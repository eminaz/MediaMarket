import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { seeds, seedPayoutAddresses } from './seed';
import { defaultPayoutAddress, payoutOverrides, requirePayoutAddress } from './payout';
import type { GenerationJob, PrivateStyleListing, Seller, StyleListing } from './types';

export const dataDir = process.env.DATA_DIR
  ? path.resolve(/* turbopackIgnore: true */ process.env.DATA_DIR)
  : path.join(process.cwd(), 'data');
let database: DatabaseSync | undefined;
export function db() {
  if (database) return database;
  mkdirSync(path.join(dataDir, 'media'), { recursive: true });
  database = new DatabaseSync(path.join(dataDir, 'tastemaker.sqlite'));
  database.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS sellers (id TEXT PRIMARY KEY, handle TEXT UNIQUE NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS styles (id TEXT PRIMARY KEY, sellerId TEXT NOT NULL REFERENCES sellers(id), data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, styleListingId TEXT NOT NULL REFERENCES styles(id), data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS worker_claims (jobId TEXT PRIMARY KEY REFERENCES jobs(id), sellerHandle TEXT NOT NULL, token TEXT NOT NULL, expiresAt INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS agent_requests (requestKey TEXT PRIMARY KEY, requestHash TEXT NOT NULL, jobId TEXT NOT NULL REFERENCES jobs(id));
    CREATE TABLE IF NOT EXISTS payment_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS payment_locks (jobId TEXT PRIMARY KEY REFERENCES jobs(id), token TEXT NOT NULL, expiresAt INTEGER NOT NULL);
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
        payoutAddress: requirePayoutAddress(
          seedPayoutAddresses[seed.handle] || defaultPayoutAddress(seed.handle),
        ),
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
          'A short text brief describing your subject, scene, and desired mood. No input image needed.',
        commercialUseAllowed: true,
        createdAt: now,
        palette: seed.palette,
        featured: ['luxury', 'street'].includes(seed.palette),
      };
      database
        .prepare('INSERT OR IGNORE INTO styles VALUES (?, ?, ?)')
        .run(style.id, seller.id, JSON.stringify(style));
      // Migrate only the original seed requirement; preserve custom seller instructions.
      database
        .prepare(
          "UPDATE styles SET data = json_set(data, '$.inputRequirements', ?) WHERE id = ? AND json_extract(data, '$.inputRequirements') = ?",
        )
        .run(
          style.inputRequirements,
          style.id,
          'One product or subject image (PNG, JPG, or WebP, up to 10 MB) and a short creative brief.',
        );
    }
    const overrides = payoutOverrides();
    const sellers = database.prepare('SELECT data FROM sellers').all() as { data: string }[];
    for (const row of sellers) {
      const seller: Seller = JSON.parse(row.data);
      seller.payoutAddress = requirePayoutAddress(
        overrides[seller.handle] || seller.payoutAddress || defaultPayoutAddress(seller.handle),
      );
      database
        .prepare('UPDATE sellers SET data = ? WHERE id = ?')
        .run(JSON.stringify(seller), seller.id);
    }
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    database.close();
    database = undefined;
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
  return (
    db()
      .prepare(
        'SELECT styles.data, sellers.data AS sellerData FROM styles JOIN sellers ON sellers.id = styles.sellerId ORDER BY styles.rowid',
      )
      .all() as { data: string; sellerData: string }[]
  ).map((row) => publicStyle({ ...JSON.parse(row.data), seller: JSON.parse(row.sellerData) }));
}
export function getPrivateStyle(id: string): PrivateStyleListing | null {
  const row = db().prepare('SELECT data FROM styles WHERE id = ?').get(id) as
    { data: string } | undefined;
  if (!row) return null;
  const style: PrivateStyleListing = JSON.parse(row.data);
  const seller = db().prepare('SELECT data FROM sellers WHERE id = ?').get(style.sellerId) as {
    data: string;
  };
  return { ...style, seller: JSON.parse(seller.data) };
}
export function getStyle(id: string) {
  const style = getPrivateStyle(id);
  return style ? publicStyle(style) : null;
}
export function saveStyle(style: PrivateStyleListing, payoutAddress?: string) {
  const conn = db();
  conn.exec('BEGIN IMMEDIATE');
  try {
    const existing = conn
      .prepare('SELECT data FROM sellers WHERE handle = ?')
      .get(style.seller.handle) as { data: string } | undefined;
    if (existing) {
      style.seller = JSON.parse(existing.data);
      style.sellerId = style.seller.id;
      if (payoutAddress) {
        style.seller.payoutAddress = requirePayoutAddress(payoutAddress);
        conn
          .prepare('UPDATE sellers SET data = ? WHERE id = ?')
          .run(JSON.stringify(style.seller), style.sellerId);
      }
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
