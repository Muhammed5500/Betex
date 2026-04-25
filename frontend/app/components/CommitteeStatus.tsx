'use client';

import { useEffect, useState } from 'react';
import { useReadContract, useWatchContractEvent } from 'wagmi';

import { ADDRESSES, BTX_VERIFIER_ABI, addressesConfigured } from '../lib/contracts';

interface NodeState {
  lastEpoch: number | null;
  lastSeenMs: number | null;
}

const FRESH_WINDOW_MS = 30_000;

export function CommitteeStatus() {
  const { data: n } = useReadContract({
    abi: BTX_VERIFIER_ABI,
    address: ADDRESSES.btxVerifier,
    functionName: 'N',
    query: { enabled: addressesConfigured },
  });

  const nodeCount = n !== undefined ? Number(n) : 3;
  const [state, setState] = useState<Record<number, NodeState>>({});

  useWatchContractEvent({
    abi: BTX_VERIFIER_ABI,
    address: ADDRESSES.btxVerifier,
    eventName: 'ShareSubmitted',
    enabled: addressesConfigured,
    onLogs(logs) {
      const now = Date.now();
      setState((prev) => {
        const next = { ...prev };
        for (const log of logs) {
          const { epochId, nodeId } = (log as unknown as {
            args: { epochId: bigint; nodeId: number };
          }).args;
          const id = Number(nodeId);
          next[id] = { lastEpoch: Number(epochId), lastSeenMs: now };
        }
        return next;
      });
    },
  });

  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), 5_000);
    return () => clearInterval(id);
  }, []);

  const freshCount = Object.values(state).filter(
    (s) => s.lastSeenMs && Date.now() - s.lastSeenMs < FRESH_WINDOW_MS,
  ).length;

  return (
    <div className="rounded-xl border border-border bg-surface shadow-soft hover:shadow-soft-lg transition-shadow duration-500 ease-paper p-5">
      <div className="flex items-center justify-between text-xs text-muted mb-4">
        <span>Committee</span>
        <span className="font-mono">
          <span className="text-text">{freshCount}</span>
          <span className="text-dim">/{nodeCount} live</span>
        </span>
      </div>
      <ul className="space-y-2.5 text-sm">
        {Array.from({ length: nodeCount }).map((_, i) => {
          const s = state[i];
          const fresh = s?.lastSeenMs && Date.now() - s.lastSeenMs < FRESH_WINDOW_MS;
          const dotClass = fresh
            ? 'bg-success live-dot'
            : s?.lastSeenMs
              ? 'bg-warning'
              : 'bg-border';
          const label = !s?.lastEpoch
            ? 'idle'
            : fresh
              ? `live · #${s.lastEpoch}`
              : `last #${s.lastEpoch}`;
          return (
            <li key={i} className="flex items-center gap-3">
              <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
              <span className="font-mono text-text">Node {i}</span>
              {i === 0 && <span className="text-xs text-muted">· combiner</span>}
              <span className="text-xs ml-auto font-mono text-muted">{label}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 pt-4 border-t border-border text-xs text-muted">
        Threshold: 2 of {nodeCount}.
      </p>
    </div>
  );
}
