import Link from 'next/link';
export default function NotFound() {
  return (
    <div className="page-wrap empty-state large-empty">
      <span className="logo-mark">✳</span>
      <h1>A little off the canvas.</h1>
      <p>That style or creation couldn’t be found.</p>
      <Link href="/" className="button button-dark">
        Back to the marketplace
      </Link>
    </div>
  );
}
