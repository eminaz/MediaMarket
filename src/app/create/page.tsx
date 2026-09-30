import { getStyles } from '@/lib/db';
import { generationMode } from '@/lib/generation';
import { CreateFlow } from '@/components/create-flow';
export const dynamic = 'force-dynamic';
export default async function CreatePage({
  searchParams,
}: {
  searchParams: Promise<{ style?: string; agent?: string }>;
}) {
  const params = await searchParams;
  return (
    <CreateFlow
      styles={getStyles()}
      initialStyle={params.style}
      agentFirst={params.agent === 'true'}
      mode={generationMode()}
    />
  );
}
