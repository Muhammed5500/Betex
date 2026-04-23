'use client';

import { useEffect, useState } from 'react';
import { useAccount, usePublicClient } from 'wagmi';

import { ADDRESSES, ENCRYPTED_POOL_ABI, addressesConfigured } from '../lib/contracts';

interface EpochEntry {
  epochId: bigint;
  orderCount: number;
  swaps: number;
  refunds: number;
  status: 'pending' | 'settled' | 'empty';
}

const LOOKBACK_BLOCKS = 50_000n;

export function EpochHistory() {
  const client = usePublicClient();
  const { address } = useAccount();
  const [entries, setEntries] = useState<EpochEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!client || !addressesConfigured) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const latest = await client!.getBlockNumber();
        const from = latest > LOOKBACK_BLOCKS ? latest - LOOKBACK_BLOCKS : 0n;

        const [submittedLogs, executedLogs, refundedLogs, closedLogs] = await Promise.all([
          client!.getContractEvents({
            abi: ENCRYPTED_POOL_ABI,
            address: ADDRESSES.encryptedPool,
            eventName: 'OrderSubmitted',
            fromBlock: from,
            toBlock: latest,
          }),
          client!.getContractEvents({
            abi: ENCRYPTED_POOL_ABI,
            address: ADDRESSES.encryptedPool,
            eventName: 'SwapExecuted',
            fromBlock: from,
            toBlock: latest,
          }),
          client!.getContractEvents({
            abi: ENCRYPTED_POOL_ABI,
            address: ADDRESSES.encryptedPool,
            eventName: 'RefundClaimed',
            fromBlock: from,
            toBlock: latest,
          }),
          client!.getContractEvents({
            abi: ENCRYPTED_POOL_ABI,
            address: ADDRESSES.encryptedPool,
            eventName: 'EpochClosed',
            fromBlock: from,
            toBlock: latest,
          }),
        ]);

        const acc = new Map<string, EpochEntry>();
        function bump(id: bigint, mut: (e: EpochEntry) => void) {
          const key = id.toString();
          const existing = acc.get(key) ?? {
            epochId: id,
            orderCount: 0,
            swaps: 0,
            refunds: 0,
            status: 'pending' as const,
          };
          mut(existing);
          acc.set(key, existing);
        }

        for (const log of submittedLogs) {
          const args = (log as unknown as { args: { epochId: bigint; user: `0x${string}` } }).args;
          if (!address || args.user.toLowerCase() === address.toLowerCase()) {
            bump(args.epochId, (e) => {
              e.orderCount += 1;
            });
          }
        }
        for (const log of executedLogs) {
          const args = (log as unknown as { args: { epochId: bigint; user: `0x${string}` } }).args;
          if (!address || args.user.toLowerCase() === address.toLowerCase()) {
            bump(args.epochId, (e) => {
              e.swaps += 1;
              e.status = 'settled';
            });
          }
        }
        for (const log of refundedLogs) {
          const args = (log as unknown as { args: { epochId: bigint; user: `0x${string}` } }).args;
          if (!address || args.user.toLowerCase() === address.toLowerCase()) {
            bump(args.epochId, (e) => {
              e.refunds += 1;
              e.status = 'settled';
            });
          }
        }
        for (const log of closedLogs) {
          const args = (log as unknown as { args: { epochId: bigint; orderCount: number } }).args;
          bump(args.epochId, (e) => {
            if (e.orderCount === 0) e.status = 'empty';
          });
        }

        const sorted = Array.from(acc.values()).sort((a, b) =>
          a.epochId > b.epochId ? -1 : a.epochId < b.epochId ? 1 : 0,
        );
        if (!cancelled) setEntries(sorted.slice(0, 20));
      } catch (err) {
        console.error('EpochHistory load failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const id = setInterval(load, 12_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [client, address]);

  if (!addressesConfigured) {
    return <div className="text-sm text-muted">Configure contract addresses to load history.</div>;
  }

  const STATUS_STYLE = {
    settled: 'bg-success/10 text-success border-success/30',
    empty: 'bg-border/40 text-muted border-border',
    pending: 'bg-purpleDim/40 text-purpleHi border-purpleDim',
  } as const;

  return (
    <div className="rounded-lg border border-border bg-gradient-surface overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <div className="text-[11px] uppercase tracking-widest text-muted flex items-center gap-2">
          <span className="w-1 h-3 rounded-full bg-gradient-cta" />
          Recent epochs {address ? '(yours)' : '(all)'}
        </div>
        {loading && <span className="text-[11px] text-muted animate-pulse">refreshing</span>}
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-muted px-5 py-12 text-center">No activity yet.</p>
      ) : (
        <ul className="divide-y divide-border text-[13px]">
          {entries.map((e) => (
            <li
              key={e.epochId.toString()}
              className="flex items-center justify-between px-5 py-3 hover:bg-surface/40 transition-colors"
            >
              <span className="font-mono text-mutedHi w-20">#{e.epochId.toString()}</span>
              <span className="text-muted text-[12px] flex-1 text-center font-mono">
                {e.orderCount}o · {e.swaps}s · {e.refunds}r
              </span>
              <span
                className={`text-[10px] uppercase tracking-widest font-mono px-2 py-0.5 rounded border ${STATUS_STYLE[e.status]}`}
              >
                {e.status}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="px-5 py-3 text-[10px] text-muted border-t border-border">
        Events from the last {LOOKBACK_BLOCKS.toString()} blocks.
      </div>
    </div>
  );
}
