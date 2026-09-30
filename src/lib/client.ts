export async function api<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(
    url,
    body === undefined
      ? { cache: 'no-store' }
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data as T;
}
export async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.set('image', file);
  const response = await fetch('/api/upload', { method: 'POST', body: form });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Upload failed. Please try again.');
  return data.url;
}
