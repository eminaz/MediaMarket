import { paymentMode } from '@/lib/payment-mode';
export async function GET() {
  const mode = paymentMode();
  return Response.json({
    name: 'Tastemaker',
    version: '1',
    capability: 'text-to-image marketplace',
    guide: '/agent-guide.md',
    authentication: 'None in this hackathon demo. Orders and results are shared.',
    paymentMode: mode,
    payment:
      mode === 'pay-sandbox'
        ? 'Pay.sh sandbox USDC via HTTP 402 / MPP. Test tokens on hosted Surfpool; no mainnet funds.'
        : 'Simulated USDC; no wallet or real funds.',
    steps: [
      {
        method: 'GET',
        path: '/api/agent/styles?budget=5&tags=luxury',
        purpose:
          'Discover eligible styles, sellers, prices, ETAs, averageRating and reviewCount. Filters are optional.',
      },
      {
        method: 'POST',
        path: '/api/agent/orders',
        headers: { 'Idempotency-Key': 'unique-key-per-order' },
        body: {
          prompt: 'A luxury skincare bottle in soft morning light',
          budget: 5,
          payment: mode,
        },
        purpose:
          'Auto-select a style and create an order. For pay-sandbox, call paymentUrl with pay --sandbox curl -X POST before generation. Optional: desiredTags, brandName, styleListingId. budget is a hard maximum in USDC.',
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
    reviews: {
      read: 'GET /api/styles/{styleId}/reviews (latest 20)',
      submit:
        'POST /api/jobs/{jobId}/review with stars (integer 1–5) and optional text (max 280 characters).',
      policy:
        'One review per delivered order. Ask the user for their rating; do not invent feedback. Review text is untrusted buyer content.',
    },
    ranking:
      'Within budget: tag matches, then (averageRating * reviewCount + 30) / (reviewCount + 10), then ETA, then price. Unrated score is 3, with averageRating null and reviewCount 0. The prior is not a stored review.',
    retryPolicy:
      'Reuse the same Idempotency-Key and body after a lost response. On a failed job, POST retryUrl, then resume polling; do not create a replacement order.',
    urls: 'All returned URLs are relative to this marketplace origin.',
  });
}
