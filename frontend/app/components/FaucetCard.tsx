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
    query: { enabled: Boolean(address) && addressesConfigured, refetchInterval: 5_000 },
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
    <div className="flex items-center justify-between py-3 border-b border-btx-border last:border-b-0">
      <div>
        <div className="font-mono text-white">{cfg.symbol}</div>
        <div className="text-xs text-btx-muted">
          {balance !== undefined ? formatUnits(balance, cfg.decimals) : '—'} {cfg.symbol}
        </div>
      </div>
      <button
        type="button"
        onClick={mint}
        disabled={!address || busy}
        className="px-3 py-2 text-sm rounded-md bg-btx-accent text-btx-bg font-semibold disabled:opacity-40"
      >
        {busy ? 'Minting…' : `+${formatUnits(cfg.faucetAmount, cfg.decimals)} ${cfg.symbol}`}
      </button>
    </div>
  );
}

export function FaucetCard() {
  const { isConnected } = useAccount();
  return (
    <div className="rounded-xl border border-btx-border bg-btx-panel p-4">
      <div className="text-sm font-semibold text-white mb-1">Testnet Faucet</div>
      <p className="text-xs text-btx-muted mb-2">Open-mint mock tokens. No per-address limit; self-service.</p>
      {!isConnected ? (
        <div className="text-sm text-btx-muted py-6 text-center">Connect wallet to mint.</div>
      ) : (
        <>
          <TokenRow token="MON" />
          <TokenRow token="USDC" />
        </>
      )}
    </div>
  );
}
