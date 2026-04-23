import test from 'node:test';
import assert from 'node:assert/strict';
import { G1, FR_ORDER, randomFr } from '../lib/bls.js';
import { schnorrProve, schnorrVerify } from '../lib/schnorr.js';

test('Schnorr: valid proof verifies', () => {
  const r = randomFr();
  const ct_1 = G1.multiply(r);
  const pi = schnorrProve(r, ct_1);
  assert.equal(schnorrVerify(ct_1, pi), true);
});

test('Schnorr: tampered s rejected', () => {
  const r = randomFr();
  const ct_1 = G1.multiply(r);
  const pi = schnorrProve(r, ct_1);
  const tampered = { R: pi.R, s: (pi.s + 1n) % FR_ORDER };
  assert.equal(schnorrVerify(ct_1, tampered), false);
});

test('Schnorr: tampered R rejected', () => {
  const r = randomFr();
  const ct_1 = G1.multiply(r);
  const pi = schnorrProve(r, ct_1);
  const tampered = { R: pi.R.add(G1), s: pi.s };
  assert.equal(schnorrVerify(ct_1, tampered), false);
});

test('Schnorr: wrong ct_1 rejected', () => {
  const r = randomFr();
  const ct_1 = G1.multiply(r);
  const pi = schnorrProve(r, ct_1);
  const wrongCt1 = ct_1.add(G1);
  assert.equal(schnorrVerify(wrongCt1, pi), false);
});

test('Schnorr: random (R, s) rejected', () => {
  const r = randomFr();
  const ct_1 = G1.multiply(r);
  const fake = { R: G1.multiply(123n), s: 456n };
  assert.equal(schnorrVerify(ct_1, fake), false);
});

test('Schnorr: swap proofs between two statements fails', () => {
  const r1 = randomFr();
  const r2 = randomFr();
  const ct1 = G1.multiply(r1);
  const ct2 = G1.multiply(r2);
  const pi1 = schnorrProve(r1, ct1);
  const pi2 = schnorrProve(r2, ct2);

  assert.equal(schnorrVerify(ct1, pi1), true);
  assert.equal(schnorrVerify(ct2, pi2), true);
  assert.equal(schnorrVerify(ct2, pi1), false, 'pi1 must not verify ct2');
  assert.equal(schnorrVerify(ct1, pi2), false, 'pi2 must not verify ct1');
});

test('Schnorr: null/malformed proof handled safely', () => {
  const ct_1 = G1.multiply(7n);
  assert.equal(schnorrVerify(ct_1, null), false);
  assert.equal(schnorrVerify(ct_1, {}), false);
  assert.equal(schnorrVerify(ct_1, { R: G1, s: 'not a bigint' }), false);
});

test('Schnorr: s = 0 rejected (degenerate proof)', () => {
  const ct_1 = G1.multiply(7n);
  const pi = { R: G1, s: 0n };
  assert.equal(schnorrVerify(ct_1, pi), false);
});

test('Schnorr: deterministic challenge (same inputs → same c implicitly verifies)', () => {
  // If schnorrProve uses random k, (R, s) differ per call — this tests that
  // BOTH proofs verify against the same ct_1 (not that R/s are equal).
  const r = randomFr();
  const ct_1 = G1.multiply(r);
  const pi1 = schnorrProve(r, ct_1);
  const pi2 = schnorrProve(r, ct_1);
  assert.ok(!pi1.R.equals(pi2.R), 'R should differ (fresh nonce k each time)');
  assert.equal(schnorrVerify(ct_1, pi1), true);
  assert.equal(schnorrVerify(ct_1, pi2), true);
});
