#!/usr/bin/env node
// Trusted-dealer BTX setup.
//
// ⚠️ This process momentarily holds the master secret τ. After the outputs are
// written, we overwrite the in-memory reference and exit. JS cannot guarantee
// memory scrubbing — production would use a hardware module + ceremony.
//
// Outputs (all under decryptor/config/):
//   - nodeK.env          per-node Shamir share + connection template
//   - public-params.json ek, dk, pkCommitments, omega (for frontend + decryptor validation)
//   - deploy-params.json bytes ready for BTXVerifier constructor

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Fp12 } from '../../js/lib/bls.js';
import { keyGenThreshold } from '../../js/lib/btx-setup-threshold.js';
import { g2ToBytes, frToBytes, bytesToHex } from '../../js/lib/eip2537.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_DIR = path.resolve(__dirname, '../config');

const Bmax = Number(process.env.BTX_BMAX ?? 16);
const N = Number(process.env.BTX_N ?? 3);
const t = Number(process.env.BTX_T ?? 1);

console.log(`[trusted-setup] Bmax=${Bmax} N=${N} t=${t} (threshold = t+1 = ${t + 1})`);

// ---------------------------------------------------------------
// 1. Key generation
// ---------------------------------------------------------------
const setup = keyGenThreshold(Bmax, N, t);

// ---------------------------------------------------------------
// 2. Per-node .env files (Shamir share + connection template)
// ---------------------------------------------------------------
fs.mkdirSync(CONFIG_DIR, { recursive: true });
for (let j = 0; j < N; j++) {
  const nodeId = j;
  const shareHex = setup.sk[j].map((s) => s.toString(16).padStart(64, '0')).join(',');
  const envBody = `# BTX Decryptor Node ${nodeId}
# Generated: ${new Date().toISOString()}
NODE_ID=${nodeId}
SHAMIR_SHARE=${shareHex}

# Filled by scripts/deploy-monad.cjs (or deploy:local) after deploy:
RPC_URL=
PRIVATE_KEY=
ENCRYPTED_POOL_ADDRESS=
BTX_VERIFIER_ADDRESS=
SCHNORR_VERIFIER_ADDRESS=

# Behaviour tuning:
POLL_INTERVAL_MS=2000
`;
  const target = path.join(CONFIG_DIR, `node${nodeId}.env`);
  fs.writeFileSync(target, envBody, { mode: 0o600 });
  console.log(`  wrote ${path.relative(process.cwd(), target)} (mode 600)`);
}

// ---------------------------------------------------------------
// 3. public-params.json — for frontend + decryptor validation
// ---------------------------------------------------------------
const publicParams = {
  Bmax,
  N,
  t,
  generatedAt: new Date().toISOString(),
  ek: Buffer.from(Fp12.toBytes(setup.ek)).toString('hex'),
  dk: setup.dk.map((p, i) =>
    i === 0 || i === Bmax + 1
      ? null
      : Buffer.from(p.toBytes(true)).toString('hex'), // compressed for JS consumption
  ),
  dk_eip2537: setup.dk.map((p, i) =>
    i === 0
      ? null
      : i === Bmax + 1
        ? bytesToHex(new Uint8Array(256))
        : bytesToHex(g2ToBytes(p)),
  ),
  pkCommitments: setup.pkCommitments.map((pkj) =>
    pkj.map((p) => Buffer.from(p.toBytes(true)).toString('hex')),
  ),
  pkCommitments_eip2537: setup.pkCommitments.map((pkj) =>
    pkj.map((p) => bytesToHex(g2ToBytes(p))),
  ),
  omega: setup.omega.map((w) => w.toString(16)),
};

const publicParamsPath = path.join(CONFIG_DIR, 'public-params.json');
fs.writeFileSync(publicParamsPath, JSON.stringify(publicParams, null, 2) + '\n');
console.log(`  wrote ${path.relative(process.cwd(), publicParamsPath)}`);

// ---------------------------------------------------------------
// 4. deploy-params.json — exact bytes for BTXVerifier constructor
// ---------------------------------------------------------------
const deployParams = {
  Bmax,
  N,
  t,
  tPlus1: t + 1,
  h_powers: setup.dk.map((p, i) => {
    if (i === 0) return null; // skip sentinel; caller must take indices 1..2*Bmax
    if (i === Bmax + 1) return bytesToHex(new Uint8Array(256));
    return bytesToHex(g2ToBytes(p));
  }).slice(1), // drop the null at index 0 → array of length 2*Bmax
  pkCommitments: setup.pkCommitments.map((pkj) =>
    pkj.map((p) => bytesToHex(g2ToBytes(p))),
  ),
  omega: setup.omega.map((w) => w.toString()), // decimal string for ethers uint256
};

const deployParamsPath = path.join(CONFIG_DIR, 'deploy-params.json');
fs.writeFileSync(deployParamsPath, JSON.stringify(deployParams, null, 2) + '\n');
console.log(`  wrote ${path.relative(process.cwd(), deployParamsPath)}`);

// ---------------------------------------------------------------
// 5. Destroy τ
// ---------------------------------------------------------------
setup.tau = 0n;
if (typeof global !== 'undefined' && typeof global.gc === 'function') global.gc();
console.log('[trusted-setup] ✓ complete. Distribute config/node*.env files to operators.');
console.log('[trusted-setup] ⚠️ node*.env contain Shamir shares — keep them secret.');
