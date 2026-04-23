// Fetches /public-params.json (produced by decryptor/scripts/trusted-setup.js).
// We only need `ek` on the client — the encryption key, a GT element serialized
// as 576-byte Fp12.toBytes.  dk / pkCommitments / omega stay server-side.

import { Fp12, hexToBytes, type GTElement } from './eip2537';

export interface PublicParamsJson {
  Bmax: number;
  N: number;
  t: number;
  generatedAt?: string;
  ek: string;
  dk?: (string | null)[];
  dk_eip2537?: (string | null)[];
  pkCommitments?: unknown;
  omega?: unknown;
}

let cached: PublicParamsJson | null = null;
let cachedEk: GTElement | null = null;

export async function loadPublicParams(): Promise<PublicParamsJson> {
  if (cached) return cached;
  const res = await fetch('/public-params.json', { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(
      `public-params.json not found (${res.status}). Run the trusted setup and copy it to frontend/public/.`,
    );
  }
  cached = (await res.json()) as PublicParamsJson;
  return cached;
}

export async function getEK(): Promise<GTElement> {
  if (cachedEk) return cachedEk;
  const p = await loadPublicParams();
  const bytes = hexToBytes(p.ek);
  if (bytes.length !== 576) {
    throw new Error(`ek must be 576 bytes (Fp12), got ${bytes.length}`);
  }
  cachedEk = Fp12.fromBytes(bytes);
  return cachedEk;
}

export function clearPublicParamsCache() {
  cached = null;
  cachedEk = null;
}
