import { test, expect } from '@playwright/test';
import path from 'node:path';
test('marketplace filters, detail, uploaded input, agent selection, payment and delivery', async ({
  page,
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
  await page
    .getByLabel('Upload your image', { exact: true })
    .setInputFiles(path.resolve('public/samples/demo-product.png'));
  await expect(page.getByText('Image ready', { exact: true })).toBeVisible();
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
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: 'test-results/delivered-desktop.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('manual selection and saved pending order recover without duplicate payment', async ({
  page,
  request,
}) => {
  await page.goto('/create?style=meme-launch-graphic');
  await page.getByRole('button', { name: /Try our sample product/ }).click();
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
        inputImageUrl: '/samples/demo-product.png',
        buyerBrief: 'A fresh luxury product campaign.',
        budget: 5,
        desiredTags: [],
        selectedByAgent: false,
      },
    })
  ).json();
  expect((await request.post(`/api/jobs/${pending.id}/advance`)).status()).toBe(409);
  await page.goto(`/jobs/${pending.id}`);
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
          inputImageUrl: '/samples/demo-product.png',
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
