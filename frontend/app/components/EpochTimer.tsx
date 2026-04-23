'use client';

import { useEffect, useState } from 'react';
import { useReadContract } from 'wagmi';

import { ADDRESSES, ENCRYPTED_POOL_ABI, addressesConfigured } from '../lib/contracts';

export function EpochTimer() {
  const { data: epochId } = useReadContract({
    abi: ENCRYPTED_POOL_ABI,
    address: ADDRESSES.encryptedPool,
    functionName: 'currentEpochId',
    query: { enabled: addressesConfigured, refetchInterval: 2_000 },
  });

  const { data: epoch } = useReadContract({
    abi: ENCRYPTED_POOL_ABI,
    address: ADDRESSES.encryptedPool,
    functionName: 'epochs',
    args: epochId !== undefined ? [epochId as bigint] : undefined,
    query: { enabled: addressesConfigured && epochId !== undefined, refetchInterval: 1_000 },
  });

  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 250);
    return () => clearInterval(id);
  }, []);

  const startTime = epoch ? Number((epoch as readonly unknown[])[0]) : 0;
  const endTime = epoch ? Number((epoch as readonly unknown[])[1]) : 0;
  const orderCount = epoch ? Number((epoch as readonly unknown[])[2]) : 0;
  const closed = epoch ? Boolean((epoch as readonly unknown[])[3]) : false;

  const totalDuration = Math.max(1, endTime - startTime);
  const timeLeft = Math.max(0, endTime - now);
  const progress = Math.max(0, Math.min(100, ((totalDuration - timeLeft) / totalDuration) * 100));
  const urgent = timeLeft <= 3 && timeLeft > 0;

  if (!addressesConfigured) {
    return (
      <div className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted">
        Configure <span className="font-mono text-purple">.env.local</span> to enable the timer.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-gradient-surface overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 text-[13px]">
        <div className="flex items-center gap-2.5">
          <span className="w-1.5 h-1.5 rounded-full bg-magenta pulse-dot" />
          <span className="text-muted uppercase tracking-wider text-[11px]">Epoch</span>
          <span className="font-mono font-medium">#{epochId?.toString() ?? '—'}</span>
          <span className="opacity-20">·</span>
          <span className="text-muted">{orderCount} {orderCount === 1 ? 'order' : 'orders'}</span>
          {closed && (
            <span className="px-1.5 py-0.5 text-[10px] rounded border border-success/40 text-success uppercase tracking-wide bg-success/10">
              closed
            </span>
          )}
        </div>
        <span className={`font-mono font-semibold ${urgent ? 'text-magenta' : ''}`}>
          {timeLeft > 0 ? `${timeLeft}s` : <span className="text-muted">settling…</span>}
        </span>
      </div>
      <div className="h-[3px] bg-border/60 overflow-hidden">
        <div
          className="h-full bg-gradient-cta transition-[width] duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
