import { ArrowUpRight, Clock3, Sparkles, Star } from 'lucide-react';
import Link from 'next/link';
import type { StyleListing, RatingSummary } from '@/lib/types';

export function Rating({ averageRating, reviewCount, label }: RatingSummary & { label?: string }) {
  return (
    <span className="rating-summary">
      <Star size={13} aria-hidden="true" />
      {label && <span>{label}: </span>}
      {reviewCount > 0 && averageRating !== null
        ? `${averageRating.toFixed(1)} stars · ${reviewCount} ${reviewCount === 1 ? 'review' : 'reviews'}`
        : 'No reviews yet'}
    </span>
  );
}

export function Logo({ small = false }: { small?: boolean }) {
  return (
    <Link href="/" className={`logo ${small ? 'small' : ''}`} aria-label="Tastemaker home">
      <span className="logo-mark">✳</span>
      <span>
        tastemaker<span className="logo-period">.</span>
      </span>
    </Link>
  );
}
export function Usdc({ amount }: { amount?: number }) {
  return (
    <span className="usdc">
      <span className="coin">$</span>
      {amount !== undefined && <strong>{amount.toFixed(2)}</strong>}
      <span>USDC</span>
    </span>
  );
}
export function Avatar({ handle }: { handle: string }) {
  return (
    <span className={`avatar avatar-${handle.length % 4}`}>
      {handle
        .replace(/[^a-z]/g, '')
        .slice(0, 2)
        .toUpperCase()}
    </span>
  );
}
export function Tags({ tags }: { tags: string[] }) {
  return (
    <div className="tags">
      {tags.map((tag) => (
        <span key={tag}>{tag}</span>
      ))}
    </div>
  );
}
const words: Record<string, { eyebrow: string; title: string; sub: string }> = {
  luxury: {
    eyebrow: 'AURÉ — OBJECTS OF DESIRE',
    title: 'Less, but\nbetter.',
    sub: 'THE ART OF EVERYDAY LUXURY',
  },
  street: {
    eyebrow: 'OFFGRID® / NEW SEASON',
    title: 'BUILT\nDIFFERENT.',
    sub: 'NO RULES. JUST THE NEXT DROP.',
  },
  pastel: {
    eyebrow: 'PEACH CLUB / GOOD THINGS',
    title: 'Your daily\nlittle joy.',
    sub: 'A SOFTER KIND OF OBSESSION',
  },
  cinema: {
    eyebrow: 'AN AFTER HOURS ORIGINAL',
    title: 'AFTER\nDARK.',
    sub: 'SOME THINGS ARE FELT. NOT HEARD.',
  },
  meme: {
    eyebrow: 'INTERN.EXE HAS ENTERED THE CHAT',
    title: 'oh, we’re\nso back.',
    sub: 'YOUR NEXT LAUNCH. INTERNET APPROVED.',
  },
  organic: {
    eyebrow: 'STUDIO AURÉ / NATURAL STUDIES',
    title: 'Rooted in\nsomething real.',
    sub: 'A SLOWER KIND OF BEAUTIFUL',
  },
};
export function StyleArtwork({
  style,
  className = '',
}: {
  style: StyleListing;
  className?: string;
}) {
  const copy =
    style.type === 'video'
      ? {
          eyebrow: 'SIGNATURE FILM / ' + style.durationSeconds + ' SECONDS',
          title: 'Roll\nthe film.',
          sub: 'VIDEO · SCENES, MOTION & MUSIC',
        }
      : style.type === 'music'
        ? {
            eyebrow: 'SIGNATURE SOUND / ' + style.durationSeconds + ' SECONDS',
            title: 'Set the\nmood.',
            sub: 'MUSIC · MADE FOR YOUR MOMENT',
          }
        : words[style.palette] || words.luxury;
  const custom = style.sampleImages[0]?.startsWith('/api/');
  return (
    <div className={`artwork art-${style.palette} ${className}`}>
      <img
        src={style.sampleImages[0]}
        alt={`${style.name} sample — ${style.publicPromptSummary}`}
        loading="lazy"
      />
      {!custom && (
        <>
          <div className="art-shade" />
          <span className="art-eyebrow">{copy.eyebrow}</span>
          <div className="art-title">
            {copy.title.split('\n').map((line, i) => (
              <span key={i}>{line}</span>
            ))}
          </div>
          <span className="art-sub">{copy.sub}</span>
          <span className="art-edition">TM—0{Object.keys(words).indexOf(style.palette) + 1}</span>
        </>
      )}
    </div>
  );
}
export function StyleCard({ style }: { style: StyleListing }) {
  return (
    <Link href={`/styles/${style.id}`} className="style-card group">
      <div className="card-art">
        <StyleArtwork style={style} />
        {style.featured && (
          <span className="featured-badge">
            <Sparkles size={11} /> CURATOR’S PICK
          </span>
        )}
        <span className="card-open">
          <ArrowUpRight size={19} />
        </span>
      </div>
      <div className="card-body">
        <div className="card-title-row">
          <h3>{style.name}</h3>
          <span className="media-label">{style.type.toUpperCase()}</span>
        </div>
        <div className="seller-line">
          <Avatar handle={style.seller.handle} />
          <span>@{style.seller.handle}</span>
          <span className="verified">✳</span>
        </div>
        <Tags tags={style.tags} />
        <Rating {...style} />
        <div className="card-bottom">
          <Usdc amount={style.priceUsdc} />
          <span className="eta">
            <Clock3 size={13} />~{style.etaSeconds}s
          </span>
        </div>
      </div>
    </Link>
  );
}
