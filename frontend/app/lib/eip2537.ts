// Browser TS port of js/lib/eip2537.js. Produces byte-for-byte identical output
// so that the same Schnorr challenge hashes on-chain and off-chain.
//
// Layout (per EIP-2537):
//   Fp:    16 bytes of zero padding || 48 bytes big-endian value   = 64 bytes
//   G1:    x || y                                                   = 128 bytes
//   G2:    x.c0 || x.c1 || y.c0 || y.c1                              = 256 bytes
//   Fr:    32 bytes big-endian (no padding)

import { bls12_381 as bls } from '@noble/curves/bls12-381.js';

export const G1 = bls.G1.Point.BASE;
export const G2 = bls.G2.Point.BASE;
export const G1_ZERO = bls.G1.Point.ZERO;
export const Fp12 = bls.fields.Fp12;
export const Fr = bls.fields.Fr;
export const FR_ORDER = Fr.ORDER;
export const pairing = bls.pairing;

export const FP_BYTES = 48;
export const G1_BYTES = 128;
export const G2_BYTES = 256;
export const FR_BYTES = 32;

export type G1Point = typeof G1;
export type G2Point = typeof G2;
export type GTElement = ReturnType<typeof pairing>;

function bigintTo48(n: bigint): Uint8Array {
  if (n < 0n) throw new Error('bigintTo48: negative');
  const out = new Uint8Array(FP_BYTES);
  let v = n;
  for (let i = FP_BYTES - 1; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  if (v !== 0n) throw new Error('bigintTo48: overflow');
  return out;
}

function bytesToBigInt(bytes: Uint8Array, offset: number, length: number): bigint {
  let n = 0n;
  for (let i = 0; i < length; i++) n = (n << 8n) + BigInt(bytes[offset + i]);
  return n;
}

export function g1ToBytes(point: G1Point): Uint8Array {
  const out = new Uint8Array(G1_BYTES);
  if (point.is0()) return out;
  const aff = point.toAffine();
  out.set(bigintTo48(aff.x), 16);
  out.set(bigintTo48(aff.y), 80);
  return out;
}

export function g1FromBytes(bytes: Uint8Array): G1Point {
  if (bytes.length !== G1_BYTES) {
    throw new Error(`g1FromBytes: expected ${G1_BYTES} bytes, got ${bytes.length}`);
  }
  let allZero = true;
  for (let i = 0; i < G1_BYTES; i++) if (bytes[i] !== 0) { allZero = false; break; }
  if (allZero) return G1_ZERO;
  for (let i = 0; i < 16; i++) {
    if (bytes[i] !== 0 || bytes[64 + i] !== 0) {
      throw new Error('g1FromBytes: non-zero EIP-2537 padding');
    }
  }
  const x = bytesToBigInt(bytes, 16, FP_BYTES);
  const y = bytesToBigInt(bytes, 80, FP_BYTES);
  const raw = new Uint8Array(96);
  raw.set(bigintTo48(x), 0);
  raw.set(bigintTo48(y), 48);
  const hex = Array.from(raw, (b) => b.toString(16).padStart(2, '0')).join('');
  const p = bls.G1.Point.fromHex(hex);
  p.assertValidity();
  return p;
}

export function g2ToBytes(point: G2Point): Uint8Array {
  const out = new Uint8Array(G2_BYTES);
  if (point.is0()) return out;
  const aff = point.toAffine();
  out.set(bigintTo48(aff.x.c0), 16);
  out.set(bigintTo48(aff.x.c1), 80);
  out.set(bigintTo48(aff.y.c0), 144);
  out.set(bigintTo48(aff.y.c1), 208);
  return out;
}

export function g2FromBytes(bytes: Uint8Array): G2Point {
  if (bytes.length !== G2_BYTES) {
    throw new Error(`g2FromBytes: expected ${G2_BYTES} bytes, got ${bytes.length}`);
  }
  let allZero = true;
  for (let i = 0; i < G2_BYTES; i++) if (bytes[i] !== 0) { allZero = false; break; }
  if (allZero) return bls.G2.Point.ZERO;
  const xc0 = bytesToBigInt(bytes, 16, FP_BYTES);
  const xc1 = bytesToBigInt(bytes, 80, FP_BYTES);
  const yc0 = bytesToBigInt(bytes, 144, FP_BYTES);
  const yc1 = bytesToBigInt(bytes, 208, FP_BYTES);
  const raw = new Uint8Array(192);
  // noble-curves uses IRTF (c1, c0) ordering; EIP-2537 uses (c0, c1).
  raw.set(bigintTo48(xc1), 0);
  raw.set(bigintTo48(xc0), 48);
  raw.set(bigintTo48(yc1), 96);
  raw.set(bigintTo48(yc0), 144);
  const hex = Array.from(raw, (b) => b.toString(16).padStart(2, '0')).join('');
  const p = bls.G2.Point.fromHex(hex);
  p.assertValidity();
  return p;
}

export function frToBytes(scalar: bigint): Uint8Array {
  const n = ((scalar % FR_ORDER) + FR_ORDER) % FR_ORDER;
  const out = new Uint8Array(FR_BYTES);
  let v = n;
  for (let i = FR_BYTES - 1; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

export function bytesToHex(bytes: Uint8Array): `0x${string}` {
  return ('0x' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')) as `0x${string}`;
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error('hexToBytes: odd length');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function randomFr(): bigint {
  for (let attempt = 0; attempt < 8; attempt++) {
    const raw = new Uint8Array(48);
    crypto.getRandomValues(raw);
    let n = 0n;
    for (const b of raw) n = (n << 8n) + BigInt(b);
    n %= FR_ORDER;
    if (n !== 0n) return n;
  }
  throw new Error('randomFr: exhausted retries');
}

export function randomGT(): GTElement {
  const x = randomFr();
  const base = pairing(G1, G2);
  return Fp12.pow(base, x);
}
