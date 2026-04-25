#!/usr/bin/env node
// Unified decryptor-node entry. Runs as a single daemon; the NODE_ID env
// variable determines identity + Shamir share ownership. Node 0 doubles as the
// combiner (pulls t+1 shares, runs off-chain BDec, submits plaintext batch).
//
// Usage:
//   node --env-file decryptor/config/node0.env decryptor/node.js

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { bls12_381 as bls } from '@noble/curves/bls12-381.js';
import { Fp12 } from '../js/lib/bls.js';
import { partialDecrypt } from '../js/lib/btx-decrypt-threshold.js';
import { g2FromBytes, hexToBytes } from '../js/lib/eip2537.js';

import { makeContracts } from './lib/contracts.js';
import { fetchEpochCiphertexts } from './lib/epoch-fetch.js';
import { combineEpoch, sigmaToBytes } from './lib/combiner.js';
import { rpcRetry } from './lib/rpc-retry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NODE_ID = Number(process.env.NODE_ID);
if (!Number.isInteger(NODE_ID) || NODE_ID < 0) throw new Error('NODE_ID missing/bad');
const SHAMIR_SHARE = (process.env.SHAMIR_SHARE ?? '')
  .split(',')
  .filter(Boolean)
  .map((hex) => BigInt('0x' + hex));
if (SHAMIR_SHARE.length === 0) throw new Error('SHAMIR_SHARE missing');

const RPC_URL = process.env.RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const addresses = {
  encryptedPool: process.env.ENCRYPTED_POOL_ADDRESS,
  btxVerifier: process.env.BTX_VERIFIER_ADDRESS,
  schnorrVerifier: process.env.SCHNORR_VERIFIER_ADDRESS,
};
for (const [k, v] of Object.entries({ RPC_URL, PRIVATE_KEY, ...addresses })) {
  if (!v) throw new Error(`[node${NODE_ID}] env var missing: ${k}`);
}

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 2000);

// ---------------------------------------------------------------
// Load public params (for combiner role)
// ---------------------------------------------------------------
const publicParamsPath = path.resolve(__dirname, 'config/public-params.json');
const publicParamsRaw = JSON.parse(fs.readFileSync(publicParamsPath, 'utf8'));

// Hydrate dk (G2 points), pkCommitments, omega as BigInt.
// public-params.dk_eip2537 is 1-indexed length 2*Bmax+1 (null at 0, zeroes at Bmax+1).
const dk = new Array(2 * publicParamsRaw.Bmax + 1).fill(null);
for (let i = 1; i <= 2 * publicParamsRaw.Bmax; i++) {
  if (i === publicParamsRaw.Bmax + 1) continue;
  dk[i] = g2FromBytes(hexToBytes(publicParamsRaw.dk_eip2537[i]));
}
const pkCommitments = publicParamsRaw.pkCommitments_eip2537.map((pkj) =>
  pkj.map((p) => g2FromBytes(hexToBytes(p))),
);
const omega = publicParamsRaw.omega.map((w) => BigInt('0x' + w));

const hydratedParams = {
  Bmax: publicParamsRaw.Bmax,
  N: publicParamsRaw.N,
  t: publicParamsRaw.t,
  dk,
  pkCommitments,
  omega,
};

// ---------------------------------------------------------------
// Contract context
// ---------------------------------------------------------------
const ctx = makeContracts({ rpcUrl: RPC_URL, privateKey: PRIVATE_KEY, addresses });

console.log(
  `[node${NODE_ID}] online  rpc=${RPC_URL}  pool=${addresses.encryptedPool}  poll=${POLL_INTERVAL_MS}ms`,
);

