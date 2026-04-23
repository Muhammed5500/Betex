import test from 'node:test';
import assert from 'node:assert/strict';
import { G1, G2, Fp12, pairing, g2Mul, FR_ORDER } from '../lib/bls.js';
import { keyGen } from '../lib/btx-setup.js';

test('keyGen: dk is punctured at index Bmax+1', () => {
  const Bmax = 8;
  const { dk } = keyGen(Bmax);
  assert.equal(dk[Bmax + 1], null, 'middle power must be null');
  assert.equal(dk[0], null, 'index 0 must be unused (1-indexed array)');
});

test('keyGen: dk[i] = [[τ^i]]_2 for all i in [1, 2·Bmax] except Bmax+1', () => {
  const Bmax = 4;
  const { tau, dk } = keyGen(Bmax);
  for (let i = 1; i <= 2 * Bmax; i++) {
    if (i === Bmax + 1) {
      assert.equal(dk[i], null);
      continue;
    }
    const tauPowerI = (tau ** BigInt(i)) % FR_ORDER;
    const expected = g2Mul(tauPowerI);
    assert.ok(dk[i].equals(expected), `dk[${i}] mismatch`);
  }
});

test('keyGen: ek == e(G1, G2)^(τ^(Bmax+1))', () => {
  const Bmax = 4;
  const { tau, ek } = keyGen(Bmax);
  const exponent = (tau ** BigInt(Bmax + 1)) % FR_ORDER;
  const base = pairing(G1, G2);
  const expected = Fp12.pow(base, exponent);
  assert.ok(Fp12.eql(ek, expected));
});

test('keyGen: ek == e(G1, [[τ^(Bmax+1)]]_2) computed independently', () => {
  const Bmax = 8;
  const { tau, ek } = keyGen(Bmax);
  const tauMidG2 = g2Mul((tau ** BigInt(Bmax + 1)) % FR_ORDER);
  const expected = pairing(G1, tauMidG2);
  assert.ok(Fp12.eql(ek, expected));
});

test('keyGen: Bmax must be >= 1', () => {
  assert.throws(() => keyGen(0));
  assert.throws(() => keyGen(-1));
  assert.throws(() => keyGen(1.5));
});

test('keyGen: τ values from two runs differ (randomness sanity)', () => {
  const a = keyGen(4);
  const b = keyGen(4);
  assert.notEqual(a.tau, b.tau);
});
