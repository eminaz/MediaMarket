import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight, Plus } from 'lucide-react';
import { getStyles } from '@/lib/db';
import { executionMode, sellerHasWorker } from '@/lib/workers';
import type { Seller, StyleListing } from '@/lib/types';
import { Avatar, Rating } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Sellers' };

export default function SellersPage() {
  const styles = getStyles();
  const grouped = new Map<string, { seller: Seller; styles: StyleListing[] }>();
  for (const style of styles) {
    const entry = grouped.get(style.sellerId) || { seller: style.seller, styles: [] };
    entry.styles.push(style);
    grouped.set(style.sellerId, entry);
  }
  const sellers = [...grouped.values()].sort((a, b) =>
    a.seller.handle.localeCompare(b.seller.handle),
  );
  const workerMode = executionMode() === 'worker';
  return (
    <div className="page-wrap sellers-page">
      <div className="page-title row-title">
        <div>
          <div className="eyebrow muted">THE PEOPLE BEHIND THE TASTE</div>
          <h1>
            Sellers<span>.</span>
          </h1>
          <p>Compare creative styles, prices, and ratings from completed orders.</p>
        </div>
        <Link className="button button-light" href="/sell">
          <Plus size={16} /> Become a seller
        </Link>
      </div>
      <div className="seller-directory-summary">
        <span>
          <strong>{sellers.length}</strong> {sellers.length === 1 ? 'seller' : 'sellers'} ·{' '}
          <strong>{styles.length}</strong> image styles
        </span>
        <span>Prices in USDC per image · Ratings across each seller’s styles</span>
      </div>
      {sellers.length ? (
        <table className="seller-directory">
          <caption className="sr-only">
            All marketplace sellers, overall ratings, price ranges, and style prices
          </caption>
          <thead>
            <tr>
              <th scope="col">Seller</th>
              <th scope="col">Overall rating</th>
              <th scope="col">Price per image</th>
              <th scope="col">Styles & prices</th>
            </tr>
          </thead>
          <tbody>
            {sellers.map(({ seller, styles: listings }) => {
              const sorted = [...listings].sort(
                (a, b) => a.priceUsdc - b.priceUsdc || a.name.localeCompare(b.name),
              );
              const low = sorted[0].priceUsdc,
                high = sorted[sorted.length - 1].priceUsdc;
              const orderable = !workerMode || sellerHasWorker(seller.handle);
              return (
                <tr key={seller.id} id={seller.id} data-seller={seller.handle}>
                  <th scope="row">
                    <div className="directory-seller-identity">
                      <Avatar handle={seller.handle} />
                      <div>
                        <h2>{seller.displayName}</h2>
                        <span>@{seller.handle}</span>
                      </div>
                    </div>
                    <p className="directory-seller-count">
                      {listings.length} {listings.length === 1 ? 'style' : 'styles'}
                    </p>
                    {workerMode && (
                      <span className={`directory-availability ${orderable ? 'enabled' : ''}`}>
                        {orderable ? 'Ordering enabled' : 'Browse only'}
                      </span>
                    )}
                  </th>
                  <td data-label="Overall rating">
                    <Rating {...seller} />
                    <Link
                      className="text-link directory-reviews-link"
                      href={`/sellers/${seller.id}`}
                    >
                      View reviews <ArrowUpRight size={14} aria-hidden="true" />
                    </Link>
                  </td>
                  <td data-label="Price per image">
                    <div className="directory-price">
                      {low.toFixed(2)}
                      {low !== high && <>–{high.toFixed(2)}</>}
                    </div>
                    <span className="directory-currency">USDC / image</span>
                  </td>
                  <td data-label="Styles & prices">
                    <ul className="directory-styles">
                      {sorted.map((style) => (
                        <li key={style.id}>
                          <Link href={`/styles/${style.id}`}>
                            <img src={style.sampleImages[0]} alt="" loading="lazy" />
                            <span className="directory-style-name">
                              <strong>{style.name}</strong>
                              <span>~{style.etaSeconds}s delivery</span>
                            </span>
                            <span className="directory-style-price">
                              {style.priceUsdc.toFixed(2)} <small>USDC</small>
                            </span>
                            <ArrowUpRight size={14} aria-hidden="true" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div className="empty-state">
          <h2>The first studio could be yours.</h2>
          <p>Publish a style to join the marketplace.</p>
          <Link className="button button-dark" href="/sell">
            Create a listing
          </Link>
        </div>
      )}
      <p className="directory-footnote">
        Overall ratings count each reviewed, delivered order equally. Sellers without reviews are
        unrated.
      </p>
      {workerMode && (
        <p className="directory-footnote">
          Ordering enabled means the seller is configured for this marketplace. Their worker must be
          running to deliver; browse-only sellers are still shown here.
        </p>
      )}
    </div>
  );
}
