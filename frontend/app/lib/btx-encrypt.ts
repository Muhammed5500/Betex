// Client-side BTX encryption. TS port of js/lib/order-codec.js.encryptOrder +
// js/lib/btx-encrypt.js.encrypt, stitched together with Web Crypto AES-GCM.
//
// Output mirrors the on-chain submitEncryptedOrder ABI exactly:
//   ct_1   bytes    128
//   ct_2   bytes    576
//   pi_R   bytes    128
//   pi_s   bytes32   32
//   aes_ct bytes    var   (nonce || tag || ct)
//   orderHash bytes32 32
//
// orderHash == keccak256(abi.encode(user, tokenIn, amountIn, tokenOut, minAmountOut, nonce))

import { encodeAbiParameters, keccak256, parseAbiParameters } from 'viem';

import {
  FR_ORDER,
  Fp12,
  G1,
  type G1Point,
  type GTElement,
  bytesToHex,
  frToBytes,
  g1ToBytes,
  randomFr,
  randomGT,
} from './eip2537';
import { schnorrProve } from './schnorr';
import { aesGcmEncrypt, aesKeyFromGTBytes } from './aes';

export interface OrderData {
  user: `0x${string}`;
  tokenIn: `0x${string}`;
  amountIn: bigint;
  tokenOut: `0x${string}`;
  minAmountOut: bigint;
  nonce: bigint;
}

export interface EncryptedOrderPayload {
  ct_1: `0x${string}`;
  ct_2: `0x${string}`;
  pi_R: `0x${string}`;
  pi_s: `0x${string}`;
  aes_ct: `0x${string}`;
  orderHash: `0x${string}`;
}

export function computeOrderHash(order: OrderData): `0x${string}` {
  const encoded = encodeAbiParameters(
    parseAbiParameters('address, address, uint256, address, uint256, uint256'),
    [order.user, order.tokenIn, order.amountIn, order.tokenOut, order.minAmountOut, order.nonce],
  );
  return keccak256(encoded);
}

/**
 * BTX-encrypt an order.
 *   m ←$ GT
 *   aesKey = SHA-256(Fp12.toBytes(m))
 *   aesCt  = AES-GCM(aesKey, JSON(order))
 *   r ←$ Fr
 *   ct_1 = r · G_1
 *   ct_2 = m · ek^r
 *   π    = Schnorr(r, ct_1)
 */
export async function encryptOrder(
  order: OrderData,
  ek: GTElement,
): Promise<EncryptedOrderPayload> {
  const m: GTElement = randomGT();
  const gtBytes = Fp12.toBytes(m);
  const aesKey = aesKeyFromGTBytes(gtBytes);

  const orderJson = JSON.stringify({
    user: order.user,
    tokenIn: order.tokenIn,
    amountIn: order.amountIn.toString(),
    tokenOut: order.tokenOut,
    minAmountOut: order.minAmountOut.toString(),
    nonce: order.nonce.toString(),
  });
  const aesCt = await aesGcmEncrypt(aesKey, new TextEncoder().encode(orderJson));

  const r = randomFr();
  const ct1: G1Point = G1.multiply(r);
  const ct2 = Fp12.mul(m, Fp12.pow(ek, r));
  const pi = schnorrProve(r, ct1);

  return {
    ct_1: bytesToHex(g1ToBytes(ct1)),
    ct_2: bytesToHex(Fp12.toBytes(ct2)),
    pi_R: bytesToHex(g1ToBytes(pi.R)),
    pi_s: bytesToHex(frToBytes(pi.s)),
    aes_ct: bytesToHex(aesCt),
    orderHash: computeOrderHash(order),
  };
}

/** Caller-side sanity: regenerates hash, verifies it matches the payload. */
export function reverifyHash(payload: EncryptedOrderPayload, order: OrderData): boolean {
  return computeOrderHash(order).toLowerCase() === payload.orderHash.toLowerCase();
}

export { FR_ORDER };
