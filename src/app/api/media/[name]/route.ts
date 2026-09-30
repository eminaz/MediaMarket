import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { dataDir } from '@/lib/db';
export const runtime = 'nodejs';
export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!/^[a-f0-9-]+\.(png|wav)$/.test(name)) return new Response('Not found', { status: 404 });
  try {
    const file = await readFile(path.join(dataDir, 'media', name));
    const download = new URL(request.url).searchParams.has('download');
    const audio = name.endsWith('.wav');
    let start = 0,
      end = file.length - 1;
    const range = audio ? request.headers.get('range') : null;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2]))
        return new Response(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${file.length}` },
        });
      start = match[1] ? Number(match[1]) : Math.max(0, file.length - Number(match[2]));
      end = match[1] && match[2] ? Math.min(Number(match[2]), file.length - 1) : file.length - 1;
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start > end ||
        start >= file.length
      )
        return new Response(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${file.length}` },
        });
    }
    return new Response(new Uint8Array(file.subarray(start, end + 1)), {
      status: range ? 206 : 200,
      headers: {
        'Content-Type': audio ? 'audio/wav' : 'image/png',
        'Content-Length': String(end - start + 1),
        ...(audio ? { 'Accept-Ranges': 'bytes' } : {}),
        ...(range ? { 'Content-Range': `bytes ${start}-${end}/${file.length}` } : {}),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
        ...(download
          ? {
              'Content-Disposition': `attachment; filename="tastemaker-creation.${audio ? 'wav' : 'png'}"`,
            }
          : {}),
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
