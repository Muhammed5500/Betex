// EIP-2537 byte encoding for BLS12-381 points and scalars.
// EIP-2537 precompiles (addresses 0x0b - 0x11) require:
//   - Each Fp element: 64 bytes = 16 bytes zero padding + 48 bytes big-endian value
//   - G1 point (uncompressed): 128 bytes = 2 × Fp (x, y)
//   - G2 point (uncompressed): 256 bytes = 4 × Fp (x.c0, x.c1, y.c0, y.c1)
//   - Fr scalar: 32 bytes big-endian (no padding)
//
// @noble/curves stores affine coordinates as raw bigints (Fp) or {c0, c1} (Fp2).
// This module bridges those representations to the exact bytes EIP-2537 expects
// so that JS encryption output matches Solidity verifier input byte-for-byte.

import { G1, G2, G1_ZERO, G2_ZERO, FR_ORDER } from './bls.js';
import { bls12_381 as bls } from '@noble/curves/bls12-381.js';

const FP_BYTES = 48;       // Fp is a 381-bit prime → 48-byte big-endian
const FP_SLOT = 64;        // EIP-2537 pads Fp to 64 bytes
const G1_BYTES = 128;      // Two Fp slots
const G2_BYTES = 256;      // Four Fp slots
const FR_BYTES = 32;

function bigintTo48(n) {
  const out = new Uint8Array(FP_BYTES);
  let v = n;
  if (v < 0n) throw new Error('bigintTo48: negative input');
  for (let i = FP_BYTES - 1; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  if (v !== 0n) throw new Error('bigintTo48: value overflows 48 bytes');
  return out;
}

function bytesToBigInt(bytes, offset, length) {
  let n = 0n;
  for (let i = 0; i < length; i++) n = (n << 8n) + BigInt(bytes[offset + i]);
  return n;
}

/**
 * Encode a G1 point to EIP-2537's 128-byte uncompressed format.
 * The identity (point at infinity) is 128 zero bytes per EIP-2537 §Encoding.
 */
export function g1ToBytes(point) {
  const out = new Uint8Array(G1_BYTES);
  if (point.is0()) return out;
  const aff = point.toAffine();
  out.set(bigintTo48(aff.x), 16);  // 16 pad + 48 x  → offset 16..63
  out.set(bigintTo48(aff.y), 80);  // 16 pad + 48 y  → offset 80..127
  return out;
}

/**
 * Decode a 128-byte EIP-2537 G1 point.
 */
export function g1FromBytes(bytes) {
  if (bytes.length !== G1_BYTES) {
    throw new Error(`g1FromBytes: expected ${G1_BYTES} bytes, got ${bytes.length}`);
  }
  // All-zero → point at infinity
  let allZero = true;
  for (let i = 0; i < G1_BYTES; i++) if (bytes[i] !== 0) { allZero = false; break; }
  if (allZero) return G1_ZERO;

  // Check padding (first 16 and middle 16 bytes must be zero).
  for (let i = 0; i < 16; i++) {
    if (bytes[i] !== 0 || bytes[64 + i] !== 0) {
      throw new Error(`g1FromBytes: non-zero EIP-2537 padding at byte ${bytes[i] !== 0 ? i : 64 + i}`);
    }
  }

  const x = bytesToBigInt(bytes, 16, FP_BYTES);
  const y = bytesToBigInt(bytes, 80, FP_BYTES);
  // Reconstruct through hex: compute uncompressed SEC1 representation (96 bytes: x||y).
  const raw = new Uint8Array(96);
  raw.set(bigintTo48(x), 0);
  raw.set(bigintTo48(y), 48);
  // noble-curves accepts raw uncompressed form via fromHex.
  const hex = Array.from(raw).map((b) => b.toString(16).padStart(2, '0')).join('');
  const point = bls.G1.Point.fromHex(hex);
  point.assertValidity();
  return point;
}

/**
 * Encode a G2 point to EIP-2537's 256-byte uncompressed format.
 * Layout: x.c0 || x.c1 || y.c0 || y.c1, each 64 bytes (16 pad + 48 value).
 * Note: EIP-2537 uses (c0, c1) ordering where the Fp2 element is c0 + c1 · u.
 */
export function g2ToBytes(point) {
  const out = new Uint8Array(G2_BYTES);
  if (point.is0()) return out;
  const aff = point.toAffine();
  // aff.x and aff.y are Fp2 values with { c0, c1 } bigint fields.
  const x = aff.x;
  const y = aff.y;
  out.set(bigintTo48(x.c0), 16);
  out.set(bigintTo48(x.c1), 80);
  out.set(bigintTo48(y.c0), 144);
  out.set(bigintTo48(y.c1), 208);
  return out;
}

/**
 * Decode a 256-byte EIP-2537 G2 point.
 */
export function g2FromBytes(bytes) {
  if (bytes.length !== G2_BYTES) {
    throw new Error(`g2FromBytes: expected ${G2_BYTES} bytes, got ${bytes.length}`);
  }
  let allZero = true;
  for (let i = 0; i < G2_BYTES; i++) if (bytes[i] !== 0) { allZero = false; break; }
  if (allZero) return G2_ZERO;

  for (let i = 0; i < 16; i++) {
    if (bytes[i] !== 0 || bytes[64 + i] !== 0 || bytes[128 + i] !== 0 || bytes[192 + i] !== 0) {
      throw new Error('g2FromBytes: non-zero EIP-2537 padding');
    }
  }

  const xc0 = bytesToBigInt(bytes, 16, FP_BYTES);
  const xc1 = bytesToBigInt(bytes, 80, FP_BYTES);
  const yc0 = bytesToBigInt(bytes, 144, FP_BYTES);
  const yc1 = bytesToBigInt(bytes, 208, FP_BYTES);

  // EIP-2537 uses (c0, c1) ordering; noble-curves uncompressed hex follows the IRTF
  // BLS signature convention (c1, c0). Swap when handing to noble.
  const raw = new Uint8Array(192);
  raw.set(bigintTo48(xc1), 0);
  raw.set(bigintTo48(xc0), 48);
  raw.set(bigintTo48(yc1), 96);
  raw.set(bigintTo48(yc0), 144);
  const hex = Array.from(raw).map((b) => b.toString(16).padStart(2, '0')).join('');
  const point = bls.G2.Point.fromHex(hex);
  point.assertValidity();
  return point;
}

/**
 * Encode a scalar to 32-byte big-endian (Fr element).
 */
export function frToBytes(scalar) {
  const n = ((scalar % FR_ORDER) + FR_ORDER) % FR_ORDER;
  const out = new Uint8Array(FR_BYTES);
  let v = n;
  for (let i = FR_BYTES - 1; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

export function frFromBytes(bytes) {
  if (bytes.length !== FR_BYTES) {
    throw new Error(`frFromBytes: expected ${FR_BYTES} bytes, got ${bytes.length}`);
  }
  return bytesToBigInt(bytes, 0, FR_BYTES) % FR_ORDER;
}

export function bytesToHex(bytes) {
  return '0x' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex) {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error(`hexToBytes: odd-length hex`);
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export const SIZES = { FP_BYTES, FP_SLOT, G1_BYTES, G2_BYTES, FR_BYTES };

// Re-export generators as convenience.
export { G1, G2 };
