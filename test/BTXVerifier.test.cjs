// End-to-end test: JS threshold setup → Solidity BTXVerifier.
// Runs a fresh trusted setup inside the test, deploys BTXVerifier with
// the exact params, submits σ_j's from 3 distinct Hardhat signers, and
// checks that combineAndVerify accepts honest shares and rejects tampered ones.

const { expect } = require('chai');
const { ethers } = require('hardhat');

const Bmax = 4;
const N = 3;
const t = 1;

async function loadJsLibs() {
  const bls = await import('../js/lib/bls.js');
  const setup = await import('../js/lib/btx-setup-threshold.js');
  const encrypt = await import('../js/lib/btx-encrypt.js');
  const decrypt = await import('../js/lib/btx-decrypt-threshold.js');
  const eip = await import('../js/lib/eip2537.js');
  return { bls, setup, encrypt, decrypt, eip };
}

// Convert JS setup output to Solidity constructor args.
function setupToSolidity(libs, setupResult, nodeAddrs) {
  const { eip, bls } = libs;
  const zero256 = '0x' + '00'.repeat(256);
  const h_powers = [];
  for (let i = 1; i <= 2 * setupResult.Bmax; i++) {
    if (i === setupResult.Bmax + 1) {
      h_powers.push(zero256); // punctured
    } else {
      h_powers.push(eip.bytesToHex(eip.g2ToBytes(setupResult.dk[i])));
    }
  }
  const pk = setupResult.pkCommitments.map((pk_j) =>
    pk_j.map((p) => eip.bytesToHex(eip.g2ToBytes(p))),
  );
  const omegaBytes = setupResult.omega.map((w) => w); // bigint → uint256
  return { h_powers, pk, omega: omegaBytes, nodeAddrs };
}

