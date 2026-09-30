import { randomUUID } from 'node:crypto';
import { db, getJob } from './db';
import { reviewSchema } from './validation';
import type { Review } from './types';

export class ReviewError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export function getOrderReview(jobId: string): Review | null {
  const row = db()
    .prepare('SELECT id, stars, text, createdAt FROM reviews WHERE jobId = ?')
    .get(jobId) as Omit<Review, 'source'> | undefined;
  return row ? { ...row, source: 'completed-order' } : null;
}
export function getStyleReviews(styleId: string): Review[] {
  const rows = db()
    .prepare(
      `SELECT reviews.id, reviews.stars, reviews.text, reviews.createdAt
    FROM reviews JOIN jobs ON jobs.id = reviews.jobId
    WHERE jobs.styleListingId = ? AND json_extract(jobs.data, '$.status') = 'delivered'
    ORDER BY reviews.createdAt DESC, reviews.rowid DESC LIMIT 20`,
    )
    .all(styleId) as Omit<Review, 'source'>[];
  return rows.map((row) => ({ ...row, source: 'completed-order' }));
}
export function submitReview(jobId: string, values: unknown) {
  const input = reviewSchema.parse(values);
  const conn = db();
  conn.exec('BEGIN IMMEDIATE');
  try {
    const job = getJob(jobId);
    if (!job) throw new ReviewError('Order not found.', 404);
    if (job.status !== 'delivered')
      throw new ReviewError('Only delivered orders can be reviewed.', 409);
    const previous = getOrderReview(jobId);
    if (previous) {
      if (previous.stars !== input.stars || previous.text !== input.text)
        throw new ReviewError(
          'This order already has a review. Each order can be reviewed once.',
          409,
        );
      conn.exec('COMMIT');
      return { review: previous, replayed: true };
    }
    const review: Review = {
      id: randomUUID(),
      ...input,
      createdAt: new Date().toISOString(),
      source: 'completed-order',
    };
    conn
      .prepare('INSERT INTO reviews (id, jobId, stars, text, createdAt) VALUES (?, ?, ?, ?, ?)')
      .run(review.id, jobId, review.stars, review.text, review.createdAt);
    conn.exec('COMMIT');
    return { review, replayed: false };
  } catch (error) {
    conn.exec('ROLLBACK');
    throw error;
  }
}
