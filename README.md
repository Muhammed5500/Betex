# Betex

Paper-faithful implementation of
[BTX](https://category-labs.github.io/category-research/BTX-paper.pdf)
(Batch Threshold Encryption — Agarwal, Das, Gilkalaye, Rindal, Shoup,
Category Labs) on Monad testnet, packaged as an MEV-resistant DEX.

Submitted to the Monad Kayseri 2026 hackathon.

## What it is

A four-layer prototype of the BTX primitive wired end-to-end:

| Layer | What it does |
|---|---|
| **Crypto** (`js/lib/`) | Pure-JS BLS12-381 via `@noble/curves`. Single-server BTX (paper §4), Shamir-over-τ-powers threshold extension (§5.2), Schnorr NIZK for CCA under AGM (§4.3). |
| **Verifier contracts** (`contracts/`) | Solidity wrapper around the EIP-2537 BLS precompiles. `BTXVerifier` stores the trusted-setup CRS and runs the aggregate pairing check; `SchnorrVerifier` validates the CCA proof at submission. |
| **DEX** (`contracts/`) | `EncryptedPool` — epoch-based encrypted order book with hash-bound decryption commitments, randomised execution order, and a refund path. `SealedAMM` — Uniswap-V2 constant-product AMM gated to the pool. |
| **Committee** (`decryptor/`) | N=3 Node.js processes. Each holds one Shamir share and submits its σⱼ on `EpochClosed`. One node acts as combiner, decrypts orders off-chain, and submits the plaintext batch. |
| **UI** (`frontend/`) | Next.js 15 + wagmi + viem + RainbowKit. Client-side BTX encryption, live epoch timer, committee status, pool reserves, faucet. |

## Deployed on Monad testnet

| Contract | Address |
|---|---|
| MockMON | [`0x7CD1cf590d76473D45C1c5FaC2eD507E6EE5Fe9d`](https://testnet.monadexplorer.com/address/0x7CD1cf590d76473D45C1c5FaC2eD507E6EE5Fe9d) |
| MockUSDC | [`0xE7dA90950524e29475FD25365443ae971C2005CD`](https://testnet.monadexplorer.com/address/0xE7dA90950524e29475FD25365443ae971C2005CD) |
| SealedAMM | [`0x019D5FFd40fD8e286f9992D0D1D17a34Ef6b8a24`](https://testnet.monadexplorer.com/address/0x019D5FFd40fD8e286f9992D0D1D17a34Ef6b8a24) |
| SchnorrVerifier | [`0xD93A0fd7Ea4521e7179B1265880077d22fb55C4c`](https://testnet.monadexplorer.com/address/0xD93A0fd7Ea4521e7179B1265880077d22fb55C4c) |
| BTXVerifier | [`0x3850d3b5DF4Dc5F05fbA420c3890435575ad7240`](https://testnet.monadexplorer.com/address/0x3850d3b5DF4Dc5F05fbA420c3890435575ad7240) |
| EncryptedPool | [`0x3c3614aB48ad90419Cb3eD94808fE24Bb4055152`](https://testnet.monadexplorer.com/address/0x3c3614aB48ad90419Cb3eD94808fE24Bb4055152) |

Config: `Bmax=16`, `N=3`, `t=1`, `epochDuration=5s`, `refundTimeout=60s`.
Initial liquidity: 10 000 MON + 40 000 USDC.

End-to-end verified: real USDC → MON swaps settled through the committee
on the live stack. Committee picks up every batch within the 5-second
window; user-perceived latency ≈ 5-7 seconds for a full encrypted swap.

## Deviations from the paper

- **AGM-Schnorr** instead of Fischlin. CCA under the Algebraic Group
  Model — smaller and ~10× cheaper on-chain.
- **Trusted dealer** (one-shot script) for τ generation. Production would
  use a KZG-style ceremony.
- **Optimistic-only robustness.** Aggregate pairing check reverts → batch
  aborts → refund after 60 s. The paper's pessimistic per-server
  fallback is V2.
- **Off-chain combiner.** β, γ, m computations happen in the committee
  node; the contract only checks the keccak256 hash binding and a single
  aggregate pairing. The paper is agnostic to this split.
- **KEM-DEM wrapper.** BTX encrypts a random GT element; we derive
  AES-256 from `SHA-256(Fp12.toBytes(m))` and wrap the real order JSON
  with AES-GCM.
- **Bmax = 16**, naive O(B²) cross-term. FFT (§6) not needed at this
  scope.

## Repo layout

```
.
├── js/
│   ├── lib/          BTX primitives (bls, btx-setup/encrypt/decrypt,
│   │                  btx-setup/decrypt-threshold, shamir, schnorr,
│   │                  eip2537, aes, order-codec)
│   ├── test/         node:test suite + fixed vectors
│   └── scripts/      vector generators
├── contracts/
│   ├── lib/          BLS12381.sol + helpers (EIP-2537 wrappers)
│   ├── test-harness/
│   ├── tokens/       MockMON, MockUSDC
│   ├── SchnorrVerifier.sol
│   ├── BTXVerifier.sol
│   ├── EncryptedPool.sol
│   └── SealedAMM.sol
├── test/             hardhat/chai suites incl. FullPipeline
├── decryptor/
│   ├── node.js       single entry point (run as `node decryptor/node.js`)
│   ├── lib/          combiner, contracts, epoch-fetch, rpc-retry
│   └── scripts/      trusted-setup
├── scripts/
│   ├── full-deploy-local.cjs   trusted-setup + local deploy + frontend sync
│   ├── deploy-monad.cjs        Monad testnet deploy
│   ├── smoke-test.js           live end-to-end test
│   └── manual-combine.cjs      one-shot combiner replay for missed epochs
└── frontend/         Next.js 15 app
```

## Quick start — local

Requires Node 20+ and a bash-compatible shell.

```bash
npm install
cd frontend && npm install && cd ..

# 1. Start a hardhat node
npx hardhat --config hardhat.config.cjs node     # terminal A

# 2. Trusted setup + full deploy + frontend sync
npm run deploy:local                              # terminal B

# 3. Start the committee
npm run committee:0                               # terminal C
npm run committee:1                               # terminal D
npm run committee:2                               # terminal E

# 4. Frontend
cd frontend && npm run dev                        # terminal F
# http://localhost:3000
```

## Quick start — Monad testnet

```bash
# a. Generate the trusted setup on a secure machine
npm run setup

# b. Set in the environment:
#    DEPLOYER_PRIVATE_KEY   deployer wallet (≥ 5 MON)
#    NODE0_ADDRESS, NODE1_ADDRESS, NODE2_ADDRESS   committee wallets
#    MONAD_RPC_URL          (optional) RPC override
npm run deploy:monad
```

Each committee operator then copies their `decryptor/config/nodeK.env`,
sets `PRIVATE_KEY`, and runs `node decryptor/node.js` with that env
loaded.

## Testing

```bash
npm test                  # JS — BLS, BTX, Schnorr, Shamir, threshold, AES
npm run test:sol          # Hardhat — BLS12381, verifiers, pool, FullPipeline
```

`FullPipeline` covers: single order happy path, multi-order epoch,
1-node offline (2-of-3 still settles), 2-node offline (combiner aborts →
refund after timeout).

## Gas footprint

| Op | Gas |
|---|---|
| `submitEncryptedOrder` (1 NIZK) | ~260k |
| `submitShare` | ~75k |
| `combineAndVerify` (B=1) | ~450k |
| `combineAndVerify` (B=8) | ~1.4M |
| `submitDecryptedBatch` (B=8) | ~2.4M |

All well within Monad's 30M block gas limit. The BTXVerifier constructor
itself is the heaviest tx at ~18M (writes the full CRS into storage);
`deploy-monad.cjs` passes an explicit 25M gas limit for that one.

## License

MIT.
