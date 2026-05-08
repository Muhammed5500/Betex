// Targeted redeploy: new SealedAMM + EncryptedPool with a different
// epochDuration (or any other constructor param). Reuses canonical WMON +
// Circle USDC + BTXVerifier + SchnorrVerifier from the previous deployment.
//
// Usage:
//   BTX_EPOCH_DURATION=5 npx hardhat --config hardhat.config.cjs \
//     run scripts/redeploy-dex.cjs --network monadTestnet

const fs = require('node:fs');
const path = require('node:path');
const { ethers, network } = require('hardhat');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_DIR = path.resolve(ROOT, 'decryptor/config');
const ADDRESSES_FILE = path.join(CONFIG_DIR, 'addresses.monad.json');
const FRONTEND_DIR = path.resolve(ROOT, 'frontend');

const INIT_MON = ethers.parseUnits('4500', 18);
const INIT_USDC = ethers.parseUnits('1800', 6);

const EPOCH_DURATION = Number(process.env.BTX_EPOCH_DURATION ?? 5);
const REFUND_TIMEOUT = Number(process.env.BTX_REFUND_TIMEOUT ?? 60);

const WMON_ABI = [
  'function deposit() external payable',
  'function balanceOf(address) external view returns (uint256)',
  'function approve(address, uint256) external returns (bool)',
];
const ERC20_ABI = [
  'function balanceOf(address) external view returns (uint256)',
  'function approve(address, uint256) external returns (bool)',
];