// ---------------------------------------------------------------
// Per-epoch handling
// ---------------------------------------------------------------
const processedEpochs = new Set();
const submittedShare = new Set(); // epochs where we already submitted σ
const combinedEpochs = new Set();
const settledEpochs = new Set(); // epochs confirmed executed on-chain — never re-read
const pendingEpochs = new Set(); // epochs known to contain ≥1 OrderSubmitted event
const emptyEpochs = new Set();   // epochs closed with orderCount=0, skip forever
let lastEventBlock = 0;          // cursor for queryFilter(OrderSubmitted)
let busy = false;

async function tryCloseEpoch() {
  // Any node may call closeEpoch(). To avoid 3 nodes racing on every tick,
  // non-zero nodes wait a small backoff — node 0 normally wins, but if it's
  // offline, nodes 1 and 2 step in and liveness is preserved.
  //
  // Empty epochs are intentionally skipped: EncryptedPool._rolloverIfExpired()
  // closes any expired epoch automatically inside the next submitEncryptedOrder
  // call, so paying gas to close a 0-order epoch is wasted work. Decryptors
  // only step in when there is real batch work waiting to be revealed.
  try {
    const curId = Number(await rpcRetry(() => ctx.encryptedPool.currentEpochId()));
    const epoch = await rpcRetry(() => ctx.encryptedPool.epochs(curId));
    const now = Math.floor(Date.now() / 1000);
    if (epoch.closed || now < Number(epoch.endTime)) return;
    if (Number(epoch.orderCount) === 0) return;

    if (NODE_ID > 0) {
      await new Promise((r) => setTimeout(r, NODE_ID * 400));
      const fresh = await rpcRetry(() => ctx.encryptedPool.epochs(curId));
      if (fresh.closed) return;
    }

    console.log(`[node${NODE_ID}] closing expired epoch ${curId}`);
    const tx = await rpcRetry(() => ctx.encryptedPool.closeEpoch());
    await tx.wait();
  } catch (err) {
    const msg = err.shortMessage ?? err.reason ?? err.message ?? '';
    if (/already closed|not expired|epoch.*closed/i.test(msg)) return;
    console.warn(`[node${NODE_ID}] closeEpoch poll error: ${msg}`);
  }
}

async function processEpoch(epochId) {
  // No early-exit guard here: the op is idempotent (we check submittedShare
  // + btxVerifier.hasSubmitted + combinedEpochs below). Short-circuiting on
  // processedEpochs before the work is done caused stuck state when a mid-
  // flight RPC error left us with the epoch marked processed but no σ sent.

  const epoch = await rpcRetry(() => ctx.encryptedPool.epochs(epochId));
  if (Number(epoch.orderCount) === 0) {
    emptyEpochs.add(epochId);
    if (!processedEpochs.has(epochId)) {
      console.log(`[node${NODE_ID}] epoch ${epochId} empty — skip`);
    }
    processedEpochs.add(epochId);
    return;
  }
  processedEpochs.add(epochId);

  const ciphertexts = await rpcRetry(() =>
    fetchEpochCiphertexts(ctx.encryptedPool, epochId),
  );
  if (ciphertexts.length !== Number(epoch.orderCount)) {
    throw new Error(
      `[node${NODE_ID}] epoch ${epochId} has ${epoch.orderCount} orders but ${ciphertexts.length} events`,
    );
  }

  // 1. Submit our σ_j if we haven't already.
  if (!submittedShare.has(epochId)) {
    const already = await rpcRetry(() =>
      ctx.btxVerifier.hasSubmitted(epochId, NODE_ID),
    );
    if (!already) {
      const { sigma_j, U } = partialDecrypt(ciphertexts, SHAMIR_SHARE);
      console.log(`[node${NODE_ID}] epoch ${epochId}: |U|=${U.length}, submitting σ_${NODE_ID}`);
      const tx = await rpcRetry(() =>
        ctx.btxVerifier.submitShare(epochId, NODE_ID, sigmaToBytes(sigma_j)),
      );
      await tx.wait();
      submittedShare.add(epochId);
      console.log(`[node${NODE_ID}] σ_${NODE_ID} submitted (tx ${tx.hash})`);
    } else {
      submittedShare.add(epochId);
    }
  }

  // 2. Node 0 = combiner: wait for t+1 shares, then finalize.
  if (NODE_ID === 0 && !combinedEpochs.has(epochId)) {
    let count = 0;
    for (let j = 0; j < hydratedParams.N; j++) {
      if (await rpcRetry(() => ctx.btxVerifier.hasSubmitted(epochId, j))) count += 1;
    }
    const tPlus1 = hydratedParams.t + 1;
    if (count < tPlus1) {
      console.log(`[node${NODE_ID}] epoch ${epochId} has ${count}/${tPlus1} shares — waiting`);
      processedEpochs.delete(epochId); // retry next poll
      return;
    }

    try {
      const { receipt, V, decryptedCount } = await combineEpoch(
        ctx,
        hydratedParams,
        epochId,
        ciphertexts,
        hydratedParams.N,
        tPlus1,
      );
      combinedEpochs.add(epochId);
      console.log(
        `[combiner] epoch ${epochId} finalized: V=[${V}] decrypted=${decryptedCount} tx=${receipt.hash}`,
      );
    } catch (err) {
      const msg = err.shortMessage ?? err.reason ?? err.message;
      console.error(`[combiner] epoch ${epochId} failed: ${msg}`);
      combinedEpochs.add(epochId); // don't keep retrying a failed batch
    }
  }
}

