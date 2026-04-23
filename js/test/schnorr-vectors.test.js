// Re-verify every stored Schnorr vector against the current library.
// If this breaks after an encoding change, regenerate with `npm run gen:vectors`
// and audit the Solidity verifier for a parallel change.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { schnorrVerify } from '../lib/schnorr.js';
import { g1FromBytes, frFromBytes, hexToBytes } from '../lib/eip2537.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VECTORS_PATH = path.resolve(__dirname, 'vectors/schnorr.json');

if (!fs.existsSync(VECTORS_PATH)) {
  test('schnorr vectors exist', () => {
    assert.fail(`missing ${VECTORS_PATH} — run \`npm run gen:vectors\``);
  });
} else {
  const data = JSON.parse(fs.readFileSync(VECTORS_PATH, 'utf8'));

  test('vectors file has expected metadata', () => {
    assert.equal(data.domain, 'BTX-SCHNORR-V1');
    assert.equal(data.curve, 'BLS12-381');
    assert.ok(Array.isArray(data.vectors) && data.vectors.length > 0);
  });

  for (const v of data.vectors) {
    test(`vector ${v.index} verifies`, () => {
      const ct_1 = g1FromBytes(hexToBytes(v.ct_1));
      const R = g1FromBytes(hexToBytes(v.R));
      const s = frFromBytes(hexToBytes(v.s));
      const pi = { R, s };
      assert.equal(schnorrVerify(ct_1, pi), true);
    });
  }

  test(`vector count matches file (${data.vectors.length})`, () => {
    // Sanity: at least 5 vectors for robust Solidity parity.
    assert.ok(data.vectors.length >= 5, `need at least 5 vectors, got ${data.vectors.length}`);
  });
}
