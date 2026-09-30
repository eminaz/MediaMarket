import { spawn } from 'node:child_process';
import path from 'node:path';

export async function runLocalProcess(
  script: string,
  args: string[],
  timeoutMs: number,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    // No shell: buyer text is a single literal argument, never executable code.
    const child = spawn(script, args, {
      cwd: path.dirname(script),
      shell: false,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    let failure: Error | null = null;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const kill = (sig: NodeJS.Signals) => {
      if (!child.pid) return;
      try {
        if (process.platform === 'win32') child.kill(sig);
        else process.kill(-child.pid, sig);
      } catch {
        /* Already exited. */
      }
    };
    const stop = (error: Error) => {
      if (failure) return;
      failure = error;
      kill('SIGTERM');
      killTimer = setTimeout(() => kill('SIGKILL'), 2000);
    };
    const abort = () => stop(new Error('Local generation cancelled.'));
    const timer = setTimeout(
      () =>
        stop(
          new Error(`Local generation timed out after ${Math.round(timeoutMs / 1000)} seconds.`),
        ),
      timeoutMs,
    );
    const cleanup = () => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      signal?.removeEventListener('abort', abort);
    };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    child.stdout.on('data', () => {}); // Drain model progress without exposing private recipes.
    child.stderr.on('data', (data: Buffer) => {
      stderr = (stderr + data.toString()).slice(-4000);
    });
    child.once('error', (error) => {
      cleanup();
      reject(error);
    });
    child.once('close', (code) => {
      cleanup();
      if (failure) reject(failure);
      else if (code !== 0)
        reject(new Error(`Generator exited with code ${code}. ${stderr.trim()}`));
      else resolve();
    });
  });
}
