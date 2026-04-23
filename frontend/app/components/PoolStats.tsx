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

  return (
    <div className="rounded-xl border border-btx-border bg-btx-panel p-4">
      <div className="text-sm font-semibold text-white mb-3">Pool</div>
      <dl className="text-sm space-y-1.5 font-mono">
        <div className="flex justify-between">
          <dt className="text-btx-muted">MON</dt>
          <dd>{monReserve !== undefined ? formatUnits(monReserve, TOKENS.MON.decimals) : '—'}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-btx-muted">USDC</dt>
          <dd>{usdcReserve !== undefined ? formatUnits(usdcReserve, TOKENS.USDC.decimals) : '—'}</dd>
        </div>
        <div className="flex justify-between pt-1 border-t border-btx-border mt-2">
          <dt className="text-btx-muted">Price</dt>
          <dd className="text-white">{price ? `${price.toFixed(4)} USDC/MON` : '—'}</dd>
        </div>
      </dl>
    </div>
  );
}
