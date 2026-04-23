// Full pipeline with AES layer: uses encryptOrder / decryptOrder / combiner.js
// to prove the decryptor infrastructure actually performs the end-to-end flow
// (orderData → AES_ct → BTX ct → combine → AES decrypt → Solidity execution).

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
    decrypt: await import('../js/lib/btx-decrypt-threshold.js'),
    eip: await import('../js/lib/eip2537.js'),
    order: await import('../js/lib/order-codec.js'),
    combiner: await import('../decryptor/lib/combiner.js'),
  };
}

async function timeTravel(seconds) {
  await network.provider.send('evm_increaseTime', [seconds]);
  await network.provider.send('evm_mine');
}

describe('Full pipeline (AES + BTX + combiner)', function () {
  let libs;
  let mon, usdc, amm, schnorr, btxVerifier, pool;
  let deployer, nodes, user;
  let setupResult, hydratedParams;
  let monAddr, usdcAddr, poolAddr;

  before(async function () {
    libs = await loadLibs();
    const signers = await ethers.getSigners();
    deployer = signers[0];
    nodes = [signers[1], signers[2], signers[3]];
    user = signers[4];

    mon = await (await ethers.getContractFactory('MockMON')).deploy();
    usdc = await (await ethers.getContractFactory('MockUSDC')).deploy();
    monAddr = await mon.getAddress();
    usdcAddr = await usdc.getAddress();

    amm = await (await ethers.getContractFactory('SealedAMM')).deploy(monAddr, usdcAddr);

    setupResult = libs.setup.keyGenThreshold(Bmax, N, t);

    schnorr = await (await ethers.getContractFactory('SchnorrVerifier')).deploy();

    const zero256 = '0x' + '00'.repeat(256);
    const h_powers = [];
    for (let i = 1; i <= 2 * Bmax; i++) {
      h_powers.push(
        i === Bmax + 1
          ? zero256
          : libs.eip.bytesToHex(libs.eip.g2ToBytes(setupResult.dk[i])),
      );
    }
    const pkCommitments = setupResult.pkCommitments.map((pkj) =>
      pkj.map((p) => libs.eip.bytesToHex(libs.eip.g2ToBytes(p))),
    );

    btxVerifier = await (await ethers.getContractFactory('BTXVerifier')).deploy(
      N, t + 1, Bmax, h_powers, pkCommitments, setupResult.omega, nodes.map((s) => s.address),
    );

    pool = await (await ethers.getContractFactory('EncryptedPool')).deploy(
      await amm.getAddress(),
      await btxVerifier.getAddress(),
      await schnorr.getAddress(),
      EPOCH_DURATION, REFUND_TIMEOUT,
    );
    poolAddr = await pool.getAddress();

    await amm.setSealedPool(poolAddr);
    const INIT_MON = ethers.parseUnits('10000', 18);
    const INIT_USDC = ethers.parseUnits('40000', 6);
    await mon.mint(deployer.address, INIT_MON);
    await usdc.mint(deployer.address, INIT_USDC);
    await mon.approve(await amm.getAddress(), INIT_MON);
    await usdc.approve(await amm.getAddress(), INIT_USDC);
    await amm.initialize(INIT_MON, INIT_USDC);

    await usdc.mint(user.address, ethers.parseUnits('5000', 6));

    // Pre-hydrate params for combiner.
    hydratedParams = {
      Bmax,
      N,
      t,
      dk: setupResult.dk,
      pkCommitments: setupResult.pkCommitments,
      omega: setupResult.omega,
    };
  });

  it('AES-wrapped encrypt → submit → commit → combiner finalizes → swap executes', async function () {
    const orderData = {
      user: user.address,
      tokenIn: usdcAddr,
      amountIn: ethers.parseUnits('75', 6),
      tokenOut: monAddr,
      minAmountOut: 0n,
      nonce: 777n,
    };

    // Client-side encrypt — full AES + BTX wrap.
    const enc = libs.order.encryptOrder(orderData, setupResult.ek);
    const ct_1 = libs.eip.bytesToHex(libs.eip.g1ToBytes(enc.ct_1));
    const ct_2 = libs.eip.bytesToHex(libs.bls.Fp12.toBytes(enc.ct_2));
    const pi_R = libs.eip.bytesToHex(libs.eip.g1ToBytes(enc.pi.R));
    const pi_s = libs.eip.bytesToHex(libs.eip.frToBytes(enc.pi.s));
    const aes_ct = libs.eip.bytesToHex(enc.aes_ct);

    await usdc.connect(user).approve(poolAddr, orderData.amountIn);
    await pool.connect(user).submitEncryptedOrder(
      ct_1, ct_2, pi_R, pi_s, aes_ct, enc.orderHash, orderData.amountIn, orderData.tokenIn,
    );

    const epochId = 1;
    await timeTravel(EPOCH_DURATION + 1);
    await pool.closeEpoch();

    // Nodes submit σ_j's.
    const ciphertexts = [{
      ct_1: enc.ct_1, ct_2: enc.ct_2, pi: enc.pi,
    }];
    const partials = setupResult.sk.map((sk_j) => libs.decrypt.partialDecrypt(ciphertexts, sk_j));
    for (let j = 0; j < N; j++) {
      await btxVerifier
        .connect(nodes[j])
        .submitShare(
          epochId, j,
          libs.eip.bytesToHex(libs.eip.g1ToBytes(partials[j].sigma_j)),
        );
    }

    // Combiner (off-chain): fetch events, decrypt AES, submit batch.
    // Instead of spinning up the real node.js process, we exercise the same
    // library functions used by it.
    const { fetchEpochCiphertexts } = await import('../decryptor/lib/epoch-fetch.js');
    const fetched = await fetchEpochCiphertexts(pool, epochId);
    expect(fetched.length).to.equal(1);
    expect(fetched[0].orderIndex).to.equal(0);

    // Give combiner.js contract handles as if we were Node 0.
    const ctx = {
      encryptedPool: pool.connect(nodes[0]),
      btxVerifier: btxVerifier.connect(nodes[0]),
    };

    const monBefore = await mon.balanceOf(user.address);
    const result = await libs.combiner.combineEpoch(
      ctx, hydratedParams, epochId, fetched, N, t + 1,
    );
    expect(result.decryptedCount).to.equal(1);

    const monAfter = await mon.balanceOf(user.address);
    expect(monAfter).to.be.greaterThan(monBefore);

    const stored = await pool.orders(epochId, 0);
    expect(stored.executed).to.equal(true);
  });

  it('Combiner correctly handles multi-order epoch via AES+BTX', async function () {
    const orders = [
      { ...{ user: user.address, tokenIn: usdcAddr, tokenOut: monAddr, minAmountOut: 0n }, amountIn: ethers.parseUnits('20', 6), nonce: 501n },
      { ...{ user: user.address, tokenIn: usdcAddr, tokenOut: monAddr, minAmountOut: 0n }, amountIn: ethers.parseUnits('40', 6), nonce: 502n },
    ];

    const encList = orders.map((o) => libs.order.encryptOrder(o, setupResult.ek));
    for (const enc of encList) {
      const o = orders[encList.indexOf(enc)];
      await usdc.connect(user).approve(poolAddr, o.amountIn);
      await pool.connect(user).submitEncryptedOrder(
        libs.eip.bytesToHex(libs.eip.g1ToBytes(enc.ct_1)),
        libs.eip.bytesToHex(libs.bls.Fp12.toBytes(enc.ct_2)),
        libs.eip.bytesToHex(libs.eip.g1ToBytes(enc.pi.R)),
        libs.eip.bytesToHex(libs.eip.frToBytes(enc.pi.s)),
        libs.eip.bytesToHex(enc.aes_ct),
        enc.orderHash, o.amountIn, o.tokenIn,
      );
    }

    const epochId = Number(await pool.currentEpochId());
    await timeTravel(EPOCH_DURATION + 1);
    await pool.closeEpoch();

    const ciphertexts = encList.map((e) => ({ ct_1: e.ct_1, ct_2: e.ct_2, pi: e.pi }));
    const partials = setupResult.sk.map((sk_j) => libs.decrypt.partialDecrypt(ciphertexts, sk_j));
    for (let j = 0; j < N; j++) {
      await btxVerifier
        .connect(nodes[j])
        .submitShare(
          epochId, j,
          libs.eip.bytesToHex(libs.eip.g1ToBytes(partials[j].sigma_j)),
        );
    }

    const { fetchEpochCiphertexts } = await import('../decryptor/lib/epoch-fetch.js');
    const fetched = await fetchEpochCiphertexts(pool, epochId);

    const ctx = {
      encryptedPool: pool.connect(nodes[0]),
      btxVerifier: btxVerifier.connect(nodes[0]),
    };

    const monBefore = await mon.balanceOf(user.address);
    const result = await libs.combiner.combineEpoch(ctx, hydratedParams, epochId, fetched, N, t + 1);
    expect(result.decryptedCount).to.equal(2);
    expect(await mon.balanceOf(user.address)).to.be.greaterThan(monBefore);

    for (let i = 0; i < 2; i++) {
      const stored = await pool.orders(epochId, i);
      expect(stored.executed).to.equal(true);
    }
  });

  // ───────────────────────────────────────────────────────────────
  // Failure-path scenarios (Faz 10 §1.2)
  // ───────────────────────────────────────────────────────────────

  it('1 node offline: 2-of-3 still settles the epoch', async function () {
    const orderData = {
      user: user.address,
      tokenIn: usdcAddr,
      amountIn: ethers.parseUnits('30', 6),
      tokenOut: monAddr,
      minAmountOut: 0n,
      nonce: 801n,
    };

    const enc = libs.order.encryptOrder(orderData, setupResult.ek);
    await usdc.connect(user).approve(poolAddr, orderData.amountIn);
    await pool.connect(user).submitEncryptedOrder(
      libs.eip.bytesToHex(libs.eip.g1ToBytes(enc.ct_1)),
      libs.eip.bytesToHex(libs.bls.Fp12.toBytes(enc.ct_2)),
      libs.eip.bytesToHex(libs.eip.g1ToBytes(enc.pi.R)),
      libs.eip.bytesToHex(libs.eip.frToBytes(enc.pi.s)),
      libs.eip.bytesToHex(enc.aes_ct),
      enc.orderHash, orderData.amountIn, orderData.tokenIn,
    );

    const epochId = Number(await pool.currentEpochId());
    await timeTravel(EPOCH_DURATION + 1);
    await pool.closeEpoch();

    const ciphertexts = [{ ct_1: enc.ct_1, ct_2: enc.ct_2, pi: enc.pi }];
    const partials = setupResult.sk.map((sk_j) => libs.decrypt.partialDecrypt(ciphertexts, sk_j));

    // Node 2 is offline — only nodes 0 and 1 submit.
    await btxVerifier.connect(nodes[0]).submitShare(
      epochId, 0, libs.eip.bytesToHex(libs.eip.g1ToBytes(partials[0].sigma_j)),
    );
    await btxVerifier.connect(nodes[1]).submitShare(
      epochId, 1, libs.eip.bytesToHex(libs.eip.g1ToBytes(partials[1].sigma_j)),
    );

    const { fetchEpochCiphertexts } = await import('../decryptor/lib/epoch-fetch.js');
    const fetched = await fetchEpochCiphertexts(pool, epochId);

    const ctx = {
      encryptedPool: pool.connect(nodes[0]),
      btxVerifier: btxVerifier.connect(nodes[0]),
    };
    const monBefore = await mon.balanceOf(user.address);
    const result = await libs.combiner.combineEpoch(ctx, hydratedParams, epochId, fetched, N, t + 1);
    expect(result.decryptedCount).to.equal(1);
    expect(result.V).to.deep.equal([0, 1]);
    expect(await mon.balanceOf(user.address)).to.be.greaterThan(monBefore);

    const stored = await pool.orders(epochId, 0);
    expect(stored.executed).to.equal(true);
  });

  it('2 nodes offline: combiner aborts, user claims refund after timeout', async function () {
    const orderData = {
      user: user.address,
      tokenIn: usdcAddr,
      amountIn: ethers.parseUnits('50', 6),
      tokenOut: monAddr,
      minAmountOut: 0n,
      nonce: 901n,
    };

    const enc = libs.order.encryptOrder(orderData, setupResult.ek);
    await usdc.connect(user).approve(poolAddr, orderData.amountIn);
    const usdcBefore = await usdc.balanceOf(user.address);

    await pool.connect(user).submitEncryptedOrder(
      libs.eip.bytesToHex(libs.eip.g1ToBytes(enc.ct_1)),
      libs.eip.bytesToHex(libs.bls.Fp12.toBytes(enc.ct_2)),
      libs.eip.bytesToHex(libs.eip.g1ToBytes(enc.pi.R)),
      libs.eip.bytesToHex(libs.eip.frToBytes(enc.pi.s)),
      libs.eip.bytesToHex(enc.aes_ct),
      enc.orderHash, orderData.amountIn, orderData.tokenIn,
    );
    const usdcAfterDeposit = await usdc.balanceOf(user.address);
    expect(usdcBefore - usdcAfterDeposit).to.equal(orderData.amountIn);

    const epochId = Number(await pool.currentEpochId());
    const orderIndex = Number((await pool.epochs(epochId)).orderCount) - 1;
    await timeTravel(EPOCH_DURATION + 1);
    await pool.closeEpoch();

    // Only node 0 submits σ — below t+1=2 threshold.
    const ciphertexts = [{ ct_1: enc.ct_1, ct_2: enc.ct_2, pi: enc.pi }];
    const partials = setupResult.sk.map((sk_j) => libs.decrypt.partialDecrypt(ciphertexts, sk_j));
    await btxVerifier.connect(nodes[0]).submitShare(
      epochId, 0, libs.eip.bytesToHex(libs.eip.g1ToBytes(partials[0].sigma_j)),
    );

    const { fetchEpochCiphertexts } = await import('../decryptor/lib/epoch-fetch.js');
    const fetched = await fetchEpochCiphertexts(pool, epochId);

    // Combiner should refuse to run with < t+1 shares.
    const ctx = {
      encryptedPool: pool.connect(nodes[0]),
      btxVerifier: btxVerifier.connect(nodes[0]),
    };
    let combineError = null;
    try {
      await libs.combiner.combineEpoch(ctx, hydratedParams, epochId, fetched, N, t + 1);
    } catch (err) {
      combineError = err;
    }
    expect(combineError, 'combineEpoch must throw when < t+1 shares').to.not.be.null;
    expect(combineError.message).to.match(/only 1 shares? on-chain/);

    // claimRefund is gated until endTime + refundTimeout. Too-early call must revert.
    await expect(pool.connect(user).claimRefund(epochId, orderIndex)).to.be.revertedWith('EP: too early');

    // Time-travel past the refund window and claim.
    await timeTravel(REFUND_TIMEOUT + 1);
    const usdcBeforeRefund = await usdc.balanceOf(user.address);
    await expect(pool.connect(user).claimRefund(epochId, orderIndex))
      .to.emit(pool, 'RefundClaimed')
      .withArgs(epochId, orderIndex, user.address, orderData.amountIn);
    const usdcAfterRefund = await usdc.balanceOf(user.address);
    expect(usdcAfterRefund - usdcBeforeRefund).to.equal(orderData.amountIn);

    const stored = await pool.orders(epochId, orderIndex);
    expect(stored.refunded).to.equal(true);
    expect(stored.executed).to.equal(false);
  });
});
