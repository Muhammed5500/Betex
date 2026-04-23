// Monad testnet deploy (Faz 10 §2.2).
//
// Assumes decryptor/scripts/trusted-setup.js was run offline on a secure
// machine and the resulting config/ directory has been distributed (or at
// least deploy-params.json + public-params.json are committed here).
//
// Required .env:
//   DEPLOYER_PRIVATE_KEY  deployer; must hold ≥ 5 MON for gas
//   NODE0_ADDRESS         committee node 0 address (separately funded ≥ 1 MON)
//   NODE1_ADDRESS         committee node 1 address
//   NODE2_ADDRESS         committee node 2 address
//   MONAD_RPC_URL         (optional) override for testnet-rpc.monad.xyz
//
// Usage:
//   npx hardhat --config hardhat.config.cjs run scripts/deploy-monad.cjs --network monadTestnet

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

function requireEnvAddress(key) {
  const v = process.env[key];
  if (!v || !/^0x[0-9a-fA-F]{40}$/.test(v)) {
    throw new Error(`${key} must be a 20-byte hex address (got: ${v ?? 'unset'})`);
  }
  return ethers.getAddress(v);
}

async function main() {
  if (network.name !== 'monadTestnet') {
    throw new Error(`Run with --network monadTestnet (current: ${network.name})`);
  }
  if (!fs.existsSync(DEPLOY_PARAMS) || !fs.existsSync(PUBLIC_PARAMS)) {
    throw new Error(
      'Missing decryptor/config/{deploy-params,public-params}.json — run trusted-setup offline first',
    );
  }

  const deployParams = JSON.parse(fs.readFileSync(DEPLOY_PARAMS, 'utf8'));
  if (deployParams.N !== 3) {
    console.warn(`[warn] deploy-params.N = ${deployParams.N}; script assumes N=3 committee`);
  }

  const nodeAddrs = [
    requireEnvAddress('NODE0_ADDRESS'),
    requireEnvAddress('NODE1_ADDRESS'),
    requireEnvAddress('NODE2_ADDRESS'),
  ].slice(0, deployParams.N);

  const signers = await ethers.getSigners();
  const deployer = signers[0];
  if (!deployer) throw new Error('No signer — set DEPLOYER_PRIVATE_KEY in .env');

  const bal = await ethers.provider.getBalance(deployer.address);
  console.log(
    `[network] ${network.name} · deployer=${deployer.address} · balance=${ethers.formatEther(bal)} MON`,
  );
  if (bal < ethers.parseEther('1')) {
    throw new Error(
      `Deployer balance ${ethers.formatEther(bal)} MON is probably too low — fund from faucet first`,
    );
  }

  // 1. Tokens
  console.log('[1] deploying MockMON / MockUSDC');
  const mon = await (await ethers.getContractFactory('MockMON', deployer)).deploy();
  await mon.waitForDeployment();
  const monAddr = await mon.getAddress();

  const usdc = await (await ethers.getContractFactory('MockUSDC', deployer)).deploy();
  await usdc.waitForDeployment();
  const usdcAddr = await usdc.getAddress();
  console.log(`    MON=${monAddr}  USDC=${usdcAddr}`);

  // 2. AMM
  console.log('[2] deploying SealedAMM');
  const amm = await (await ethers.getContractFactory('SealedAMM', deployer)).deploy(monAddr, usdcAddr);
  await amm.waitForDeployment();
  const ammAddr = await amm.getAddress();
  console.log(`    SealedAMM=${ammAddr}`);

  // 3. SchnorrVerifier
  console.log('[3] deploying SchnorrVerifier');
  const schnorr = await (await ethers.getContractFactory('SchnorrVerifier', deployer)).deploy();
  await schnorr.waitForDeployment();
  const schnorrAddr = await schnorr.getAddress();
  console.log(`    SchnorrVerifier=${schnorrAddr}`);

  // 4. BTXVerifier
  // Constructor copies ~20 KB (h_powers + pkCommitments) into storage at Bmax=16;
  // measured ~18.1M gas. Ethers' default estimation caps at 2^24=16.77M which
  // silently runs out — pass gasLimit explicitly, well under Monad's 30M tx cap.
  console.log('[4] deploying BTXVerifier');
  const btx = await (await ethers.getContractFactory('BTXVerifier', deployer)).deploy(
    deployParams.N,
    deployParams.tPlus1,
    deployParams.Bmax,
    deployParams.h_powers,
    deployParams.pkCommitments,
    deployParams.omega,
    nodeAddrs,
    { gasLimit: 25_000_000 },
  );
  await btx.waitForDeployment();
  const btxAddr = await btx.getAddress();
  console.log(`    BTXVerifier=${btxAddr}`);

  // 5. EncryptedPool
  console.log('[5] deploying EncryptedPool');
  const pool = await (
    await ethers.getContractFactory('EncryptedPool', deployer)
  ).deploy(ammAddr, btxAddr, schnorrAddr, EPOCH_DURATION, REFUND_TIMEOUT);
  await pool.waitForDeployment();
  const poolAddr = await pool.getAddress();
  console.log(`    EncryptedPool=${poolAddr}`);

  // 6. Wire + liquidity
  console.log('[6] wiring AMM + bootstrapping liquidity');
  await (await amm.setSealedPool(poolAddr)).wait();
  await (await mon.mint(deployer.address, INIT_MON)).wait();
  await (await usdc.mint(deployer.address, INIT_USDC)).wait();
  await (await mon.approve(ammAddr, INIT_MON)).wait();
  await (await usdc.approve(ammAddr, INIT_USDC)).wait();
  await (await amm.initialize(INIT_MON, INIT_USDC)).wait();
  console.log('    10000 MON + 40000 USDC deposited');

  // 7. Post-deploy sanity checks
  console.log('[7] post-deploy checks');
  const currentEpoch = await pool.currentEpochId();
  const rA = await amm.reserveA();
  const rB = await amm.reserveB();
  console.log(`    currentEpochId = ${currentEpoch}`);
  console.log(`    reserveA = ${rA.toString()}, reserveB = ${rB.toString()}`);
  if (currentEpoch !== 1n) throw new Error('expected currentEpochId == 1');
  if (rA === 0n || rB === 0n) throw new Error('reserves must be non-zero');

  // 8. Patch node envs (RPC + contract addrs; operators add PRIVATE_KEY manually)
  const rpcUrl = network.config.url ?? 'https://testnet-rpc.monad.xyz';
  console.log('[8] patching decryptor/config/nodeK.env');
  for (let j = 0; j < deployParams.N; j++) {
    const envPath = path.join(CONFIG_DIR, `node${j}.env`);
    if (!fs.existsSync(envPath)) {
      console.warn(`    node${j}.env missing — skipping`);
      continue;
    }
    let env = fs.readFileSync(envPath, 'utf8');
    env = env.replace(/^RPC_URL=.*$/m, `RPC_URL=${rpcUrl}`);
    env = env.replace(/^ENCRYPTED_POOL_ADDRESS=.*$/m, `ENCRYPTED_POOL_ADDRESS=${poolAddr}`);
    env = env.replace(/^BTX_VERIFIER_ADDRESS=.*$/m, `BTX_VERIFIER_ADDRESS=${btxAddr}`);
    env = env.replace(/^SCHNORR_VERIFIER_ADDRESS=.*$/m, `SCHNORR_VERIFIER_ADDRESS=${schnorrAddr}`);
    fs.writeFileSync(envPath, env, { mode: 0o600 });
  }
  console.log('    ⚠️  each operator must set PRIVATE_KEY in their own node${j}.env');

  // 9. Frontend env + public params
  if (fs.existsSync(FRONTEND_DIR)) {
    const chainId = Number(network.config.chainId ?? 10143);
    const body = `NEXT_PUBLIC_CHAIN_ID=${chainId}
NEXT_PUBLIC_RPC_URL=${rpcUrl}
NEXT_PUBLIC_ENCRYPTED_POOL_ADDRESS=${poolAddr}
NEXT_PUBLIC_SEALED_AMM_ADDRESS=${ammAddr}
NEXT_PUBLIC_BTX_VERIFIER_ADDRESS=${btxAddr}
NEXT_PUBLIC_SCHNORR_VERIFIER_ADDRESS=${schnorrAddr}
NEXT_PUBLIC_MOCK_MON_ADDRESS=${monAddr}
NEXT_PUBLIC_MOCK_USDC_ADDRESS=${usdcAddr}
`;
    fs.writeFileSync(path.join(FRONTEND_DIR, '.env.local'), body);
    const publicDir = path.join(FRONTEND_DIR, 'public');
    if (fs.existsSync(publicDir)) {
      fs.copyFileSync(PUBLIC_PARAMS, path.join(publicDir, 'public-params.json'));
    }
    console.log('[9] frontend/.env.local + public/public-params.json written');
  }

  // 10. Summary
  const summary = {
    network: network.name,
    chainId: Number(network.config.chainId ?? 10143),
    rpcUrl,
    deployer: deployer.address,
    nodes: nodeAddrs,
    contracts: {
      MockMON: monAddr,
      MockUSDC: usdcAddr,
      SealedAMM: ammAddr,
      SchnorrVerifier: schnorrAddr,
      BTXVerifier: btxAddr,
      EncryptedPool: poolAddr,
    },
    epochDuration: EPOCH_DURATION,
    refundTimeout: REFUND_TIMEOUT,
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(CONFIG_DIR, 'addresses.monad.json'),
    JSON.stringify(summary, null, 2) + '\n',
  );
  console.log('\n[✓] Monad testnet deployment complete.');
  console.log('    Explorer:', `https://testnet.monadexplorer.com/address/${poolAddr}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
