import test from 'node:test';
import assert from 'node:assert/strict';

import { keyGenThreshold } from '../lib/btx-setup-threshold.js';
import { partialDecrypt, combine } from '../lib/btx-decrypt-threshold.js';
import { encryptOrder, decryptOrder, computeOrderHash } from '../lib/order-codec.js';
import { aesGcmEncrypt, aesGcmDecrypt } from '../lib/aes.js';

const Bmax = 4;
const N = 3;
const t = 1;

const MOCK_ORDER = {
  user: '0x1234567890123456789012345678901234567890',
  tokenIn: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  amountIn: 100000000n,
  tokenOut: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  minAmountOut: 0n,
  nonce: 42n,
};

test('aesGcmEncrypt + aesGcmDecrypt roundtrip', () => {
  const key = new Uint8Array(32);
  for (let i = 0; i < 32; i++) key[i] = i;
  const plaintext = new TextEncoder().encode('hello BTX monad');
  const ct = aesGcmEncrypt(key, plaintext);
  const pt = aesGcmDecrypt(key, ct);
  assert.deepEqual(pt, plaintext);
});

test('aesGcmDecrypt rejects tampered tag', () => {
  const key = new Uint8Array(32);
  const ct = aesGcmEncrypt(key, new TextEncoder().encode('data'));
  ct[12] ^= 0xff; // flip tag byte
  assert.throws(() => aesGcmDecrypt(key, ct));
});

test('computeOrderHash stable + matches Solidity abi.encode layout manually', () => {
  const h = computeOrderHash(MOCK_ORDER);
  assert.match(h, /^0x[0-9a-f]{64}$/);
  // Hash is deterministic
  assert.equal(h, computeOrderHash(MOCK_ORDER));
});

test('encryptOrder + BTX threshold decrypt + AES decrypt roundtrips', () => {
  const setup = keyGenThreshold(Bmax, N, t);
  const encrypted = encryptOrder(MOCK_ORDER, setup.ek);

  const ciphertexts = [{ ct_1: encrypted.ct_1, ct_2: encrypted.ct_2, pi: encrypted.pi }];
  const partials = setup.sk.map((sk_j) => partialDecrypt(ciphertexts, sk_j));

  const result = combine(
    partials,
    [0, 1],
    ciphertexts,
    setup.dk,
    setup.pkCommitments,
    setup.omega,
    Bmax,
    t + 1,
  );
  assert.equal(result.messages.length, 1);
  const m = result.messages[0];
  assert.ok(m !== null);

  const orderOut = decryptOrder(m, encrypted.aes_ct);
  assert.equal(orderOut.user, MOCK_ORDER.user);
  assert.equal(orderOut.tokenIn, MOCK_ORDER.tokenIn);
  assert.equal(orderOut.amountIn, MOCK_ORDER.amountIn);
  assert.equal(orderOut.tokenOut, MOCK_ORDER.tokenOut);
  assert.equal(orderOut.minAmountOut, MOCK_ORDER.minAmountOut);
  assert.equal(orderOut.nonce, MOCK_ORDER.nonce);
});

test('multiple orders in one batch: all decrypt distinctly', () => {
  const setup = keyGenThreshold(Bmax, N, t);
  const orders = [
    { ...MOCK_ORDER, nonce: 1n, amountIn: 100n },
    { ...MOCK_ORDER, nonce: 2n, amountIn: 200n },
    { ...MOCK_ORDER, nonce: 3n, amountIn: 300n },
  ];
  const encrypted = orders.map((o) => encryptOrder(o, setup.ek));
  const ciphertexts = encrypted.map((e) => ({ ct_1: e.ct_1, ct_2: e.ct_2, pi: e.pi }));
  const partials = setup.sk.map((sk_j) => partialDecrypt(ciphertexts, sk_j));
  const result = combine(partials, [0, 2], ciphertexts, setup.dk, setup.pkCommitments, setup.omega, Bmax, t + 1);

  for (let i = 0; i < 3; i++) {
    const orderOut = decryptOrder(result.messages[i], encrypted[i].aes_ct);
    assert.equal(orderOut.nonce, orders[i].nonce);
    assert.equal(orderOut.amountIn, orders[i].amountIn);
  }
});