async function main() {
  if (network.name !== 'monadTestnet') {
    throw new Error(`Run with --network monadTestnet (current: ${network.name})`);
  }
  if (!fs.existsSync(ADDRESSES_FILE)) {
    throw new Error('addresses.monad.json not found — run full deploy first');
  }

  const prev = JSON.parse(fs.readFileSync(ADDRESSES_FILE, 'utf8'));
  const [deployer] = await ethers.getSigners();

  console.log(`[redeploy-dex] network=${network.name} deployer=${deployer.address}`);
  const wmonAddr = prev.contracts.WMON;
  const usdcAddr = prev.contracts.USDC;
  if (!wmonAddr || !usdcAddr) {
    throw new Error('addresses.monad.json missing WMON/USDC entries — re-run full deploy first');
  }

  console.log(`[redeploy-dex] reusing:`);
  console.log(`  WMON             ${wmonAddr}`);
  console.log(`  USDC             ${usdcAddr}`);
  console.log(`  SchnorrVerifier  ${prev.contracts.SchnorrVerifier}`);
  console.log(`  BTXVerifier      ${prev.contracts.BTXVerifier}`);
  console.log(`[redeploy-dex] new epochDuration=${EPOCH_DURATION}s refundTimeout=${REFUND_TIMEOUT}s`);

  const bal = await ethers.provider.getBalance(deployer.address);
  console.log(`[redeploy-dex] deployer balance: ${ethers.formatEther(bal)} MON`);

  // 1. New SealedAMM (must be paired to a pool; setSealedPool is one-shot)
  console.log('[1] deploying SealedAMM');
  const amm = await (
    await ethers.getContractFactory('SealedAMM', deployer)
  ).deploy(wmonAddr, usdcAddr);
  await amm.waitForDeployment();
  const ammAddr = await amm.getAddress();
  console.log(`    SealedAMM=${ammAddr}`);

  // 2. New EncryptedPool pointing to new AMM + existing verifiers
  console.log('[2] deploying EncryptedPool');
  const pool = await (
    await ethers.getContractFactory('EncryptedPool', deployer)
  ).deploy(
    ammAddr,
    prev.contracts.BTXVerifier,
    prev.contracts.SchnorrVerifier,
    EPOCH_DURATION,
    REFUND_TIMEOUT,
  );
  await pool.waitForDeployment();
  const poolAddr = await pool.getAddress();
  console.log(`    EncryptedPool=${poolAddr}`);

  // 3. Wire AMM + bootstrap liquidity (deployer must already hold tokens; wrap if short)
  console.log('[3] wiring AMM + bootstrap liquidity');
  await (await amm.setSealedPool(poolAddr)).wait();

  const wmon = new ethers.Contract(wmonAddr, WMON_ABI, deployer);
  const usdc = new ethers.Contract(usdcAddr, ERC20_ABI, deployer);

  const wmonBal = await wmon.balanceOf(deployer.address);
  if (wmonBal < INIT_MON) {
    const need = INIT_MON - wmonBal;
    console.log(`    wrapping ${ethers.formatEther(need)} MON → WMON`);
    await (await wmon.deposit({ value: need })).wait();
  }
  const usdcBal = await usdc.balanceOf(deployer.address);
  if (usdcBal < INIT_USDC) {
    throw new Error(
      `Deployer holds ${ethers.formatUnits(usdcBal, 6)} USDC, need ${ethers.formatUnits(INIT_USDC, 6)}. Top up via https://faucet.circle.com.`,
    );
  }

  await (await wmon.approve(ammAddr, INIT_MON)).wait();
  await (await usdc.approve(ammAddr, INIT_USDC)).wait();
  await (await amm.initialize(INIT_MON, INIT_USDC)).wait();
  console.log(
    `    liquidity: ${ethers.formatEther(INIT_MON)} WMON + ${ethers.formatUnits(INIT_USDC, 6)} USDC`,
  );

  // 4. Sanity check
  const curId = await pool.currentEpochId();
  const rA = await amm.reserveA();
  const rB = await amm.reserveB();
  console.log(`[4] post-deploy: currentEpochId=${curId} rA=${rA} rB=${rB}`);
  if (curId !== 1n) throw new Error('expected currentEpochId == 1');

  // 5. Patch node envs (contract addresses only; private keys untouched)
  console.log('[5] patching decryptor/config/nodeK.env');
  for (const j of [0, 1, 2]) {
    const envPath = path.join(CONFIG_DIR, `node${j}.env`);
    if (!fs.existsSync(envPath)) {
      console.warn(`    node${j}.env missing — skipping`);
      continue;
    }
    let env = fs.readFileSync(envPath, 'utf8');
    env = env.replace(/^ENCRYPTED_POOL_ADDRESS=.*$/m, `ENCRYPTED_POOL_ADDRESS=${poolAddr}`);
    fs.writeFileSync(envPath, env, { mode: 0o600 });
  }

  // 6. Update addresses.monad.json
  const next = {
    ...prev,
    contracts: {
      ...prev.contracts,
      SealedAMM: ammAddr,
      EncryptedPool: poolAddr,
    },
    epochDuration: EPOCH_DURATION,
    refundTimeout: REFUND_TIMEOUT,
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(ADDRESSES_FILE, JSON.stringify(next, null, 2) + '\n');

  // 7. Update frontend .env.local
  if (fs.existsSync(FRONTEND_DIR)) {
    const envLocalPath = path.join(FRONTEND_DIR, '.env.local');
    if (fs.existsSync(envLocalPath)) {
      let body = fs.readFileSync(envLocalPath, 'utf8');
      body = body.replace(/^NEXT_PUBLIC_ENCRYPTED_POOL_ADDRESS=.*$/m, `NEXT_PUBLIC_ENCRYPTED_POOL_ADDRESS=${poolAddr}`);
      body = body.replace(/^NEXT_PUBLIC_SEALED_AMM_ADDRESS=.*$/m, `NEXT_PUBLIC_SEALED_AMM_ADDRESS=${ammAddr}`);
      fs.writeFileSync(envLocalPath, body);
    }
  }

  console.log('\n[✓] dex redeployed');
  console.log(`    SealedAMM      ${ammAddr}`);
  console.log(`    EncryptedPool  ${poolAddr}`);
  console.log(`    epochDuration  ${EPOCH_DURATION}s`);
  console.log(`    explorer: https://testnet.monadexplorer.com/address/${poolAddr}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
