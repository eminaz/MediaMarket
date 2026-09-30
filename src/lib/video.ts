import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { renderMockImage } from './mock-image';
import { renderMockMusic } from './audio';
import type { StyleListing } from './types';

// Video workers deliver H.264 MP4. Validate the container and its duration before delivery.
export const MAX_VIDEO_BYTES = 64 * 1024 * 1024;
const containers = new Set(['moov', 'trak', 'mdia']);
type Box = { type: string; start: number; end: number };
function boxes(input: Buffer, start: number, end: number) {
  const found: Box[] = [];
  for (let offset = start; offset < end;) {
    if (offset + 8 > end) throw new Error('Truncated MP4 box.');
    let size = input.readUInt32BE(offset),
      header = 8;
    if (size === 1) {
      if (offset + 16 > end) throw new Error('Truncated MP4 box.');
      size = Number(input.readBigUInt64BE(offset + 8));
      header = 16;
    } else if (size === 0) size = end - offset;
    if (size < header || offset + size > end) throw new Error('Invalid MP4 box size.');
    found.push({
      type: input.toString('latin1', offset + 4, offset + 8),
      start: offset + header,
      end: offset + size,
    });
    offset += size;
  }
  return found;
}
function walk(input: Buffer, box: Box, visit: (box: Box) => void) {
  visit(box);
  if (containers.has(box.type))
    for (const child of boxes(input, box.start, box.end)) walk(input, child, visit);
}

export function mp4Duration(input: Buffer) {
  if (input.length < 16 || input.length > MAX_VIDEO_BYTES)
    throw new Error('Expected an MP4 video up to 64 MB.');
  const top = boxes(input, 0, input.length);
  const moov = top.find((box) => box.type === 'moov');
  if (top[0]?.type !== 'ftyp' || !moov || !top.some((box) => box.type === 'mdat'))
    throw new Error('Expected an MP4 video with a movie header and media data.');
  let duration: number | undefined;
  let hasVideo = false;
  walk(input, moov, (box) => {
    if (box.type === 'mvhd') {
      const version = input[box.start];
      const at = box.start + (version === 1 ? 20 : 12);
      if (at + (version === 1 ? 12 : 8) > box.end) throw new Error('Invalid MP4 movie header.');
      const timescale = input.readUInt32BE(at);
      const units =
        version === 1 ? Number(input.readBigUInt64BE(at + 4)) : input.readUInt32BE(at + 4);
      if (timescale) duration = units / timescale;
    }
    if (box.type === 'hdlr' && input.toString('latin1', box.start + 8, box.start + 12) === 'vide')
      hasVideo = true;
  });
  if (!duration || !hasVideo) throw new Error('MP4 contains no playable video track.');
  return duration;
}

export function validateMp4(input: Buffer, expectedDuration?: number) {
  const duration = mp4Duration(input);
  if (
    duration < 4.9 ||
    duration > 30.2 ||
    (expectedDuration !== undefined && Math.abs(duration - expectedDuration) > 0.25)
  )
    throw new Error('Video duration does not match the purchased clip.');
  return input;
}

const run = promisify(execFile);
async function h264Encoder(ffmpeg: string) {
  const { stdout } = await run(ffmpeg, ['-hide_banner', '-encoders']);
  const encoder = ['libx264', 'libopenh264', 'h264_videotoolbox'].find((name) =>
    new RegExp(`\\s${name}\\s`).test(stdout),
  );
  if (!encoder) throw new Error('ffmpeg has no H.264 encoder for the demo video.');
  return encoder;
}

export async function renderMockVideo({
  durationSeconds,
  buyerBrief,
  brandName,
  styleListing,
}: {
  durationSeconds: number;
  buyerBrief: string;
  brandName: string;
  styleListing: StyleListing;
}) {
  // A labeled slow-pan demo of the mock poster with synthesized music; no AI model required.
  const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
  const directory = await mkdtemp(path.join(tmpdir(), 'tastemaker-video-'));
  try {
    const poster = await renderMockImage({
      inputImage: null,
      buyerBrief,
      brandName,
      styleListing,
    });
    await writeFile(
      path.join(directory, 'poster.png'),
      await sharp(poster).resize(768, 960).png().toBuffer(),
    );
    await writeFile(
      path.join(directory, 'music.wav'),
      renderMockMusic(durationSeconds, buyerBrief + styleListing.name),
    );
    const output = path.join(directory, 'video.mp4');
    const encoder = await h264Encoder(ffmpeg).catch((error: NodeJS.ErrnoException) => {
      throw new Error(
        error.code === 'ENOENT'
          ? 'Demo video needs ffmpeg. Install it or set FFMPEG_PATH.'
          : error.message,
      );
    });
    const d = durationSeconds;
    await run(
      ffmpeg,
      [
        '-y',
        '-loglevel',
        'error',
        '-loop',
        '1',
        '-framerate',
        '30',
        '-i',
        'poster.png',
        '-i',
        'music.wav',
        '-t',
        String(d),
        '-vf',
        `crop=768:768:0:'(ih-768)*t/${d}',fade=t=in:st=0:d=0.5,fade=t=out:st=${d - 0.8}:d=0.8,format=yuv420p`,
        '-c:v',
        encoder,
        '-b:v',
        '2M',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-map_metadata',
        '-1',
        '-movflags',
        '+faststart',
        output,
      ],
      { cwd: directory, timeout: 120_000 },
    );
    return validateMp4(await readFile(output), d);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