describe('BTXVerifier', function () {
  let libs;
  let verifier;
  let signers;
  let setupResult;
  let messages;
  let ciphertexts;
  let partials;

  before(async function () {
    libs = await loadJsLibs();
    signers = await ethers.getSigners();

    // Fresh JS trusted setup.
    setupResult = libs.setup.keyGenThreshold(Bmax, N, t);

    // Pick first N hardhat accounts as node addresses.
    const nodeAddrs = [signers[0].address, signers[1].address, signers[2].address];
    const solArgs = setupToSolidity(libs, setupResult, nodeAddrs);

    const Factory = await ethers.getContractFactory('BTXVerifier');
    verifier = await Factory.deploy(
      N, t + 1, Bmax,
      solArgs.h_powers,
      solArgs.pk,
      solArgs.omega,
      solArgs.nodeAddrs,
    );
    await verifier.waitForDeployment();

    // Encrypt Bmax messages (so U covers the full batch).
    messages = Array.from({ length: Bmax }, () => libs.bls.randomGT());
    ciphertexts = messages.map((m) => libs.encrypt.encrypt(setupResult.ek, m));

    // Each node computes σ_j.
    partials = setupResult.sk.map((sk_j) => libs.decrypt.partialDecrypt(ciphertexts, sk_j));
  });

  it('Lagrange Solidity matches JS for V=[0,1]', async function () {
    const jsL = (await import('../js/lib/shamir.js')).lagrange([0, 1], setupResult.omega);
    const solL = await verifier.lagrangeAt0([0, 1]);
    for (let i = 0; i < 2; i++) {
      const solAsBigInt = BigInt(solL[i]);
      expect(solAsBigInt).to.equal(jsL[i]);
    }
  });

  it('Lagrange Solidity matches JS for V=[0,2] and V=[1,2]', async function () {
    const shamir = await import('../js/lib/shamir.js');
    for (const V of [[0, 2], [1, 2]]) {
      const jsL = shamir.lagrange(V, setupResult.omega);
      const solL = await verifier.lagrangeAt0(V);
      for (let i = 0; i < V.length; i++) {
        expect(BigInt(solL[i])).to.equal(jsL[i]);
      }
    }
  });

  it('3 nodes submit σ_j, only authorized callers accepted', async function () {
    const epochId = 1;
    for (let j = 0; j < N; j++) {
      const sigmaBytes = libs.eip.bytesToHex(libs.eip.g1ToBytes(partials[j].sigma_j));
      await expect(verifier.connect(signers[j]).submitShare(epochId, j, sigmaBytes))
        .to.emit(verifier, 'ShareSubmitted')
        .withArgs(epochId, j);
    }
    // Duplicate → reject
    const dup = libs.eip.bytesToHex(libs.eip.g1ToBytes(partials[0].sigma_j));
    await expect(
      verifier.connect(signers[0]).submitShare(epochId, 0, dup),
    ).to.be.revertedWith('BTXVerifier: duplicate');

    // Unauthorized → reject (signer 5 tries to submit as node 0)
    await expect(
      verifier.connect(signers[5]).submitShare(2, 0, dup),
    ).to.be.revertedWith('BTXVerifier: unauthorized');
  });

  it('combineAndVerify accepts honest shares, returned σ matches JS', async function () {
    const epochId = 1;
    const U = partials[0].U; // 1-indexed, e.g. [1,2,3,4]
    const ct1List = ciphertexts.map((ct) =>
      libs.eip.bytesToHex(libs.eip.g1ToBytes(ct.ct_1)),
    );

    const tx = await verifier.combineAndVerify(epochId, [0, 1], ct1List, U);
    await expect(tx).to.emit(verifier, 'BatchVerified');

    // On-chain returned σ matches JS off-chain combine.
    const jsResult = libs.decrypt.combine(
      partials,
      [0, 1],
      ciphertexts,
      setupResult.dk,
      setupResult.pkCommitments,
      setupResult.omega,
      Bmax,
      t + 1,
    );
    const onChainSigma = await verifier.combinedSigmaOf(epochId);
    const jsSigmaBytes = libs.eip.bytesToHex(libs.eip.g1ToBytes(jsResult.sigma));
    expect(onChainSigma).to.equal(jsSigmaBytes);
  });

  it('combineAndVerify reverts on tampered σ_j (pairing fails)', async function () {
    const epochId = 2;

    // Submit two honest and one tampered.
    const tampered = partials[0].sigma_j.add(libs.bls.G1); // σ_0 + G1
    await verifier
      .connect(signers[0])
      .submitShare(epochId, 0, libs.eip.bytesToHex(libs.eip.g1ToBytes(tampered)));
    await verifier
      .connect(signers[1])
      .submitShare(epochId, 1, libs.eip.bytesToHex(libs.eip.g1ToBytes(partials[1].sigma_j)));

    const U = partials[0].U;
    const ct1List = ciphertexts.map((ct) =>
      libs.eip.bytesToHex(libs.eip.g1ToBytes(ct.ct_1)),
    );

    await expect(
      verifier.combineAndVerify(epochId, [0, 1], ct1List, U),
    ).to.be.revertedWith('BTXVerifier: pairing check failed');
  });

  it('combineAndVerify works with V=[0,2] when nodes 0 and 2 submit', async function () {
    const epochId = 3;
    await verifier
      .connect(signers[0])
      .submitShare(epochId, 0, libs.eip.bytesToHex(libs.eip.g1ToBytes(partials[0].sigma_j)));
    await verifier
      .connect(signers[2])
      .submitShare(epochId, 2, libs.eip.bytesToHex(libs.eip.g1ToBytes(partials[2].sigma_j)));

    const U = partials[0].U;
    const ct1List = ciphertexts.map((ct) =>
      libs.eip.bytesToHex(libs.eip.g1ToBytes(ct.ct_1)),
    );

    await expect(verifier.combineAndVerify(epochId, [0, 2], ct1List, U)).to.emit(
      verifier,
      'BatchVerified',
    );
  });

  it('Gas for combineAndVerify (Bmax=4, |V|=2, |U|=4)', async function () {
    const epochId = 4;
    await verifier
      .connect(signers[0])
      .submitShare(epochId, 0, libs.eip.bytesToHex(libs.eip.g1ToBytes(partials[0].sigma_j)));
    await verifier
      .connect(signers[1])
      .submitShare(epochId, 1, libs.eip.bytesToHex(libs.eip.g1ToBytes(partials[1].sigma_j)));

    const U = partials[0].U;
    const ct1List = ciphertexts.map((ct) =>
      libs.eip.bytesToHex(libs.eip.g1ToBytes(ct.ct_1)),
    );

    const gas = await verifier.combineAndVerify.estimateGas(epochId, [0, 1], ct1List, U);
    console.log(`      combineAndVerify gas: ${gas.toString()}`);
    expect(Number(gas)).to.be.lessThan(2_000_000);
  });
});
