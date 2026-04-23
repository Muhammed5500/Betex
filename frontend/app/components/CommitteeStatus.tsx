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
          const { epochId, nodeId } = (log as unknown as { args: { epochId: bigint; nodeId: number } }).args;
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

  return (
    <div className="rounded-xl border border-btx-border bg-btx-panel p-4">
      <div className="text-sm font-semibold text-white mb-3">Committee · 2-of-{nodeCount}</div>
      <ul className="space-y-2 text-sm">
        {Array.from({ length: nodeCount }).map((_, i) => {
          const s = state[i];
          const fresh = s?.lastSeenMs && Date.now() - s.lastSeenMs < FRESH_WINDOW_MS;
          const dot = fresh ? 'bg-btx-success' : s?.lastSeenMs ? 'bg-yellow-500' : 'bg-btx-border';
          const label = !s?.lastEpoch
            ? 'no shares yet'
            : fresh
              ? `live · epoch #${s.lastEpoch}`
              : `last: epoch #${s.lastEpoch}`;
          return (
            <li key={i} className="flex items-center gap-3">
              <span className={`w-2 h-2 rounded-full ${dot}`} />
              <span className="font-mono text-white">Node {i}</span>
              <span className="text-xs text-btx-muted ml-auto">{label}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-btx-muted">
        Green = submitted a share in the last 30 s.
      </p>
    </div>
  );
}
