// Generate deterministic Schnorr proof vectors for Solidity verifier parity.
// For each witness r, we record:
//   - r (hex, 32 bytes)
//   - ct_1 = r · G_1 (hex, 128 bytes EIP-2537)
//   - π.R (hex, 128 bytes)
//   - π.s (hex, 32 bytes)
//   - challenge c (hex, 32 bytes; recomputed at parse time — present for debugging)
//
// The Solidity test suite consumes this JSON and calls SchnorrVerifier.verify(ct_1, R, s)
// for each entry. All entries must return true.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { G1, FR_ORDER, hashToFr } from '../lib/bls.js';
import { schnorrProve, schnorrVerify } from '../lib/schnorr.js';
import { g1ToBytes, frToBytes, bytesToHex } from '../lib/eip2537.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_PATH = path.resolve(__dirname, '../test/vectors/schnorr.json');

const DOMAIN = new TextEncoder().encode('BTX-SCHNORR-V1');

// Fixed witness values covering small scalars and a pseudo-random sample.
// NOTE: schnorrProve uses a fresh random k internally so the (R, s) pair
// differs between runs; the vectors still verify because Fiat-Shamir is
// deterministic in c given (G_1, ct_1, R).
const witnesses = [
  1n,
  2n,
  3n,
  12345n,
  0xdeadbeefn,
  0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn,
  // A few "random" values derived from fixed seeds for reproducible tests.
  hashToFr(new TextEncoder().encode('BTX-TEST-VECTOR-SEED-1')),
  hashToFr(new TextEncoder().encode('BTX-TEST-VECTOR-SEED-2')),
  hashToFr(new TextEncoder().encode('BTX-TEST-VECTOR-SEED-3')),
];

const vectors = [];
for (let i = 0; i < witnesses.length; i++) {
  const r = witnesses[i] % FR_ORDER;
  if (r === 0n) continue;

  const ct_1 = G1.multiply(r);
  const pi = schnorrProve(r, ct_1);

  // Sanity: every generated proof must verify in JS first.
  if (!schnorrVerify(ct_1, pi)) {
    throw new Error(`vector ${i} failed self-verification`);
  }

  // Compute challenge for parity — Solidity will redo this same hash.
  const c = hashToFr(
    DOMAIN,
    g1ToBytes(G1),
    g1ToBytes(ct_1),
    g1ToBytes(pi.R),
  );

  vectors.push({
    index: i,
    r: bytesToHex(frToBytes(r)),
    ct_1: bytesToHex(g1ToBytes(ct_1)),
    R: bytesToHex(g1ToBytes(pi.R)),
    s: bytesToHex(frToBytes(pi.s)),
    c: bytesToHex(frToBytes(c)),
  });
}

const output = {
  domain: 'BTX-SCHNORR-V1',
  curve: 'BLS12-381',
  encoding: 'EIP-2537 (G1 uncompressed, 128 bytes; Fr big-endian, 32 bytes)',
  hash: 'SHA-256(DOMAIN || G_1 || ct_1 || R) mod FR_ORDER',
  generatedAt: new Date().toISOString(),
  generator: {
    G1: bytesToHex(g1ToBytes(G1)),
  },
  vectors,
};

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n');

console.log(`Wrote ${vectors.length} Schnorr test vectors → ${OUTPUT_PATH}`);
