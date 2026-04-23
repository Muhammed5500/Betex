import test from 'node:test';
import assert from 'node:assert/strict';
import { G1, G2, G1_ZERO, G2_ZERO, randomFr } from '../lib/bls.js';
import {
  g1ToBytes, g1FromBytes, g2ToBytes, g2FromBytes,
  frToBytes, frFromBytes, bytesToHex, hexToBytes, SIZES,
} from '../lib/eip2537.js';

test('EIP-2537 sizes are correct', () => {
  assert.equal(SIZES.FP_BYTES, 48);
  assert.equal(SIZES.FP_SLOT, 64);
  assert.equal(SIZES.G1_BYTES, 128);
  assert.equal(SIZES.G2_BYTES, 256);
  assert.equal(SIZES.FR_BYTES, 32);
});

test('g1ToBytes: identity → 128 zeros', () => {
  const bytes = g1ToBytes(G1_ZERO);
  assert.equal(bytes.length, 128);
  for (const b of bytes) assert.equal(b, 0);
});

test('g1ToBytes: G1 has correct 16-byte padding before x and y', () => {
  const bytes = g1ToBytes(G1);
  // bytes[0..15] and bytes[64..79] must be zero padding
  for (let i = 0; i < 16; i++) {
    assert.equal(bytes[i], 0, `left pad byte ${i}`);
    assert.equal(bytes[64 + i], 0, `middle pad byte ${i}`);
  }
});

test('g1 encode→decode roundtrip', () => {
  const points = [G1, G1.multiply(7n), G1.multiply(randomFr()), G1_ZERO];
  for (const p of points) {
    const bytes = g1ToBytes(p);
    const recovered = g1FromBytes(bytes);
    assert.ok(p.equals(recovered), 'G1 roundtrip');
  }
});

test('g1FromBytes: rejects non-zero padding', () => {
  const bytes = g1ToBytes(G1);
  bytes[0] = 0x42;
  assert.throws(() => g1FromBytes(bytes), /padding/);
});

test('g1FromBytes: rejects wrong length', () => {
  assert.throws(() => g1FromBytes(new Uint8Array(127)), /128 bytes/);
  assert.throws(() => g1FromBytes(new Uint8Array(129)), /128 bytes/);
});

test('g2ToBytes: identity → 256 zeros', () => {
  const bytes = g2ToBytes(G2_ZERO);
  assert.equal(bytes.length, 256);
  for (const b of bytes) assert.equal(b, 0);
});

test('g2 encode→decode roundtrip', () => {
  const points = [G2, G2.multiply(5n), G2.multiply(randomFr()), G2_ZERO];
  for (const p of points) {
    const bytes = g2ToBytes(p);
    const recovered = g2FromBytes(bytes);
    assert.ok(p.equals(recovered), 'G2 roundtrip');
  }
});

test('fr encode→decode roundtrip', () => {
  const values = [0n, 1n, 7n, randomFr(), randomFr()];
  for (const v of values) {
    const bytes = frToBytes(v);
    assert.equal(bytes.length, 32);
    assert.equal(frFromBytes(bytes), v);
  }
});

test('hex helpers roundtrip', () => {
  const bytes = new Uint8Array([0x00, 0xff, 0xab, 0xcd]);
  const hex = bytesToHex(bytes);
  assert.equal(hex, '0x00ffabcd');
  assert.deepEqual(hexToBytes(hex), bytes);
  assert.deepEqual(hexToBytes('00ffabcd'), bytes);
});
