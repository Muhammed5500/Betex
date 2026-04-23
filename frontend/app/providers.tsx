'use client';

import { getDefaultConfig, RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMemo } from 'react';
import { WagmiProvider } from 'wagmi';

import { activeChain } from './lib/chains';

const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? '';

export function Providers({ children }: { children: React.ReactNode }) {
  const chain = activeChain();

  const wagmiConfig = useMemo(
    () =>
      getDefaultConfig({
        appName: 'BTX-Monad',
        projectId: WALLETCONNECT_PROJECT_ID || 'btx-monad-local',
        chains: [chain],
        ssr: true,
      }),
    [chain],
  );

  const queryClient = useMemo(() => new QueryClient(), []);

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: '#6d8dff',
            accentColorForeground: '#0b0d12',
            borderRadius: 'medium',
          })}
          modalSize="compact"
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
