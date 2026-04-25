'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { WalletButton } from './WalletButton';

const NAV = [
  { href: '/swap', label: 'Swap' },
  { href: '/pool', label: 'Pool' },
  { href: '/epochs', label: 'Epochs' },
  { href: '/faucet', label: 'Faucet' },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg/85 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="font-serif font-medium text-text tracking-tight text-[18px] focus-ring rounded-sm hover:text-purple transition-colors"
          >
            Betex
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-md transition-all duration-300 ease-paper focus-ring ${
                    active
                      ? 'text-text bg-surface shadow-soft'
                      : 'text-muted hover:text-text hover:bg-surface/60'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <WalletButton />
      </div>
    </header>
  );
}
