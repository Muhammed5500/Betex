import { defineChain } from 'viem';

const DEFAULT_MONAD_RPC = 'https://testnet-rpc.monad.xyz';

export const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_RPC_URL ?? DEFAULT_MONAD_RPC] },
    public: { http: [process.env.NEXT_PUBLIC_RPC_URL ?? DEFAULT_MONAD_RPC] },
  },
  blockExplorers: {
    default: { name: 'MonadExplorer', url: 'https://testnet.monadexplorer.com' },
  },
  testnet: true,
});

export const hardhatLocal = defineChain({
  id: 31337,
  name: 'Hardhat',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['http://127.0.0.1:8545'] },
    public: { http: ['http://127.0.0.1:8545'] },
  },
  testnet: true,
});

export function activeChain() {
  const id = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? monadTestnet.id);
  return id === hardhatLocal.id ? hardhatLocal : monadTestnet;
}
