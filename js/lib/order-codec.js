// High-level encrypt/decrypt that wraps BTX with AES-GCM and produces an
// on-chain-binding orderHash = keccak256(abi.encode(orderData)).
//
// Byte format for abi.encode(address, address, uint256, address, uint256, uint256):
//   6 × 32 bytes = 192 bytes total; addresses left-padded to 32, uint256 BE.

import { keccak_256 } from '@noble/hashes/sha3.js';

import { Fp12, randomGT, FR_ORDER } from './bls.js';
import { encrypt } from './btx-encrypt.js';
import { aesGcmEncrypt, aesGcmDecrypt, aesKeyFromGTBytes } from './aes.js';

const TEXT_ENC = new TextEncoder();
const TEXT_DEC = new TextDecoder();

function hexToBytes(hex) {
  const clean = hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error('hexToBytes: odd-length');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToHex(bytes) {
  return '0x' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function padAddress(addr) {
  const hex = addr.toLowerCase().replace(/^0x/, '');
  if (hex.length !== 40) throw new Error(`padAddress: expected 20 bytes, got ${hex.length / 2}`);
  return '0'.repeat(24) + hex;
}

function padUint256(n) {
  const bn = BigInt(n);
  if (bn < 0n) throw new Error('padUint256: negative');
  return bn.toString(16).padStart(64, '0');
}

/**
 * Compute the EncryptedPool commitment hash for an order.
 * Solidity: keccak256(abi.encode(user, tokenIn, amountIn, tokenOut, minAmountOut, nonce))
 * @param {object} order  { user, tokenIn, amountIn, tokenOut, minAmountOut, nonce }
 * @returns {string} 0x-prefixed hex bytes32
 */
export function computeOrderHash(order) {
  const encoded =
    padAddress(order.user) +
    padAddress(order.tokenIn) +
    padUint256(order.amountIn) +
    padAddress(order.tokenOut) +
    padUint256(order.minAmountOut) +
    padUint256(order.nonce);
  const hash = keccak_256(hexToBytes(encoded));
  return bytesToHex(hash);
}

/**
 * Client-side encrypt: wraps orderData with BTX+AES.
 * @param {object} orderData  { user, tokenIn, amountIn, tokenOut, minAmountOut, nonce }
 * @param {object} ek         GT element (encryption key)
 * @returns {{ ct_1, ct_2, pi, aes_ct: Uint8Array, orderHash: string, m_GT }}
 */
export function encryptOrder(orderData, ek) {
  const m_GT = randomGT();

  const gtBytes = Fp12.toBytes(m_GT);
  const aesKey = aesKeyFromGTBytes(gtBytes);

  const orderJson = JSON.stringify({
    user: orderData.user,
    tokenIn: orderData.tokenIn,
    amountIn: orderData.amountIn.toString(),
    tokenOut: orderData.tokenOut,
    minAmountOut: orderData.minAmountOut.toString(),
    nonce: orderData.nonce.toString(),
  });
  const aesCt = aesGcmEncrypt(aesKey, TEXT_ENC.encode(orderJson));

  const ct = encrypt(ek, m_GT);

  return {
    ct_1: ct.ct_1,
    ct_2: ct.ct_2,
    pi: ct.pi,
    aes_ct: aesCt,
    orderHash: computeOrderHash(orderData),
    m_GT, // for testing / debugging; NOT transmitted on-chain
  };
}

/**
 * Decryptor-side: given recovered m_GT and AES ciphertext bytes, return parsed orderData.
 * Throws if AES authentication fails or JSON is malformed.
 * @param {object} m_GT       GT element recovered by BTX threshold decryption
 * @param {Uint8Array} aes_ct
 * @returns {object} orderData with BigInt amountIn / minAmountOut / nonce
 */
export function decryptOrder(m_GT, aes_ct) {
  const gtBytes = Fp12.toBytes(m_GT);
  const aesKey = aesKeyFromGTBytes(gtBytes);
  const json = TEXT_DEC.decode(aesGcmDecrypt(aesKey, aes_ct));
  const raw = JSON.parse(json);
  return {
    user: raw.user,
    tokenIn: raw.tokenIn,
    amountIn: BigInt(raw.amountIn),
    tokenOut: raw.tokenOut,
    minAmountOut: BigInt(raw.minAmountOut),
    nonce: BigInt(raw.nonce),
  };
}

export const ORDER_FR_ORDER = FR_ORDER;
