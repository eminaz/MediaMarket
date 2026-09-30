import { notFound } from 'next/navigation';
import { getJob, getStyle } from '@/lib/db';
import { JobView } from '@/components/job-view';
export const dynamic = 'force-dynamic';
export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const job = getJob((await params).id);
  if (!job) notFound();
  return <JobView initialJob={{ ...job, style: getStyle(job.styleListingId)! }} />;
}
