'use client';
import { useRef, useState } from 'react';
import { ImagePlus, LoaderCircle, Upload, X } from 'lucide-react';
import { uploadImage } from '@/lib/client';
export function ImageUpload({
  value,
  onChange,
  demo = false,
  label = 'Upload your image',
}: {
  value: string;
  onChange: (url: string) => void;
  demo?: boolean;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);
  async function upload(file?: File) {
    if (!file || busy) return;
    setBusy(true);
    setError('');
    try {
      onChange(await uploadImage(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <input
        ref={input}
        aria-label={label}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        onChange={(e) => {
          void upload(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {value ? (
        <div className="uploaded-image">
          <img src={value} alt="Your input image" />
          <div>
            <span>
              <ImagePlus size={16} />
              Image ready
            </span>
            <button
              type="button"
              className="text-button"
              onClick={() => onChange('')}
              aria-label="Remove image"
            >
              <X size={16} />
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className={`upload-zone ${drag ? 'dragging' : ''}`}
          disabled={busy}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            void upload(e.dataTransfer.files?.[0]);
          }}
        >
          {busy ? <LoaderCircle className="spin" size={27} /> : <Upload size={25} />}
          <strong>{busy ? 'Getting your image ready…' : 'Drop something good here'}</strong>
          <span>or click to upload · PNG, JPG, WebP · up to 10 MB</span>
        </button>
      )}
      {demo && !value && (
        <button
          type="button"
          className="demo-product-button"
          onClick={() => onChange('/samples/demo-product.png')}
          disabled={busy}
        >
          <img src="/samples/demo-product.png" alt="Sample skincare bottle" />
          <span>
            Just exploring?{' '}
            <strong>
              Try our sample product <span>↗</span>
            </strong>
          </span>
        </button>
      )}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
