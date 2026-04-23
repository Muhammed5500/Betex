// BLS12-381 wrapper over @noble/curves v2.
// Maps paper notation to the curve library's API.
// Paper [[x]]_1 = x·g_1 ∈ G1, [[x]]_2 = x·g_2 ∈ G2, [[x]]_T = x·g_T ∈ GT.
// GT is represented as Fp12 (multiplicative), so paper's additive GT maps to Fp12.mul.

import { bls12_381 as bls } from '@noble/curves/bls12-381.js';
import { sha256 } from '@noble/hashes/sha2.js';

export const G1 = bls.G1.Point.BASE;
export const G2 = bls.G2.Point.BASE;
export const G1_ZERO = bls.G1.Point.ZERO;
export const G2_ZERO = bls.G2.Point.ZERO;

export const Fr = bls.fields.Fr;
export const Fp = bls.fields.Fp;
export const Fp2 = bls.fields.Fp2;
export const Fp6 = bls.fields.Fp6;
export const Fp12 = bls.fields.Fp12;

export const pairing = bls.pairing;
export const pairingBatch = bls.pairingBatch;

export const FR_ORDER = Fr.ORDER;

// Convert a byte buffer to a bigint (big-endian).
function bytesToBigInt(bytes) {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) + BigInt(b);
  return n;
}

/**
 * Sample a uniformly random non-zero element of Fr.
 * @returns {bigint}
 */
export function randomFr() {
  // Drain extra entropy and reduce mod p to keep distribution close to uniform.
  // Retry if the reduction happens to produce 0 (~2^-255 probability).
  for (let attempt = 0; attempt < 8; attempt++) {
    const raw = bls.utils.randomSecretKey();
    const n = bytesToBigInt(raw) % FR_ORDER;
    if (n !== 0n) return n;
  }
  throw new Error('randomFr: exhausted retries sampling non-zero scalar');
}

/**
 * [[x]]_1 = x · G_1 ∈ G1. Accepts 0 by returning the identity.
 */
export function g1Mul(scalar) {
  const s = scalar % FR_ORDER;
  const normalized = s < 0n ? s + FR_ORDER : s;
  if (normalized === 0n) return G1_ZERO;
  return G1.multiply(normalized);
}

/**
 * [[x]]_2 = x · G_2 ∈ G2.
 */
export function g2Mul(scalar) {
  const s = scalar % FR_ORDER;
  const normalized = s < 0n ? s + FR_ORDER : s;
  if (normalized === 0n) return G2_ZERO;
  return G2.multiply(normalized);
}

/**
 * Multi-scalar multiplication in G1. Reference implementation (O(k)); fine for Bmax=16.
 * Σ scalars[i] · points[i]
 */
export function g1MSM(scalars, points) {
  if (scalars.length !== points.length) {
    throw new Error(`g1MSM: length mismatch (${scalars.length} vs ${points.length})`);
  }
  let acc = G1_ZERO;
  for (let i = 0; i < scalars.length; i++) {
    const s = scalars[i] % FR_ORDER;
    const normalized = s < 0n ? s + FR_ORDER : s;
    if (normalized === 0n) continue;
    acc = acc.add(points[i].multiply(normalized));
  }
  return acc;
}

/**
 * Multi-scalar multiplication in G2.
 */
export function g2MSM(scalars, points) {
  if (scalars.length !== points.length) {
    throw new Error(`g2MSM: length mismatch`);
  }
  let acc = G2_ZERO;
  for (let i = 0; i < scalars.length; i++) {
    const s = scalars[i] % FR_ORDER;
    const normalized = s < 0n ? s + FR_ORDER : s;
    if (normalized === 0n) continue;
    acc = acc.add(points[i].multiply(normalized));
  }
  return acc;
}

/**
 * Table [τ, τ², ..., τ^k] mod p.
 */
export function powerTable(tau, k) {
  if (k < 1) return [];
  const out = new Array(k);
  out[0] = ((tau % FR_ORDER) + FR_ORDER) % FR_ORDER;
  for (let i = 1; i < k; i++) {
    out[i] = (out[i - 1] * out[0]) % FR_ORDER;
  }
  return out;
}

/**
 * H: {0,1}* → Fr using SHA-256.
 * Used for Fiat–Shamir in Schnorr. Callers supply domain separation themselves
 * by prepending a tag buffer.
 */
export function hashToFr(...buffers) {
  let total = 0;
  for (const b of buffers) total += b.length;
  const concat = new Uint8Array(total);
  let offset = 0;
  for (const b of buffers) {
    concat.set(b, offset);
    offset += b.length;
  }
  const digest = sha256(concat);
  return bytesToBigInt(digest) % FR_ORDER;
}

/**
 * Sample a random GT element by exponentiating e(G1, G2).
 * This lives in the prime-order subgroup of GT, which is the correct domain for BTX.
 */
export function randomGT() {
  const x = randomFr();
  const base = pairing(G1, G2);
  return Fp12.pow(base, x);
}

// Convenience re-export for callers that want raw bytes ↔ bigint helpers.
export { bytesToBigInt };
