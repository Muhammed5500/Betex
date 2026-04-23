// TS port of js/lib/schnorr.js — byte-compatible with the Solidity verifier.
// SHA-256 over DOMAIN || G1 || ct_1 || R, all in EIP-2537 128-byte uncompressed form.

import { sha256 } from '@noble/hashes/sha2.js';
import {
  FR_ORDER,
  G1,
  G1_BYTES,
  type G1Point,
  g1ToBytes,
  randomFr,
} from './eip2537';

const DOMAIN = new TextEncoder().encode('BTX-SCHNORR-V1');

function hashToFr(...buffers: Uint8Array[]): bigint {
  let total = DOMAIN.length;
  for (const b of buffers) total += b.length;
  const concat = new Uint8Array(total);
  concat.set(DOMAIN, 0);
  let offset = DOMAIN.length;
  for (const b of buffers) {
    concat.set(b, offset);
    offset += b.length;
  }
  const digest = sha256(concat);
  let n = 0n;
  for (const b of digest) n = (n << 8n) + BigInt(b);
  return n % FR_ORDER;
}

export interface SchnorrProof {
  R: G1Point;
  s: bigint;
}

export function schnorrProve(r: bigint, ct_1: G1Point): SchnorrProof {
  const k = randomFr();
  const R = G1.multiply(k);
  const c = hashToFr(g1ToBytes(G1), g1ToBytes(ct_1), g1ToBytes(R));
  const rNorm = ((r % FR_ORDER) + FR_ORDER) % FR_ORDER;
  const s = (k + c * rNorm) % FR_ORDER;
  return { R, s };
}

export function schnorrVerify(ct_1: G1Point, pi: SchnorrProof): boolean {
  const c = hashToFr(g1ToBytes(G1), g1ToBytes(ct_1), g1ToBytes(pi.R));
  const sNorm = ((pi.s % FR_ORDER) + FR_ORDER) % FR_ORDER;
  if (sNorm === 0n) return false;
  const lhs = G1.multiply(sNorm);
  const cNorm = ((c % FR_ORDER) + FR_ORDER) % FR_ORDER;
  const rhs = cNorm === 0n ? pi.R : pi.R.add(ct_1.multiply(cNorm));
  return lhs.equals(rhs);
}

export const SCHNORR_BYTES = { G1: G1_BYTES };
