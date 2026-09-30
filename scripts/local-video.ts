import { access, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { renderMockMusic } from '../src/lib/audio';
import { MAX_VIDEO_BYTES, validateMp4 } from '../src/lib/video';
import {
  buildGenerationPrompt,
  generateLocalImage,
  type LocalGeneratorConfig,
} from './local-generator';
import { generateLocalMusic } from './local-music';
import { runLocalProcess } from './local-process';

export type LocalVideoConfig = {
  script: string;
  timeoutMs: number;
  slides: number;
  width: number;
  height: number;
};
function integer(
  env: Record<string, string | undefined>,
  key: string,
  fallback: number,
  min: number,
  max: number,
) {
  const value = Number(env[key] || fallback);
  if (!Number.isInteger(value) || value < min || value > max)
    throw new Error(`${key} must be an integer between ${min} and ${max}.`);
  return value;
}
// Video assembles locally generated scenes and music with Remotion (demo-video.sh), so it
// needs the image generator too. Music falls back to the demo synthesizer when absent.
export async function localVideoConfig(
  imageGenerator: LocalGeneratorConfig | null,
  env: Record<string, string | undefined> = process.env,
): Promise<LocalVideoConfig | null> {
  const mode = env.SELLER_VIDEO_GENERATOR || (env.SELLER_GENERATOR === 'mock' ? 'mock' : 'auto');
  if (!['auto', 'local', 'mock'].includes(mode))
    throw new Error('SELLER_VIDEO_GENERATOR must be auto, local, or mock.');
  if (mode === 'mock') return null;
  const script = path.resolve(
    env.LOCAL_VIDEO_SCRIPT || path.join(homedir(), 'Pictures/local-image-gen/demo-video.sh'),
  );
  const strict = mode === 'local' || !!env.LOCAL_VIDEO_SCRIPT;
  try {
    await access(script, constants.X_OK);
  } catch {
    if (strict) throw new Error(`Video renderer is missing or not executable: ${script}`);
    return null;
  }
  if (!imageGenerator) {
    if (strict) throw new Error('Local video needs the local image generator for its scenes.');
    return null;
  }
  const width = integer(env, 'LOCAL_VIDEO_WIDTH', 768, 256, 1920);
  const height = integer(env, 'LOCAL_VIDEO_HEIGHT', 768, 256, 1920);
  if (width % 2 || height % 2) throw new Error('Local video dimensions must be even.');
  return {
    script,
    width,
    height,
    slides: integer(env, 'LOCAL_VIDEO_SLIDES', 4, 1, 8),
    timeoutMs: integer(env, 'LOCAL_VIDEO_TIMEOUT_MS', 300_000, 1000, 1_800_000),
  };
}

// A seller recipe may carry its music direction after "Soundtrack:" (or "Music:").
export function splitVideoRecipe(workflow: string) {
  const [visual, soundtrack] = workflow.split(/\b(?:soundtrack|music)\s*:/i, 2);
  return {
    visual: visual.trim() || workflow,
    soundtrack:
      soundtrack?.trim() ||
      'Cinematic ambient instrumental underscore for a product film, restrained and polished, no vocals.',
  };
}

const shots = [
  'Hero shot: the subject centered, clean and iconic.',
  'Close-up detail: texture, material, and craftsmanship.',
  'Lifestyle moment: the subject in a natural, aspirational setting.',
  'Closing composition: calm, wide framing with space for a headline.',
  'Dramatic side light: strong silhouette and gentle shadows.',
  'Overhead arrangement: styled flat lay with complementary props.',
  'Soft focus atmosphere: shallow depth of field and glowing highlights.',
  'Final beauty shot: the subject with a subtle reflection.',
];
const motions = ['zoom-in', 'pan-left', 'pan-right', 'zoom-out'];
const lines = [
  ['Every detail matters.', 'Designed to stand out.'],
  ['Made for your day.', 'Make it yours.'],
  ['Light, in every detail.', 'A softer mood.'],
  ['Made to linger.', 'Your everyday signature.'],
];
function words(text: string, count: number) {
  const list = text.trim().split(/\s+/);
  return list.length > count ? `${list.slice(0, count).join(' ')}…` : text.trim();
}
// Headlines are templated from the buyer's brand and brief; the private recipe never appears.
export function videoCopy(brief: string, brand: string, slides: number) {
  const name = brand.trim();
  const opening = words(brief.split(/[.!?;\n]/).find((s) => s.trim()) || brief, 8);
  return {
    brand: name.toUpperCase(),
    eyebrow: name ? 'INTRODUCING' : 'A NEW PERSPECTIVE',
    cta: name ? `DISCOVER ${name.toUpperCase()}` : 'DISCOVER MORE',
    slides: Array.from({ length: slides }, (_, i) => {
      const [title, subtitle] =
        i === 0
          ? [name ? `Meet ${name}.` : 'A quiet statement.', opening]
          : i === slides - 1 && slides > 1
            ? [name ? `Discover ${name}.` : 'Discover more.', name || 'Find your signature.']
            : lines[(i - 1) % lines.length];
      return { title, subtitle, motion: motions[i % motions.length] };
    }),
  };
}

export async function generateLocalVideo({
  config,
  imageGenerator,
  musicGenerator,
  workflowPrompt,
  brief,
  brand,
  durationSeconds,
  workDirectory,
  signal,
  onPhase = () => {},
}: {
  config: LocalVideoConfig;
  imageGenerator: LocalGeneratorConfig;
  musicGenerator: { script: string; timeoutMs: number } | null;
  workflowPrompt: string;
  brief: string;
  brand: string;
  durationSeconds: number;
  workDirectory: string;
  signal?: AbortSignal;
  onPhase?: (phase: string) => void;
}) {
  if (!Number.isInteger(durationSeconds) || durationSeconds < 5 || durationSeconds > 30)
    throw new Error('Video clips must be 5–30 seconds.');
  const recipe = splitVideoRecipe(workflowPrompt);
  // Short clips get fewer scenes so each one outlasts its incoming and outgoing crossfades.
  let count = config.slides;
  while (count > 1 && Math.floor((durationSeconds * 30 + (count - 1) * 18) / count) <= 36) count--;
  const copy = videoCopy(brief, brand, count);
  // Scenes, music, props, the MP4, and the renderer's sidecar all live here and are deleted.
  const directory = await mkdtemp(path.join(workDirectory, 'video-'));
  try {
    const slides = [];
    for (let i = 0; i < count; i++) {
      onPhase(`Generating scene ${i + 1} of ${count} with local AI`);
      const image = await generateLocalImage(
        { ...imageGenerator, seed: (imageGenerator.seed + i) % 4294967296 },
        buildGenerationPrompt(
          recipe.visual,
          `${brief}\n${shots[i % shots.length]} No text or lettering in the image.`,
          brand,
        ),
        path.join(directory, `scene-${i}.tmp.png`),
        signal,
      );
      await writeFile(path.join(directory, `scene-${i}.png`), image);
      slides.push({ ...copy.slides[i], image: `scene-${i}.png` });
    }
    onPhase(musicGenerator ? 'Generating the soundtrack with local AI' : 'Synthesizing demo music');
    const prompt = `${recipe.soundtrack}\nBuyer brief: ${brief}${brand ? `\nProject: ${brand}` : ''}`;
    const music = musicGenerator
      ? await generateLocalMusic(
          musicGenerator,
          prompt,
          durationSeconds,
          path.join(directory, 'music.tmp.wav'),
          signal,
        )
      : renderMockMusic(durationSeconds, prompt);
    await writeFile(path.join(directory, 'music.wav'), music);
    const props = path.join(directory, 'video.json');
    await writeFile(
      props,
      JSON.stringify({
        brand: copy.brand,
        eyebrow: copy.eyebrow,
        cta: copy.cta,
        durationSeconds,
        fps: 30,
        width: config.width,
        height: config.height,
        transitionSeconds: 0.6,
        music: 'music.wav',
        musicVolume: 0.35,
        slides,
      }),
    );
    onPhase('Rendering the video with Remotion');
    const output = path.join(directory, 'video.mp4');
    await runLocalProcess(
      config.script,
      ['--config', props, '--output', output],
      config.timeoutMs,
      signal,
    );
    signal?.throwIfAborted();
    if ((await stat(output)).size > MAX_VIDEO_BYTES) throw new Error('Video output exceeds 64 MB.');
    return validateMp4(await readFile(output), durationSeconds);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
