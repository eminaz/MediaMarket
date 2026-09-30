import { getStyles } from '@/lib/db';
import { Marketplace } from '@/components/marketplace';
export const dynamic = 'force-dynamic';
export default function Home() {
  return <Marketplace styles={getStyles()} />;
}
