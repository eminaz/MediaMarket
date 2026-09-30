'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  Download,
  LoaderCircle,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import type { JobWithStyle } from '@/lib/types';
import { api } from '@/lib/client';
import { Avatar, StyleArtwork, Tags, Usdc } from './ui';
export function JobView({ initialJob }: { initialJob: JobWithStyle }) {
  const [job, setJob] = useState(initialJob);
  const [error, setError] = useState('');
  const [paying, setPaying] = useState(false);
  const advancing = useRef(false);
  const done = job.status === 'delivered';
  useEffect(() => {
    if (job.paymentStatus !== 'confirmed' || job.status === 'delivered' || job.status === 'failed')
      return;
    let stopped = false;
    async function tick() {
      try {
        const latest = await api<JobWithStyle>(`/api/jobs/${initialJob.id}`);
        if (stopped) return;
        setJob(latest);
        setError('');
        if (!advancing.current && !['delivered', 'failed'].includes(latest.status)) {
          advancing.current = true;
          void api(`/api/jobs/${initialJob.id}/advance`, {})
            .catch((e) => {
              if (!stopped) setError(e.message);
            })
            .finally(() => {
              advancing.current = false;
            });
        }
      } catch (e) {
        if (!stopped) setError((e as Error).message);
      }
    }
    void tick();
    const interval = setInterval(tick, 1000);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [initialJob.id, job.status, job.paymentStatus]);
  async function retry() {
    try {
      setError('');
      await api(`/api/jobs/${job.id}/retry`, {});
      setJob(await api(`/api/jobs/${job.id}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function pay() {
    setPaying(true);
    try {
      setError('');
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await api(`/api/jobs/${job.id}/pay`, {});
      setJob(await api(`/api/jobs/${job.id}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPaying(false);
    }
  }
  return (
    <div className="page-wrap job-page">
      <Link className="back-link" href="/jobs">
        <ArrowLeft size={15} />
        My creations
      </Link>
      <div className="job-heading">
        <div>
          <div className="eyebrow muted">CREATION / {job.id.slice(0, 8).toUpperCase()}</div>
          <h1>
            {done
              ? 'Now that’s an impression.'
              : job.status === 'failed'
                ? 'A small creative interruption.'
                : 'Good taste takes a moment.'}
          </h1>
          <p>
            {done
              ? 'Your brief. Your creator’s perspective. Something entirely yours.'
              : job.status === 'failed'
                ? 'Your order is saved. Retry without another payment.'
                : 'Your idea is finding its new point of view.'}
          </p>
        </div>
        <span className={`status-pill ${done ? 'delivered' : ''}`}>
          {done ? <CheckCircle2 size={14} /> : <Clock3 size={14} />}
          {done
            ? 'Delivered'
            : job.paymentStatus === 'pending'
              ? 'Awaiting payment'
              : job.status === 'failed'
                ? 'Needs a retry'
                : 'In the studio'}
        </span>
      </div>
      <div className="job-grid">
        <section className="result-panel">
          {done && job.outputImageUrl ? (
            <>
              <div className="result-image">
                <img
                  src={job.outputImageUrl}
                  alt={`Generated ${job.style.name} image for ${job.brandName || 'your brief'}`}
                />
              </div>
              <div className="result-toolbar">
                <div>
                  <CheckCircle2 size={18} />
                  <span>
                    Your creation, ready to go.
                    <small>
                      {job.generationMode === 'mock'
                        ? 'Demo composition · 1024 × 1280 PNG'
                        : 'AI-generated image · PNG'}
                    </small>
                  </span>
                </div>
                <a
                  className="button button-dark"
                  href={`${job.outputImageUrl}?download=1`}
                  download
                >
                  Download image <Download size={16} />
                </a>
              </div>
            </>
          ) : (
            <div className={`generation-stage ${job.status === 'failed' ? 'failed' : ''}`}>
              <div className="generation-orbit">
                <span>✳</span>
                <i />
                <i />
              </div>
              <span className="eyebrow">
                {job.status === 'failed'
                  ? 'LET’S GIVE THAT ANOTHER GO'
                  : 'YOUR IDEA, IN GOOD HANDS'}
              </span>
              <h2>
                {job.paymentStatus === 'pending'
                  ? 'One step from something good.'
                  : job.status === 'queued'
                    ? 'Your spot in the studio is ready.'
                    : job.status === 'failed'
                      ? 'The studio hit a snag.'
                      : 'A new perspective is taking shape.'}
              </h2>
              <p>
                {job.error ||
                  (job.paymentStatus === 'pending'
                    ? 'Confirm the simulated payment to start your creation.'
                    : 'Bringing your image and your creator’s signature style together.')}
              </p>
              {job.status === 'failed' && (
                <button className="button button-dark" onClick={retry}>
                  <RotateCcw size={16} />
                  Retry generation
                </button>
              )}
              {job.paymentStatus === 'pending' && (
                <button className="button button-dark" onClick={pay} disabled={paying}>
                  {paying && <LoaderCircle className="spin" size={16} />}Pay{' '}
                  {job.priceUsdc.toFixed(2)} demo USDC
                </button>
              )}
              <span className="generation-caption">
                {job.paymentStatus === 'pending'
                  ? 'SIMULATED PAYMENT · NO REAL FUNDS'
                  : `ESTIMATED STYLE DELIVERY: ~${job.style.etaSeconds}s`}
              </span>
            </div>
          )}
          <div className="job-progress" aria-live="polite">
            {['queued', 'generating', 'delivered'].map((s, i) => {
              const current = ['queued', 'generating', 'delivered'].indexOf(job.status);
              return (
                <div key={s} className={current >= i ? 'reached' : ''}>
                  <span>
                    {current > i || done ? (
                      <Check size={13} />
                    ) : current === i ? (
                      <span className="status-dot" />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <strong>{s}</strong>
                  {i < 2 && <i />}
                </div>
              );
            })}
          </div>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
        </section>
        <aside className="job-sidebar">
          <div className="job-style">
            <StyleArtwork style={job.style} />
            <div>
              <span className="eyebrow muted">THE CREATIVE DIRECTION</span>
              <h3>
                <Link href={`/styles/${job.style.id}`}>{job.style.name}</Link>
              </h3>
              <div className="seller-line">
                <Avatar handle={job.style.seller.handle} />@{job.style.seller.handle}
              </div>
              <div className="card-bottom">
                <Usdc amount={job.priceUsdc} />
                <span className="payment-paid">
                  {job.paymentStatus === 'confirmed' ? (
                    <>
                      <Check size={12} />
                      Demo paid
                    </>
                  ) : (
                    'Payment pending'
                  )}
                </span>
              </div>
            </div>
          </div>
          <div className="job-brief">
            <h3>Your starting point</h3>
            <div className="input-thumb">
              <img src={job.inputImageUrl} alt="Original input image" />
              <span>
                {job.brandName || 'Your original image'}
                <small>INPUT IMAGE</small>
              </span>
            </div>
            <label>THE BRIEF</label>
            <p>{job.buyerBrief}</p>
            <Tags tags={job.desiredTags} />
            {job.selectedByAgent && (
              <div className="agent-reason">
                <Sparkles size={17} />
                <div>
                  <strong>Picked by your buyer agent</strong>
                  <p>{job.decisionReason}</p>
                </div>
              </div>
            )}
            <div className="mode-note">
              {job.generationMode === 'mock'
                ? 'Made with our local demo compositor. Your input is arranged into a style-specific poster; this is not an AI image edit.'
                : 'Signature style. One image at a time.'}
            </div>
          </div>
          {done && (
            <Link
              href={`/create?style=${job.styleListingId}`}
              className="button button-light button-full"
            >
              Make another <ArrowRight size={16} />
            </Link>
          )}
        </aside>
      </div>
    </div>
  );
}
