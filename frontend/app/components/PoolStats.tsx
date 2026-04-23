'use client';

import { formatUnits } from 'viem';
import { useReadContract } from 'wagmi';

import { ADDRESSES, SEALED_AMM_ABI, TOKENS, addressesConfigured } from '../lib/contracts';

export function PoolStats() {
  const { data: reserveA } = useReadContract({
    abi: SEALED_AMM_ABI,
    address: ADDRESSES.sealedAmm,
    functionName: 'reserveA',
    query: { enabled: addressesConfigured, refetchInterval: 4_000 },
  });
  const { data: reserveB } = useReadContract({
    abi: SEALED_AMM_ABI,
    address: ADDRESSES.sealedAmm,
    functionName: 'reserveB',
    query: { enabled: addressesConfigured, refetchInterval: 4_000 },
  });
  const { data: tokenA } = useReadContract({
    abi: SEALED_AMM_ABI,
    address: ADDRESSES.sealedAmm,
    functionName: 'tokenA',
    query: { enabled: addressesConfigured },
  });

  const aIsMon = tokenA && (tokenA as string).toLowerCase() === TOKENS.MON.address.toLowerCase();
  const monReserve = aIsMon ? (reserveA as bigint | undefined) : (reserveB as bigint | undefined);
  const usdcReserve = aIsMon ? (reserveB as bigint | undefined) : (reserveA as bigint | undefined);

  const price =
    monReserve && usdcReserve
      ? Number(formatUnits(usdcReserve, TOKENS.USDC.decimals)) /
        Number(formatUnits(monReserve, TOKENS.MON.decimals))
      : 0;

  function formatNum(v: bigint | undefined, d: number) {
    if (v === undefined) return '—';
    return Number(formatUnits(v, d)).toLocaleString('en-US', {
      maximumFractionDigits: d === 6 ? 2 : 4,
    });
  }

  return (
    <div className="rounded-lg border border-border bg-gradient-surface p-4 card-lift">
      <div className="text-[11px] uppercase tracking-widest text-muted mb-3 flex items-center gap-2">
        <span className="w-1 h-3 rounded-full bg-gradient-cta" />
        Pool reserves
      </div>
      <div className="space-y-3">
        <ReserveRow
          symbol="MON"
          value={formatNum(monReserve, TOKENS.MON.decimals)}
          color="text-monToken"
          dot="bg-monToken"
        />
        <ReserveRow
          symbol="USDC"
          value={formatNum(usdcReserve, TOKENS.USDC.decimals)}
          color="text-usdcToken"
          dot="bg-usdcToken"
        />
      </div>
      <div className="mt-4 pt-3 border-t border-border flex items-baseline justify-between">
        <span className="text-[11px] uppercase tracking-widest text-muted">Price</span>
        <span className="font-mono text-sm font-medium">
          {price ? (
            <>
              <span className="shimmer-text">{price.toFixed(4)}</span>
              <span className="text-muted ml-1">USDC/MON</span>
            </>
          ) : (
            '—'
          )}
        </span>
      </div>
    </div>
  );
}

function ReserveRow({
  symbol,
  value,
  color,
  dot,
}: {
  symbol: string;
  value: string;
  color: string;
  dot: string;
}) {
  return (
    <div className="flex items-baseline justify-between text-[13px]">
      <div className="flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
        <span className={`font-mono font-medium ${color}`}>{symbol}</span>
      </div>
      <span className="font-mono">{value}</span>
    </div>
  );
}
