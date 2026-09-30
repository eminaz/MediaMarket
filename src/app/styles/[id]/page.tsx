import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  ImagePlus,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { getStyle, getStyles } from '@/lib/db';
import { Avatar, StyleArtwork, StyleCard, Tags, Usdc } from '@/components/ui';
export const dynamic = 'force-dynamic';
export default async function StylePage({ params }: { params: Promise<{ id: string }> }) {
  const style = getStyle((await params).id);
  if (!style) notFound();
  return (
    <div className="page-wrap">
      <Link className="back-link" href="/#styles">
        <ArrowLeft size={15} />
        Back to the collection
      </Link>
      <div className="detail-grid">
        <div>
          <StyleArtwork style={style} className="detail-art" />
          <div className="gallery-caption">
            <span>
              <Sparkles size={14} />A taste of what’s possible
            </span>
            <span>EXAMPLE OUTPUT / 01</span>
          </div>
          {style.sampleImages.slice(1).map((src, i) => (
            <img
              className="extra-sample"
              key={src}
              src={src}
              alt={`${style.name} example ${i + 2}`}
            />
          ))}
        </div>
        <div className="detail-copy">
          <div className="eyebrow muted">SIGNATURE IMAGE WORKFLOW</div>
          <h1>{style.name}</h1>
          <div className="seller-line large">
            <Avatar handle={style.seller.handle} />
            <div>
              <strong>{style.seller.displayName}</strong>
              <span>@{style.seller.handle}</span>
            </div>
            <span className="verified">✳</span>
          </div>
          <p className="detail-description">{style.description}</p>
          <Tags tags={style.tags} />
          <div className="detail-quote">
            “{style.publicPromptSummary || 'A signature perspective for your next idea.'}”
          </div>
          <div className="purchase-box">
            <div>
              <Usdc amount={style.priceUsdc} />
              <span>per image · one-time payment</span>
            </div>
            <span className="eta">
              <Clock3 size={15} />~{style.etaSeconds}s delivery
            </span>
          </div>
          <Link className="button button-dark button-full" href={`/create?style=${style.id}`}>
            Use this style <ArrowRight size={17} />
          </Link>
          <p className="checkout-note">
            <ShieldCheck size={13} />
            Simulated USDC checkout · No wallet required
          </p>
          <div className="requirements">
            <h3>
              <ImagePlus size={17} />
              What you bring
            </h3>
            <p>{style.inputRequirements}</p>
            <h3>
              <Check size={17} />
              What you get
            </h3>
            <p>
              A finished image and a downloadable PNG.{' '}
              {style.commercialUseAllowed
                ? 'Commercial use allowed under this seller’s listing terms.'
                : 'Personal use only under this seller’s listing terms.'}
            </p>
            <span className="license-label">
              <ShieldCheck size={14} />
              {style.commercialUseAllowed ? 'Commercial use allowed' : 'Personal use only'}
            </span>
          </div>
        </div>
      </div>
      <div className="related-section">
        <div className="section-heading">
          <h2>Another way to see it.</h2>
          <Link href="/" className="text-link">
            All styles <ArrowRight size={15} />
          </Link>
        </div>
        <div className="style-grid">
          {getStyles()
            .filter((s) => s.id !== style.id)
            .slice(0, 3)
            .map((s) => (
              <StyleCard key={s.id} style={s} />
            ))}
        </div>
      </div>
    </div>
  );
}
