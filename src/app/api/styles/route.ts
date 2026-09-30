import { randomUUID } from 'node:crypto';
import { getStyles, publicStyle, saveStyle } from '@/lib/db';
import { apiError, listingSchema } from '@/lib/validation';
import { defaultPayoutAddress, payoutOverrides } from '@/lib/payout';
export const runtime = 'nodejs';
export async function GET() {
  return Response.json(getStyles());
}
export async function POST(request: Request) {
  try {
    const { payoutAddress, ...values } = listingSchema.parse(await request.json());
    const id = randomUUID();
    const seller = {
      id: randomUUID(),
      handle: values.handle,
      displayName: values.handle,
      bio: 'Independent creative seller on Tastemaker.',
      avatarUrl: '',
      payoutAddress:
        payoutOverrides()[values.handle] || payoutAddress || defaultPayoutAddress(values.handle),
    };
    const style = {
      ...values,
      id,
      sellerId: seller.id,
      seller,
      type: 'image' as const,
      createdAt: new Date().toISOString(),
      featured: false,
    };
    saveStyle(style, payoutOverrides()[values.handle] || payoutAddress);
    return Response.json(publicStyle(style), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
