// Produce test vectors for the Solidity BLS12381 library that wraps EIP-2537.
// Each vector records inputs AND the expected output in EIP-2537 byte format,
// so Hardhat tests can assert byte-level parity between @noble/curves and the
// on-chain precompile.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { G1, G2, g1Mul, g2Mul } from '../lib/bls.js';
import { g1ToBytes, g2ToBytes, frToBytes, bytesToHex } from '../lib/eip2537.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_PATH = path.resolve(__dirname, '../test/vectors/eip2537.json');

// -G_2 — used by aggregate pairing checks to move terms to one side.
const G2_NEG = G2.negate();

// --- G1 ADD ---
const g1addCases = [
  { a: 7n, b: 13n },
  { a: 1n, b: 1n }, // doubling edge case (1·G + 1·G = 2·G)
  { a: 100n, b: 200n },
];
const g1add = g1addCases.map(({ a, b }) => {
  const aP = g1Mul(a);
  const bP = g1Mul(b);
  const sum = aP.add(bP);
  return {
    a_scalar: a.toString(),
    b_scalar: b.toString(),
    a: bytesToHex(g1ToBytes(aP)),
    b: bytesToHex(g1ToBytes(bP)),
    expected: bytesToHex(g1ToBytes(sum)),
  };
});

// --- G1 scalar multiplication (single-pair MSM) ---
const g1mulCases = [
  { point: 1n, scalar: 5n },   // 5·G
  { point: 7n, scalar: 3n },   // 3·(7G) = 21G
  { point: 11n, scalar: 17n },
];
const g1mul = g1mulCases.map(({ point, scalar }) => {
  const P = g1Mul(point);
  const result = P.multiply(scalar);
  return {
    point_scalar: point.toString(),
    scalar: bytesToHex(frToBytes(scalar)),
    point: bytesToHex(g1ToBytes(P)),
    expected: bytesToHex(g1ToBytes(result)),
  };
});

// --- G2 ADD ---
const g2add = [
  { a: 3n, b: 5n },
  { a: 9n, b: 9n },
].map(({ a, b }) => {
  const aP = g2Mul(a);
  const bP = g2Mul(b);
  return {
    a_scalar: a.toString(),
    b_scalar: b.toString(),
    a: bytesToHex(g2ToBytes(aP)),
    b: bytesToHex(g2ToBytes(bP)),
    expected: bytesToHex(g2ToBytes(aP.add(bP))),
  };
});

// --- G2 scalar multiplication ---
const g2mul = [
  { point: 1n, scalar: 3n },
  { point: 5n, scalar: 7n },
].map(({ point, scalar }) => {
  const P = g2Mul(point);
  return {
    point_scalar: point.toString(),
    scalar: bytesToHex(frToBytes(scalar)),
    point: bytesToHex(g2ToBytes(P)),
    expected: bytesToHex(g2ToBytes(P.multiply(scalar))),
  };
});

// --- Pairing identity: e(G_1, G_2) · e(-G_1, G_2) == 1_GT ---
// Solidity's PAIRING_CHECK expects a concatenation of (G1 || G2) pairs and returns
// 1 if the product equals 1_GT.
const g1Bytes = g1ToBytes(G1);
const g1NegBytes = g1ToBytes(G1.negate());
const g2Bytes = g2ToBytes(G2);
const g2NegBytes = g2ToBytes(G2_NEG);

const pairingIdentity = {
  description: 'e(G1, G2) · e(-G1, G2) == 1',
  pairs: [
    { g1: bytesToHex(g1Bytes), g2: bytesToHex(g2Bytes) },
    { g1: bytesToHex(g1NegBytes), g2: bytesToHex(g2Bytes) },
  ],
  expected: true,
};

// --- Pairing bilinearity via check: e(aG1, bG2) · e(-abG1, G2) == 1 ---
// Lets us verify e(aG1, bG2) == e(G1, G2)^(ab) via precompile.
const a = 7n;
const b = 11n;
const aG1 = g1Mul(a);
const bG2 = g2Mul(b);
const abG1_neg = g1Mul(a * b).negate();

const pairingBilinear = {
  description: 'e(a·G1, b·G2) · e(-a·b·G1, G2) == 1  (a=7, b=11)',
  pairs: [
    { g1: bytesToHex(g1ToBytes(aG1)), g2: bytesToHex(g2ToBytes(bG2)) },
    { g1: bytesToHex(g1ToBytes(abG1_neg)), g2: bytesToHex(g2Bytes) },
  ],
  expected: true,
};

// --- Negative pairing case: e(G1, G2) · e(G1, G2) != 1 ---
const pairingShouldFail = {
  description: 'e(G1, G2) · e(G1, G2) != 1 (well-formed inputs but product is not identity)',
  pairs: [
    { g1: bytesToHex(g1Bytes), g2: bytesToHex(g2Bytes) },
    { g1: bytesToHex(g1Bytes), g2: bytesToHex(g2Bytes) },
  ],
  expected: false,
};

const output = {
  curve: 'BLS12-381',
  encoding: 'EIP-2537',
  generatedAt: new Date().toISOString(),
  constants: {
    G1: bytesToHex(g1Bytes),
    G1_NEG: bytesToHex(g1NegBytes),
    G2: bytesToHex(g2Bytes),
    G2_NEG: bytesToHex(g2NegBytes),
  },
  g1add,
  g1mul,
  g2add,
  g2mul,
  pairing: [pairingIdentity, pairingBilinear, pairingShouldFail],
};

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n');

const count = g1add.length + g1mul.length + g2add.length + g2mul.length + output.pairing.length;
console.log(`Wrote ${count} EIP-2537 vectors → ${OUTPUT_PATH}`);
