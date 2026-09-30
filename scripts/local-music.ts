import { access, readFile, stat, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { cleanWav, MAX_AUDIO_BYTES } from '../src/lib/audio';
import { runLocalProcess } from './local-process';

export async function localMusicConfig(env: Record<string, string | undefined> = process.env) {
  const mode = env.SELLER_MUSIC_GENERATOR || (env.SELLER_GENERATOR === 'mock' ? 'mock' : 'auto');
  if (!['auto', 'local', 'mock'].includes(mode))
    throw new Error('SELLER_MUSIC_GENERATOR must be auto, local, or mock.');
  if (mode === 'mock') return null;
  const script = path.resolve(
    env.LOCAL_MUSIC_SCRIPT || path.join(homedir(), 'Pictures/local-image-gen/music.sh'),
  );
  try {
    await access(script, constants.X_OK);
  } catch {
    if (mode === 'local' || env.LOCAL_MUSIC_SCRIPT)
      throw new Error(`Music generator is missing or not executable: ${script}`);
    return null;
  }
  const timeoutMs = Number(env.LOCAL_MUSIC_TIMEOUT_MS || 600_000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 1_800_000)
    throw new Error('LOCAL_MUSIC_TIMEOUT_MS must be between 1000 and 1800000.');
  return { script, timeoutMs };
}

export async function generateLocalMusic(
  config: { script: string; timeoutMs: number },
  prompt: string,
  durationSeconds: number,
  outputPath: string,
  signal?: AbortSignal,
) {
  if (!Number.isInteger(durationSeconds) || durationSeconds < 5 || durationSeconds > 30)
    throw new Error('Music clips must be 5–30 seconds.');
  try {
    await runLocalProcess(
      config.script,
      ['--prompt', prompt, '--duration', String(durationSeconds), '--output', outputPath],
      config.timeoutMs,
      signal,
    );
    signal?.throwIfAborted();
    if ((await stat(outputPath)).size > MAX_AUDIO_BYTES)
      throw new Error('Music output exceeds 32 MB.');
    return cleanWav(await readFile(outputPath), durationSeconds);
  } finally {
    await unlink(outputPath).catch(() => {});
    // The local model writes a sidecar containing prompts. Never deliver or retain it.
    await unlink(outputPath.replace(/\.wav$/, '.metadata.json')).catch(() => {});
  }
}
