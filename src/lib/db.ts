import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { seeds } from './seed';
import type { GenerationJob, PrivateStyleListing, Seller, StyleListing } from './types';

export const dataDir = process.env.DATA_DIR
  ? path.resolve(/* turbopackIgnore: true */ process.env.DATA_DIR)
  : path.join(process.cwd(), 'data');
let database: DatabaseSync;
export function db() {
  if (database) return database;
  mkdirSync(path.join(dataDir, 'media'), { recursive: true });
  database = new DatabaseSync(path.join(dataDir, 'tastemaker.sqlite'));
  database.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS sellers (id TEXT PRIMARY KEY, handle TEXT UNIQUE NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS styles (id TEXT PRIMARY KEY, sellerId TEXT NOT NULL REFERENCES sellers(id), data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, styleListingId TEXT NOT NULL REFERENCES styles(id), data TEXT NOT NULL);
  `);
  const now = new Date().toISOString();
  database.exec('BEGIN IMMEDIATE');
  try {
    for (const seed of seeds) {
      const seller: Seller = {
        id: seed.handle,
        handle: seed.handle,
        displayName: seed.displayName,
        bio: 'Independent creative studio. Distinctive taste, on demand.',
        avatarUrl: '',
      };
      database
        .prepare('INSERT OR IGNORE INTO sellers VALUES (?, ?, ?)')
        .run(seller.id, seller.handle, JSON.stringify(seller));
      const style: PrivateStyleListing = {
        id: seed.id,
        sellerId: seller.id,
        seller,
        name: seed.name,
        description: seed.description,
        tags: seed.tags,
        priceUsdc: seed.priceUsdc,
        etaSeconds: seed.etaSeconds,
        type: 'image',
        sampleImages: [`/samples/${seed.sample}`],
        publicPromptSummary: seed.summary,
        hiddenWorkflowPrompt: seed.prompt,
        inputRequirements:
          'One product or subject image (PNG, JPG, or WebP, up to 10 MB) and a short creative brief.',
        commercialUseAllowed: true,
        createdAt: now,
        palette: seed.palette,
        featured: ['luxury', 'street'].includes(seed.palette),
      };
      database
        .prepare('INSERT OR IGNORE INTO styles VALUES (?, ?, ?)')
        .run(style.id, seller.id, JSON.stringify(style));
    }
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
  return database;
}
export function publicStyle(style: PrivateStyleListing): StyleListing {
  const { hiddenWorkflowPrompt, ...safe } = style;
  void hiddenWorkflowPrompt;
  return safe;
}
export function getStyles() {
  return (db().prepare('SELECT data FROM styles ORDER BY rowid').all() as { data: string }[]).map(
    (row) => publicStyle(JSON.parse(row.data)),
  );
}
export function getPrivateStyle(id: string): PrivateStyleListing | null {
  const row = db().prepare('SELECT data FROM styles WHERE id = ?').get(id) as
    { data: string } | undefined;
  return row ? JSON.parse(row.data) : null;
}
export function getStyle(id: string) {
  const style = getPrivateStyle(id);
  return style ? publicStyle(style) : null;
}
export function saveStyle(style: PrivateStyleListing) {
  const conn = db();
  conn.exec('BEGIN IMMEDIATE');
  try {
    const existing = conn
      .prepare('SELECT data FROM sellers WHERE handle = ?')
      .get(style.seller.handle) as { data: string } | undefined;
    if (existing) {
      style.seller = JSON.parse(existing.data);
      style.sellerId = style.seller.id;
    } else
      conn
        .prepare('INSERT INTO sellers VALUES (?, ?, ?)')
        .run(style.seller.id, style.seller.handle, JSON.stringify(style.seller));
    conn
      .prepare('INSERT INTO styles VALUES (?, ?, ?)')
      .run(style.id, style.sellerId, JSON.stringify(style));
    conn.exec('COMMIT');
  } catch (error) {
    conn.exec('ROLLBACK');
    throw error;
  }
}
export function saveJob(job: GenerationJob) {
  db()
    .prepare('INSERT INTO jobs VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data')
    .run(job.id, job.styleListingId, JSON.stringify(job));
  return job;
}
export function getJob(id: string): GenerationJob | null {
  const row = db().prepare('SELECT data FROM jobs WHERE id = ?').get(id) as
    { data: string } | undefined;
  return row ? JSON.parse(row.data) : null;
}
export function getJobs(): GenerationJob[] {
  return (
    db().prepare('SELECT data FROM jobs ORDER BY rowid DESC LIMIT 100').all() as { data: string }[]
  ).map((row) => JSON.parse(row.data));
}
