const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('SealedAMM', function () {
  let mon, usdc, amm;
  let owner, pool, user;

  const INIT_MON = ethers.parseUnits('10000', 18);
  const INIT_USDC = ethers.parseUnits('40000', 6);

  beforeEach(async function () {
    [owner, pool, user] = await ethers.getSigners();

    const MockMON = await ethers.getContractFactory('MockMON');
    mon = await MockMON.deploy();
    const MockUSDC = await ethers.getContractFactory('MockUSDC');
    usdc = await MockUSDC.deploy();

    const AMM = await ethers.getContractFactory('SealedAMM');
    amm = await AMM.deploy(await mon.getAddress(), await usdc.getAddress());

    await amm.setSealedPool(pool.address);

    // Mint + approve + initialize
    await mon.mint(owner.address, INIT_MON);
    await usdc.mint(owner.address, INIT_USDC);
    await mon.approve(await amm.getAddress(), INIT_MON);
    await usdc.approve(await amm.getAddress(), INIT_USDC);
    await amm.initialize(INIT_MON, INIT_USDC);
  });

  it('initialize sets reserves', async function () {
    expect(await amm.reserveA()).to.equal(INIT_MON);
    expect(await amm.reserveB()).to.equal(INIT_USDC);
    expect(await amm.initialized()).to.equal(true);
  });

  it('setSealedPool can only be called once', async function () {
    await expect(amm.setSealedPool(user.address)).to.be.revertedWith('SealedAMM: pool set');
  });

  it('initialize cannot be called twice', async function () {
    await expect(amm.initialize(1, 1)).to.be.revertedWith('SealedAMM: initialized');
  });

  it('getAmountOut applies 0.3% fee correctly', async function () {
    // 100 USDC → MON with pool 10k MON / 40k USDC
    const amountIn = ethers.parseUnits('100', 6); // 100 USDC
    const out = await amm.getAmountOut(amountIn, await usdc.getAddress());
    // formula: out = (amountIn * 997 * reserveOut) / (reserveIn * 1000 + amountIn * 997)
    const expected =
      (amountIn * 997n * INIT_MON) /
      (INIT_USDC * 1000n + amountIn * 997n);
    expect(out).to.equal(expected);
  });

  it('swap only callable by pool', async function () {
    await usdc.mint(user.address, ethers.parseUnits('100', 6));
    await usdc
      .connect(user)
      .approve(await amm.getAddress(), ethers.parseUnits('100', 6));
    await expect(
      amm.connect(user).swap(
        ethers.parseUnits('100', 6),
        await usdc.getAddress(),
        user.address,
        0,
      ),
    ).to.be.revertedWith('SealedAMM: not pool');
  });

  it('swap updates reserves and transfers correctly', async function () {
    const amountIn = ethers.parseUnits('100', 6);

    // Pool needs USDC to call transferFrom. In reality EncryptedPool has escrow,
    // here we simulate by minting to `pool`.
    await usdc.mint(pool.address, amountIn);
    await usdc.connect(pool).approve(await amm.getAddress(), amountIn);

    const balBefore = await mon.balanceOf(user.address);
    const tx = await amm.connect(pool).swap(amountIn, await usdc.getAddress(), user.address, 0);
    await tx.wait();

    const expectedOut =
      (amountIn * 997n * INIT_MON) / (INIT_USDC * 1000n + amountIn * 997n);
    expect(await mon.balanceOf(user.address)).to.equal(balBefore + expectedOut);
    expect(await amm.reserveB()).to.equal(INIT_USDC + amountIn);
    expect(await amm.reserveA()).to.equal(INIT_MON - expectedOut);
  });

  it('swap reverts on slippage violation', async function () {
    const amountIn = ethers.parseUnits('100', 6);
    await usdc.mint(pool.address, amountIn);
    await usdc.connect(pool).approve(await amm.getAddress(), amountIn);

    const minOut = ethers.parseUnits('1000000', 18); // absurdly high
    await expect(
      amm.connect(pool).swap(amountIn, await usdc.getAddress(), user.address, minOut),
    ).to.be.revertedWith('SealedAMM: slippage');
  });
});
