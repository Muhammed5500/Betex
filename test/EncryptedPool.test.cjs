// Integration test: full encrypted DEX flow through BTX.
// - JS: trusted setup → user encrypts a real order → submits on-chain.
// - Solidity: Schnorr NIZK verified, escrow taken, epoch rolled.
// - JS: 3 nodes compute σ_j; combiner picks V=2.
// - Solidity: combineAndVerify runs aggregate pairing check, AMM swap executes.

const { expect } = require('chai');
const { ethers, network } = require('hardhat');

const Bmax = 4;
const N = 3;
const t = 1;
const EPOCH_DURATION = 10;
const REFUND_TIMEOUT = 60;

async function loadLibs() {
  return {
    bls: await import('../js/lib/bls.js'),
    setup: await import('../js/lib/btx-setup-threshold.js'),
    encrypt: await import('../js/lib/btx-encrypt.js'),
    decrypt: await import('../js/lib/btx-decrypt-threshold.js'),
    eip: await import('../js/lib/eip2537.js'),
  };
}

function ctToBytes(libs, ct) {
  const { eip, bls } = libs;
  const ct_1 = eip.bytesToHex(eip.g1ToBytes(ct.ct_1));
  // ct_2 is an Fp12 element; serialize as 576-byte raw.
  const ct2Bytes = bls.Fp12.toBytes(ct.ct_2);
  const ct_2 = eip.bytesToHex(ct2Bytes);
  const pi_R = eip.bytesToHex(eip.g1ToBytes(ct.pi.R));
  const pi_s = eip.bytesToHex(eip.frToBytes(ct.pi.s));
  return { ct_1, ct_2, pi_R, pi_s };
}

function computeOrderHash(order) {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'address', 'uint256', 'address', 'uint256', 'uint256'],
      [order.user, order.tokenIn, order.amountIn, order.tokenOut, order.minAmountOut, order.nonce],
    ),
  );
}

async function timeTravel(seconds) {
  await network.provider.send('evm_increaseTime', [seconds]);
  await network.provider.send('evm_mine');
}

