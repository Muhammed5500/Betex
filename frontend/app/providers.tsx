'use client';

import { RainbowKitProvider, darkTheme, connectorsForWallets } from '@rainbow-me/rainbowkit';
import {
  metaMaskWallet,
  phantomWallet,
  rabbyWallet,
  coinbaseWallet,
  braveWallet,
  injectedWallet,
} from '@rainbow-me/rainbowkit/wallets';
import '@rainbow-me/rainbowkit/styles.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMemo } from 'react';
import { WagmiProvider, createConfig, http } from 'wagmi';

import { activeChain, hardhatLocal, monadTestnet } from './lib/chains';

const APP_NAME = 'Betex';
// Not used since we skip WalletConnect wallets, but RainbowKit still wants a non-empty string.
const WC_PROJECT_ID = 'betex-app';

export function Providers({ children }: { children: React.ReactNode }) {
  const chain = activeChain();

  const wagmiConfig = useMemo(() => {
    const connectors = connectorsForWallets(
      [
        {
          groupName: 'Popular',
          wallets: [metaMaskWallet, phantomWallet, rabbyWallet, coinbaseWallet, braveWallet],
        },
        {
          groupName: 'Other',
          wallets: [injectedWallet],
        },
      ],
      { appName: APP_NAME, projectId: WC_PROJECT_ID },
    );

    return createConfig({
      chains: [chain === hardhatLocal ? hardhatLocal : monadTestnet],
      transports: {
        [monadTestnet.id]: http(),
        [hardhatLocal.id]: http(),
      },
      connectors,
      ssr: true,
    });
  }, [chain]);

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
