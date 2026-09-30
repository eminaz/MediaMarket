import Link from 'next/link';
import { ArrowRight, ImagePlus, Plus } from 'lucide-react';
import { getJobs, getStyle } from '@/lib/db';
import { StyleArtwork, Usdc } from '@/components/ui';
export const dynamic = 'force-dynamic';
export default function JobsPage() {
  const jobs = getJobs();
  return (
    <div className="page-wrap">
      <div className="page-title row-title">
        <div>
          <div className="eyebrow muted">THE THINGS YOU’VE PUT INTO THE WORLD</div>
          <h1>
            My creations<span>.</span>
          </h1>
          <p>Your ideas, seen a little differently. Shared local demo history.</p>
        </div>
        <Link className="button button-dark" href="/create">
          <Plus size={16} />
          Create an image
        </Link>
      </div>
      {jobs.length ? (
        <div className="creations-grid">
          {jobs.map((job) => {
            const style = getStyle(job.styleListingId)!;
            return (
              <Link className="creation-card" key={job.id} href={`/jobs/${job.id}`}>
                <div className="creation-preview">
                  {job.outputImageUrl ? (
                    <img src={job.outputImageUrl} alt={job.brandName || style.name} />
                  ) : (
                    <StyleArtwork style={style} />
                  )}
                  <span className={`status-pill ${job.status === 'delivered' ? 'delivered' : ''}`}>
                    {job.paymentStatus === 'pending' ? 'Payment pending' : job.status}
                  </span>
                </div>
                <div>
                  <h3>{job.brandName || style.name}</h3>
                  <p>
                    {style.name} · @{style.seller.handle}
                  </p>
                  <div className="card-bottom">
                    <Usdc amount={job.priceUsdc} />
                    <ArrowRight size={16} />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="empty-state large-empty">
          <ImagePlus size={35} />
          <h2>A blank canvas. For now.</h2>
          <p>Your first good idea is one creative match away.</p>
          <Link className="button button-dark" href="/create">
            Make your first creation <ArrowRight size={16} />
          </Link>
        </div>
      )}
    </div>
  );
}
