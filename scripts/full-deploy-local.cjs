// All-in-one local deploy (Faz 10 §1.1).
//
// Runs inside the Hardhat runtime. Steps:
//   1. (Re)run trusted-setup.js if decryptor/config/deploy-params.json is missing
//      or --fresh is passed.
//   2. Deploy MockMON, MockUSDC, SealedAMM, SchnorrVerifier, BTXVerifier, EncryptedPool.
//   3. Wire AMM → pool; bootstrap 10k MON + 40k USDC liquidity.
//   4. Patch decryptor/config/nodeK.env files (RPC + PRIVATE_KEY + contract addrs).
//   5. Write frontend/.env.local with NEXT_PUBLIC_* env vars.
//   6. Copy decryptor/config/public-params.json → frontend/public/public-params.json.
//   7. Dump decryptor/config/addresses.json summary.
//
// Usage:
//   npx hardhat --config hardhat.config.cjs run scripts/full-deploy-local.cjs --network localhost
// Or against the in-process hardhat runtime:
//   npx hardhat --config hardhat.config.cjs run scripts/full-deploy-local.cjs

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const { ethers, network } = require('hardhat');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_DIR = path.resolve(ROOT, 'decryptor/config');
const DEPLOY_PARAMS = path.join(CONFIG_DIR, 'deploy-params.json');
const PUBLIC_PARAMS = path.join(CONFIG_DIR, 'public-params.json');
const FRONTEND_DIR = path.resolve(ROOT, 'frontend');

const INIT_MON = ethers.parseUnits('10000', 18);
const INIT_USDC = ethers.parseUnits('40000', 6);

const EPOCH_DURATION = Number(process.env.BTX_EPOCH_DURATION ?? 10);
const REFUND_TIMEOUT = Number(process.env.BTX_REFUND_TIMEOUT ?? 60);

function isLocalNetwork(name) {
  return name === 'hardhat' || name === 'localhost';
}

function runTrustedSetup() {
  console.log('[step 1] running trusted-setup.js');
  const res = spawnSync(process.execPath, ['decryptor/scripts/trusted-setup.js'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env },
  });
  if (res.status !== 0) throw new Error(`trusted-setup.js exited ${res.status}`);
}

function ensureTrustedSetup() {
  const fresh = process.argv.includes('--fresh');
  if (fresh || !fs.existsSync(DEPLOY_PARAMS) || !fs.existsSync(PUBLIC_PARAMS)) {
    runTrustedSetup();
  } else {
    console.log('[step 1] deploy-params.json present — reusing existing trusted setup');
    console.log('         (pass --fresh to regenerate)');
  }
}

async function deployStack(deployer, nodeSigners, deployParams) {
  console.log('[step 2] deploying contracts');
  const mon = await (await ethers.getContractFactory('MockMON', deployer)).deploy();
  await mon.waitForDeployment();
  const monAddr = await mon.getAddress();

  const usdc = await (await ethers.getContractFactory('MockUSDC', deployer)).deploy();
  await usdc.waitForDeployment();
  const usdcAddr = await usdc.getAddress();

  const amm = await (await ethers.getContractFactory('SealedAMM', deployer)).deploy(monAddr, usdcAddr);
  await amm.waitForDeployment();
  const ammAddr = await amm.getAddress();

  const schnorr = await (await ethers.getContractFactory('SchnorrVerifier', deployer)).deploy();
  await schnorr.waitForDeployment();
  const schnorrAddr = await schnorr.getAddress();

  const nodeAddrs = nodeSigners.map((s) => s.address);
  const btx = await (await ethers.getContractFactory('BTXVerifier', deployer)).deploy(
    deployParams.N,
    deployParams.tPlus1,
    deployParams.Bmax,
    deployParams.h_powers,
    deployParams.pkCommitments,
    deployParams.omega,
    nodeAddrs,
    // Bmax=16 constructor copies ~20 KB into storage; default gas estimation
    // caps at 2^24=16,777,216 which runs out. Override per-tx gas explicitly.
    { gasLimit: 60_000_000 },
  );
  await btx.waitForDeployment();
  const btxAddr = await btx.getAddress();

  const pool = await (
    await ethers.getContractFactory('EncryptedPool', deployer)
  ).deploy(ammAddr, btxAddr, schnorrAddr, EPOCH_DURATION, REFUND_TIMEOUT);
  await pool.waitForDeployment();
  const poolAddr = await pool.getAddress();

  console.log(`  MockMON        ${monAddr}`);
  console.log(`  MockUSDC       ${usdcAddr}`);
  console.log(`  SealedAMM      ${ammAddr}`);
  console.log(`  SchnorrVerifier ${schnorrAddr}`);
  console.log(`  BTXVerifier    ${btxAddr}`);
  console.log(`  EncryptedPool  ${poolAddr}`);

  return { mon, usdc, amm, schnorr, btx, pool, monAddr, usdcAddr, ammAddr, schnorrAddr, btxAddr, poolAddr, nodeAddrs };
}

