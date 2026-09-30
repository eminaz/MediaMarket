import { test, expect } from '@playwright/test';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
const require = createRequire(import.meta.url);
test('marketplace filters, detail, text brief, agent selection, payment and delivery', async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.style-card')).toHaveCount(6);
  await page.getByRole('button', { name: 'Cinematic', exact: true }).click();
  await expect(page.locator('.style-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'All styles', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search styles' }).fill('luxury');
  await expect(page.locator('.style-card')).toHaveCount(1);
  await page.locator('.style-card').click();
  await expect(page.getByRole('heading', { name: 'Luxury Product Ad', exact: true })).toBeVisible();
  await expect(page.getByText('Commercial use allowed', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Use this style' }).click();
  await expect(page.locator('input[type=file]')).toHaveCount(0);
  await page.getByLabel('The brief').fill('A quiet luxury launch for a botanical skincare serum.');
  await page.getByLabel('Brand or subject name').fill('AURA skincare');
  await page.getByRole('button', { name: 'luxury', exact: true }).click();
  await page.getByRole('button', { name: 'minimal', exact: true }).click();
  await page.getByRole('button', { name: 'Find my style' }).click();
  await page.getByRole('button', { name: 'Auto-pick for me' }).click();
  await expect(page.getByText('A little reasoning behind the taste')).toBeVisible();
  await expect(page.locator('.style-option.selected')).toContainText('Luxury Product Ad');
  await page.getByRole('button', { name: 'Review creation' }).click();
  await page.getByRole('button', { name: 'Pay 2.50 USDC & create' }).click();
  await expect(page.getByRole('button', { name: 'Payment pending' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Payment confirmed' })).toBeVisible();
  await expect(page).toHaveURL(/\/jobs\/[^/]+$/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Now that’s an impression.' })).toBeVisible({
    timeout: 30_000,
  });
  const result = page.locator('.result-image img');
  await expect(result).toBeVisible();
  expect(await result.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1024);
  await expect(page.getByText('Picked by your buyer agent')).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download image' }).click();
  expect((await downloadPromise).suggestedFilename()).toBe('tastemaker-creation.png');
  await page.getByRole('radio', { name: '5 stars', exact: true }).check();
  await page.getByLabel('A short review').fill('Beautiful lighting and a polished composition.');
  await page.getByRole('button', { name: 'Submit review', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your review', exact: true })).toBeVisible();
  await expect(
    page.getByText('Beautiful lighting and a polished composition.', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Submit review', exact: true })).toHaveCount(0);
  const id = page.url().split('/').pop();
  expect((await request.post(`/api/jobs/${id}/review`, { data: { stars: 1 } })).status()).toBe(409);
  const discovery = await (await request.get('/api/agent/styles?tags=luxury')).json();
  expect(discovery.styles[0].averageRating).toBe(5);
  expect(discovery.styles[0].reviewCount).toBe(1);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: 'test-results/delivered-desktop.png', fullPage: true });
  await page.goto('/styles/luxury-product-ad');
  await expect(
    page.getByText('Beautiful lighting and a polished composition.', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.detail-ratings')).toContainText('5.0 stars · 1 review');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(errors).toEqual([]);
});

test('manual selection and saved pending order recover without duplicate payment', async ({
  page,
  request,
}) => {
  await page.goto('/create?style=meme-launch-graphic');
  await page.getByLabel('The brief').fill('A funny new product launch for my serum.');
  await page.getByRole('button', { name: 'Find my style' }).click();
  await expect(page.locator('.style-option.selected')).toContainText('Meme Launch Graphic');
  await page.getByRole('button', { name: 'Review creation' }).click();
  await page.getByRole('button', { name: 'Pay 0.75 USDC & create' }).click();
  await expect(page).toHaveURL(/\/jobs\/[^/]+$/);
  await expect(page.getByRole('heading', { name: 'Now that’s an impression.' })).toBeVisible({
    timeout: 30_000,
  });
  const id = page.url().split('/').pop();
  const paidAgain = await (await request.post(`/api/jobs/${id}/pay`)).json();
  expect(paidAgain.status).toBe('delivered');
  expect(paidAgain.priceUsdc).toBe(0.75);
  expect(paidAgain.selectedByAgent).toBe(false);
  const pending = await (
    await request.post('/api/jobs', {
      data: {
        styleListingId: 'luxury-product-ad',
        buyerBrief: 'A fresh luxury product campaign.',
        budget: 5,
        desiredTags: [],
        selectedByAgent: false,
      },
    })
  ).json();
  expect((await request.post(`/api/jobs/${pending.id}/advance`)).status()).toBe(409);
  await page.goto(`/jobs/${pending.id}`);
  await expect(page.getByRole('radio', { name: '5 stars', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Pay 2.50 demo USDC' }).click();
  await expect(page.getByText('In the studio', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Now that’s an impression.' })).toBeVisible({
    timeout: 30_000,
  });
});

test('seller publishing keeps secret sauce out of all public responses', async ({
  page,
  request,
}) => {
  await page.goto('/sell');
  await page.getByLabel('Style name').fill('Analog Summer');
  await page.getByLabel('Seller handle').fill('summer.studio');
  await page
    .getByLabel('Describe your style')
    .fill('Warm analog film grain and soft summer light for independent brands.');
  await page.getByLabel('Your style in a sentence').fill('A slower summer state of mind.');
  await page.getByLabel('Tags', { exact: false }).fill('analog, warm, lifestyle');
  await page
    .getByLabel('Upload sample image', { exact: true })
    .setInputFiles(path.resolve('public/samples/luxury.jpg'));
  await expect(page.getByAltText('Sample 1', { exact: true })).toBeVisible();
  const secret = 'SECRET_WORKFLOW_82: warm film grain, soft daylight, natural shadows.';
  await page.getByLabel('Internal workflow prompt').fill(secret);
  await page.getByRole('button', { name: 'Publish your style' }).click();
  await expect(page.getByRole('heading', { name: 'Analog Summer', exact: true })).toBeVisible();
  expect(await page.content()).not.toContain(secret);
  expect(await (await request.get('/api/styles')).text()).not.toContain('hiddenWorkflowPrompt');
  expect(await (await request.get('/api/styles')).text()).not.toContain(secret);
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Search styles' }).fill('Analog Summer');
  await expect(page.locator('.style-card')).toHaveCount(1);
});

test('validation, unknown jobs, budget constraints and unsupported uploads', async ({
  request,
}) => {
  expect(
    (
      await request.post('/api/agent/pick', { data: { budget: 0.1, desiredTags: ['luxury'] } })
    ).status(),
  ).toBe(422);
  expect((await request.get('/api/jobs/not-a-job')).status()).toBe(404);
  expect(
    (
      await request.post('/api/jobs', {
        data: {
          styleListingId: 'luxury-product-ad',
          buyerBrief: 'A good brief.',
          budget: 0.2,
          desiredTags: [],
          selectedByAgent: false,
        },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post('/api/upload', {
        multipart: {
          image: {
            name: 'fake.png',
            mimeType: 'image/png',
            buffer: Buffer.from('this is not an image'),
          },
        },
      })
    ).status(),
  ).toBe(400);
  const data = {
    styleListingId: 'luxury-product-ad',
    inputImageUrl: 'https://example.com/private',
    buyerBrief: 'A good brief.',
    budget: 5,
  };
  expect((await request.post('/api/jobs', { data })).status()).toBe(400);
});

test('mobile marketplace is usable without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/marketplace-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'test-results/marketplace-desktop.png', fullPage: true });
});

test('headless agent also advances and downloads a single-server order', async ({ request }) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'agent-local-mode-'));
  try {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        '--import',
        require.resolve('tsx'),
        path.resolve('scripts/buyer-agent.ts'),
        'A luxury serum bottle in soft morning light',
        '--marketplace',
        'http://127.0.0.1:3100',
      ],
      { cwd: directory, timeout: 30_000 },
    );
    const delivered = JSON.parse(stdout);
    expect(delivered.status).toBe('delivered');
    expect(delivered.generationMode).toBe('mock');
    const status = await (await request.get(`/api/agent/orders/${delivered.jobId}`)).json();
    expect(status.executionMode).toBe('local');
    expect(await readFile(delivered.imagePath)).toEqual(
      await (await request.get(delivered.imageUrl)).body(),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('seller directory compares all sellers, their aggregated ratings and style prices on desktop and mobile', async ({
  page,
  request,
}) => {
  const styles = await (await request.get('/api/styles')).json();
  const expectedSellers = new Set(styles.map((style: { sellerId: string }) => style.sellerId));
  await page.goto('/');
  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  await navigation.getByRole('link', { name: 'Sellers', exact: true }).click();
  await expect(page).toHaveURL(/\/sellers$/);
  await expect(page.getByRole('heading', { name: 'Sellers.', exact: true })).toBeVisible();
  await expect(navigation.getByRole('link', { name: 'Sellers', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(navigation.getByRole('link', { name: 'Seller studio' })).not.toHaveClass(/active/);
  await expect(page.locator('.seller-directory tbody tr')).toHaveCount(expectedSellers.size);
  const aure = page.locator('[data-seller="studio.aure"]');
  await expect(aure).toContainText('3 styles');
  await expect(aure.locator('.directory-price')).toHaveText('2.00–2.50');
  const seller = styles.find(
    (style: { sellerId: string }) => style.sellerId === 'studio.aure',
  ).seller;
  await expect(aure.locator('.rating-summary')).toHaveText(
    seller.reviewCount
      ? `${seller.averageRating.toFixed(1)} stars · ${seller.reviewCount} ${seller.reviewCount === 1 ? 'review' : 'reviews'}`
      : 'No reviews yet',
  );
  await expect(aure.locator('.directory-styles').getByRole('link')).toHaveCount(3);
  await expect(page.locator('[data-seller="offgrid"] .rating-summary')).toHaveText(
    'No reviews yet',
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'test-results/sellers-desktop.png', fullPage: true });
  for (const width of [820, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await expect(navigation.getByRole('link', { name: 'Sellers', exact: true })).toBeVisible();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/sellers-mobile.png', fullPage: true });
  await aure.getByRole('link', { name: /Luxury Product Ad/ }).click();
  await expect(page).toHaveURL(/\/styles\/luxury-product-ad$/);
});

test('seller reviews combine comments across styles and link back to each listing', async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const feedback = [
    { styleListingId: 'luxury-product-ad', text: 'Combined view: elegant lighting.', stars: 5 },
    {
      styleListingId: 'botanical-editorial',
      text: 'Combined view: lovely botanical colors.',
      stars: 4,
    },
  ];
  for (const { styleListingId, text, stars } of feedback) {
    const response = await request.post('/api/jobs', {
      data: { styleListingId, buyerBrief: 'A refined skincare campaign', budget: 5 },
    });
    expect(response.status()).toBe(201);
    const job = await response.json();
    await expect
      .poll(async () => (await request.post(`/api/jobs/${job.id}/pay`)).status())
      .toBe(200);
    await page.goto(`/jobs/${job.id}`);
    await expect(page.getByRole('heading', { name: 'Now that’s an impression.' })).toBeVisible({
      timeout: 30_000,
    });
    expect(
      (await request.post(`/api/jobs/${job.id}/review`, { data: { stars, text } })).status(),
    ).toBe(201);
  }
  await page.goto('/sellers');
  await page
    .locator('[data-seller="studio.aure"]')
    .getByRole('link', { name: 'View reviews' })
    .click();
  await expect(page).toHaveURL(/\/sellers\/studio.aure$/);
  const reviews = page.getByRole('region', { name: 'Seller reviews', exact: true });
  for (const { text, stars } of feedback) {
    const card = reviews.locator('article').filter({ hasText: text });
    await expect(card).toBeVisible();
    await expect(card.getByLabel(`${stars} out of 5 stars`)).toBeVisible();
  }
  await expect(reviews.locator('article').first()).toContainText(feedback[1].text);
  await page.screenshot({ path: 'test-results/seller-reviews-desktop.png', fullPage: true });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await page.screenshot({ path: 'test-results/seller-reviews-mobile.png', fullPage: true });
  await reviews
    .locator('article')
    .filter({ hasText: feedback[1].text })
    .getByRole('link', { name: 'Botanical Editorial' })
    .click();
  await page.getByRole('link', { name: 'All seller reviews' }).click();
  await expect(page).toHaveURL(/\/sellers\/studio.aure$/);
  await page.goto('/sellers/offgrid');
  await expect(page.getByRole('heading', { name: 'No reviews yet.' })).toBeVisible();
  await page.goto('/sellers/missing-seller');
  // Next.js streamed responses can keep HTTP 200 while rendering notFound().
  await expect(page.getByRole('heading', { name: 'A little off the canvas.' })).toBeVisible();
});

test('music marketplace, auto-pick, checkout, WAV playback, review and seller publishing', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await page
    .getByRole('group', { name: 'Media type' })
    .getByRole('button', { name: 'Music', exact: true })
    .click();
  await expect(page.locator('.style-card')).toHaveCount(1);
  await page.locator('.style-card').click();
  await expect(page.getByText('per 10s track · one-time payment')).toBeVisible();
  await page.getByRole('link', { name: 'Use this style' }).click();
  await expect(page.getByLabel('What would you like to create?')).toHaveValue('music');
  await page.getByLabel('The brief').fill('Warm piano, minimal luxury ambient music, no vocals');
  await page.getByRole('button', { name: 'Find my style', exact: true }).click();
  await page.getByRole('button', { name: 'Auto-pick for me' }).click();
  await expect(page.locator('.style-option.selected')).toContainText('Luxury Ambient Music');
  await page.getByRole('button', { name: 'Review creation' }).click();
  await page.getByRole('button', { name: 'Pay 2.50 USDC & create' }).click();
  await expect(page.getByRole('heading', { name: 'Your soundtrack is ready.' })).toBeVisible({
    timeout: 30_000,
  });
  const audio = page.getByLabel('Generated music', { exact: true });
  await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.duration)).toBe(10);
  await audio.evaluate((el: HTMLAudioElement) => el.play());
  await expect
    .poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime))
    .toBeGreaterThan(0);
  await audio.evaluate((el: HTMLAudioElement) => el.pause());
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download music' }).click();
  expect((await downloadPromise).suggestedFilename()).toBe('tastemaker-creation.wav');
  await page.getByRole('radio', { name: '4 stars', exact: true }).check();
  await page.getByLabel('A short review').fill('A gentle soundtrack for our perfume launch.');
  await page.getByRole('button', { name: 'Submit review', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your review', exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: 'test-results/music-delivered.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.goto('/sell');
  await page.getByRole('combobox', { name: 'Media type', exact: true }).selectOption('music');
  await page.getByLabel('Style name', { exact: true }).fill('Warm acoustic music');
  await page.getByLabel('Seller handle', { exact: true }).fill('music.studio');
  await page
    .getByLabel('Describe your style', { exact: true })
    .fill('Gentle acoustic guitar and warm textures for thoughtful brand films.');
  await page.getByLabel('Tags', { exact: false }).fill('acoustic, warm');
  await page.getByLabel('Track duration', { exact: false }).fill('15');
  await page.getByLabel('Price per track', { exact: false }).fill('3.75');
  await page
    .getByLabel('Internal workflow prompt', { exact: true })
    .fill('Private music recipe: intimate fingerpicked guitar with soft pads.');
  await page.getByRole('button', { name: 'Publish your style' }).click();
  await expect(
    page.getByRole('heading', { name: 'Warm acoustic music', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('per 15s track · one-time payment')).toBeVisible();
  const styles = await (await request.get('/api/styles')).json();
  const published = styles.find((s: { name: string }) => s.name === 'Warm acoustic music');
  expect(published.type).toBe('music');
  expect(published.priceUsdc).toBe(3.75);
  expect(JSON.stringify(published)).not.toContain('Private music recipe');
});
