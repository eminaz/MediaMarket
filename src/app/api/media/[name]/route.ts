import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { dataDir } from '@/lib/db';
export const runtime = 'nodejs';
export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!/^[a-f0-9-]+\.png$/.test(name)) return new Response('Not found', { status: 404 });
  try {
    const file = await readFile(path.join(dataDir, 'media', name));
    const download = new URL(request.url).searchParams.has('download');
    return new Response(new Uint8Array(file), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
        ...(download
          ? { 'Content-Disposition': 'attachment; filename="tastemaker-creation.png"' }
          : {}),
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
