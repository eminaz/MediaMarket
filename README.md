# Tastemaker

**Agents don’t just buy compute — they buy taste.**

A hackathon MVP marketplace for independent image-generation styles. Sellers package a creative recipe; buyers bring an image and a brief, choose a style (or let a buyer agent choose), pay simulated USDC, and receive a downloadable image.

Built with Next.js App Router, TypeScript, Tailwind CSS, SQLite, and Sharp. No authentication, wallet, API key, or external database is needed for the default demo.

## Run locally

Requires **Node.js 22.13+** (Node 24 LTS recommended) and npm. SQLite uses Node’s built-in `node:sqlite` module; no database installation or Prisma generation is required. Some Node versions print an experimental SQLite warning.

```sh
npm install
npm run seed
npm run dev
```

Open **http://localhost:3000**. Seeding is also automatic on the first database access, so `npm run seed` is optional and safe to repeat. It preserves existing listings and jobs. Six demo listings, five sellers, local sample photographs, and a transparent sample product are included.

Production preview:

```sh
npm run build
npm start
```

## Demo walkthrough

1. Explore the marketplace; filter by vibe, search a creator, or sort by price and delivery time.
2. Open **Luxury Product Ad** and click **Use this style**, or start **Create an image**.
3. Upload a PNG, JPG, or WebP, or choose **Try our sample product**.
4. Enter `A quiet luxury launch for a botanical skincare serum.`, brand `AURA skincare`, budget `5`, and vibes `luxury` and `minimal`.
5. Click **Find my style**, then **Auto-pick for me**. The buyer agent selects Luxury Product Ad at **2.50 USDC** and explains its decision. You can also select a style manually.
6. Review the order and click **Pay 2.50 USDC & create**. Payment visibly progresses from pending to confirmed. No real funds move.
7. Watch **queued → generating → delivered**. Local mock delivery takes roughly 7–10 seconds; listing ETAs represent the intended creative service and live API latency varies.
8. Compare the original input, selected style, and output. Download the PNG or create another image.
9. Visit **Seller studio** to publish a new style, upload 1–3 examples, choose pricing and a fallback palette, and enter a private workflow prompt.

Saved creations appear in **My creations**, including pending payments and interrupted work. Reloading a job resumes progress; failed jobs can be retried without another payment.

## Environment variables

No `.env` file is required. To configure live generation, copy `.env.example` to `.env.local` and restart the server.

| Variable             | Default           | Purpose                                                                                                                                                                          |
| -------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GENERATION_MODE`    | `auto` when unset | `mock` always uses the local compositor; `auto` uses OpenAI when a key is present; `openai` explicitly requires the key. The example file selects `mock` for a predictable demo. |
| `OPENAI_API_KEY`     | empty             | Server-side key for optional OpenAI image edits. Never exposed to the browser.                                                                                                   |
| `OPENAI_IMAGE_MODEL` | `gpt-image-1`     | Image-edit model used by the OpenAI provider.                                                                                                                                    |
| `DATA_DIR`           | `./data`          | Writable folder for SQLite and uploaded/generated PNGs. Relative paths resolve from the project root.                                                                            |

### Mock mode

Without an API key, the app creates a **1024 × 1280 PNG poster using the buyer’s actual input image**, brand name, brief, and the chosen style’s palette. This is a deterministic local composition, not an AI image edit or background removal. Six palettes provide different creative treatments. Newly published listings choose a demo palette; arbitrary hidden prompts are interpreted only by the live provider.

The UI labels demo payments and locally composed results. All default images are checked into `public/samples/`; the demo makes no external image requests.

### Live generation

```dotenv
GENERATION_MODE=auto
OPENAI_API_KEY=your-key
OPENAI_IMAGE_MODEL=gpt-image-1
```

The server uploads the buyer’s image to the [OpenAI Image API edits endpoint](https://developers.openai.com/api/docs/guides/image-generation#edit-images), with the seller’s private workflow, buyer brief, and optional brand name. The returned PNG is stored locally. Requires API credits and access to the configured model; provider charges are separate from the simulated marketplace price.

Real provider errors are displayed as failed jobs with a retry action; the app does **not** silently substitute mock output after a live failure. Requests time out after 150 seconds. Live generation is implemented but automated tests run entirely in mock mode; no paid API requests are made by the tests.

## How it works

```text
src/app/                 App Router pages and API routes
src/components/          Marketplace, creation flow, seller form, job status UI
src/lib/types.ts         Seller, StyleListing, GenerationJob, MediaType
src/lib/db.ts            SQLite tables, idempotent seed, public projections
src/lib/seed.ts          Six signature style listings
src/lib/agent.ts         Budget filter → exact tag matches → lowest ETA → price
src/lib/generation.ts    ImageProvider interface, mock and OpenAI providers
src/lib/media.ts         Image validation, normalization, local storage
src/lib/validation.ts    API input validation
scripts/seed.ts          Optional explicit seed command
tests/                  Agent unit tests and Playwright acceptance tests
```

SQLite stores `Seller`, `StyleListing`, and `GenerationJob` records as JSON in relational tables with stable primary keys and foreign keys. Prices are snapshotted on jobs and validated on the server. Seller handles group multiple styles under the same seller.

Private workflow prompts stay in the server database. Public API responses, server-rendered listing data, agent selections, and job metadata use an explicit public projection that removes `hiddenWorkflowPrompt`.

The browser polls job state and advances paid work through a small HTTP state machine. A SQLite compare-and-swap claim prevents duplicate provider calls from multiple tabs. Delivered jobs and payment confirmations are idempotent. If the local process stops during generation, the job becomes retryable after a three-minute stale-claim timeout. No distributed queue is needed for the demo. A queued job advances when its page is open; it is not a background worker.

## Checks

```sh
npm run typecheck
npm run lint
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

