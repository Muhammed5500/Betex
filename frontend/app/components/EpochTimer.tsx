'use client';

import { useEffect, useState } from 'react';
import { useReadContract } from 'wagmi';

import { ADDRESSES, ENCRYPTED_POOL_ABI, addressesConfigured } from '../lib/contracts';

export function EpochTimer() {
  const { data: epochId } = useReadContract({
    abi: ENCRYPTED_POOL_ABI,
    address: ADDRESSES.encryptedPool,
    functionName: 'currentEpochId',
    query: { enabled: addressesConfigured, refetchInterval: 6_000 },
  });

  const { data: epoch } = useReadContract({
    abi: ENCRYPTED_POOL_ABI,
    address: ADDRESSES.encryptedPool,
    functionName: 'epochs',
    args: epochId !== undefined ? [epochId as bigint] : undefined,
    query: { enabled: addressesConfigured && epochId !== undefined, refetchInterval: 4_000 },
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

  if (!addressesConfigured) {
    return (
      <div className="rounded-xl border border-border bg-surface shadow-soft px-5 py-4 text-sm text-muted">
        Configure <span className="font-mono text-text">.env.local</span> to enable the timer.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface shadow-soft hover:shadow-soft-lg transition-shadow duration-500 ease-paper overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 text-sm">
        <div className="flex items-center gap-3 text-muted">
          <span>Epoch</span>
          <span className="font-mono text-text">#{epochId?.toString() ?? '—'}</span>
          <span className="text-dim">·</span>
          <span>
            {orderCount} {orderCount === 1 ? 'order' : 'orders'}
          </span>
          {closed && <span className="text-xs text-success">closed</span>}
        </div>
        <span className="font-mono text-text">
          {timeLeft > 0 ? `${timeLeft}s` : <span className="text-muted">settling…</span>}
        </span>
      </div>
      <div className="h-px bg-border">
        <div
          className="h-full bg-purple transition-[width] duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