async function bootstrapLiquidity(d, contracts) {
  console.log('[step 3] bootstrapping AMM liquidity');
  await (await contracts.amm.setSealedPool(contracts.poolAddr)).wait();
  await (await contracts.mon.mint(d.address, INIT_MON)).wait();
  await (await contracts.usdc.mint(d.address, INIT_USDC)).wait();
  await (await contracts.mon.approve(contracts.ammAddr, INIT_MON)).wait();
  await (await contracts.usdc.approve(contracts.ammAddr, INIT_USDC)).wait();
  await (await contracts.amm.initialize(INIT_MON, INIT_USDC)).wait();
  console.log(`  10000 MON + 40000 USDC deposited`);
}

function patchNodeEnv(j, nodeAddrs, contracts, rpcUrl, privateKey) {
  const envPath = path.join(CONFIG_DIR, `node${j}.env`);
  if (!fs.existsSync(envPath)) {
    console.warn(`  warn: ${envPath} missing`);
    return;
  }
  let env = fs.readFileSync(envPath, 'utf8');
  env = env.replace(/^RPC_URL=.*$/m, `RPC_URL=${rpcUrl}`);
  if (privateKey) env = env.replace(/^PRIVATE_KEY=.*$/m, `PRIVATE_KEY=${privateKey}`);
  env = env.replace(/^ENCRYPTED_POOL_ADDRESS=.*$/m, `ENCRYPTED_POOL_ADDRESS=${contracts.poolAddr}`);
  env = env.replace(/^BTX_VERIFIER_ADDRESS=.*$/m, `BTX_VERIFIER_ADDRESS=${contracts.btxAddr}`);
  env = env.replace(/^SCHNORR_VERIFIER_ADDRESS=.*$/m, `SCHNORR_VERIFIER_ADDRESS=${contracts.schnorrAddr}`);
  fs.writeFileSync(envPath, env, { mode: 0o600 });
  console.log(`  patched decryptor/config/node${j}.env`);
}

function writeFrontendEnv(contracts, rpcUrl, chainId) {
  if (!fs.existsSync(FRONTEND_DIR)) {
    console.log('[step 5] frontend/ missing — skipping .env.local');
    return;
  }
  const body = `NEXT_PUBLIC_CHAIN_ID=${chainId}
NEXT_PUBLIC_RPC_URL=${rpcUrl}
NEXT_PUBLIC_ENCRYPTED_POOL_ADDRESS=${contracts.poolAddr}
NEXT_PUBLIC_SEALED_AMM_ADDRESS=${contracts.ammAddr}
NEXT_PUBLIC_BTX_VERIFIER_ADDRESS=${contracts.btxAddr}
NEXT_PUBLIC_SCHNORR_VERIFIER_ADDRESS=${contracts.schnorrAddr}
NEXT_PUBLIC_MOCK_MON_ADDRESS=${contracts.monAddr}
NEXT_PUBLIC_MOCK_USDC_ADDRESS=${contracts.usdcAddr}
`;
  const envPath = path.join(FRONTEND_DIR, '.env.local');
  fs.writeFileSync(envPath, body);
  console.log(`  wrote frontend/.env.local`);
}

