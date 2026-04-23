// Hardhat test consuming js/test/vectors/eip2537.json.
// Purpose: byte-level parity between @noble/curves output and EIP-2537 precompile output.

const { expect } = require('chai');
const { ethers } = require('hardhat');
const fs = require('node:fs');
const path = require('node:path');

const vectors = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../js/test/vectors/eip2537.json'), 'utf8'),
);

describe('BLS12381 (EIP-2537 parity)', function () {
  let harness;

  before(async function () {
    const Factory = await ethers.getContractFactory('BLS12381TestHarness');
    harness = await Factory.deploy();
    await harness.waitForDeployment();
  });

  describe('Generator constants', function () {
    it('G1_GENERATOR matches @noble/curves encoding', async function () {
      expect(await harness.g1Generator()).to.equal(vectors.constants.G1);
    });

    it('G2_GENERATOR matches', async function () {
      expect(await harness.g2Generator()).to.equal(vectors.constants.G2);
    });

    it('G2_GENERATOR_NEG matches', async function () {
      expect(await harness.g2GeneratorNeg()).to.equal(vectors.constants.G2_NEG);
    });
  });

  describe('g1Add', function () {
    for (const v of vectors.g1add) {
      it(`${v.a_scalar}·G + ${v.b_scalar}·G matches`, async function () {
        const out = await harness.g1Add(v.a, v.b);
        expect(out).to.equal(v.expected);
      });
    }
  });

  describe('g1ScalarMul', function () {
    for (const v of vectors.g1mul) {
      it(`${v.point_scalar}·G scaled correctly`, async function () {
        const out = await harness.g1ScalarMul(v.point, v.scalar);
        expect(out).to.equal(v.expected);
      });
    }
  });

  describe('g2Add', function () {
    for (const v of vectors.g2add) {
      it(`${v.a_scalar}·G2 + ${v.b_scalar}·G2 matches`, async function () {
        const out = await harness.g2Add(v.a, v.b);
        expect(out).to.equal(v.expected);
      });
    }
  });

  describe('g2ScalarMul', function () {
    for (const v of vectors.g2mul) {
      it(`${v.point_scalar}·G2 scaled correctly`, async function () {
        const out = await harness.g2ScalarMul(v.point, v.scalar);
        expect(out).to.equal(v.expected);
      });
    }
  });

  describe('pairingCheck', function () {
    for (const p of vectors.pairing) {
      it(p.description, async function () {
        const g1s = p.pairs.map((x) => x.g1);
        const g2s = p.pairs.map((x) => x.g2);
        const result = await harness.packPairingCheckAndVerify(g1s, g2s);
        expect(result).to.equal(p.expected);
      });
    }
  });

  describe('Input validation', function () {
    it('g1Add reverts on wrong length', async function () {
      await expect(
        harness.g1Add('0x' + '00'.repeat(127), '0x' + '00'.repeat(128)),
      ).to.be.revertedWith('BLS12381: invalid G1 length');
    });

    it('pairingCheck reverts on non-multiple-of-384 length', async function () {
      await expect(harness.pairingCheck('0x' + '00'.repeat(383))).to.be.revertedWith(
        'BLS12381: invalid pairing input',
      );
    });
  });

  describe('Gas measurement', function () {
    it('logs G1ADD gas cost', async function () {
      const v = vectors.g1add[0];
      const [, gas] = await harness.gasG1Add(v.a, v.b);
      console.log(`      G1ADD gas: ${gas.toString()}`);
      expect(Number(gas)).to.be.greaterThan(0);
    });

    it('logs PAIRING_CHECK gas cost (2 pairs)', async function () {
      const p = vectors.pairing[0];
      const g1s = p.pairs.map((x) => x.g1);
      const g2s = p.pairs.map((x) => x.g2);
      // Pack using helper inside contract then call gasPairingCheck manually.
      // Construct packed input off-chain by concatenating.
      const hex = g1s.map((g1, i) => g1.slice(2) + g2s[i].slice(2)).join('');
      const [, gas] = await harness.gasPairingCheck('0x' + hex);
      console.log(`      PAIRING_CHECK (k=2) gas: ${gas.toString()}`);
      expect(Number(gas)).to.be.greaterThan(0);
    });
  });
});
