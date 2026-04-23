'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { WalletButton } from './WalletButton';

const NAV = [
  { href: '/', label: 'Swap' },
  { href: '/pool', label: 'Pool' },
  { href: '/epochs', label: 'Epochs' },
  { href: '/faucet', label: 'Faucet' },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 border-b border-border/60 bg-bg/60 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-10">
          <Link href="/" className="flex items-center gap-2.5">
            <BrandMark />
            <span className="font-bold tracking-tight text-lg shimmer-text">Betex</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-md transition-colors ${
                    active
                      ? 'text-text bg-purpleDim/40'
                      : 'text-muted hover:text-text hover:bg-surface'
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

function BrandMark() {
  return (
    <div className="relative w-7 h-7">
      <div className="absolute inset-0 rounded-lg bg-gradient-cta opacity-90" />
      <div className="absolute inset-[3px] rounded-[6px] bg-bg flex items-center justify-center">
        <span className="text-[11px] font-bold shimmer-text">β</span>
      </div>
    </div>
  );
}
