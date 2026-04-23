import type { Metadata } from 'next';
import Link from 'next/link';

import { WalletButton } from './components/WalletButton';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'BTX-Monad — Encrypted DEX',
  description:
    'Paper-faithful BTX threshold encryption on Monad testnet. MEV-resistant swaps with a 2-of-3 decryptor committee.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="min-h-screen flex flex-col">
            <header className="border-b border-btx-border px-6 py-4 flex items-center justify-between bg-btx-panel/60 backdrop-blur">
              <div className="flex items-center gap-8">
                <Link href="/" className="flex items-center gap-2 font-semibold text-white">
                  <span className="inline-block w-2 h-2 rounded-full bg-btx-accent" />
                  BTX<span className="text-btx-muted">/Monad</span>
                </Link>
                <nav className="flex gap-5 text-sm text-btx-muted">
                  <Link href="/" className="hover:text-white">Swap</Link>
                  <Link href="/pool" className="hover:text-white">Pool</Link>
                  <Link href="/epochs" className="hover:text-white">Epochs</Link>
                  <Link href="/faucet" className="hover:text-white">Faucet</Link>
                </nav>
              </div>
              <WalletButton />
            </header>

            <main className="flex-1 px-6 py-8 max-w-5xl mx-auto w-full">{children}</main>

            <footer className="border-t border-btx-border px-6 py-3 text-xs text-btx-muted text-center">
              Encrypted client-side · Decrypted by 2-of-3 committee · Paper-faithful BLS12-381 threshold BTX
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
