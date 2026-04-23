// End-to-end smoke test against Monad testnet:
//   1. Mint USDC to deployer
//   2. Approve the pool
//   3. Encrypt an order (BTX + AES)
//   4. submitEncryptedOrder
//   5. Force epoch close (after endTime)
//   6. Wait up to ~90s for committee + combiner to emit BatchExecuted
//   7. Verify user's MON balance increased

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { JsonRpcProvider, Wallet, NonceManager, Contract, formatEther, formatUnits, parseUnits } from 'ethers';

import { Fp12 } from '../js/lib/bls.js';
import { encryptOrder } from '../js/lib/order-codec.js';
import { g1ToBytes, frToBytes, bytesToHex, hexToBytes } from '../js/lib/eip2537.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ART = path.join(ROOT, 'artifacts/contracts');

const RPC = process.env.SMOKE_RPC_URL ?? process.env.MONAD_RPC_URL ?? 'https://testnet-rpc.monad.xyz';
const DEPLOYER_KEY = process.env.SMOKE_DEPLOYER_KEY ?? process.env.DEPLOYER_PRIVATE_KEY;
if (!DEPLOYER_KEY) throw new Error('DEPLOYER_PRIVATE_KEY or SMOKE_DEPLOYER_KEY missing');

const addressesFile = process.env.SMOKE_ADDRESSES_FILE
  ?? path.join(ROOT, 'decryptor/config/addresses.monad.json');
const addresses = JSON.parse(fs.readFileSync(addressesFile, 'utf8'));
const publicParams = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'decryptor/config/public-params.json'), 'utf8'),
);

const ek = Fp12.fromBytes(hexToBytes(publicParams.ek));

function loadAbi(name, sub = '') {
  const p = path.join(ART, sub, `${name}.sol`, `${name}.json`);
  return JSON.parse(fs.readFileSync(p, 'utf8')).abi;
}

const provider = new JsonRpcProvider(RPC);
// NonceManager avoids a hardhat auto-mine race where getTransactionCount(pending)
// returns the stale value between awaited txs on the same account.
const rawWallet = new Wallet(DEPLOYER_KEY, provider);
const wallet = new NonceManager(rawWallet);
wallet.address = rawWallet.address; // NonceManager wraps Wallet; re-expose .address

const pool = new Contract(addresses.contracts.EncryptedPool, loadAbi('EncryptedPool'), wallet);
const usdc = new Contract(addresses.contracts.MockUSDC, loadAbi('MockUSDC', 'tokens'), wallet);
const mon = new Contract(addresses.contracts.MockMON, loadAbi('MockMON', 'tokens'), wallet);
const amm = new Contract(addresses.contracts.SealedAMM, loadAbi('SealedAMM'), wallet);

const USDC_IN = parseUnits('75', 6); // 75 USDC → MON
const DEPOSIT_BUFFER = USDC_IN; // deposit == input