Browser tests start their own server on port 3100 with an isolated database under `data/test-*`. They cover browsing, filtering, detail pages, real file upload, auto-picking, manual selection, mock payment, refresh recovery, download, seller publishing, private-prompt isolation, invalid requests, and mobile overflow. Screenshots are saved under `test-results/`.

## Deliberate MVP boundaries

- **Payments are simulated.** There are no on-chain transactions, wallet connections, settlement, or real balances. The app is Solana/USDC themed, not an on-chain marketplace.
- **No sign-in.** Seller handles, creations, uploads, and job URLs are shared by users of the local instance. Workflow prompts are omitted from public routes, but this is not a secure multi-tenant service.
- **Persistent local disk is required.** Use a long-running Node process with writable storage. Ephemeral serverless filesystems require a different database, object storage, and a durable worker.
- Uploads are limited to 10 MB and PNG/JPG/WebP; decoded images are capped at 40 million pixels and normalized to PNG with a maximum dimension of 1600 pixels.
- Commercial use is a seller-provided listing label. Buyers remain responsible for the rights to their inputs and final uses.

## Extending to video

`MediaType` already allows `image | video`. The current picker and checkout only accept image listings. Add a video provider with an asynchronous submit/status interface, duration/aspect-ratio inputs, object storage for larger files, and a video player on the delivery page. Reuse sellers, style recipes, pricing, payment state, and the overall job flow. A real Solana USDC payment adapter and worker queue can replace the mock payment and browser-driven generation independently.

## Preview image credits

Sample photography is bundled from Unsplash for the demo; editorial text and layout are rendered by the application. These are illustrative style previews, not examples generated by the live provider.

- [Perfume photograph](https://images.unsplash.com/photo-1541643600914-78b084683601) — source ID `photo-1541643600914-78b084683601`
- [Sneaker photograph](https://images.unsplash.com/photo-1542291026-7eec264c27ff) — source ID `photo-1542291026-7eec264c27ff`
- [Skincare photograph](https://images.unsplash.com/photo-1608571423902-eed4a5ad8108) — source ID `photo-1608571423902-eed4a5ad8108`
- [Headphones photograph](https://images.unsplash.com/photo-1505740420928-5e560c06d30e) — source ID `photo-1505740420928-5e560c06d30e`
- [Cat photograph](https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba) — source ID `photo-1514888286974-6c03e2ca1dba`
- [Botanical photograph](https://images.unsplash.com/photo-1416879595882-3373a0480b5b) — source ID `photo-1416879595882-3373a0480b5b`

The transparent AURA sample bottle is original procedural artwork included with the project.