async function poll() {
  if (busy) return;
  busy = true;
  try {
    await tryCloseEpoch();

    // 1. Event-driven pending-epoch discovery. Cheaper than scanning every
    //    epoch — we only care about ones that actually contain orders.
    //    Monad's public RPC caps eth_getLogs range to ~100 blocks, so we
    //    paginate backwards from head until we reach lastEventBlock.
    try {
      const head = await rpcRetry(() => ctx.provider.getBlockNumber());
      // Initial-boot lookback: cover restarts that happened up to a few minutes
      // ago so pending epochs aren't silently missed. Monad @ 400 ms blocks →
      // 5000 blocks ≈ 33 minutes. Subsequent polls use the lastEventBlock
      // cursor, so this cost is only paid once per process.
      const BOOT_LOOKBACK = Number(process.env.BTX_BOOT_LOOKBACK_BLOCKS ?? 5000);
      const target = lastEventBlock || Math.max(0, head - BOOT_LOOKBACK);
      let from = target;
      const PAGE = 100;
      while (from <= head) {
        const to = Math.min(head, from + PAGE - 1);
        const evs = await rpcRetry(() =>
          ctx.encryptedPool.queryFilter(
            ctx.encryptedPool.filters.OrderSubmitted(),
            from,
            to,
          ),
        );
        for (const ev of evs) {
          const eid = Number(ev.args.epochId);
          if (!settledEpochs.has(eid)) pendingEpochs.add(eid);
        }
        from = to + 1;
      }
      lastEventBlock = head + 1;
    } catch (err) {
      console.warn(
        `[node${NODE_ID}] OrderSubmitted query: ${err.shortMessage ?? err.message}`,
      );
    }

    // 2. For each pending epoch check state and advance.
    for (const eid of [...pendingEpochs]) {
      try {
        const ep = await rpcRetry(() => ctx.encryptedPool.epochs(eid));
        if (ep.executed) {
          settledEpochs.add(eid);
          pendingEpochs.delete(eid);
          continue;
        }
        if (ep.closed) await processEpoch(eid);
        // If not closed yet, just wait — next poll will re-check.
      } catch (err) {
        console.warn(
          `[node${NODE_ID}] epoch ${eid} step: ${err.shortMessage ?? err.message}`,
        );
      }
    }
  } finally {
    busy = false;
  }
}

setInterval(poll, POLL_INTERVAL_MS);
poll();

process.on('SIGINT', () => {
  console.log(`[node${NODE_ID}] shutting down`);
  process.exit(0);
});
