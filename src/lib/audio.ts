// The music worker delivers PCM16 WAV. Keep only format and audio chunks so private
// prompts in metadata never travel to the buyer.
export const MAX_AUDIO_BYTES = 32 * 1024 * 1024;
export function cleanWav(input: Buffer, expectedDuration?: number) {
  if (
    input.length < 44 ||
    input.length > MAX_AUDIO_BYTES ||
    input.toString('ascii', 0, 4) !== 'RIFF' ||
    input.toString('ascii', 8, 12) !== 'WAVE' ||
    input.readUInt32LE(4) + 8 !== input.length
  )
    throw new Error('Expected a valid WAV file up to 32 MB.');
  let format: Buffer | undefined;
  let samples: Buffer | undefined;
  for (let offset = 12; offset < input.length;) {
    if (offset + 8 > input.length) throw new Error('Truncated WAV chunk.');
    const name = input.toString('ascii', offset, offset + 4);
    const size = input.readUInt32LE(offset + 4);
    if (offset + 8 + size + (size % 2) > input.length) throw new Error('Truncated WAV audio.');
    const chunk = input.subarray(offset + 8, offset + 8 + size);
    if (name === 'fmt ') {
      if (format || size < 16) throw new Error('Invalid WAV format.');
      format = chunk.subarray(0, 16);
    }
    if (name === 'data') {
      if (samples) throw new Error('Multiple WAV data chunks are unsupported.');
      samples = chunk;
    }
    offset += 8 + size + (size % 2);
  }
  if (!format || !samples?.length) throw new Error('WAV contains no audio.');
  const channels = format.readUInt16LE(2),
    rate = format.readUInt32LE(4);
  const block = channels * 2;
  if (
    format.readUInt16LE(0) !== 1 ||
    format.readUInt16LE(14) !== 16 ||
    ![1, 2].includes(channels) ||
    rate < 8000 ||
    rate > 96000 ||
    format.readUInt16LE(12) !== block ||
    format.readUInt32LE(8) !== rate * block ||
    samples.length % block
  )
    throw new Error('Deliver mono or stereo PCM16 WAV audio.');
  const duration = samples.length / (rate * block);
  if (
    duration < 4.9 ||
    duration > 30.1 ||
    (expectedDuration !== undefined && Math.abs(duration - expectedDuration) > 0.1)
  )
    throw new Error('Audio duration does not match the purchased clip.');
  const output = Buffer.alloc(44 + samples.length);
  output.write('RIFF');
  output.writeUInt32LE(output.length - 8, 4);
  output.write('WAVEfmt ', 8);
  output.writeUInt32LE(16, 16);
  format.copy(output, 20);
  output.write('data', 36);
  output.writeUInt32LE(samples.length, 40);
  samples.copy(output, 44);
  return output;
}

export function renderMockMusic(durationSeconds: number, brief: string) {
  // An audible synthesized demo, explicitly labeled as mock; no model required.
  const rate = 24000,
    frames = durationSeconds * rate;
  const output = Buffer.alloc(44 + frames * 2);
  output.write('RIFF');
  output.writeUInt32LE(output.length - 8, 4);
  output.write('WAVEfmt ', 8);
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(1, 22);
  output.writeUInt32LE(rate, 24);
  output.writeUInt32LE(rate * 2, 28);
  output.writeUInt16LE(2, 32);
  output.writeUInt16LE(16, 34);
  output.write('data', 36);
  output.writeUInt32LE(frames * 2, 40);
  const offset = [...brief].reduce((n, ch) => (n + ch.charCodeAt(0)) % 5, 0);
  const root = 130.81 * 2 ** (offset / 12);
  for (let i = 0; i < frames; i++) {
    const t = i / rate;
    const fade = Math.min(1, t / 0.4, (durationSeconds - t) / 0.8);
    const pulse = 0.65 + 0.35 * Math.exp(-3 * (t % 0.75));
    const sample = [1, 1.25, 1.5, 2].reduce(
      (sum, note) => sum + Math.sin(2 * Math.PI * root * note * t),
      0,
    );
    output.writeInt16LE(Math.round(sample * 1700 * fade * pulse), 44 + i * 2);
  }
  return output;
}
