// Load contract ABIs from Hardhat artifacts + wire ethers Contract instances.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ethers } from 'ethers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ARTIFACTS = path.resolve(__dirname, '../../artifacts/contracts');

function loadAbi(contractName, subPath = '') {
  const p = path.join(
    ARTIFACTS,
    subPath,
    `${contractName}.sol`,
    `${contractName}.json`,
  );
  return JSON.parse(fs.readFileSync(p, 'utf8')).abi;
}

/**
 * @param {{ rpcUrl: string, privateKey?: string, addresses: { encryptedPool, btxVerifier, schnorrVerifier } }} cfg
 */
export function makeContracts(cfg) {
  // Disable ethers' JSON-RPC batching — Monad's public endpoints (and some
  // of the alternatives we rotate through) return malformed responses for
  // batched calls, which surfaces as "could not coalesce error" even when
  // individual calls are healthy.
  const provider = new ethers.JsonRpcProvider(cfg.rpcUrl, undefined, {
    batchMaxCount: 1,
    staticNetwork: true,
  });
  // Wrap in NonceManager so back-to-back txs (submitShare → combineAndVerify →
  // submitDecryptedBatch from the same combiner account) don't race each other
  // on hardhat's auto-mining chain, which otherwise reports "nonce has already
  // been used" between an awaited receipt and the next send.
  const signer = cfg.privateKey
    ? new ethers.NonceManager(new ethers.Wallet(cfg.privateKey, provider))
    : provider;

  const encryptedPool = new ethers.Contract(
    cfg.addresses.encryptedPool,
    loadAbi('EncryptedPool'),
    signer,
  );
  const btxVerifier = new ethers.Contract(
    cfg.addresses.btxVerifier,
    loadAbi('BTXVerifier'),
    signer,
  );
  const schnorr = new ethers.Contract(
    cfg.addresses.schnorrVerifier,
    loadAbi('SchnorrVerifier'),
    signer,
  );

  return { provider, signer, encryptedPool, btxVerifier, schnorr };
}
