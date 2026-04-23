'use client';

import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMemo } from 'react';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { injected, metaMask } from 'wagmi/connectors';

import { activeChain, hardhatLocal, monadTestnet } from './lib/chains';

export function Providers({ children }: { children: React.ReactNode }) {
  const chain = activeChain();

  const wagmiConfig = useMemo(
    () =>
      createConfig({
        chains: [chain === hardhatLocal ? hardhatLocal : monadTestnet],
        transports: {
          [monadTestnet.id]: http(),
          [hardhatLocal.id]: http(),
        },
        connectors: [injected(), metaMask()],
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
            accentColor: '#836ef9',
            accentColorForeground: '#ffffff',
            borderRadius: 'medium',
            fontStack: 'system',
            overlayBlur: 'small',
          })}
          modalSize="compact"
          initialChain={chain}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
