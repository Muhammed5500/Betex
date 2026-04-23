// AES-256-GCM using Web Crypto. Wire format matches js/lib/aes.js:
//   bytes = nonce(12) || tag(16) || ciphertext(variable)
// The decryptor (Node createDecipheriv with setAuthTag) decodes this layout directly.

import { sha256 } from '@noble/hashes/sha2.js';

const NONCE_LEN = 12;
const TAG_LEN = 16;

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  // Copy into a fresh ArrayBuffer — decouples from any SharedArrayBuffer
  // backing store and from the source's byteOffset/byteLength window.
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  return ab;
}

export async function aesGcmEncrypt(key: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array> {
  if (key.length !== 32) throw new Error(`aesGcmEncrypt: key must be 32 bytes (got ${key.length})`);
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LEN));
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(key),
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  );
  const encryptedBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, tagLength: TAG_LEN * 8 },
    cryptoKey,
    toArrayBuffer(plaintext),
  );
  const combined = new Uint8Array(encryptedBuf);
  const ciphertextLen = combined.length - TAG_LEN;
  const ct = combined.slice(0, ciphertextLen);
  const tag = combined.slice(ciphertextLen);
  const out = new Uint8Array(NONCE_LEN + TAG_LEN + ct.length);
  out.set(nonce, 0);
  out.set(tag, NONCE_LEN);
  out.set(ct, NONCE_LEN + TAG_LEN);
  return out;
}

export function aesKeyFromGTBytes(gtBytes: Uint8Array): Uint8Array {
  return sha256(gtBytes);
}
