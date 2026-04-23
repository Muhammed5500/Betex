import test from 'node:test';
import assert from 'node:assert/strict';
import { Fp12, randomGT } from '../lib/bls.js';
import { keyGen } from '../lib/btx-setup.js';
import { encrypt } from '../lib/btx-encrypt.js';
import { schnorrVerify } from '../lib/schnorr.js';

test('encrypt produces well-formed ciphertext', () => {
  const { ek } = keyGen(4);
  const m = randomGT();
  const ct = encrypt(ek, m);

  assert.ok(ct.ct_1, 'ct_1 present');
  assert.ok(ct.ct_2, 'ct_2 present');
  assert.ok(ct.pi && ct.pi.R && typeof ct.pi.s === 'bigint', 'pi well-formed');

  ct.ct_1.assertValidity();
});

test('encrypt NIZK verifies', () => {
  const { ek } = keyGen(4);
  const m = randomGT();
  const ct = encrypt(ek, m);
  assert.equal(schnorrVerify(ct.ct_1, ct.pi), true);
});

test('encrypt: two ciphertexts for the same m differ (fresh r each time)', () => {
  const { ek } = keyGen(4);
  const m = randomGT();
  const ct1 = encrypt(ek, m);
  const ct2 = encrypt(ek, m);
  assert.ok(!ct1.ct_1.equals(ct2.ct_1), 'ct_1 should differ');
  assert.ok(!Fp12.eql(ct1.ct_2, ct2.ct_2), 'ct_2 should differ');
});
