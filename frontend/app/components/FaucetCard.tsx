'use client';

import { useState } from 'react';
import { formatUnits } from 'viem';
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';

import { MINTABLE_ERC20_ABI, TOKENS, type TokenKey, addressesConfigured } from '../lib/contracts';

const TOKEN_STYLE: Record<TokenKey, { dot: string; text: string; bg: string; button: string }> = {
  MON: {
    dot: 'bg-monToken',
    text: 'text-monToken',
    bg: 'bg-monToken/10 border-monToken/30',
    button: 'bg-monToken hover:bg-purpleHi',
  },
  USDC: {
    dot: 'bg-usdcToken',
    text: 'text-usdcToken',
    bg: 'bg-usdcToken/10 border-usdcToken/30',
    button: 'bg-usdcToken hover:bg-cyan',
  },
};

function TokenRow({ token }: { token: TokenKey }) {
  const cfg = TOKENS[token];
  const style = TOKEN_STYLE[token];
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
    <div className={`flex items-center justify-between p-4 rounded-lg border ${style.bg}`}>
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${style.bg} border ${style.text}`}>
          <span className="font-bold text-[11px]">{cfg.symbol.slice(0, 3)}</span>
        </div>
        <div>
          <div className="font-semibold">{cfg.symbol}</div>
          <div className="text-[11px] text-muted font-mono mt-0.5">
            {balance !== undefined ? formatUnits(balance, cfg.decimals) : '—'}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={mint}
        disabled={!address || busy}
        className={`px-4 h-10 text-sm rounded-md text-white font-semibold disabled:opacity-40 transition-all ${style.button}`}
      >
        {busy ? 'Minting…' : `+ ${formatUnits(cfg.faucetAmount, cfg.decimals)}`}
      </button>
    </div>
  );
}

export function FaucetCard() {
  const { isConnected } = useAccount();
  return (
    <div className="rounded-lg border border-border bg-gradient-surface p-5 space-y-3">
      <div>
        <div className="text-[15px] font-semibold">Mint test tokens</div>
        <p className="text-[12px] text-muted mt-1">
          Open-mint mock ERC-20s. No per-address limit.
        </p>
      </div>
      {!isConnected ? (
        <div className="text-sm text-muted py-8 text-center border border-dashed border-border rounded-lg">
          Connect wallet to mint.
        </div>
      ) : (
        <div className="space-y-2.5">
          <TokenRow token="MON" />
          <TokenRow token="USDC" />
        </div>
      )}
    </div>
  );
}
