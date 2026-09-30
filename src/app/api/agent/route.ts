export async function GET() {
  return Response.json({
    name: 'Tastemaker',
    version: '1',
    capability: 'text-to-image marketplace',
    guide: '/agent-guide.md',
    authentication: 'None in this hackathon demo. Orders and results are shared.',
    payment: 'Simulated USDC only; no wallet or real funds.',
    steps: [
      {
        method: 'GET',
        path: '/api/agent/styles?budget=5&tags=luxury',
        purpose: 'Discover eligible styles, sellers, prices, and ETAs. Filters are optional.',
      },
      {
        method: 'POST',
        path: '/api/agent/orders',
        headers: { 'Idempotency-Key': 'unique-key-per-order' },
        body: {
          prompt: 'A luxury skincare bottle in soft morning light',
          budget: 5,
          payment: 'simulated',
        },
        purpose:
          'Auto-select a style and confirm simulated payment. Optional: desiredTags, brandName, styleListingId. budget is a hard maximum in USDC.',
      },
      {
        method: 'GET',
        path: '/api/agent/orders/{jobId}',
        purpose:
          'Poll every pollAfterMs until delivered or failed. In local execution mode, POST advanceUrl while waiting; worker mode needs no advance calls.',
      },
      {
        method: 'GET',
        path: '{downloadUrl}',
        purpose:
          'Download the PNG to the buyer laptop and display it. viewUrl opens the marketplace result page.',
      },
    ],
    retryPolicy:
      'Reuse the same Idempotency-Key and body after a lost response. On a failed job, POST retryUrl, then resume polling; do not create a replacement order.',
    urls: 'All returned URLs are relative to this marketplace origin.',
  });
}
