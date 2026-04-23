import test from 'node:test';
import assert from 'node:assert/strict';
import { FR_ORDER } from '../lib/bls.js';
import { share, lagrange, reconstruct } from '../lib/shamir.js';

const OMEGA_123 = [1n, 2n, 3n];

test('Shamir 2-of-3: any 2 shares reconstruct secret', () => {
  const secret = 12345n;
  const shares = share(secret, 3, 1, OMEGA_123);

  for (const V of [[0, 1], [0, 2], [1, 2]]) {
    assert.equal(reconstruct(V, shares, OMEGA_123), secret, `V=${V}`);
  }
});

test('Shamir 2-of-3: all 3 shares also reconstruct', () => {
  const secret = 999n;
  const shares = share(secret, 3, 1, OMEGA_123);
  assert.equal(reconstruct([0, 1, 2], shares, OMEGA_123), secret);
});

test('Shamir: single share alone does not equal secret (with overwhelming probability)', () => {
  const secret = 12345n;
  const shares = share(secret, 3, 1, OMEGA_123);
  for (const s of shares) assert.notEqual(s, secret);
});

test('Shamir: constant polynomial (t=0) — all shares equal secret', () => {
  const secret = 42n;
  const shares = share(secret, 3, 0, OMEGA_123);
  for (const s of shares) assert.equal(s, secret);
  assert.equal(reconstruct([0], shares, OMEGA_123), secret);
});

test('Shamir 3-of-5: any 3 reconstruct, 2 do not suffice numerically', () => {
  const omega = [1n, 2n, 3n, 4n, 5n];
  const secret = 0xdeadbeefn;
  const shares = share(secret, 5, 2, omega);

  // Any 3 reconstruct correctly.
  for (const V of [[0, 1, 2], [0, 2, 4], [1, 3, 4]]) {
    assert.equal(reconstruct(V, shares, omega), secret);
  }
  // 2 shares reconstruct a value that is *not* the secret (linear interpolation
  // of degree-1 poly through 2 points doesn't match the true degree-2 poly at X=0).
  const partial = reconstruct([0, 1], shares, omega);
  assert.notEqual(partial, secret);
});

test('Shamir: random large secret roundtrips', () => {
  const secret = 0x7fffffffffffffffffffffffffffffffffffffn;
  const shares = share(secret, 3, 1, OMEGA_123);
  assert.equal(reconstruct([0, 1], shares, OMEGA_123), secret);
});

test('Shamir: Lagrange on constant polynomial recovers f(0)', () => {
  const L = lagrange([0, 1], OMEGA_123);
  // For constant polynomial f(X) = c, all shares are c. Reconstructed = Σ L_j · c = (Σ L_j) · c.
  // So Σ L_j == 1 mod p (Lagrange partition of unity at X=0).
  const sum = (L[0] + L[1]) % FR_ORDER;
  assert.equal(sum, 1n);
});

test('share: rejects duplicate omega', () => {
  assert.throws(() => share(5n, 3, 1, [1n, 1n, 2n]));
});

test('share: rejects zero in omega', () => {
  assert.throws(() => share(5n, 3, 1, [0n, 1n, 2n]));
});

test('share: rejects bad t', () => {
  assert.throws(() => share(5n, 3, 3, OMEGA_123), /t=3/);
  assert.throws(() => share(5n, 3, -1, OMEGA_123));
});
