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

const STATUS_LABEL: Record<EpochEntry['status'], string> = {
  settled: 'Settled',
  empty: 'Empty',
  pending: 'Pending',
};

const STATUS_STYLE: Record<EpochEntry['status'], string> = {
  settled: 'text-success',
  empty: 'text-dim',
  pending: 'text-purple',
};

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

  return (
    <div className="rounded-xl border border-border bg-surface shadow-soft hover:shadow-soft-lg transition-shadow duration-500 ease-paper overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <div className="text-xs text-muted">
          Recent epochs {address ? '(yours)' : '(all)'}
        </div>
        {loading && <span className="text-xs text-dim">refreshing</span>}
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-muted px-5 py-12 text-center">No activity yet.</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {entries.map((e) => (
            <li
              key={e.epochId.toString()}
              className="flex items-center justify-between px-5 py-3"
            >
              <span className="font-mono text-text w-20">#{e.epochId.toString()}</span>
              <span className="text-muted text-xs font-mono">
                {e.orderCount}o · {e.swaps}s · {e.refunds}r
              </span>
              <span className={`text-xs font-mono ${STATUS_STYLE[e.status]}`}>
                {STATUS_LABEL[e.status]}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="px-5 py-3 text-xs text-muted border-t border-border">
        Last {LOOKBACK_BLOCKS.toString()} blocks.
      </div>
    </div>
  );
}
