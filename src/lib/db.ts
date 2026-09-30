import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { seeds, seedPayoutAddresses } from './seed';
import { defaultPayoutAddress, payoutOverrides, requirePayoutAddress } from './payout';
import { unrated } from './ratings';
import type {
  GenerationJob,
  PrivateStyleListing,
  Seller,
  StyleListing,
  RatingSummary,
} from './types';

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
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      jobId TEXT UNIQUE NOT NULL REFERENCES jobs(id),
      stars INTEGER NOT NULL CHECK(typeof(stars) = 'integer' AND stars BETWEEN 1 AND 5),
      text TEXT NOT NULL CHECK(length(text) <= 280),
      createdAt TEXT NOT NULL
    );
  `);
  const now = new Date().toISOString();
  database.exec('BEGIN IMMEDIATE');
  try {
    for (const seed of seeds) {
      const seller: Seller = {
        ...unrated,
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
        ...unrated,
        id: seed.id,
        sellerId: seller.id,
        seller,
        name: seed.name,
        description: seed.description,
        tags: seed.tags,
        priceUsdc: seed.priceUsdc,
        etaSeconds: seed.etaSeconds,
        type: seed.type || 'image',
        ...(seed.type === 'music' ? { durationSeconds: seed.durationSeconds } : {}),
        sampleImages: [`/samples/${seed.sample}`],
        publicPromptSummary: seed.summary,
        hiddenWorkflowPrompt: seed.prompt,
        inputRequirements:
          seed.type === 'music'
            ? 'A short text brief describing mood, instruments, tempo, and intended use. Delivers a 10-second instrumental track.'
            : 'A short text brief describing your subject, scene, and desired mood. No input image needed.',
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
// Derive summaries from individual completed-order reviews. Seller averages are weighted by
// the number of orders across all styles, not an average of style averages.
function ratingSummaries() {
  const rows = db()
    .prepare(
      `
    SELECT jobs.styleListingId AS styleId, styles.sellerId,
      COUNT(*) AS count, SUM(reviews.stars) AS total
    FROM reviews JOIN jobs ON jobs.id = reviews.jobId JOIN styles ON styles.id = jobs.styleListingId
    WHERE json_extract(jobs.data, '$.status') = 'delivered'
    GROUP BY jobs.styleListingId, styles.sellerId
  `,
    )
    .all() as { styleId: string; sellerId: string; count: number; total: number }[];
  const styles = new Map<string, RatingSummary>();
  const sellers = new Map<string, { count: number; total: number }>();
  for (const row of rows) {
    styles.set(row.styleId, { averageRating: row.total / row.count, reviewCount: row.count });
    const previous = sellers.get(row.sellerId) || { count: 0, total: 0 };
    sellers.set(row.sellerId, {
      count: previous.count + row.count,
      total: previous.total + row.total,
    });
  }
  return (style: PrivateStyleListing): PrivateStyleListing => {
    const seller = sellers.get(style.sellerId);
    return {
      ...style,
      ...(styles.get(style.id) || unrated),
      seller: {
        ...style.seller,
        averageRating: seller ? seller.total / seller.count : null,
        reviewCount: seller?.count || 0,
      },
    };
  };
}
export function getStyles() {
  const withRatings = ratingSummaries();
  return (
    db()
      .prepare(
        'SELECT styles.data, sellers.data AS sellerData FROM styles JOIN sellers ON sellers.id = styles.sellerId ORDER BY styles.rowid',
      )
      .all() as { data: string; sellerData: string }[]
  ).map((row) =>
    publicStyle(withRatings({ ...JSON.parse(row.data), seller: JSON.parse(row.sellerData) })),
  );
}
export function getPrivateStyle(id: string): PrivateStyleListing | null {
  const row = db().prepare('SELECT data FROM styles WHERE id = ?').get(id) as
    { data: string } | undefined;
  if (!row) return null;
  const style: PrivateStyleListing = JSON.parse(row.data);
  const seller = db().prepare('SELECT data FROM sellers WHERE id = ?').get(style.sellerId) as {
    data: string;
  };
  return ratingSummaries()({ ...style, seller: JSON.parse(seller.data) });
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
