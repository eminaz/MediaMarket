'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
  WandSparkles,
} from 'lucide-react';
import { api } from '@/lib/client';
import type { GenerationJob, StyleListing } from '@/lib/types';
import { Avatar, StyleArtwork, Tags, Usdc } from './ui';
import { ImageUpload } from './image-upload';

const vibes = [
  'luxury',
  'minimal',
  'streetwear',
  'bold',
  'pastel',
  'cute',
  'cinematic',
  'dark',
  'meme',
  'organic',
];
export function CreateFlow({
  styles,
  initialStyle,
  agentFirst,
  mode,
}: {
  styles: StyleListing[];
  initialStyle?: string;
  agentFirst: boolean;
  mode: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [image, setImage] = useState('');
  const [brief, setBrief] = useState('');
  const [brand, setBrand] = useState('');
  const [budget, setBudget] = useState('5');
  const [tags, setTags] = useState<string[]>([]);
  const [selected, setSelected] = useState(styles.find((s) => s.id === initialStyle) || null);
  const [agent, setAgent] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [payment, setPayment] = useState<'idle' | 'pending' | 'confirmed'>('idle');
  const [jobId, setJobId] = useState<string | null>(null);
  function next() {
    setError('');
    if (!image) return setError('Add an input image, or try our sample product.');
    if (brief.trim().length < 5)
      return setError('Give your creator a short brief of at least 5 characters.');
    if (!Number.isFinite(Number(budget)) || Number(budget) <= 0 || Number(budget) > 10000)
      return setError('Enter a budget between 0.01 and 10,000 USDC.');
    setStep(2);
    if (agentFirst && !selected) void autoPick();
  }
  async function autoPick() {
    setBusy(true);
    setError('');
    try {
      const pick = await api<{ style: StyleListing; reason: string }>('/api/agent/pick', {
        budget: Number(budget),
        desiredTags: tags,
      });
      setSelected(pick.style);
      setAgent(true);
      setReason(pick.reason);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function pay() {
    if (!selected || busy) return;
    setBusy(true);
    setPayment('pending');
    setError('');
    try {
      let id = jobId;
      if (!id) {
        const job = await api<GenerationJob>('/api/jobs', {
          styleListingId: selected.id,
          inputImageUrl: image,
          buyerBrief: brief,
          brandName: brand,
          budget: Number(budget),
          desiredTags: tags,
          selectedByAgent: agent,
        });
        id = job.id;
        setJobId(id);
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const paid = await api<GenerationJob>(`/api/jobs/${id}/pay`, {});
      if (paid.paymentStatus !== 'confirmed')
        throw new Error('Payment is still pending. Please try again.');
      setPayment('confirmed');
      await new Promise((resolve) => setTimeout(resolve, 800));
      router.push(`/jobs/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setPayment('idle');
      setBusy(false);
    }
  }
  return (
    <div className="page-wrap create-page">
      <Link href="/" className="back-link">
        <ArrowLeft size={15} />
        Back to exploring
      </Link>
      <div className="page-title">
        <div className="eyebrow muted">YOUR NEXT GOOD IDEA STARTS HERE</div>
        <h1>
          Let’s make an impression<span>.</span>
        </h1>
        <p>A little direction from you. A whole lot of taste from your creator.</p>
      </div>
      <div className="stepper">
        {['Your brief', 'Find your style', 'Make it yours'].map((s, i) => (
          <div
            key={s}
            className={`${step === i + 1 ? 'current' : ''} ${step > i + 1 ? 'complete' : ''}`}
          >
            <span>{step > i + 1 ? <Check size={13} /> : `0${i + 1}`}</span>
            {s}
            {i < 2 && <i />}
          </div>
        ))}
      </div>
      <div className="create-grid">
        <section className="form-panel">
          {step === 1 && (
            <>
              <div className="panel-heading">
                <span className="section-number">01</span>
                <div>
                  <h2>Give us the starting point.</h2>
                  <p>A product, a portrait, a thing you love.</p>
                </div>
              </div>
              <ImageUpload value={image} onChange={setImage} demo />
              <label className="field">
                The brief <span>What are we making?</span>
                <textarea
                  value={brief}
                  maxLength={1000}
                  onChange={(e) => setBrief(e.target.value)}
                  placeholder="A launch campaign for my new skincare line. Think quiet luxury, morning light, and less-is-more energy."
                  rows={4}
                />
              </label>
              <label className="field">
                Brand or subject name <span>Optional</span>
                <input
                  value={brand}
                  maxLength={60}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder="e.g. AURA skincare"
                />
              </label>
              <div className="field-row">
                <label className="field">
                  Your budget{' '}
                  <div className="input-suffix">
                    <input
                      type="number"
                      min="0.01"
                      max="10000"
                      step="0.25"
                      value={budget}
                      onChange={(e) => {
                        setBudget(e.target.value);
                        setAgent(false);
                      }}
                    />
                    <span>USDC</span>
                  </div>
                </label>
                <div className="budget-hint">
                  <ShieldCheck size={18} />
                  <span>
                    You only pay the style’s price.
                    <br />
                    Your budget is the upper limit.
                  </span>
                </div>
              </div>
              <div className="field">
                Set the vibe <span>Choose a few that feel right</span>
                <div className="vibe-chips">
                  {vibes.map((t) => (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={tags.includes(t)}
                      className={tags.includes(t) ? 'selected' : ''}
                      onClick={() => {
                        setTags(tags.includes(t) ? tags.filter((v) => v !== t) : [...tags, t]);
                        setAgent(false);
                      }}
                    >
                      {tags.includes(t) && <Check size={12} />}
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <button className="button button-dark button-full" onClick={next}>
                Find my style <ArrowRight size={16} />
              </button>
            </>
          )}
          {step === 2 && (
            <>
              <div className="panel-heading">
                <span className="section-number">02</span>
                <div>
                  <h2>Find your creative match.</h2>
                  <p>Handpick a point of view, or give your agent the brief.</p>
                </div>
              </div>
              <button className="auto-pick-button" disabled={busy} onClick={autoPick}>
                {busy ? <LoaderCircle className="spin" size={23} /> : <WandSparkles size={23} />}
                <span>
                  <strong>Auto-pick for me</strong>
                  <span>Your vibe + your budget + the fastest match.</span>
                </span>
                <ArrowRight size={19} />
              </button>
              {agent && reason && (
                <div className="agent-reason">
                  <Sparkles size={18} />
                  <div>
                    <strong>A little reasoning behind the taste</strong>
                    <p>{reason}</p>
                  </div>
                </div>
              )}
              <div className="style-options">
                {mode === 'worker' && (
                  <p className="mode-note">
                    Showing styles from sellers configured for this worker demo. Their laptop must
                    be running to deliver your image.
                  </p>
                )}
                {styles.length === 0 && (
                  <p className="error-message" role="alert">
                    No seller workers are configured. Add a seller token on the marketplace or use
                    the distributed demo launcher.
                  </p>
                )}
                {styles.map((s) => (
                  <button
                    key={s.id}
                    disabled={s.priceUsdc > Number(budget) || busy}
                    className={`style-option ${selected?.id === s.id ? 'selected' : ''}`}
                    onClick={() => {
                      setSelected(s);
                      setAgent(false);
                      setReason('');
                    }}
                  >
                    <StyleArtwork style={s} />
                    <span className="option-copy">
                      <strong>{s.name}</strong>
                      <span>
                        @{s.seller.handle} · ~{s.etaSeconds}s
                      </span>
                      <span>{s.tags.join(' · ')}</span>
                    </span>
                    <span className="option-price">
                      {s.priceUsdc.toFixed(2)}
                      <small>USDC</small>
                      {s.priceUsdc > Number(budget) && <small>Over budget</small>}
                    </span>
                    <span className="radio-circle">
                      {selected?.id === s.id && <Check size={12} />}
                    </span>
                  </button>
                ))}
              </div>
              <div className="form-actions">
                <button
                  className="button button-light"
                  onClick={() => {
                    setStep(1);
                    setError('');
                  }}
                >
                  Back
                </button>
                <button
                  className="button button-dark"
                  disabled={!selected || selected.priceUsdc > Number(budget) || busy}
                  onClick={() => {
                    setStep(3);
                    setError('');
                  }}
                >
                  Review creation <ArrowRight size={16} />
                </button>
              </div>
            </>
          )}
          {step === 3 && selected && (
            <>
              <div className="panel-heading">
                <span className="section-number">03</span>
                <div>
                  <h2>Good taste. Great choice.</h2>
                  <p>One last look before we bring your idea to life.</p>
                </div>
              </div>
              <div className="review-input">
                <img src={image} alt="Your input" />
                <div>
                  <span className="eyebrow muted">YOUR STARTING POINT</span>
                  <h3>{brand || 'Untitled creation'}</h3>
                  <p>{brief}</p>
                  <Tags tags={tags} />
                </div>
              </div>
              <div className="order-lines">
                <div>
                  <span>{selected.name}</span>
                  <Usdc amount={selected.priceUsdc} />
                </div>
                <div>
                  <span>Platform fee</span>
                  <span>
                    On us <span className="tiny-star">✳</span>
                  </span>
                </div>
                <div>
                  <span>Estimated generation</span>
                  <span>~{selected.etaSeconds} seconds</span>
                </div>
                <div className="order-total">
                  <strong>Total</strong>
                  <Usdc amount={selected.priceUsdc} />
                </div>
              </div>
              <div className="payment-notice">
                <span className="solana-icon">≋</span>
                <div>
                  <strong>USDC, with a Solana state of mind.</strong>
                  <p>
                    This is a simulated payment. No wallet, real tokens, or network fees.{' '}
                    {mode === 'worker'
                      ? 'A separate seller worker will compose your image and send it back.'
                      : mode === 'mock'
                        ? 'Your image uses our local demo compositor.'
                        : 'Image generation uses the configured live API.'}
                  </p>
                </div>
                <span className="demo-badge">DEMO</span>
              </div>
              <button
                className={`button button-full ${payment === 'confirmed' ? 'button-success' : 'button-dark'}`}
                disabled={busy}
                onClick={pay}
              >
                {payment === 'pending' ? (
                  <>
                    <LoaderCircle className="spin" size={18} />
                    Payment pending…
                  </>
                ) : payment === 'confirmed' ? (
                  <>
                    <CheckCircle2 size={18} />
                    Payment confirmed
                  </>
                ) : (
                  <>
                    Pay {selected.priceUsdc.toFixed(2)} USDC & create <ArrowRight size={17} />
                  </>
                )}
              </button>
              <p className="checkout-note">
                <ShieldCheck size={13} />
                {selected.commercialUseAllowed ? 'Commercial use allowed' : 'Personal use only'} ·
                Downloadable PNG
              </p>
              {!busy && !jobId && (
                <button className="text-button" onClick={() => setStep(2)}>
                  <ArrowLeft size={14} />
                  Change style
                </button>
              )}
              {jobId && !busy && (
                <Link className="text-link" href={`/jobs/${jobId}`}>
                  Open saved order <ArrowRight size={14} />
                </Link>
              )}
            </>
          )}
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
        </section>
        <aside className="creation-aside">
          {selected ? (
            <>
              <StyleArtwork style={selected} />
              <div className="aside-content">
                <span className="eyebrow muted">
                  {agent ? 'YOUR AGENT’S PICK' : 'YOUR SELECTED STYLE'}
                </span>
                <h3>{selected.name}</h3>
                <div className="seller-line">
                  <Avatar handle={selected.seller.handle} />@{selected.seller.handle}
                </div>
                <p>{selected.publicPromptSummary}</p>
                <div className="card-bottom">
                  <Usdc amount={selected.priceUsdc} />
                  <span className="eta">
                    <Clock3 size={13} />~{selected.etaSeconds}s
                  </span>
                </div>
              </div>
            </>
          ) : (
            <div className="aside-empty">
              <span>✳</span>
              <h3>
                A fresh set
                <br />
                of eyes.
              </h3>
              <p>
                Every style is a creator’s unique recipe. Your image is the ingredient that makes it
                yours.
              </p>
              <div>
                <Check size={14} />
                Signature creative direction
              </div>
              <div>
                <Check size={14} />
                Simple, per-image pricing
              </div>
              <div>
                <Check size={14} />
                Yours to download
              </div>
            </div>
          )}
          <div className="aside-footnote">
            <span className="status-dot" />
            {mode === 'worker'
              ? 'Seller laptop mode · mock image renderer'
              : mode === 'mock'
                ? 'Demo mode · no API key needed'
                : 'Live image generation enabled'}
          </div>
        </aside>
      </div>
    </div>
  );
}
