import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import Link from 'next/link';

import { Navbar } from './components/Navbar';
import './globals.css';
import { Providers } from './providers';

const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans', display: 'swap' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'Betex — Encrypted DEX on Monad',
  description:
    'Paper-faithful BTX threshold encryption on Monad testnet. MEV-resistant swaps with a 2-of-3 decryptor committee.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="font-sans antialiased">
        <Providers>
          <div className="relative z-10 min-h-screen flex flex-col">
            <Navbar />
            <main className="flex-1 px-6 py-10 max-w-6xl mx-auto w-full">{children}</main>
            <footer className="px-6 py-6 border-t border-border/60">
              <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-muted">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-success pulse-dot" />
                  <span>Live on Monad testnet</span>
                </div>
                <div className="flex items-center gap-3">
                  <Link
                    href="https://category-labs.github.io/category-research/BTX-paper.pdf"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-text transition-colors"
                  >
                    BTX paper
                  </Link>
                  <span className="opacity-40">·</span>
                  <Link
                    href="https://github.com/Muhammed5500/Betex"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-text transition-colors"
                  >
                    GitHub
                  </Link>
                  <span className="opacity-40">·</span>
                  <Link
                    href="https://testnet.monadexplorer.com"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-text transition-colors"
                  >
                    Explorer
                  </Link>
                </div>
              </div>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
