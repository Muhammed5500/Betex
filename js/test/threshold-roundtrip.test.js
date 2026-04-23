import test from 'node:test';
import assert from 'node:assert/strict';
import { Fp12, FR_ORDER, G1, g2Mul, randomGT } from '../lib/bls.js';
import { keyGenThreshold } from '../lib/btx-setup-threshold.js';
import { encrypt } from '../lib/btx-encrypt.js';
import { partialDecrypt, verifyShare, combine } from '../lib/btx-decrypt-threshold.js';
import { reconstruct } from '../lib/shamir.js';

test('threshold KeyGen: any 2 shares reconstruct each τ^i', () => {
  const Bmax = 6;
  const { tau, sk, omega } = keyGenThreshold(Bmax, 3, 1);

  for (let i = 0; i < Bmax; i++) {
    const sharesForPowerI = sk.map((sk_j) => sk_j[i]);
    const expected = (tau ** BigInt(i + 1)) % FR_ORDER;
    for (const V of [[0, 1], [0, 2], [1, 2]]) {
      assert.equal(reconstruct(V, sharesForPowerI, omega), expected, `i=${i + 1}, V=${V}`);
    }
  }
});

test('threshold KeyGen: pkCommitments[j][i-1] = [[τ^i_j]]_2', () => {
  const Bmax = 4;
  const { sk, pkCommitments } = keyGenThreshold(Bmax, 3, 1);
  for (let j = 0; j < 3; j++) {
    for (let i = 0; i < Bmax; i++) {
      assert.ok(pkCommitments[j][i].equals(g2Mul(sk[j][i])));
    }
  }
});

test('partialDecrypt: σ_j is a valid G1 point, U lists all valid slots', () => {
  const Bmax = 4;
  const { ek, sk } = keyGenThreshold(Bmax, 3, 1);
  const cts = Array.from({ length: 3 }, () => encrypt(ek, randomGT()));
  const { sigma_j, U } = partialDecrypt(cts, sk[0]);
  assert.deepEqual(U, [1, 2, 3]);
  sigma_j.assertValidity();
});

test('verifyShare: honest σ_j passes', () => {
  const Bmax = 4;
  const { ek, sk, pkCommitments } = keyGenThreshold(Bmax, 3, 1);
  const cts = Array.from({ length: 3 }, () => encrypt(ek, randomGT()));
  for (let j = 0; j < 3; j++) {
    const { sigma_j, U } = partialDecrypt(cts, sk[j]);
    assert.ok(verifyShare(sigma_j, U, cts, pkCommitments[j]), `node ${j + 1}`);
  }
});

test('verifyShare: tampered σ_j fails', () => {
  const Bmax = 4;
  const { ek, sk, pkCommitments } = keyGenThreshold(Bmax, 3, 1);
  const cts = [encrypt(ek, randomGT())];
  const { sigma_j, U } = partialDecrypt(cts, sk[0]);
  const bad = sigma_j.add(G1);
  assert.equal(verifyShare(bad, U, cts, pkCommitments[0]), false);
});

test('threshold round-trip B=4: V=[0,1], [0,2], [1,2] all decrypt', () => {
  const Bmax = 4;
  const B = 4;
  const { ek, dk, sk, pkCommitments, omega } = keyGenThreshold(Bmax, 3, 1);
  const messages = Array.from({ length: B }, () => randomGT());
  const cts = messages.map((m) => encrypt(ek, m));

  const partials = sk.map((sk_j) => partialDecrypt(cts, sk_j));

  for (const V of [[0, 1], [0, 2], [1, 2]]) {
    const result = combine(partials, V, cts, dk, pkCommitments, omega, Bmax, 2);
    for (let i = 0; i < B; i++) {
      assert.ok(Fp12.eql(messages[i], result.messages[i]), `V=${V} slot ${i + 1}`);
    }
  }
});

test('threshold round-trip B=8 = Bmax', () => {
  const Bmax = 8;
  const { ek, dk, sk, pkCommitments, omega } = keyGenThreshold(Bmax, 3, 1);
  const messages = Array.from({ length: Bmax }, () => randomGT());
  const cts = messages.map((m) => encrypt(ek, m));
  const partials = sk.map((sk_j) => partialDecrypt(cts, sk_j));
  const result = combine(partials, [0, 1], cts, dk, pkCommitments, omega, Bmax, 2);
  for (let i = 0; i < Bmax; i++) {
    assert.ok(Fp12.eql(messages[i], result.messages[i]));
  }
});

test('threshold: 1 node offline still decrypts (only 2 partials valid)', () => {
  const Bmax = 4;
  const { ek, dk, sk, pkCommitments, omega } = keyGenThreshold(Bmax, 3, 1);
  const cts = [encrypt(ek, randomGT()), encrypt(ek, randomGT())];

  const partials = [
    partialDecrypt(cts, sk[0]),
    partialDecrypt(cts, sk[1]),
    null, // node 3 offline
  ];
  const result = combine(partials, [0, 1, 2], cts, dk, pkCommitments, omega, Bmax, 2);
  assert.equal(result.chosenV.length, 2);
  assert.ok(Fp12.eql(result.messages[0], result.messages[0])); // basic sanity
});

test('threshold: combine drops tampered share and uses good ones', () => {
  const Bmax = 4;
  const { ek, dk, sk, pkCommitments, omega } = keyGenThreshold(Bmax, 3, 1);
  const m = randomGT();
  const cts = [encrypt(ek, m)];

  const partials = sk.map((sk_j) => partialDecrypt(cts, sk_j));
  // Corrupt node 1.
  partials[0].sigma_j = partials[0].sigma_j.add(G1);

  // Give combine all 3 candidates; it should drop node 0 and use nodes 1 & 2.
  const result = combine(partials, [0, 1, 2], cts, dk, pkCommitments, omega, Bmax, 2);
  assert.deepEqual(result.chosenV, [1, 2]);
  assert.ok(Fp12.eql(m, result.messages[0]));
});

test('threshold: only 1 honest share → combine throws', () => {
  const Bmax = 4;
  const { ek, dk, sk, pkCommitments, omega } = keyGenThreshold(Bmax, 3, 1);
  const cts = [encrypt(ek, randomGT())];
  const partials = sk.map((sk_j) => partialDecrypt(cts, sk_j));
  // Corrupt nodes 0 and 1.
  partials[0].sigma_j = partials[0].sigma_j.add(G1);
  partials[1].sigma_j = partials[1].sigma_j.add(G1);

  assert.throws(
    () => combine(partials, [0, 1, 2], cts, dk, pkCommitments, omega, Bmax, 2),
    /only 1 valid shares/,
  );
});

test('threshold: invalid NIZK in batch is excluded (returns null for that slot)', () => {
  const Bmax = 4;
  const { ek, dk, sk, pkCommitments, omega } = keyGenThreshold(Bmax, 3, 1);
  const m1 = randomGT();
  const m2 = randomGT();
  const ct1 = encrypt(ek, m1);
  const ct2 = encrypt(ek, m2);
  ct2.pi = { ...ct2.pi, s: (ct2.pi.s + 1n) % FR_ORDER };

  const cts = [ct1, ct2];
  const partials = sk.map((sk_j) => partialDecrypt(cts, sk_j));
  const result = combine(partials, [0, 1], cts, dk, pkCommitments, omega, Bmax, 2);

  assert.ok(Fp12.eql(m1, result.messages[0]));
  assert.equal(result.messages[1], null);
  assert.deepEqual(result.U, [1]);
});
