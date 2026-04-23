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

  if (!addressesConfigured) {
    return (
      <div className="rounded-xl border border-btx-border bg-btx-panel p-4 text-sm text-btx-muted">
        Configure <code className="text-btx-accent">.env.local</code> with contract addresses to enable the
        epoch timer.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-btx-border bg-btx-panel p-4">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <span className="text-btx-muted">Epoch</span>
          <span className="font-mono text-white">#{epochId?.toString() ?? '—'}</span>
          <span className="text-btx-muted">·</span>
          <span className="text-btx-muted">{orderCount} orders</span>
          {closed && (
            <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-btx-accentDim/40 text-btx-accent">
              closed
            </span>
          )}
        </div>
        <div className="font-mono">
          {timeLeft > 0 ? (
            <span className="text-white">{timeLeft}s</span>
          ) : (
            <span className="text-btx-danger">settling…</span>
          )}
        </div>
      </div>
      <div className="mt-3 h-1 rounded-full bg-btx-border overflow-hidden">
        <div
          className="h-full bg-btx-accent transition-[width] duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
