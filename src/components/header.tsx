'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUpRight, Plus } from 'lucide-react';
import { Logo } from './ui';
export function Header() {
  const path = usePathname();
  return (
    <header className="site-header">
      <div className="header-inner">
        <Logo />
        <nav aria-label="Main navigation">
          <Link className={path === '/' || path.startsWith('/styles') ? 'active' : ''} href="/">
            Explore styles
          </Link>
          <Link className={path.startsWith('/jobs') ? 'active' : ''} href="/jobs">
            My creations
          </Link>
          <Link className={path.startsWith('/sell') ? 'active' : ''} href="/sell">
            Seller studio <ArrowUpRight size={12} />
          </Link>
        </nav>
        <div className="header-right">
          <span className="network">
            <span />
            Solana demo
          </span>
          <Link className="button button-dark button-sm" href="/create">
            <Plus size={15} />
            Create an image
          </Link>
        </div>
      </div>
    </header>
  );
}
