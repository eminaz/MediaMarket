import { z } from 'zod';
import { isAddress } from '@solana/addresses';
const imageUrl = z
  .string()
  .regex(
    /^\/api\/media\/[a-f0-9-]+\.png$|^\/samples\/(luxury|street|pastel|cinema|meme|organic)\.jpg$/,
  );
export const tagsSchema = z.array(z.string().trim().min(1).max(30)).max(12);
export const reviewSchema = z
  .object({
    stars: z.number().int().min(1).max(5),
    text: z.string().trim().max(280, 'Keep your review to 280 characters.').default(''),
  })
  .strict();
export const jobSchema = z.object({
  styleListingId: z.string().min(1),
  inputImageUrl: z.string().nullable().optional().default(null),
  buyerBrief: z
    .string()
    .trim()
    .min(5, 'Tell us a little more about your idea (at least 5 characters).')
    .max(1000),
  brandName: z.string().trim().max(60).default(''),
  budget: z.number().finite().min(0.01).max(10000),
  desiredTags: tagsSchema.default([]),
  selectedByAgent: z.boolean().default(false),
});
export const listingSchema = z.object({
  payoutAddress: z
    .string()
    .trim()
    .refine((value) => !value || isAddress(value), 'Enter a valid Solana payout address.')
    .optional(),
  name: z.string().trim().min(3).max(70),
  handle: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9][a-z0-9._-]{1,29}$/,
      'Use 2–30 lowercase letters, numbers, dots, or underscores for your handle.',
    ),
  description: z.string().trim().min(20).max(1500),
  tags: tagsSchema.min(1),
  priceUsdc: z
    .number()
    .finite()
    .min(0.1)
    .max(1000)
    .refine(
      (n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-8,
      'Use at most two decimal places.',
    ),
  etaSeconds: z.number().int().min(5).max(3600),
  sampleImages: z.array(imageUrl).min(1).max(3),
  hiddenWorkflowPrompt: z.string().trim().min(15).max(4000),
  publicPromptSummary: z.string().trim().max(150).default(''),
  inputRequirements: z.string().trim().min(5).max(500),
  commercialUseAllowed: z.boolean(),
  palette: z.enum(['luxury', 'street', 'pastel', 'cinema', 'meme', 'organic']).default('luxury'),
});
export function apiError(error: unknown) {
  return Response.json(
    {
      error:
        error instanceof z.ZodError
          ? error.issues[0].message
          : error instanceof Error
            ? error.message
            : 'Something went wrong. Please try again.',
    },
    { status: 400 },
  );
}