function copyPublicParams() {
  const publicDir = path.join(FRONTEND_DIR, 'public');
  if (!fs.existsSync(publicDir)) return;
  const dest = path.join(publicDir, 'public-params.json');
  fs.copyFileSync(PUBLIC_PARAMS, dest);
  console.log(`  copied public-params.json → frontend/public/`);
}

async function main() {
  ensureTrustedSetup();

  const deployParams = JSON.parse(fs.readFileSync(DEPLOY_PARAMS, 'utf8'));
  const signers = await ethers.getSigners();
  const [deployer, ...rest] = signers;
  if (rest.length < deployParams.N) {
    throw new Error(`Need ${deployParams.N + 1} accounts; have ${signers.length}`);
  }
  const nodeSigners = rest.slice(0, deployParams.N);

  console.log(`[network] ${network.name} · deployer=${deployer.address}`);
  console.log(`[nodes]   ${nodeSigners.map((s) => s.address).join(', ')}`);

  const contracts = await deployStack(deployer, nodeSigners, deployParams);
  await bootstrapLiquidity(deployer, contracts);

  // ── Step 4: node env patching ─────────────────────────────────
  console.log('[step 4] patching decryptor/config/nodeK.env');
  const rpcUrl =
    network.name === 'localhost'
      ? 'http://127.0.0.1:8545'
      : network.config.url ?? '';
  const chainId = Number(network.config.chainId ?? 31337);
  const local = isLocalNetwork(network.name);
  const accounts = network.config.accounts;
  for (let j = 0; j < deployParams.N; j++) {
    let privKey = '';
    if (local) {
      if (Array.isArray(accounts)) {
        const acct = accounts[j + 1];
        privKey = typeof acct === 'string' ? acct : acct?.privateKey ?? '';
      } else if (accounts && accounts.mnemonic) {
        const basePath = accounts.path ?? "m/44'/60'/0'/0";
        const index = (accounts.initialIndex ?? 0) + j + 1;
        const wallet = ethers.HDNodeWallet.fromPhrase(
          accounts.mnemonic,
          undefined,
          `${basePath}/${index}`,
        );
        privKey = wallet.privateKey;
      }
    }
    patchNodeEnv(j, contracts.nodeAddrs, contracts, rpcUrl, privKey);
  }

  // ── Step 5 & 6: frontend sync ─────────────────────────────────
  console.log('[step 5] writing frontend/.env.local');
  writeFrontendEnv(contracts, rpcUrl, chainId);
  console.log('[step 6] copying public-params.json');
  copyPublicParams();

  // ── Step 7: addresses.json summary ────────────────────────────
  const summary = {
    network: network.name,
    chainId,
    rpcUrl,
    deployer: deployer.address,
    nodes: contracts.nodeAddrs,
    contracts: {
      MockMON: contracts.monAddr,
      MockUSDC: contracts.usdcAddr,
      SealedAMM: contracts.ammAddr,
      SchnorrVerifier: contracts.schnorrAddr,
      BTXVerifier: contracts.btxAddr,
      EncryptedPool: contracts.poolAddr,
    },
    epochDuration: EPOCH_DURATION,
    refundTimeout: REFUND_TIMEOUT,
    generatedAt: new Date().toISOString(),
  };
  const summaryPath = path.join(CONFIG_DIR, 'addresses.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n');
  console.log(`[step 7] wrote decryptor/config/addresses.json\n`);

  console.log('✓ Deployment complete.');
  console.log('');
  console.log('Next:');
  console.log('  A.  npm run committee:0        (terminal)');
  console.log('  B.  npm run committee:1        (terminal)');
  console.log('  C.  npm run committee:2        (terminal)');
  console.log('  D.  cd frontend && npm run dev (terminal → http://localhost:3000)');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
