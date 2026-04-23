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

  const freshCount = Object.values(state).filter(
    (s) => s.lastSeenMs && Date.now() - s.lastSeenMs < FRESH_WINDOW_MS,
  ).length;

  return (
    <div className="rounded-lg border border-border bg-gradient-surface p-4 card-lift">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] uppercase tracking-widest text-muted flex items-center gap-2">
          <span className="w-1 h-3 rounded-full bg-gradient-to-b from-success to-cyan" />
          Committee
        </div>
        <span className="text-[11px] font-mono text-muted">
          <span className="text-success">{freshCount}</span>
          <span className="opacity-60">/{nodeCount} live</span>
        </span>
      </div>
      <ul className="space-y-2.5 text-[13px]">
        {Array.from({ length: nodeCount }).map((_, i) => {
          const s = state[i];
          const fresh = s?.lastSeenMs && Date.now() - s.lastSeenMs < FRESH_WINDOW_MS;
          const dotClass = fresh
            ? 'bg-success pulse-dot'
            : s?.lastSeenMs
              ? 'bg-warning'
              : 'bg-border';
          const label = !s?.lastEpoch
            ? 'idle'
            : fresh
              ? `live · #${s.lastEpoch}`
              : `last #${s.lastEpoch}`;
          const labelColor = fresh ? 'text-success' : 'text-muted';
          return (
            <li key={i} className="flex items-center gap-3">
              <span className={`w-2 h-2 rounded-full ${dotClass}`} />
              <span className="font-mono">Node {i}</span>
              <span className={`text-[11px] ml-auto font-mono ${labelColor}`}>{label}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 pt-3 border-t border-border text-[10px] text-muted">
        Threshold: 2-of-{nodeCount} honest nodes to decrypt
      </p>
    </div>
  );
}
