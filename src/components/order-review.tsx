'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Star, CheckCircle2, LoaderCircle } from 'lucide-react';
import { api } from '@/lib/client';
import type { Review } from '@/lib/types';

export function OrderReview({
  jobId,
  initialReview,
  onReviewed,
}: {
  jobId: string;
  initialReview: Review | null;
  onReviewed: () => Promise<void>;
}) {
  const [review, setReview] = useState(initialReview);
  const [stars, setStars] = useState(0);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!stars) {
      setError('Choose a rating from 1 to 5 stars.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await api<{ review: Review }>(`/api/jobs/${jobId}/review`, { stars, text });
      setReview(result.review);
      await onReviewed();
      router.refresh();
    } catch (e) {
      // Recover a lost success response or another tab's submission without replacing it.
      const saved = await api<{ review: Review | null }>(`/api/jobs/${jobId}/review`).catch(
        () => null,
      );
      if (saved?.review) {
        setReview(saved.review);
        router.refresh();
      } else setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="order-review" aria-label="Order review">
      {review ? (
        <>
          <h3>
            <CheckCircle2 size={17} /> Your review
          </h3>
          <p className="review-stars" aria-label={`${review.stars} out of 5 stars`}>
            {'★'.repeat(review.stars)}
            {'☆'.repeat(5 - review.stars)}
          </p>
          {review.text && <p className="review-text">{review.text}</p>}
          <p className="mode-note">
            Saved for this completed order. Thank you for sharing your experience.
          </p>
        </>
      ) : (
        <form onSubmit={submit}>
          <h3>How was this style?</h3>
          <p className="mode-note">
            Your image is delivered. Help the next buyer find their style.
          </p>
          <fieldset className="star-picker" disabled={busy}>
            <legend>Rate this style</legend>
            {[1, 2, 3, 4, 5].map((value) => (
              <label key={value}>
                <input
                  type="radio"
                  name={`rating-${jobId}`}
                  value={value}
                  checked={stars === value}
                  onChange={() => setStars(value)}
                  aria-label={`${value} ${value === 1 ? 'star' : 'stars'}`}
                />
                <Star
                  size={25}
                  aria-hidden="true"
                  fill={value <= stars ? 'currentColor' : 'none'}
                />
              </label>
            ))}
          </fieldset>
          <label className="field">
            A short review <span>Optional · 280 characters</span>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={280}
              rows={3}
              placeholder="What worked well? What could be better?"
              disabled={busy}
            />
          </label>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <button className="button button-dark" type="submit" disabled={busy || !stars}>
            {busy && <LoaderCircle className="spin" size={15} />} Submit review
          </button>
          <p className="mode-note">One review per completed order.</p>
        </form>
      )}
    </section>
  );
}
