import { runLocalProcess } from './local-process';
import { access, readFile, stat, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

export type LocalGeneratorConfig = {
  script: string;
  steps: number;
  seed: number;
  width: number;
  height: number;
  timeoutMs: number;
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
export async function localGeneratorConfig(
  env: Record<string, string | undefined> = process.env,
): Promise<LocalGeneratorConfig | null> {
  const mode = env.SELLER_GENERATOR || 'auto';
  if (!['auto', 'local', 'mock'].includes(mode))
    throw new Error('SELLER_GENERATOR must be auto, local, or mock.');
  if (mode === 'mock') return null;
  const script = path.resolve(
    env.LOCAL_GENERATOR_SCRIPT || path.join(homedir(), 'Pictures/local-image-gen/generate.sh'),
  );
  try {
    await access(script, constants.X_OK);
  } catch {
    if (mode === 'local' || env.LOCAL_GENERATOR_SCRIPT)
      throw new Error(`Local generator is missing or not executable: ${script}`);
    return null;
  }
  const width = integer(env, 'LOCAL_GENERATOR_WIDTH', 768, 256, 2048);
  const height = integer(env, 'LOCAL_GENERATOR_HEIGHT', 768, 256, 2048);
  if (width % 16 || height % 16) throw new Error('Local image dimensions must be multiples of 16.');
  return {
    script,
    steps: integer(env, 'LOCAL_GENERATOR_STEPS', 4, 1, 50),
    seed: integer(env, 'LOCAL_GENERATOR_SEED', 42, 0, 4294967295),
    width,
    height,
    timeoutMs: integer(env, 'LOCAL_GENERATOR_TIMEOUT_MS', 180_000, 1000, 900_000),
  };
}
export function buildGenerationPrompt(workflow: string, brief: string, brand: string) {
  return `Create a finished image from the following text description. There is no reference image.\n\nCreative direction:\n${workflow}\n\nSubject and scene:\n${brief}\n${brand ? `Brand or subject name: ${brand}\n` : ''}\nUse the creative direction as visual guidance. Do not render these instructions as text in the image.`;
}
export async function generateLocalImage(
  config: LocalGeneratorConfig,
  prompt: string,
  outputPath: string,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const args = [
    '--prompt',
    prompt,
    '--steps',
    String(config.steps),
    '--seed',
    String(config.seed),
    '--width',
    String(config.width),
    '--height',
    String(config.height),
    '--output',
    outputPath,
  ];
  try {
    await runLocalProcess(config.script, args, config.timeoutMs, signal);
    signal?.throwIfAborted();
    if ((await stat(outputPath)).size > 10 * 1024 * 1024)
      throw new Error('Generator output exceeds 10 MB.');
    const buffer = await readFile(outputPath);
    const metadata = await sharp(buffer, { limitInputPixels: 16_000_000 }).metadata();
    if (metadata.format !== 'png') throw new Error('The generator did not produce a PNG.');
    // Strip metadata (which can contain the private prompt) before delivery.
    return await sharp(buffer, { limitInputPixels: 16_000_000 }).png().toBuffer();
  } finally {
    await unlink(outputPath).catch(() => {});
  }
}
