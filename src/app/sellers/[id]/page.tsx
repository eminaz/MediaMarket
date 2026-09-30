import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Avatar, Rating } from '@/components/ui';
import { getStyles } from '@/lib/db';
import { getSellerReviews, SELLER_REVIEWS_PAGE_SIZE } from '@/lib/reviews';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Seller reviews' };

export default async function SellerReviewsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { id } = await params;
  const styles = getStyles().filter((style) => style.sellerId === id);
  if (!styles.length) notFound();
  const seller = styles[0].seller;
  const totalPages = Math.max(1, Math.ceil(seller.reviewCount / SELLER_REVIEWS_PAGE_SIZE));
  const requestedPage = Number((await searchParams).page);
  const page = Number.isSafeInteger(requestedPage)
    ? Math.min(totalPages, Math.max(1, requestedPage))
    : 1;
  const reviews = getSellerReviews(id, page);
  return (
    <div className="page-wrap seller-reviews-page">
      <Link className="back-link" href="/sellers">
        <ArrowLeft size={15} /> All sellers
      </Link>
      <div className="page-title">
        <div className="eyebrow muted">ACROSS EVERY STYLE</div>
        <h1>
          {seller.displayName}
          <span>.</span>
        </h1>
        <div className="seller-reviews-identity">
          <Avatar handle={seller.handle} />
          <span>@{seller.handle}</span>
          <Rating {...seller} />
        </div>
        <p>
          Buyer feedback from completed orders across all {styles.length}{' '}
          {styles.length === 1 ? 'style' : 'styles'}.
        </p>
      </div>
      <section className="style-reviews" aria-label="Seller reviews">
        <div className="section-heading">
          <h2>What buyers are saying.</h2>
          <span className="mode-note">Newest first</span>
        </div>
        {reviews.length ? (
          <>
            <div className="review-list">
              {reviews.map((review) => (
                <article className="review-card" key={review.id}>
                  <Link className="text-link" href={`/styles/${review.styleId}`}>
                    {review.styleName} <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                  <p className="review-stars" aria-label={`${review.stars} out of 5 stars`}>
                    {'★'.repeat(review.stars)}
                    {'☆'.repeat(5 - review.stars)}
                  </p>
                  {review.text ? (
                    <p className="review-text">{review.text}</p>
                  ) : (
                    <p className="mode-note">Rating only · No written comment</p>
                  )}
                  <p className="mode-note">
                    Completed order ·{' '}
                    <time dateTime={review.createdAt}>{review.createdAt.slice(0, 10)}</time>
                  </p>
                </article>
              ))}
            </div>
            {totalPages > 1 && (
              <nav className="seller-review-pagination" aria-label="Review pages">
                {page > 1 && (
                  <Link className="button button-light" href={`/sellers/${id}?page=${page - 1}`}>
                    Newer reviews
                  </Link>
                )}
                <span className="mode-note">
                  Page {page} of {totalPages}
                </span>
                {page < totalPages && (
                  <Link className="button button-light" href={`/sellers/${id}?page=${page + 1}`}>
                    Older reviews
                  </Link>
                )}
              </nav>
            )}
          </>
        ) : (
          <div className="empty-state">
            <h2>No reviews yet.</h2>
            <p>Feedback appears here after a delivered order is rated.</p>
          </div>
        )}
      </section>
      <section aria-label="Seller styles">
        <div className="section-heading">
          <h2>Explore their styles.</h2>
        </div>
        <ul className="directory-styles">
          {styles.map((style) => (
            <li key={style.id}>
              <Link href={`/styles/${style.id}`}>
                <img src={style.sampleImages[0]} alt="" loading="lazy" />
                <span className="directory-style-name">
                  <strong>{style.name}</strong>
                </span>
                <span className="directory-style-price">
                  {style.priceUsdc.toFixed(2)} <small>USDC</small>
                </span>
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
