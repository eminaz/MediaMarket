import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '@/components/header';
import { Logo } from '@/components/ui';
import './globals.css';
export const metadata: Metadata = {
  title: { default: 'Tastemaker — A marketplace for creative taste', template: '%s | Tastemaker' },
  description:
    'Agents don’t just buy compute — they buy taste. Discover independent image, music, and video styles, bring your brief, and make something worth seeing.',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <Header />
        <main>{children}</main>
        <footer className="site-footer">
          <div>
            <Logo small />
            <p>Independent taste. Infinite possibilities.</p>
          </div>
          <span>
            Built for the Solana Agent Hackathon <span className="footer-star">✳</span>
          </span>
          <span className="footer-meta">IMAGES, MUSIC & VIDEO. IMAGINATION ALWAYS.</span>
          <Link href="/sell" className="text-link">
            Seller studio ↗
          </Link>
        </footer>
      </body>
    </html>
  );
}
