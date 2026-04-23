// One-shot: combine + submitDecryptedBatch for a specific epoch.
// Use when node 0 (combiner) missed an epoch (e.g. after a restart).
// Usage: node scripts/manual-combine.cjs <epochId>

const path = require('node:path');
const fs = require('node:fs');
require('dotenv/config');

(async () => {
  const epochId = Number(process.argv[2]);
  if (!epochId) { console.error('usage: manual-combine.cjs <epochId>'); process.exit(1); }

  // Dynamic imports for ESM deps
  const { g2FromBytes, hexToBytes } = await import('./../js/lib/eip2537.js');
  const { makeContracts } = await import('./../decryptor/lib/contracts.js');
  const { fetchEpochCiphertexts } = await import('./../decryptor/lib/epoch-fetch.js');
  const { combineEpoch } = await import('./../decryptor/lib/combiner.js');

  const publicParamsRaw = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../decryptor/config/public-params.json'), 'utf8'),
  );
  const dk = new Array(2 * publicParamsRaw.Bmax + 1).fill(null);
  for (let i = 1; i <= 2 * publicParamsRaw.Bmax; i++) {
    if (i === publicParamsRaw.Bmax + 1) continue;
    dk[i] = g2FromBytes(hexToBytes(publicParamsRaw.dk_eip2537[i]));
  }
  const pkCommitments = publicParamsRaw.pkCommitments_eip2537.map((pkj) =>
    pkj.map((p) => g2FromBytes(hexToBytes(p))),
  );
  const omega = publicParamsRaw.omega.map((w) => BigInt('0x' + w));
  const hydrated = { Bmax: publicParamsRaw.Bmax, N: publicParamsRaw.N, t: publicParamsRaw.t, dk, pkCommitments, omega };

  const ctx = makeContracts({
    rpcUrl: process.env.MONAD_RPC_URL,
    privateKey: process.env.DEPLOYER_PRIVATE_KEY,
    addresses: {
      encryptedPool: '0x24E6f6e80f090c0E211aE070bDc75B20bEEb484D',
      btxVerifier: '0x3850d3b5DF4Dc5F05fbA420c3890435575ad7240',
      schnorrVerifier: '0xD93A0fd7Ea4521e7179B1265880077d22fb55C4c',
    },
  });

  console.log(`[manual-combine] fetching ciphertexts for epoch ${epochId}...`);
  const cts = await fetchEpochCiphertexts(ctx.encryptedPool, epochId);
  console.log(`  ${cts.length} order(s) found`);

  const result = await combineEpoch(ctx, hydrated, epochId, cts, publicParamsRaw.N, publicParamsRaw.t + 1);
  console.log(`[manual-combine] ✓ finalized: V=[${result.V}] decrypted=${result.decryptedCount}`);
  console.log(`  tx: https://testnet.monadexplorer.com/tx/${result.receipt.hash}`);
})().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});
