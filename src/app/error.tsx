'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="page-wrap empty-state large-empty">
      <h1>Let’s try that again.</h1>
      <p>Something interrupted the studio. Your saved work is still here.</p>
      <button className="button button-dark" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
