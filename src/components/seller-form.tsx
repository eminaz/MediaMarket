'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, EyeOff, LoaderCircle, Plus, Sparkles, X } from 'lucide-react';
import { api } from '@/lib/client';
import type { StyleListing } from '@/lib/types';
import { ImageUpload } from './image-upload';
export function SellerForm() {
  const router = useRouter();
  const [samples, setSamples] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!samples.length) return setError('Add at least one sample image to show your style.');
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const listing = await api<StyleListing>('/api/styles', {
        name: form.get('name'),
        handle: String(form.get('handle')).replace(/^@/, ''),
        description: form.get('description'),
        tags: String(form.get('tags'))
          .split(',')
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean),
        priceUsdc: Number(form.get('price')),
        etaSeconds: Number(form.get('eta')),
        sampleImages: samples,
        hiddenWorkflowPrompt: form.get('workflow'),
        publicPromptSummary: form.get('summary'),
        inputRequirements: form.get('requirements'),
        commercialUseAllowed: form.get('commercial') === 'on',
        palette: form.get('palette'),
      });
      router.push(`/styles/${listing.id}`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="page-wrap seller-page">
      <div className="page-title">
        <div className="eyebrow muted">THE SELLER STUDIO</div>
        <h1>
          Your taste is the product<span>.</span>
        </h1>
        <p>Package your creative point of view. Let a whole new audience put it to work.</p>
      </div>
      <div className="create-grid">
        <form className="form-panel" onSubmit={submit}>
          <div className="panel-heading">
            <span className="section-number">
              <Plus size={18} />
            </span>
            <div>
              <h2>Create a signature style</h2>
              <p>A repeatable recipe. An unmistakable point of view.</p>
            </div>
          </div>
          <div className="field-row">
            <label className="field">
              Style name
              <input
                name="name"
                required
                minLength={3}
                maxLength={70}
                placeholder="e.g. Analog Summer"
              />
            </label>
            <label className="field">
              Seller handle
              <input
                name="handle"
                required
                minLength={2}
                maxLength={31}
                placeholder="@your.studio"
              />
            </label>
          </div>
          <label className="field">
            Describe your style
            <textarea
              name="description"
              required
              minLength={20}
              maxLength={1500}
              rows={3}
              placeholder="What makes your style different? What kind of images does it create?"
            />
          </label>
          <label className="field">
            Your style in a sentence <span>Optional</span>
            <input
              name="summary"
              maxLength={150}
              placeholder="Sun-soaked. Grain-heavy. Beautifully imperfect."
            />
          </label>
          <label className="field">
            Tags <span>Separate with commas</span>
            <input name="tags" required placeholder="analog, warm, lifestyle" />
          </label>
          <div className="field-row">
            <label className="field">
              Price per image <span>USDC</span>
              <input
                name="price"
                type="number"
                min="0.10"
                max="1000"
                step="0.01"
                defaultValue="2.00"
                required
              />
            </label>
            <label className="field">
              Estimated delivery <span>Seconds</span>
              <input name="eta" type="number" min="5" max="3600" defaultValue="30" required />
            </label>
          </div>
          <div className="field">
            Show your signature <span>1–3 sample images</span>
          </div>
          <div className="sample-thumbs">
            {samples.map((src, i) => (
              <div key={src}>
                <img src={src} alt={`Sample ${i + 1}`} />
                <button
                  type="button"
                  aria-label={`Remove sample ${i + 1}`}
                  onClick={() => setSamples(samples.filter((_, index) => index !== i))}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
          {samples.length < 3 && (
            <ImageUpload
              value=""
              label="Upload sample image"
              onChange={(url) => setSamples([...samples, url])}
            />
          )}
          <label className="field">
            Inputs you need
            <textarea
              name="requirements"
              required
              minLength={5}
              maxLength={500}
              rows={2}
              defaultValue="One product or subject image (PNG, JPG, or WebP) and a short creative brief."
            />
          </label>
          <label className="field">
            Demo composition palette
            <select name="palette" defaultValue="luxury">
              <option value="luxury">Warm ivory / Luxury</option>
              <option value="street">Electric blue / Streetwear</option>
              <option value="pastel">Soft pink / Pastel</option>
              <option value="cinema">Deep charcoal / Cinematic</option>
              <option value="meme">Acid green / Meme</option>
              <option value="organic">Earthy sage / Organic</option>
            </select>
            <small>
              Used by the local fallback compositor. Live generation follows your workflow below.
            </small>
          </label>
          <div className="secret-field">
            <div>
              <EyeOff size={18} />
              <strong>The secret sauce</strong>
              <span>PRIVATE</span>
            </div>
            <p>
              Your internal workflow stays on the server. Buyers see your style, never this recipe.
            </p>
            <label className="field">
              Internal workflow prompt
              <textarea
                name="workflow"
                required
                minLength={15}
                maxLength={4000}
                rows={6}
                placeholder="Describe your art direction, composition rules, lighting, textures, typography, and how to incorporate the buyer’s input image…"
              />
            </label>
          </div>
          <label className="checkbox-field">
            <input name="commercial" type="checkbox" defaultChecked />
            <span>Allow commercial use of images created with this style.</span>
          </label>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <button className="button button-dark button-full" type="submit" disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />}
            {busy ? 'Publishing your style…' : 'Publish your style'}
            <ArrowRight size={17} />
          </button>
          <p className="checkout-note">Publishes instantly to this local demo marketplace.</p>
        </form>
        <aside className="seller-aside">
          <span className="seller-flower">✳</span>
          <div className="eyebrow">A WORKFLOW WITH A POINT OF VIEW</div>
          <h2>
            Don’t sell a prompt.
            <br />
            Sell a perspective.
          </h2>
          <p>
            The best styles feel like a creative collaborator, with a consistent look and a clear
            purpose.
          </p>
          <div className="seller-tips">
            {[
              'Give your style a specific job to do.',
              'Use examples that show a coherent aesthetic.',
              'Be clear about the input you need.',
              'Keep your special recipe in the secret sauce.',
            ].map((t) => (
              <div key={t}>
                <Check size={15} />
                <span>{t}</span>
              </div>
            ))}
          </div>
          <div className="mode-note">
            Hackathon studio: no sign-in required. Listings are shared with everyone using this
            local instance.
          </div>
        </aside>
      </div>
    </div>
  );
}