async function main() {
  const me = wallet.address;
  console.log(`[smoke] wallet=${me} rpc=${RPC}`);
  console.log(`[smoke] pool=${addresses.contracts.EncryptedPool}`);

  const [bal, monBal0, usdcBal0] = await Promise.all([
    provider.getBalance(me),
    mon.balanceOf(me),
    usdc.balanceOf(me),
  ]);
  console.log(`[smoke] pre: ${formatEther(bal)} MON gas, ${formatUnits(monBal0, 18)} MON, ${formatUnits(usdcBal0, 6)} USDC`);

  // 1. Mint USDC if needed
  if (usdcBal0 < USDC_IN) {
    console.log(`[smoke] minting ${formatUnits(USDC_IN, 6)} USDC to self`);
    const tx = await usdc.mint(me, USDC_IN);
    await tx.wait();
  }

  // 2. Approve pool
  const allowance = await usdc.allowance(me, addresses.contracts.EncryptedPool);
  if (allowance < DEPOSIT_BUFFER) {
    console.log(`[smoke] approving pool for USDC`);
    const tx = await usdc.approve(addresses.contracts.EncryptedPool, DEPOSIT_BUFFER);
    await tx.wait();
  }

  // 3. Encrypt order
  const nonce = BigInt(Date.now());
  const orderData = {
    user: me,
    tokenIn: addresses.contracts.MockUSDC,
    amountIn: USDC_IN,
    tokenOut: addresses.contracts.MockMON,
    minAmountOut: 0n,
    nonce,
  };

  // Preview expected MON out from AMM (no fee-aware slippage for smoke)
  const preview = await amm.getAmountOut(USDC_IN, addresses.contracts.MockUSDC);
  console.log(`[smoke] AMM preview: ${formatUnits(USDC_IN, 6)} USDC → ${formatUnits(preview, 18)} MON`);

  const enc = encryptOrder(orderData, ek);
  const ct_1 = bytesToHex(g1ToBytes(enc.ct_1));
  const ct_2 = bytesToHex(Fp12.toBytes(enc.ct_2));
  const pi_R = bytesToHex(g1ToBytes(enc.pi.R));
  const pi_s = bytesToHex(frToBytes(enc.pi.s));
  const aes_ct = bytesToHex(enc.aes_ct);

  // 4. submit
  console.log(`[smoke] submitting encrypted order (orderHash=${enc.orderHash.slice(0, 18)}...)`);
  const epochBefore = Number(await pool.currentEpochId());
  const submitTx = await pool.submitEncryptedOrder(
    ct_1, ct_2, pi_R, pi_s, aes_ct, enc.orderHash, USDC_IN, addresses.contracts.MockUSDC,
  );
  console.log(`[smoke]   tx ${submitTx.hash}`);
  const rc = await submitTx.wait();
  console.log(`[smoke]   confirmed in block ${rc.blockNumber}, gas ${rc.gasUsed}`);

  // Find the epoch id from OrderSubmitted event
  const submittedEpoch = rc.logs
    .map((l) => {
      try { return pool.interface.parseLog(l); } catch { return null; }
    })
    .filter((p) => p && p.name === 'OrderSubmitted')[0];
  if (!submittedEpoch) throw new Error('no OrderSubmitted event in tx');
  const epochId = Number(submittedEpoch.args.epochId);
  const orderIndex = Number(submittedEpoch.args.orderIndex);
  console.log(`[smoke]   OrderSubmitted epoch=${epochId} orderIndex=${orderIndex}`);

  // 5. Wait for epoch to expire, then nudge closeEpoch
  const epoch = await pool.epochs(epochId);
  const endTime = Number(epoch.endTime);
  const now0 = Math.floor(Date.now() / 1000);
  const wait0 = Math.max(0, endTime - now0) + 1;
  console.log(`[smoke] epoch endTime=${endTime}, waiting ~${wait0}s`);
  await sleep(wait0 * 1000);

  try {
    const closeTx = await pool.closeEpoch();
    console.log(`[smoke]   closeEpoch tx ${closeTx.hash}`);
    await closeTx.wait();
  } catch (e) {
    const msg = e.shortMessage ?? e.message ?? '';
    if (msg.includes('already closed') || msg.includes('EP: already closed')) {
      console.log('[smoke]   (epoch was already closed by committee)');
    } else {
      throw e;
    }
  }

  // 6. Poll for epoch.executed up to 180s
  const deadline = Date.now() + 180_000;
  let executed = false;
  while (Date.now() < deadline) {
    const ep = await pool.epochs(epochId);
    if (ep.executed) {
      executed = true;
      break;
    }
    await sleep(4000);
  }
  if (!executed) {
    throw new Error(`epoch ${epochId} did not become executed within 180s`);
  }

  console.log(`[smoke] epoch ${epochId} executed ✓`);

  // 7. Verify balances + order
  const monBal1 = await mon.balanceOf(me);
  const usdcBal1 = await usdc.balanceOf(me);
  const orderState = await pool.orders(epochId, orderIndex);

  const gained = monBal1 - monBal0;
  console.log('[smoke] post-flight:');
  console.log(`  MON: ${formatUnits(monBal0, 18)} → ${formatUnits(monBal1, 18)} (+${formatUnits(gained, 18)})`);
  console.log(`  USDC: ${formatUnits(usdcBal0, 6)} → ${formatUnits(usdcBal1, 6)}`);
  console.log(`  order.executed=${orderState.executed} refunded=${orderState.refunded}`);

  if (!orderState.executed) throw new Error('order marked not executed despite epoch.executed');
  if (gained <= 0n) throw new Error('MON balance did not increase');

  console.log(`[smoke] ✓ end-to-end success. user gained ${formatUnits(gained, 18)} MON.`);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

main().catch((e) => {
  console.error('[smoke] FAILED:', e);
  process.exit(1);
});
