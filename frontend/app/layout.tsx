import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import Link from 'next/link';

import { Navbar } from './components/Navbar';
import './globals.css';
import { Providers } from './providers';

const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans', display: 'swap' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'Betex · Encrypted DEX on Monad',
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
            <main className="flex-1 px-6 py-12 max-w-6xl mx-auto w-full">{children}</main>

            <footer className="border-t border-border bg-bgSoft mt-12">
              <div className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-end gap-5 text-sm text-muted">
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
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
