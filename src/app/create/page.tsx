import { getStyles } from '@/lib/db';
import { generationMode } from '@/lib/generation';
import { CreateFlow } from '@/components/create-flow';
import { executionMode, sellerHasWorker } from '@/lib/workers';
export const dynamic = 'force-dynamic';
export default async function CreatePage({
  searchParams,
}: {
  searchParams: Promise<{ style?: string; agent?: string }>;
}) {
  const params = await searchParams;
  const execution = executionMode();
  return (
    <CreateFlow
      styles={getStyles().filter(
        (style) => execution === 'local' || sellerHasWorker(style.seller.handle),
      )}
      initialStyle={params.style}
      agentFirst={params.agent === 'true'}
      mode={execution === 'worker' ? 'worker' : generationMode()}
    />
  );
}
