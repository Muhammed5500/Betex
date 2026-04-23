import test from 'node:test';
import assert from 'node:assert/strict';
import { Fp12, FR_ORDER, randomGT } from '../lib/bls.js';
import { keyGen } from '../lib/btx-setup.js';
import { encrypt } from '../lib/btx-encrypt.js';
import { decrypt } from '../lib/btx-decrypt.js';

function runRoundTrip(Bmax, B) {
  const { tau, dk, ek } = keyGen(Bmax);
  const messages = Array.from({ length: B }, () => randomGT());
  const cts = messages.map((m) => encrypt(ek, m));
  const recovered = decrypt(cts, tau, dk, Bmax);

  assert.equal(recovered.length, B);
  for (let i = 0; i < B; i++) {
    assert.ok(recovered[i] !== null, `slot ${i + 1} unexpectedly null`);
    assert.ok(Fp12.eql(messages[i], recovered[i]), `slot ${i + 1} mismatch`);
  }
}

test('round-trip B=1, Bmax=4', () => runRoundTrip(4, 1));
test('round-trip B=2, Bmax=4', () => runRoundTrip(4, 2));
test('round-trip B=4 = Bmax', () => runRoundTrip(4, 4));
test('round-trip B=4, Bmax=8', () => runRoundTrip(8, 4));
test('round-trip B=8 = Bmax', () => runRoundTrip(8, 8));

test('invalid NIZK → slot returns null, others still decrypt', () => {
  const Bmax = 4;
  const { tau, dk, ek } = keyGen(Bmax);

  const m1 = randomGT();
  const m2 = randomGT();
  const m3 = randomGT();
  const ct1 = encrypt(ek, m1);
  const ct2 = encrypt(ek, m2);
  const ct3 = encrypt(ek, m3);

  // Tamper slot 2's NIZK — decryption must skip it and still recover 1 and 3.
  ct2.pi = { ...ct2.pi, s: (ct2.pi.s + 1n) % FR_ORDER };

  const recovered = decrypt([ct1, ct2, ct3], tau, dk, Bmax);
  assert.ok(Fp12.eql(m1, recovered[0]), 'slot 1 should decrypt');
  assert.equal(recovered[1], null, 'slot 2 should be null (invalid NIZK)');
  assert.ok(Fp12.eql(m3, recovered[2]), 'slot 3 should decrypt');
});

test('all-invalid batch → all nulls', () => {
  const Bmax = 4;
  const { tau, dk, ek } = keyGen(Bmax);
  const m = randomGT();
  const ct = encrypt(ek, m);
  ct.pi = { ...ct.pi, s: (ct.pi.s + 1n) % FR_ORDER };

  const recovered = decrypt([ct], tau, dk, Bmax);
  assert.equal(recovered[0], null);
});
