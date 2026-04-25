'use client';

import { useState } from 'react';
import { formatUnits } from 'viem';
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';

import { MINTABLE_ERC20_ABI, TOKENS, type TokenKey, addressesConfigured } from '../lib/contracts';

function TokenRow({ token }: { token: TokenKey }) {
  const cfg = TOKENS[token];
  const { address } = useAccount();
  const { data: balance, refetch } = useReadContract({
    abi: MINTABLE_ERC20_ABI,
    address: cfg.address,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) && addressesConfigured, refetchInterval: 15_000 },
  });

  const { writeContractAsync, isPending } = useWriteContract();
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const { isLoading: isMining } = useWaitForTransactionReceipt({ hash: txHash });

  async function mint() {
    if (!address) return;
    const hash = await writeContractAsync({
      abi: MINTABLE_ERC20_ABI,
      address: cfg.address,
      functionName: 'mint',
      args: [address, cfg.faucetAmount],
    });
    setTxHash(hash);
    setTimeout(() => refetch(), 3_000);
  }

  const busy = isPending || isMining;

  return (
    <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-surfaceWarm transition-colors duration-300 ease-paper hover:border-borderHi">
      <div>
        <div className="text-text font-medium">{cfg.symbol}</div>
        <div className="text-xs text-muted font-mono mt-0.5">
          {balance !== undefined ? formatUnits(balance, cfg.decimals) : '—'}
        </div>
      </div>
      <button
        type="button"
        onClick={mint}
        disabled={!address || busy}
        className="focus-ring px-4 h-10 text-sm rounded-lg border border-border bg-surface shadow-soft text-text hover:border-borderHi hover:shadow-soft-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-300 ease-paper active:translate-y-px"
      >
        {busy ? 'Minting…' : `+ ${formatUnits(cfg.faucetAmount, cfg.decimals)}`}
      </button>
    </div>
  );
}

export function FaucetCard() {
  const { isConnected } = useAccount();
  return (
    <div className="rounded-xl border border-border bg-surface shadow-soft hover:shadow-soft-lg transition-shadow duration-500 ease-paper p-6">
      <div className="mb-5">
        <div className="text-sm font-medium text-text">Mint test tokens</div>
        <p className="text-xs text-muted mt-1">Open-mint mock ERC-20s. No per-address limit.</p>
      </div>
      {!isConnected ? (
        <div className="text-sm text-muted py-10 text-center border border-dashed border-border rounded-lg">
          Connect wallet to mint.
        </div>
      ) : (
        <div className="space-y-2">
          <TokenRow token="MON" />
          <TokenRow token="USDC" />
        </div>
      )}
    </div>
  );
}
