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

  // Three meaningful states once the epoch window has expired:
  //   - settling: orders exist, committee is actively revealing
  //   - idle:     no orders, decryptors intentionally skip closeEpoch
  //               (Solidity _rolloverIfExpired handles it on the next swap)
  //   - counting: epoch still open, regular countdown
  const expired = timeLeft === 0;
  const isSettling = expired && orderCount > 0 && !closed;
  const isIdle = expired && orderCount === 0 && !closed;

  if (!addressesConfigured) {
    return (
      <div className="rounded-xl border border-border bg-surface shadow-soft px-5 py-4 text-sm text-muted">
        Configure <span className="font-mono text-text">.env.local</span> to enable the timer.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface shadow-soft hover:shadow-soft-lg transition-shadow duration-500 ease-paper overflow-hidden">
      <div className="px-5 pt-4 pb-3">
        {/* Header: title (left)  ·  status (right) */}
        <div className="flex items-center justify-between text-xs text-muted mb-3">
          <span>Epoch</span>
          <span className="font-mono whitespace-nowrap">
            {!expired ? (
              <span className="text-text">{timeLeft}s</span>
            ) : isSettling ? (
              <span className="text-muted live-dot">settling…</span>
            ) : isIdle ? (
              <span className="text-dim">idle</span>
            ) : closed ? (
              <span className="text-success">closed</span>
            ) : (
              <span className="text-muted">—</span>
            )}
          </span>
        </div>
        {/* Body: epoch id · order count */}
        <div className="flex items-baseline gap-2 font-mono text-sm">
          <span className="text-text">#{epochId?.toString() ?? '—'}</span>
          <span className="text-dim">·</span>
          <span className="text-muted whitespace-nowrap">
            {orderCount} {orderCount === 1 ? 'order' : 'orders'}
          </span>
        </div>
      </div>
      <div className="h-px bg-border">
        <div
          className={`h-full transition-[width] duration-300 ${
            isIdle ? 'bg-dim/40' : isSettling ? 'bg-purple live-dot' : 'bg-purple'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
