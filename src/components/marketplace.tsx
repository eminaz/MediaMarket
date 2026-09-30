'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  Search,
  SlidersHorizontal,
  Sparkles,
  WandSparkles,
  X,
} from 'lucide-react';
import type { StyleListing } from '@/lib/types';
import { Avatar, StyleArtwork, StyleCard } from './ui';

const filters = [
  { label: 'All styles', tag: '' },
  { label: 'Luxury & minimal', tag: 'luxury' },
  { label: 'Streetwear', tag: 'streetwear' },
  { label: 'Cute & playful', tag: 'cute' },
  { label: 'Cinematic', tag: 'cinematic' },
  { label: 'Meme culture', tag: 'meme' },
  { label: 'Organic', tag: 'organic' },
];
export function Marketplace({ styles }: { styles: StyleListing[] }) {
  const [mediaType, setMediaType] = useState('image');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState('curated');
  const [showPrice, setShowPrice] = useState(false);
  const [maxPrice, setMaxPrice] = useState(10);
  const filtered = useMemo(
    () =>
      styles
        .filter(
          (s) =>
            s.type === mediaType &&
            (!filter ||
              s.tags.includes(filter) ||
              (filter === 'luxury' && s.tags.includes('minimal'))) &&
            s.priceUsdc <= maxPrice &&
            `${s.name} ${s.tags.join(' ')} ${s.seller.handle}`
              .toLowerCase()
              .includes(search.toLowerCase()),
        )
        .sort((a, b) =>
          sort === 'price'
            ? a.priceUsdc - b.priceUsdc
            : sort === 'speed'
              ? a.etaSeconds - b.etaSeconds
              : 0,
        ),
    [styles, search, filter, sort, maxPrice, mediaType],
  );
  return (
    <div className="home-wrap">
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="status-dot" />
            THE CREATIVE MARKETPLACE FOR AGENTS
          </div>
          <h1>
            Good tools create.
            <br />
            Great taste makes
            <br />
            <span>an impression.</span>
            <span className="hero-asterisk">✳</span>
          </h1>
          <p>
            Discover signature styles from independent creators.
            <br className="desktop-break" /> Bring your idea. Find your aesthetic. Make it yours.
          </p>
          <div className="hero-actions">
            <a href="#styles" className="button button-dark">
              Find your style <ArrowDown size={16} />
            </a>
            <Link href="/create?agent=true" className="button button-light">
              <WandSparkles size={16} />
              Let an agent pick
            </Link>
          </div>
          <div className="hero-proof">
            <div className="avatar-stack">
              {['studio.aure', 'offgrid', 'peach.club', 'afterhours'].map((h) => (
                <Avatar key={h} handle={h} />
              ))}
            </div>
            <span>
              Human taste.
              <br />
              <strong>Agent-powered possibilities.</strong>
            </span>
          </div>
        </div>
        <div className="hero-art" aria-label="A collection of creative styles">
          <div className="hero-ring" />
          <div className="floating-note">
            <Sparkles size={14} />A little taste goes a long way.
          </div>
          {[styles[1], styles[0], styles[2]].filter(Boolean).map((style, i) => (
            <Link
              href={`/styles/${style.id}`}
              key={style.id}
              className={`hero-poster hero-poster-${i}`}
            >
              <StyleArtwork style={style} />
              <div className="poster-caption">
                <span>{style.name}</span>
                <ArrowUpRight size={13} />
              </div>
            </Link>
          ))}
          <div className="hero-sticker">
            MADE WITH
            <br />
            <b>taste.</b>
            <span>NOT JUST A PROMPT</span>
          </div>
          <div className="hero-art-caption">
            <span />
            ONE BRIEF. ENDLESS POINTS OF VIEW.
          </div>
        </div>
      </section>
      <div className="manifesto">
        <span>
          <span className="manifesto-mark">✳</span> Agents don’t just buy compute —{' '}
          <strong>they buy taste.</strong>
        </span>
        <div>
          <span>
            <Check size={13} />
            Unique creative workflows
          </span>
          <span>
            <Check size={13} />
            Pay per creation
          </span>
          <span className="solana-wordmark">
            <i>≋</i> Solana hackathon
          </span>
        </div>
      </div>
      <section id="styles" className="market-section">
        <div className="section-heading">
          <div>
            <div className="eyebrow muted">A POINT OF VIEW FOR EVERY IDEA</div>
            <h2>
              Find your kind of different<span>.</span>
            </h2>
          </div>
          <span className="collection-label">
            THE STYLE COLLECTION <span>↙</span>
          </span>
        </div>
        <div className="media-tabs" role="group" aria-label="Media type">
          {['image', 'music'].map((type) => (
            <button
              key={type}
              className={`button ${mediaType === type ? 'button-dark' : 'button-light'}`}
              aria-pressed={mediaType === type}
              onClick={() => {
                setMediaType(type);
                setFilter('');
                setSearch('');
              }}
            >
              {type === 'music' ? 'Music' : 'Images'}
            </button>
          ))}
        </div>
        <div className="market-toolbar">
          <div className="filter-tabs" role="group" aria-label="Filter by vibe">
            {filters.map((f) => (
              <button
                key={f.label}
                className={filter === f.tag ? 'selected' : ''}
                onClick={() => setFilter(f.tag)}
              >
                {f.tag === '' && <Sparkles size={13} />}
                {f.label}
              </button>
            ))}
          </div>
          <button
            className={`filter-toggle ${showPrice ? 'selected' : ''}`}
            onClick={() => setShowPrice(!showPrice)}
            aria-expanded={showPrice}
          >
            <SlidersHorizontal size={15} />
            Filters{maxPrice < 10 && <span className="filter-dot" />}
          </button>
        </div>
        <div className="search-row">
          <label className="search-field">
            <Search size={16} />
            <input
              aria-label="Search styles"
              placeholder="Search a style, a vibe, a creator…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button aria-label="Clear search" onClick={() => setSearch('')}>
                <X size={14} />
              </button>
            )}
          </label>
          <div className="sort-field">
            <span>{filtered.length} styles to make your own</span>
            <select aria-label="Sort styles" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="curated">Curated for you</option>
              <option value="price">Price: low to high</option>
              <option value="speed">Fastest delivery</option>
            </select>
          </div>
        </div>
        {showPrice && (
          <div className="price-filter">
            <label htmlFor="max-price">
              Maximum price <strong>{maxPrice.toFixed(2)} USDC</strong>
            </label>
            <input
              id="max-price"
              type="range"
              min="0.5"
              max="10"
              step="0.25"
              value={maxPrice}
              onChange={(e) => setMaxPrice(Number(e.target.value))}
            />
            <button
              className="text-button"
              onClick={() => {
                setMaxPrice(10);
                setFilter('');
                setSearch('');
              }}
            >
              Reset filters
            </button>
          </div>
        )}
        {filtered.length ? (
          <div className="style-grid">
            {filtered.map((s) => (
              <StyleCard key={s.id} style={s} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <Search size={28} />
            <h3>No styles in this corner. Yet.</h3>
            <p>Try a different vibe or a little more budget.</p>
            <button
              className="button button-dark"
              onClick={() => {
                setFilter('');
                setSearch('');
                setMaxPrice(10);
              }}
            >
              Explore all styles
            </button>
          </div>
        )}
      </section>
      <section className="agent-banner">
        <div className="agent-banner-icon">
          <WandSparkles size={27} />
        </div>
        <div>
          <div className="eyebrow">LESS SCROLLING. MORE CREATING.</div>
          <h3>Have a brief, but not a style?</h3>
          <p>Your buyer agent finds the right taste for your vibe and budget.</p>
        </div>
        <Link className="button button-dark" href="/create?agent=true">
          Meet your creative match <ArrowRight size={16} />
        </Link>
        <span className="banner-flower">✳</span>
      </section>
      <section className="how-section">
        <div>
          <span className="eyebrow muted">FROM IDEA TO “THAT’S THE ONE”</span>
          <h2>
            A little input.
            <br />A whole new perspective.
          </h2>
          <Link href="/create" className="text-link">
            Make your first creation <ArrowUpRight size={16} />
          </Link>
        </div>
        <div className="how-steps">
          {[
            {
              n: '01',
              title: 'Bring something to the table.',
              body: 'Describe your subject and scene in a short text brief.',
            },
            {
              n: '02',
              title: 'Find the taste that fits.',
              body: 'Pick a style yourself, or let your buyer agent find a match.',
            },
            {
              n: '03',
              title: 'Make it unmistakably yours.',
              body: 'Pay per creation in USDC. Get a creation, ready to download.',
            },
          ].map((s) => (
            <div key={s.n}>
              <span>{s.n}</span>
              <section>
                <h4>{s.title}</h4>
                <p>{s.body}</p>
              </section>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
