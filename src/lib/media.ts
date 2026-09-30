import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { dataDir, db } from './db';

export async function saveUpload(file: File) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
    throw new Error('Please upload a PNG, JPG, or WebP image.');
  if (file.size > 10 * 1024 * 1024 || file.size === 0)
    throw new Error('Images must be between 1 byte and 10 MB.');
  const input = Buffer.from(await file.arrayBuffer());
  const metadata = await sharp(input, { limitInputPixels: 40_000_000 }).metadata();
  if (!['png', 'jpeg', 'webp'].includes(metadata.format || ''))
    throw new Error('This file is not a supported image.');
  const buffer = await sharp(input, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();
  return saveMedia(buffer);
}
export async function saveMedia(buffer: Buffer) {
  db();
  const name = `${randomUUID()}.png`;
  await writeFile(path.join(dataDir, 'media', name), buffer);
  return `/api/media/${name}`;
}
export async function readImage(url: string) {
  if (/^\/api\/media\/[a-f0-9-]+\.png$/.test(url))
    return readFile(path.join(dataDir, 'media', path.basename(url)));
  if (url === '/samples/demo-product.png') return readFile(path.join(process.cwd(), 'public', url));
  throw new Error('Please upload an input image first.');
}
