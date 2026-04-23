// Combiner logic: after t+1 shares are on-chain, fetch them, run BDec2 locally,
// derive AES keys from recovered m_GT, decrypt order payloads, and submit to
// EncryptedPool. Contract performs the aggregate pairing check + hash binding.

import { combine } from '../../js/lib/btx-decrypt-threshold.js';
import { decryptOrder } from '../../js/lib/order-codec.js';
import { g1FromBytes, g1ToBytes, bytesToHex, hexToBytes } from '../../js/lib/eip2537.js';

/**
 * @param {object} ctx               { encryptedPool, btxVerifier, provider, signer }
 * @param {object} publicParams      parsed public-params.json + hydrated objects
 * @param {number} epochId
 * @param {Array} ciphertexts         from fetchEpochCiphertexts
 * @param {number} N
 * @param {number} tPlus1
 */
export async function combineEpoch(ctx, publicParams, epochId, ciphertexts, N, tPlus1) {
  // 1. Pull σ_j from contract for each submitted node.
  const submitted = [];
  for (let j = 0; j < N; j++) {
    const has = await ctx.btxVerifier.hasSubmitted(epochId, j);
    if (!has) continue;
    const sigmaHex = await ctx.btxVerifier.getShare(epochId, j);
    submitted.push({ nodeId: j, sigma_j: g1FromBytes(hexToBytes(sigmaHex)) });
  }
  if (submitted.length < tPlus1) {
    throw new Error(`combine: only ${submitted.length} shares on-chain, need ${tPlus1}`);
  }

  // 2. Build partials[] aligned with 0..N-1 for the combine() API.
  const partials = new Array(N).fill(null);
  // All ciphertexts are Schnorr-verified at submission time, so U covers every slot.
  const U = ciphertexts.map((c) => c.orderIndex + 1);
  for (const s of submitted) {
    partials[s.nodeId] = { sigma_j: s.sigma_j, U };
  }

  // 3. Run off-chain combine to recover m_GT values.
  const V = submitted.slice(0, tPlus1).map((s) => s.nodeId);
  const result = combine(
    partials,
    V,
    ciphertexts,
    publicParams.dk,
    publicParams.pkCommitments,
    publicParams.omega,
    publicParams.Bmax,
    tPlus1,
  );

  // 4. AES-unwrap each slot's plaintext order.
  const decrypted = [];
  for (let i = 0; i < ciphertexts.length; i++) {
    const m = result.messages[i];
    if (!m) {
      // Shouldn't happen under our current Schnorr-at-submit policy, but be defensive.
      console.warn(`combiner: slot ${i} missing m_GT — skipping`);
      continue;
    }
    let order;
    try {
      order = decryptOrder(m, ciphertexts[i].aes_ct);
    } catch (err) {
      console.warn(`combiner: AES decrypt failed for slot ${i}: ${err.message}`);
      continue;
    }
    if (order.user.toLowerCase() !== ciphertexts[i].user.toLowerCase()) {
      console.warn(`combiner: user mismatch at slot ${i} — skipping`);
      continue;
    }
    decrypted.push({
      orderIndex: ciphertexts[i].orderIndex,
      user: order.user,
      tokenIn: order.tokenIn,
      amountIn: order.amountIn,
      tokenOut: order.tokenOut,
      minAmountOut: order.minAmountOut,
      nonce: order.nonce,
    });
  }

  if (decrypted.length === 0) {
    throw new Error('combiner: no valid decrypted orders');
  }

  // 5. Submit on-chain. Contract runs aggregate pairing check + hash binding + AMM swaps.
  const tx = await ctx.encryptedPool.submitDecryptedBatch(epochId, decrypted, V);
  const receipt = await tx.wait();
  return { receipt, V, decryptedCount: decrypted.length, chosenV: result.chosenV };
}

export function sigmaToBytes(sigma_j) {
  return bytesToHex(g1ToBytes(sigma_j));
}
