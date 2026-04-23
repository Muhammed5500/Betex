const { expect } = require('chai');
const { ethers } = require('hardhat');
const fs = require('node:fs');
const path = require('node:path');

const vectorsFile = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../js/test/vectors/schnorr.json'), 'utf8'),
);

describe('SchnorrVerifier', function () {
  let verifier;

  before(async function () {
    const Factory = await ethers.getContractFactory('SchnorrVerifier');
    verifier = await Factory.deploy();
    await verifier.waitForDeployment();
  });

  describe('Vector parity (JS → Solidity)', function () {
    for (const v of vectorsFile.vectors) {
      it(`vector ${v.index}: r = ${v.r.slice(0, 20)}...`, async function () {
        const ok = await verifier.verify(v.ct_1, v.R, v.s);
        expect(ok).to.equal(true);
      });
    }
  });

  describe('Negative cases', function () {
    let valid;

    before(function () {
      valid = vectorsFile.vectors[0];
    });

    it('tampered s returns false', async function () {
      const bad = '0x' + '01' + valid.s.slice(4); // flip first byte
      const ok = await verifier.verify(valid.ct_1, valid.R, bad);
      expect(ok).to.equal(false);
    });

    it('tampered R returns false', async function () {
      // Replace R with G1 generator bytes — a valid G1 point that is not the expected R.
      const harnessFactory = await ethers.getContractFactory('BLS12381TestHarness');
      const harness = await harnessFactory.deploy();
      await harness.waitForDeployment();
      const g1 = await harness.g1Generator();
      const ok = await verifier.verify(valid.ct_1, g1, valid.s);
      expect(ok).to.equal(false);
    });

    it('s >= FR_ORDER returns false', async function () {
      const FR_ORDER = BigInt(
        '0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001',
      );
      const bigS = '0x' + FR_ORDER.toString(16).padStart(64, '0');
      const ok = await verifier.verify(valid.ct_1, valid.R, bigS);
      expect(ok).to.equal(false);
    });

    it('wrong length ct_1 returns false', async function () {
      const shortCt1 = '0x' + '00'.repeat(127);
      const ok = await verifier.verify(shortCt1, valid.R, valid.s);
      expect(ok).to.equal(false);
    });
  });

  describe('Gas', function () {
    it('logs verify gas', async function () {
      const v = vectorsFile.vectors[0];
      const gas = await verifier.verify.estimateGas(v.ct_1, v.R, v.s);
      console.log(`      SchnorrVerifier.verify gas: ${gas.toString()}`);
      expect(Number(gas)).to.be.lessThan(200000);
    });
  });
});