describe('EncryptedPool (end-to-end)', function () {
  let libs;
  let mon, usdc, amm, schnorr, btxVerifier, pool;
  let signers, deployer, nodes, user;
  let setupResult;
  let monAddr, usdcAddr, poolAddr;

  const INIT_MON = ethers.parseUnits('10000', 18);
  const INIT_USDC = ethers.parseUnits('40000', 6);

  before(async function () {
    libs = await loadLibs();
    signers = await ethers.getSigners();
    deployer = signers[0];
    nodes = [signers[1], signers[2], signers[3]];
    user = signers[4];

    // 1. Tokens + AMM
    mon = await (await ethers.getContractFactory('MockMON')).deploy();
    usdc = await (await ethers.getContractFactory('MockUSDC')).deploy();
    monAddr = await mon.getAddress();
    usdcAddr = await usdc.getAddress();

    amm = await (await ethers.getContractFactory('SealedAMM')).deploy(monAddr, usdcAddr);

    // 2. JS trusted setup
    setupResult = libs.setup.keyGenThreshold(Bmax, N, t);

    // 3. SchnorrVerifier
    schnorr = await (await ethers.getContractFactory('SchnorrVerifier')).deploy();

    // 4. BTXVerifier with setup params
    const zero256 = '0x' + '00'.repeat(256);
    const h_powers = [];
    for (let i = 1; i <= 2 * Bmax; i++) {
      if (i === Bmax + 1) h_powers.push(zero256);
      else h_powers.push(libs.eip.bytesToHex(libs.eip.g2ToBytes(setupResult.dk[i])));
    }
    const pkCommitments = setupResult.pkCommitments.map((pkj) =>
      pkj.map((p) => libs.eip.bytesToHex(libs.eip.g2ToBytes(p))),
    );
    const omega = setupResult.omega.map((w) => w);
    const nodeAddrs = nodes.map((s) => s.address);

    btxVerifier = await (await ethers.getContractFactory('BTXVerifier')).deploy(
      N, t + 1, Bmax, h_powers, pkCommitments, omega, nodeAddrs,
    );

    // 5. EncryptedPool
    pool = await (await ethers.getContractFactory('EncryptedPool')).deploy(
      await amm.getAddress(),
      await btxVerifier.getAddress(),
      await schnorr.getAddress(),
      EPOCH_DURATION,
      REFUND_TIMEOUT,
    );
    poolAddr = await pool.getAddress();

    // 6. Wire AMM + bootstrap liquidity
    await amm.setSealedPool(poolAddr);
    await mon.mint(deployer.address, INIT_MON);
    await usdc.mint(deployer.address, INIT_USDC);
    await mon.approve(await amm.getAddress(), INIT_MON);
    await usdc.approve(await amm.getAddress(), INIT_USDC);
    await amm.initialize(INIT_MON, INIT_USDC);

    // 7. Fund user
    await usdc.mint(user.address, ethers.parseUnits('10000', 6));
  });

  async function submitOrder({ amountIn, tokenIn, tokenOut, minAmountOut = 0n, nonce }) {
    const order = {
      user: user.address,
      tokenIn,
      amountIn,
      tokenOut,
      minAmountOut: BigInt(minAmountOut),
      nonce: BigInt(nonce),
    };
    const orderHash = computeOrderHash(order);

    // Encrypt a random m_GT under the BTX encryption key.
    const m = libs.bls.randomGT();
    const ct = libs.encrypt.encrypt(setupResult.ek, m);
    const ctBytes = ctToBytes(libs, ct);

    // AES_ct is irrelevant for on-chain flow; pass a stub.
    const aes_ct = '0x' + '00'.repeat(64);

    await usdc.connect(user).approve(poolAddr, amountIn);
    const tx = await pool.connect(user).submitEncryptedOrder(
      ctBytes.ct_1,
      ctBytes.ct_2,
      ctBytes.pi_R,
      ctBytes.pi_s,
      aes_ct,
      orderHash,
      amountIn,
      tokenIn,
    );
    await tx.wait();
    return { order, orderHash, ct };
  }

  it('end-to-end: submit, decrypt, swap executes, balances update', async function () {
    // Order: user swaps 100 USDC for MON
    const amountIn = ethers.parseUnits('100', 6);
    const { order, ct } = await submitOrder({
      amountIn,
      tokenIn: usdcAddr,
      tokenOut: monAddr,
      nonce: 1n,
    });

    const epochId = 1;
    expect(await pool.getOrderCount(epochId)).to.equal(1);

    // Close epoch
    await timeTravel(EPOCH_DURATION + 1);
    await pool.closeEpoch();
    expect((await pool.epochs(epochId)).closed).to.equal(true);

    // Each node submits σ_j
    const ciphertexts = [ct];
    const partials = setupResult.sk.map((sk_j) =>
      libs.decrypt.partialDecrypt(ciphertexts, sk_j),
    );
    for (let j = 0; j < N; j++) {
      const sigmaBytes = libs.eip.bytesToHex(libs.eip.g1ToBytes(partials[j].sigma_j));
      await btxVerifier.connect(nodes[j]).submitShare(epochId, j, sigmaBytes);
    }

    // Combiner submits plaintext batch with V=[0,1]
    const decrypted = [
      {
        orderIndex: 0,
        user: order.user,
        tokenIn: order.tokenIn,
        amountIn: order.amountIn,
        tokenOut: order.tokenOut,
        minAmountOut: order.minAmountOut,
        nonce: order.nonce,
      },
    ];

    const monBefore = await mon.balanceOf(user.address);
    const tx = await pool.submitDecryptedBatch(epochId, decrypted, [0, 1]);
    const receipt = await tx.wait();

    // Expect BatchExecuted and one SwapExecuted event
    const swapLog = receipt.logs.find((l) => {
      try {
        return pool.interface.parseLog(l)?.name === 'SwapExecuted';
      } catch {
        return false;
      }
    });
    expect(swapLog).to.not.equal(undefined);

    const monAfter = await mon.balanceOf(user.address);
    expect(monAfter).to.be.greaterThan(monBefore);

    const storedOrder = await pool.orders(epochId, 0);
    expect(storedOrder.executed).to.equal(true);
  });

  it('end-to-end: tampered σ_j → combineAndVerify reverts → batch not executed', async function () {
    // We're in epoch 2 now (after rollover from last test + closeEpoch).
    const amountIn = ethers.parseUnits('50', 6);
    const { order, ct } = await submitOrder({
      amountIn,
      tokenIn: usdcAddr,
      tokenOut: monAddr,
      nonce: 2n,
    });

    const epochId = Number(await pool.currentEpochId());

    await timeTravel(EPOCH_DURATION + 1);
    await pool.closeEpoch();

    // Submit TAMPERED σ_0 (node 0) and honest σ_1
    const ciphertexts = [ct];
    const partials = setupResult.sk.map((sk_j) =>
      libs.decrypt.partialDecrypt(ciphertexts, sk_j),
    );
    const badSigma = partials[0].sigma_j.add(libs.bls.G1);
    await btxVerifier
      .connect(nodes[0])
      .submitShare(epochId, 0, libs.eip.bytesToHex(libs.eip.g1ToBytes(badSigma)));
    await btxVerifier
      .connect(nodes[1])
      .submitShare(epochId, 1, libs.eip.bytesToHex(libs.eip.g1ToBytes(partials[1].sigma_j)));

    const decrypted = [
      {
        orderIndex: 0,
        user: order.user,
        tokenIn: order.tokenIn,
        amountIn: order.amountIn,
        tokenOut: order.tokenOut,
        minAmountOut: order.minAmountOut,
        nonce: order.nonce,
      },
    ];

    await expect(
      pool.submitDecryptedBatch(epochId, decrypted, [0, 1]),
    ).to.be.revertedWith('BTXVerifier: pairing check failed');

    // Epoch is NOT marked executed — user can now refund after timeout.
    const storedOrder = await pool.orders(epochId, 0);
    expect(storedOrder.executed).to.equal(false);
    expect(storedOrder.refunded).to.equal(false);
  });

  it('refund path: after timeout, user reclaims deposit', async function () {
    // Continues from previous test — epoch with tampered batch that reverted.
    // The epoch is closed but not executed; user can claim refund after refundTimeout.
    const epochId = Number(await pool.currentEpochId()) - 1;
    const storedBefore = await pool.orders(epochId, 0);
    expect(storedBefore.refunded).to.equal(false);

    const balBefore = await usdc.balanceOf(user.address);

    // Not yet past refund window
    await expect(pool.connect(user).claimRefund(epochId, 0)).to.be.revertedWith('EP: too early');

    // Advance past refundTimeout
    await timeTravel(REFUND_TIMEOUT + 1);

    await pool.connect(user).claimRefund(epochId, 0);

    const balAfter = await usdc.balanceOf(user.address);
    expect(balAfter - balBefore).to.equal(storedBefore.depositAmount);

    const storedAfter = await pool.orders(epochId, 0);
    expect(storedAfter.refunded).to.equal(true);
  });

  it('submit rejects tampered NIZK before taking escrow', async function () {
    const amountIn = ethers.parseUnits('25', 6);
    const order = {
      user: user.address,
      tokenIn: usdcAddr,
      amountIn,
      tokenOut: monAddr,
      minAmountOut: 0n,
      nonce: 999n,
    };
    const orderHash = computeOrderHash(order);

    const m = libs.bls.randomGT();
    const ct = libs.encrypt.encrypt(setupResult.ek, m);
    // Tamper the Schnorr proof
    ct.pi.s = (ct.pi.s + 1n) % libs.bls.FR_ORDER;
    const ctBytes = ctToBytes(libs, ct);

    const balBefore = await usdc.balanceOf(user.address);
    await usdc.connect(user).approve(poolAddr, amountIn);
    await expect(
      pool
        .connect(user)
        .submitEncryptedOrder(
          ctBytes.ct_1,
          ctBytes.ct_2,
          ctBytes.pi_R,
          ctBytes.pi_s,
          '0x00',
          orderHash,
          amountIn,
          usdcAddr,
        ),
    ).to.be.revertedWith('EP: invalid NIZK');
    // User balance unchanged — escrow was NOT taken.
    expect(await usdc.balanceOf(user.address)).to.equal(balBefore);
  });

  it('multi-order epoch: 3 orders, all decrypt and execute', async function () {
    const amounts = [
      ethers.parseUnits('30', 6),
      ethers.parseUnits('70', 6),
      ethers.parseUnits('200', 6),
    ];
    const totalIn = amounts[0] + amounts[1] + amounts[2];

    const usdcBeforeSubmits = await usdc.balanceOf(user.address);
    const monBeforeSubmits = await mon.balanceOf(user.address);

    const submissions = [];
    for (let i = 0; i < 3; i++) {
      submissions.push(
        await submitOrder({
          amountIn: amounts[i],
          tokenIn: usdcAddr,
          tokenOut: monAddr,
          nonce: BigInt(100 + i),
        }),
      );
    }
    const epochId = Number(await pool.currentEpochId());

    // After escrow: user's USDC dropped by totalIn; MON unchanged.
    expect(usdcBeforeSubmits - (await usdc.balanceOf(user.address))).to.equal(totalIn);

    await timeTravel(EPOCH_DURATION + 1);
    await pool.closeEpoch();

    const ciphertexts = submissions.map((s) => s.ct);
    const partials = setupResult.sk.map((sk_j) =>
      libs.decrypt.partialDecrypt(ciphertexts, sk_j),
    );
    for (let j = 0; j < N; j++) {
      await btxVerifier
        .connect(nodes[j])
        .submitShare(epochId, j, libs.eip.bytesToHex(libs.eip.g1ToBytes(partials[j].sigma_j)));
    }

    const decrypted = submissions.map((s, idx) => ({
      orderIndex: idx,
      user: s.order.user,
      tokenIn: s.order.tokenIn,
      amountIn: s.order.amountIn,
      tokenOut: s.order.tokenOut,
      minAmountOut: s.order.minAmountOut,
      nonce: s.order.nonce,
    }));

    const gasTx = await pool.submitDecryptedBatch(epochId, decrypted, [0, 2]);
    const receipt = await gasTx.wait();
    console.log(`      submitDecryptedBatch (B=3) gas: ${receipt.gasUsed.toString()}`);

    // After execution: USDC unchanged from escrow point (pool spent escrow, not user).
    // User received MON proportional to totalIn.
    const monGain = (await mon.balanceOf(user.address)) - monBeforeSubmits;
    expect(monGain).to.be.greaterThan(0n);

    for (let idx = 0; idx < 3; idx++) {
      const stored = await pool.orders(epochId, idx);
      expect(stored.executed).to.equal(true);
    }
  });
});
