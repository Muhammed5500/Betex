// Fetch an epoch's ciphertexts via OrderSubmitted events and reconstruct the
// BTX inputs for partialDecrypt / combine.

import { bls12_381 as bls } from '@noble/curves/bls12-381.js';
import { Fp12 } from '../../js/lib/bls.js';
import { g1FromBytes, frFromBytes, hexToBytes } from '../../js/lib/eip2537.js';

// Monad's public RPC caps eth_getLogs range at ~100 blocks and rejects
// unbounded queries with HTTP 413. We paginate backwards from head by this
// page size.
const GETLOGS_PAGE_SIZE = 100;
// Hard cap on how far back we scan when a caller doesn't hint a start block.
// 400 ms blocks × 5000 ≈ 33 minutes of history — comfortably covers an
// expired-then-settled epoch even under worst-case combiner lag.
const DEFAULT_LOOKBACK_BLOCKS = 5000;

async function paginatedQuery(encryptedPool, epochId, fromBlock, toBlock) {
  const filter = encryptedPool.filters.OrderSubmitted(epochId);
  const all = [];
  for (let from = fromBlock; from <= toBlock; from += GETLOGS_PAGE_SIZE) {
    const to = Math.min(toBlock, from + GETLOGS_PAGE_SIZE - 1);
    const evs = await encryptedPool.queryFilter(filter, from, to);
    if (evs.length) all.push(...evs);
  }
  return all;
}

/**
 * Return an array of {ct_1, ct_2, pi, aes_ct, orderHash, user, orderIndex}
 * sorted by orderIndex ascending.
 *
 * @param {Contract} encryptedPool
 * @param {number|bigint} epochId
 * @param {{fromBlock?: number, toBlock?: number}} [range]
 *        Optional block range. Defaults to [head-DEFAULT_LOOKBACK_BLOCKS, head].
 */
export async function fetchEpochCiphertexts(encryptedPool, epochId, range = {}) {
  const provider = encryptedPool.runner?.provider ?? encryptedPool.provider;
  const head = range.toBlock ?? (await provider.getBlockNumber());
  const from = range.fromBlock ?? Math.max(0, head - DEFAULT_LOOKBACK_BLOCKS);

  const events = await paginatedQuery(encryptedPool, epochId, from, head);

  return events
    .map((ev) => {
      const args = ev.args;
      const ct_2_bytes = hexToBytes(args.ct_2);
      if (ct_2_bytes.length !== 576) {
        throw new Error(`fetchEpochCiphertexts: ct_2 length ${ct_2_bytes.length} != 576`);
      }
      return {
        orderIndex: Number(args.orderIndex),
        user: args.user,
        ct_1: g1FromBytes(hexToBytes(args.ct_1)),
        ct_2: Fp12.fromBytes(ct_2_bytes),
        pi: {
          R: g1FromBytes(hexToBytes(args.pi_R)),
          s: frFromBytes(hexToBytes(args.pi_s)),
        },
        aes_ct: hexToBytes(args.aes_ct),
        orderHash: args.orderHash,
      };
    })
    .sort((a, b) => a.orderIndex - b.orderIndex);
}
