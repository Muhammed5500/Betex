'use client';

import { formatUnits } from 'viem';
import { useReadContract } from 'wagmi';

import { ADDRESSES, SEALED_AMM_ABI, TOKENS, addressesConfigured } from '../lib/contracts';

export function PoolStats() {
  const { data: reserveA } = useReadContract({
    abi: SEALED_AMM_ABI,
    address: ADDRESSES.sealedAmm,
    functionName: 'reserveA',
    query: { enabled: addressesConfigured, refetchInterval: 15_000 },
  });
  const { data: reserveB } = useReadContract({
    abi: SEALED_AMM_ABI,
    address: ADDRESSES.sealedAmm,
    functionName: 'reserveB',
    query: { enabled: addressesConfigured, refetchInterval: 15_000 },
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
    <div className="rounded-xl border border-border bg-surface shadow-soft hover:shadow-soft-lg transition-shadow duration-500 ease-paper p-5">
      <div className="text-xs text-muted mb-4">Pool reserves</div>
      <div className="space-y-2.5 text-sm">
        <Row symbol="MON" value={formatNum(monReserve, TOKENS.MON.decimals)} />
        <Row symbol="USDC" value={formatNum(usdcReserve, TOKENS.USDC.decimals)} />
      </div>
      <div className="mt-4 pt-4 border-t border-border flex items-baseline justify-between text-sm">
        <span className="text-muted text-xs">Price</span>
        <span className="font-mono text-text">
          {price ? (
            <>
              {price.toFixed(4)} <span className="text-muted">USDC/MON</span>
            </>
          ) : (
            '—'
          )}
        </span>
      </div>
    </div>
  );
}

function Row({ symbol, value }: { symbol: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="font-mono text-text">{symbol}</span>
      <span className="font-mono text-muted">{value}</span>
    </div>
  );
}
