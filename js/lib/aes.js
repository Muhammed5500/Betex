// AES-256-GCM for KEM-DEM. The BTX layer encrypts a GT-element `m`; we derive
// an AES key from `m` and wrap the real order payload (JSON) with it.
//
// Wire format (identical to Web Crypto's suggested layout):
//   bytes = nonce(12) || tag(16) || ciphertext(variable)

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { sha256 } from '@noble/hashes/sha2.js';

const NONCE_LEN = 12;
const TAG_LEN = 16;

/**
 * @param {Uint8Array} key        32 bytes
 * @param {Uint8Array} plaintext  arbitrary
 * @returns {Uint8Array}  nonce || tag || ciphertext
 */
export function aesGcmEncrypt(key, plaintext) {
  if (key.length !== 32) throw new Error(`aesGcmEncrypt: key must be 32 bytes (got ${key.length})`);
  const nonce = randomBytes(NONCE_LEN);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const out = new Uint8Array(NONCE_LEN + TAG_LEN + encrypted.length);
  out.set(nonce, 0);
  out.set(tag, NONCE_LEN);
  out.set(encrypted, NONCE_LEN + TAG_LEN);
  return out;
}

/**
 * @param {Uint8Array} key         32 bytes
 * @param {Uint8Array} ciphertext  nonce || tag || ct
 * @returns {Uint8Array}  plaintext
 */
export function aesGcmDecrypt(key, ciphertext) {
  if (key.length !== 32) throw new Error('aesGcmDecrypt: key must be 32 bytes');
  if (ciphertext.length < NONCE_LEN + TAG_LEN) {
    throw new Error('aesGcmDecrypt: ciphertext too short');
  }
  const nonce = ciphertext.slice(0, NONCE_LEN);
  const tag = ciphertext.slice(NONCE_LEN, NONCE_LEN + TAG_LEN);
  const enc = ciphertext.slice(NONCE_LEN + TAG_LEN);
  const decipher = createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(tag);
  return new Uint8Array(Buffer.concat([decipher.update(enc), decipher.final()]));
}

/**
 * Derive a 32-byte AES key from a GT element's byte representation.
 * Deterministic: same m → same key (critical for decryptor correctness).
 * @param {Uint8Array} gtBytes  576-byte Fp12 serialization
 */
export function aesKeyFromGTBytes(gtBytes) {
  return sha256(gtBytes); // 32 bytes
}
