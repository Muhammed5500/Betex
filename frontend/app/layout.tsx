import type { Metadata } from 'next';
import { Caveat, Geist, Geist_Mono } from 'next/font/google';
import Link from 'next/link';

import { Navbar } from './components/Navbar';
import './globals.css';
import { Providers } from './providers';

const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans', display: 'swap' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', display: 'swap' });
const caveat = Caveat({
  subsets: ['latin'],
  variable: '--font-caveat',
  weight: ['500', '600'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Betex — Encrypted DEX on Monad',
  description:
    'Paper-faithful BTX threshold encryption on Monad testnet. MEV-resistant swaps with a 2-of-3 decryptor committee.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${caveat.variable}`}>
      <body className="font-sans antialiased">
        <Providers>
          <div className="relative z-10 min-h-screen flex flex-col">
            {/* Notebook masthead */}
            <div className="border-b border-border">
              <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between text-eyebrow uppercase font-mono text-muted">
                <div>
                  BTX <span className="text-text">Field Notebook</span>
                </div>
                <div className="hidden sm:flex items-center gap-4">
                  <span>Vol. 1</span>
                  <span className="opacity-40">·</span>
                  <span>Apr 2026</span>
                  <span className="opacity-40">·</span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-success live-dot" />
                    Monad testnet
                  </span>
                </div>
              </div>
            </div>

            <Navbar />
            <main className="flex-1 px-6 py-12 max-w-6xl mx-auto w-full">{children}</main>

            {/* Colophon footer */}
            <footer className="border-t border-border bg-bgSoft mt-12">
              <div className="max-w-6xl mx-auto px-6 py-8">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-sm">
                  <div className="text-muted">
                    <span className="font-mono text-eyebrow uppercase text-dim mr-3">Colophon</span>
                    Set in <em>Iowan Old Style</em>, Geist, Geist Mono &amp; Caveat. Built on
                    Monad testnet · MIT.
                  </div>
                  <div className="flex items-center gap-5 text-muted">
                    <Link
                      href="https://category-labs.github.io/category-research/BTX-paper.pdf"
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-text underline decoration-border underline-offset-3 hover:decoration-purple"
                    >
                      Paper
                    </Link>
                    <Link
                      href="https://github.com/Muhammed5500/Betex"
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-text underline decoration-border underline-offset-3 hover:decoration-purple"
                    >
                      GitHub
                    </Link>
                    <Link
                      href="https://testnet.monadexplorer.com"
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-text underline decoration-border underline-offset-3 hover:decoration-purple"
                    >
                      Explorer
                    </Link>
                  </div>
                </div>
              </div>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
