import test from 'node:test';
import assert from 'node:assert/strict';
import {
  G1, G2, Fp12, Fr, FR_ORDER,
  g1Mul, g2Mul, g1MSM, pairing, randomFr, powerTable, randomGT,
} from '../lib/bls.js';

test('Fr.ORDER is the BLS12-381 scalar field prime', () => {
  const expected =
    0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001n;
  assert.equal(FR_ORDER, expected);
});

test('randomFr returns a value in [1, Fr.ORDER - 1]', () => {
  for (let i = 0; i < 16; i++) {
    const r = randomFr();
    assert.ok(r > 0n && r < FR_ORDER, `random ${r} out of range`);
  }
});

test('g1Mul: 0 · G1 == identity, 1 · G1 == G1', () => {
  const zero = g1Mul(0n);
  assert.ok(zero.is0(), '0 · G1 should be point at infinity');
  const one = g1Mul(1n);
  assert.ok(one.equals(G1), '1 · G1 should equal base point');
});

test('g1MSM matches naive Σ s_i · P_i', () => {
  const scalars = [3n, 5n, 7n];
  const points = [G1, G1.multiply(2n), G1.multiply(4n)];
  const msm = g1MSM(scalars, points);
  // Naive: 3·G + 5·(2G) + 7·(4G) = (3 + 10 + 28)·G = 41·G
  const expected = G1.multiply(41n);
  assert.ok(msm.equals(expected));
});

test('powerTable: τ, τ², τ³, τ⁴ match manual computation', () => {
  const tau = 7n;
  const table = powerTable(tau, 4);
  assert.equal(table[0], 7n);
  assert.equal(table[1], 49n);
  assert.equal(table[2], 343n);
  assert.equal(table[3], 2401n);
});

test('pairing bilinearity: e(a·G1, b·G2) == e(G1, G2)^(a·b)', () => {
  const a = randomFr();
  const b = randomFr();
  const lhs = pairing(g1Mul(a), g2Mul(b));
  const base = pairing(G1, G2);
  const ab = (a * b) % FR_ORDER;
  const rhs = Fp12.pow(base, ab);
  assert.ok(Fp12.eql(lhs, rhs));
});

test('pairing linearity in G1: e(a·G1 + c·G1, G2) == e(G1, G2)^(a+c)', () => {
  const a = 5n;
  const c = 11n;
  const sumPoint = g1Mul(a).add(g1Mul(c));
  const lhs = pairing(sumPoint, G2);
  const base = pairing(G1, G2);
  const rhs = Fp12.pow(base, (a + c) % FR_ORDER);
  assert.ok(Fp12.eql(lhs, rhs));
});

test('Fp12 ONE identity and inverse', () => {
  const x = randomGT();
  assert.ok(Fp12.eql(Fp12.mul(x, Fp12.ONE), x));
  const xInv = Fp12.inv(x);
  assert.ok(Fp12.eql(Fp12.mul(x, xInv), Fp12.ONE));
});

test('Fp12.pow with small exponents', () => {
  const base = pairing(G1, G2);
  assert.ok(Fp12.eql(Fp12.pow(base, 0n), Fp12.ONE));
  assert.ok(Fp12.eql(Fp12.pow(base, 1n), base));
  const squared = Fp12.pow(base, 2n);
  assert.ok(Fp12.eql(squared, Fp12.mul(base, base)));
});
