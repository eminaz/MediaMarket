import { saveUpload } from '@/lib/media';
import { apiError } from '@/lib/validation';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    if (Number(request.headers.get('content-length')) > 11 * 1024 * 1024)
      throw new Error('Image is too large. Maximum size is 10 MB.');
    const form = await request.formData();
    const image = form.get('image');
    if (!(image instanceof File)) throw new Error('Please choose an image.');
    return Response.json({ url: await saveUpload(image) });
  } catch (error) {
    return apiError(error);
  }
}
