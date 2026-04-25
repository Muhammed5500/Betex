<h1 align="center">Betex</h1>

<p align="center">
  <strong>An MEV-resistant encrypted DEX on Monad testnet, built on a paper-faithful implementation of Category Labs' BTX threshold encryption.</strong>
</p>

<p align="center">
  <a href="https://category-labs.github.io/category-research/BTX-paper.pdf">BTX Paper</a> ·
  <a href="https://testnet.monadexplorer.com/address/0x3c3614aB48ad90419Cb3eD94808fE24Bb4055152">Live Contract</a> ·
  <a href="#quick-start">Quick Start</a>
</p>

---

## TL;DR

Betex is a decentralized exchange where **every order is encrypted in the user's browser** and revealed **only after a 2-of-3 committee votes together**, in a window too short for any MEV bot to exploit. Execution order inside each batch is then shuffled by on-chain randomness. The result: sandwich attacks are **mathematically impossible** — not just "hard".

Under the hood is a paper-faithful implementation of [**BTX: Simple and Efficient Batch Threshold Encryption**](https://category-labs.github.io/category-research/BTX-paper.pdf) (Agarwal, Das, Gilkalaye, Rindal, Shoup — Category Labs, 17 Apr 2026), running on Monad's BLS12-381 precompiles (EIP-2537, MONAD_FOUR hard fork). Paper §4–§7 in Solidity + Node.js; paper §8 (encrypted mempool) wrapped as a working DEX.

> **Built for Monad Kayseri 2026 hackathon.**

---

## The Problem — MEV in Transparent DEXs

In a normal AMM (Uniswap, Curve, SushiSwap), every swap order that hits the mempool is **fully visible** until the block producer picks it up:

```
Bot monitors mempool:
  victim_tx: swapExactTokensForTokens(1000 USDC, minOut=0.45, [USDC, WETH], victim, deadline)
                                       ^         ^              ^
                                       direction min slippage    destination
```

An MEV bot reads this, submits their own swap *ahead* of the victim's (higher gas fee), pushes the AMM price against the victim, lets the victim's tx settle at a worse price, then backruns to profit. **This is a sandwich attack**, and it drains roughly $1B/year from real users across Ethereum-class chains.

The root cause is structural: a classical DEX mempool is a public bulletin board of intentions. Privacy at the order-level is a prerequisite for fair execution.

## The Idea — Encrypted Mempool + Threshold Decryption

What if orders were encrypted on submission and only revealed together, in batches, after enough time has passed that no temporal-advantage attack is possible?

That's an **encrypted mempool**. Existing designs (Ferveo, Shutter, Radius) use threshold encryption schemes that require *O(N)* communication per order per server, where *N* is the committee size. At scale, this gets expensive.

**BTX (Agarwal et al., 2026)** solves this: a new threshold encryption scheme where each server broadcasts a **single group element** σⱼ regardless of the batch size. The combiner aggregates these to decrypt *N* messages at once. Communication per server is **O(1) in batch size** — the scheme's defining property.

Betex is the first working DEX built on BTX. Paper-faithful. Live on Monad testnet.

---

## Deployed on Monad testnet

| Contract | Address |
|---|---|
| MockMON | [`0x7CD1cf590d76473D45C1c5FaC2eD507E6EE5Fe9d`](https://testnet.monadexplorer.com/address/0x7CD1cf590d76473D45C1c5FaC2eD507E6EE5Fe9d) |
| MockUSDC | [`0xE7dA90950524e29475FD25365443ae971C2005CD`](https://testnet.monadexplorer.com/address/0xE7dA90950524e29475FD25365443ae971C2005CD) |
| SealedAMM | [`0x019D5FFd40fD8e286f9992D0D1D17a34Ef6b8a24`](https://testnet.monadexplorer.com/address/0x019D5FFd40fD8e286f9992D0D1D17a34Ef6b8a24) |
| SchnorrVerifier | [`0xD93A0fd7Ea4521e7179B1265880077d22fb55C4c`](https://testnet.monadexplorer.com/address/0xD93A0fd7Ea4521e7179B1265880077d22fb55C4c) |
| BTXVerifier | [`0x3850d3b5DF4Dc5F05fbA420c3890435575ad7240`](https://testnet.monadexplorer.com/address/0x3850d3b5DF4Dc5F05fbA420c3890435575ad7240) |
| EncryptedPool | [`0x3c3614aB48ad90419Cb3eD94808fE24Bb4055152`](https://testnet.monadexplorer.com/address/0x3c3614aB48ad90419Cb3eD94808fE24Bb4055152) |

**Config**: `Bmax=16`, `N=3`, `t=1`, `epochDuration=5s`, `refundTimeout=60s`
**Initial liquidity**: 10 000 MON + 40 000 USDC
**Chain**: Monad testnet (chainId 10143)

End-to-end verified: real USDC ↔ MON swaps settle through the committee in ~5-7 seconds wall-clock, including client-side encryption.

---

## Architecture — Four Layers

Betex is a **stack of four independent layers**, each mappable to a part of the BTX paper:

```
┌─────────────────────────────────────────────────────────────────┐
│  UI  (Next.js 15 + wagmi + viem + RainbowKit)                   │
│  - client-side BTX encryption (@noble/curves)                   │
│  - live epoch timer, committee status, pool reserves            │
└─────────────────────────────────────────────────────────────────┘
                           │  submitEncryptedOrder(ct_1, ct_2, π, aes_ct, orderHash, amount, token)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  DEX  (Solidity — EncryptedPool + SealedAMM + tokens)           │
│  - epoch-based encrypted order book + escrow                    │
│  - hash-bound plaintext binding                                 │
│  - Fisher-Yates shuffle under blockhash seed                    │
│  - Uniswap V2-style AMM gated by `onlyPool` modifier            │
└─────────────────────────────────────────────────────────────────┘
                           │  combineAndVerify(epochId, V, ct1List, U)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  VERIFIER  (Solidity — BTXVerifier + SchnorrVerifier + BLS lib) │
│  - trusted-setup CRS (h_powers, pkCommitments, omega)           │
│  - aggregate pairing check via EIP-2537 PAIRING_CHECK           │
│  - Lagrange interpolation in Solidity (Fermat-inverse)          │
│  - per-order Schnorr NIZK verification                          │
└─────────────────────────────────────────────────────────────────┘
                           │  submitShare(epochId, nodeId, σ_j)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  COMMITTEE  (Node.js N=3 processes)                             │
│  - partialDecrypt: σ_j = Σ_{l∈U} τ^l_j · ct_{l,1}              │
│  - combiner (node 0): Lagrange + BDec2 + AES unwrap             │
│  - polls Monad RPC, submits shares on EpochClosed               │
└─────────────────────────────────────────────────────────────────┘
                           │  partial shares + decrypted batch
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  CRYPTO PRIMITIVES  (Pure-JS — js/lib/)                         │
│  - BLS12-381 via @noble/curves                                  │
│  - Schnorr NIZK (Fiat-Shamir + SHA-256)                         │
│  - Shamir secret sharing (Lagrange over Fr)                     │
│  - EIP-2537 byte encoders                                       │
│  - KEM-DEM wrapper (AES-256-GCM)                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Flow — One Swap, End to End

Below is the life cycle of a single swap from browser to AMM settlement. Numbers refer to the paper.

### 1. Key Generation (one-time, paper §5.2 — trusted dealer)

A dealer samples `τ ← Fr` and derives:
- **Encryption key** `ek = [[τ^(Bmax+1)]]_T ∈ GT` — public, embedded in the frontend.
- **Decryption commitments** `dk = { h_i = [[τ^i]]_2 }` for `i ∈ [1, 2·Bmax] \ {Bmax+1}` — the "punctured CRS" (§4.2). The middle power is **deliberately missing** — it's the structural hole that decryption needs τ to fill.
- **Shamir shares**: for each power i ∈ [1, Bmax], sample a fresh t-degree polynomial f_i with f_i(0) = τ^i, and hand each node j the vector `sk_j = (f_1(ω_j), ..., f_Bmax(ω_j))`.

τ is destroyed before the script exits. Nodes only know their shares.

### 2. Client-Side Encryption (paper §5.1 Enc)

A user who wants to swap `amountIn` of `tokenIn` for `tokenOut` with slippage tolerance `minAmountOut`, in the browser:

```
1.  Sample r ←$ Fr,  m ←$ GT
2.  ct_1 := r·G_1                                      ∈ G1         (BLS12-381)
3.  ct_2 := m · ek^r                                   ∈ Fp12 (GT)
4.  Schnorr NIZK π = (R, s) proving "I know r such that ct_1 = r·G_1"  (§4.3)
5.  AES key := SHA-256(Fp12.toBytes(m))
6.  aes_ct := AES-256-GCM-Encrypt(AES key, orderJSON)                   (KEM-DEM wrap)
7.  orderHash := keccak256(abi.encode(user, tokenIn, amountIn,
                                      tokenOut, minAmountOut, nonce))   (commitment)
```

All 7 steps run in the browser. `r`, `m`, `AES key`, `orderJSON` never leave the client. The user submits `(ct_1, ct_2, π, aes_ct, orderHash, amount, token)` on-chain.

### 3. On-Chain Escrow

`EncryptedPool.submitEncryptedOrder(...)`:
1. Verifies the Schnorr NIZK — cheap, single SHA-256 + G1 MSM via EIP-2537 (rejects junk before touching tokens, §4.3).
2. Pulls `amount` of `token` from the user via `SafeERC20.transferFrom` into the pool's escrow.
3. Appends the encrypted slot to `epochs[currentEpochId]`, emits `OrderSubmitted`.

**Visibility**: `amount` and `token` are plaintext on-chain (ERC-20 requires this to move tokens). Everything else — direction, target token, slippage, nonce, recipient — is encrypted. Observers see "this address deposited 20 USDC"; they cannot see what the user wants back.

### 4. Epoch Close + Committee Shares (paper §5.2 π-BDec1)

After `epochDuration = 5s`, any node calls `closeEpoch()`. The epoch freezes. Each node j independently computes:

```
σ_j := Σ_{l ∈ U} τ^l_j · ct_{l,1}     ∈ G1      (single G1 MSM; O(1) w.r.t. B in output)
```

where `U` is the set of orders whose Schnorr NIZK passed. **Each node broadcasts exactly one G1 point**, regardless of how many orders are in the batch — this is the paper's defining efficiency property.

### 5. Combiner Path (paper §5.2 π-BDec2 + aggregate verify)

Node 0 (designated combiner) waits for `t+1 = 2` shares to land on `BTXVerifier`. It:

1. **Lagrange interpolates in the exponent**:
   `σ := Σ_{j ∈ V} L_j · σ_j ∈ G1`, where `L_j = Π_{k ∈ V, k ≠ j} ω_k / (ω_k - ω_j)` is the Lagrange coefficient at X = 0.

2. **Runs BDec2 off-chain** (paper §4.4) on the punctured CRS:
   ```
   β_l  = e(σ, h_{Bmax-l+1})                              ∈ GT
   γ_l  = Σ_{i ∈ U, i ≠ l} e(ct_{i,1}, h_{Bmax-l+i+1})    ∈ GT
   m_l  = ct_{l,2} / (β_l / γ_l)
   ```
   The cross-term γ_l exploits the missing middle power of the CRS: all pairing-product terms cancel except the i=l term, leaving m_l exposed.

3. For each recovered m_l: derive AES key, decrypt `aes_ct`, parse the order JSON.
4. Submits the whole batch on-chain via `submitDecryptedBatch(epochId, decrypted, V)`.

### 6. On-Chain Verification + AMM Execution

`EncryptedPool.submitDecryptedBatch` is atomic:

1. **Hash binding**: for each revealed plaintext, check `keccak256(abi.encode(...)) == orderHash_l`. A malicious combiner cannot substitute plaintexts — the hash commitment is immutable from step 2.
2. **Aggregate pairing check** (paper §5 blue, optimistic path):
   ```
   Σ_{l ∈ U} e(ct_{l,1}, h_l)  +  e(σ, -G_2)  ==  1_GT
   ```
   One `PAIRING_CHECK` precompile call. If it fails, the whole batch reverts — refund path kicks in after `refundTimeout`.
3. **Fisher-Yates shuffle** of the decrypted order list:
   ```solidity
   uint256 seed = keccak256(
     abi.encode(blockhash(block.number - 1), block.prevrandao, epochId)
   );
   ```
4. Sequentially call `SealedAMM.swap(order)` for each slot in the shuffled order. If `actualOut < minAmountOut`, individual swap reverts and refunds that specific slot; others continue.

The entire step 6 happens in **one atomic transaction**. No external contract can interleave between reveal and settlement — and `SealedAMM` has an `onlyPool` modifier, so no bot can call the AMM directly.

---

## Why Sandwich Attacks Are Impossible Here

A sandwich needs three things:

| Attack Requirement | In classical DEX | In Betex |
|---|---|---|
| See the victim's **direction** | ✅ in plaintext | ❌ encrypted in `ct_1, ct_2, aes_ct` |
| Know the victim's **slippage tolerance** | ✅ in plaintext | ❌ encrypted |
| **Insert a tx before** the victim in block order | ✅ via gas priority | ❌ batch is atomic; AMM gated |

All three must hold. Betex breaks #2 and #3 unconditionally (#1 partially leaks in a 2-asset pool). A 1-asset production pool with wrapped deposits would break #1 too; that's a V2 refinement.

---

## Cryptographic Deep Dive

### Punctured CRS

The heart of BTX is the "punctured" common reference string (paper §4.2). A naive threshold IBE-style scheme would publish every power `[[τ^i]]_2` for i up to 2·Bmax. BTX omits exactly one: `[[τ^(Bmax+1)]]_2` is **not** in the public parameters; only `[[τ^(Bmax+1)]]_T` (i.e., `ek`) lives in the GT group.

This asymmetry is what makes decryption require τ:
- **Forward** (encrypt): `ct_2 = m · ek^r` needs `ek` only — public, anyone.
- **Backward** (decrypt): `m = ct_2 / (β_l / γ_l)`. The computation of β_l needs `σ = Σ τ^l · ct_{l,1}`, which requires `τ` (or Shamir shares of τ^l). The cross-term γ_l uses the *other* public h's but stops at the puncture.

The algebra: `β_l - γ_l` collapses to `[[r_l · τ^(Bmax+1)]]_T = r_l · ek`, independent of i ≠ l. Puncturing the middle power is what makes this cancellation land on exactly ek rather than a stray term. See paper §7 for full correctness proof.

### Shamir-over-τ-Powers (paper §5.2)

Instead of Shamir-sharing `τ` once and having each node compute `τ^l_j = (τ_j)^l`, BTX Shamir-shares each **power** `τ^i` independently. A fresh t-degree polynomial per power. Node j's share is a vector `sk_j = (τ^1_j, τ^2_j, ..., τ^Bmax_j)`.

Why? Because if you share τ once, `(τ_j)^l` is not a valid Shamir share of `τ^l` (polynomial operations don't distribute). Sharing each power gives Lagrange interpolation on the **exponents**:

```
τ^l = Σ_{j ∈ V} L_j(0) · τ^l_j    (t+1 nodes suffice)
```

And since the partial decryption is linear in τ^l_j:

```
σ = Σ_l τ^l · ct_{l,1} = Σ_l [Σ_j L_j · τ^l_j] · ct_{l,1} = Σ_j L_j · σ_j
```

The magic: σ_j's are computed independently, then combined linearly in G1. No interactive protocol needed.

### Schnorr NIZK Under AGM (paper §4.3, deviation)

The paper mandates a *simulation-extractable* NIZK to achieve CCA security. The textbook route is Fischlin's transformation, which is expensive: proofs are ~10× larger and verify ~10× slower.

Betex uses plain **Fiat-Shamir Schnorr** instead, leveraging Fuchsbauer-Kiltz-Loss 2018 — under the **Algebraic Group Model (AGM)**, Schnorr is zero-knowledge and simulation-extractable. AGM is the same assumption behind Groth16, PLONK, KZG, and most pairing-based SNARKs. It is a stronger assumption than the standard model but widely accepted in the Ethereum ecosystem.

The proof:
```
Prove(r, ct_1):
  k ←$ Fr;
  R  := k · G_1;
  c  := SHA-256(DOMAIN || G_1 || ct_1 || R) mod FR_ORDER;
  s  := k + c · r mod FR_ORDER;
  π  := (R, s)

Verify(ct_1, (R, s)):
  c  := SHA-256(DOMAIN || G_1 || ct_1 || R) mod FR_ORDER;
  assert s · G_1 == R + c · ct_1
```

Domain separator is `"BTX-SCHNORR-V1"`. Both JS prover and Solidity verifier hash identical 128-byte EIP-2537 uncompressed G1 encodings — byte-for-byte compatible.

### Aggregate Pairing Check (paper §5 blue path)

The natural verification — "each σ_j is what node j claimed" — costs *N × B* pairings. The paper's blue-path optimization is to check them **together** in a single pairing equation:

```
Σ_{l ∈ U} e(ct_{l,1}, h_l)  ·  e(σ, G_2)^{-1}  ==  1_GT
```

which reduces to `|U| + 1` pairings, packed into one `PAIRING_CHECK` precompile call (EIP-2537 addr 0x0f).

Betex implements only this optimistic path: any malicious partial causes the whole batch to revert, users refund. The pessimistic per-server check (paper §5, for identifying *which* node cheated) is roadmapped as V2.

### KEM-DEM Wrapper (deviation)

Paper talks about encrypting `m ∈ GT` directly. A real order is ~200 bytes of JSON; encoding that into a GT element is possible but wasteful. Betex uses a standard **KEM-DEM**:

- **KEM**: BTX encrypts a random `m ∈ GT` — purely crypto material.
- **DEM**: derive `AES-256 key = SHA-256(Fp12.toBytes(m))`, wrap the real order JSON with AES-256-GCM. Nonce(12) || ciphertext || tag(16).

`m` lives purely in the cryptographic path; the committee recovers it via BDec2 and feeds it to the AES decrypt. On-chain payload size stays bounded regardless of how complex the order struct gets.

---

## Deviations From the Paper

Betex is faithful to paper §4–§7. The following are explicit deviations, chosen for implementability within hackathon scope:

| Deviation | Tradeoff |
|---|---|
| **AGM-Schnorr** instead of Fischlin NIZK | CCA proof relies on AGM (same as all pairing-based SNARKs), not standard model. ~10× cheaper on-chain. |
| **Trusted dealer** instead of DKG | One-shot script samples τ, distributes Shamir shares, deletes τ. Production would use a KZG-style MPC ceremony. |
| **Optimistic-only robustness** | Aggregate pairing check reverts whole batch on any failure. Paper's pessimistic per-server fallback (identify which node cheated) is V2. |
| **Off-chain combiner** | β, γ, m_l computations happen in Node.js, contract only does hash binding + single `PAIRING_CHECK`. Paper is agnostic to this split. |
| **KEM-DEM wrapper** | BTX encrypts a random GT element; AES-GCM wraps the real order JSON. Keeps on-chain payload bounded. |
| **Bmax = 16** | Hackathon scope. Naive O(B²) cross-term is <1s. FFT acceleration (paper §6) not needed at this scale. |

---

## Repo Layout

```
betex/
├── js/                            Pure-JS BTX primitives
│   ├── lib/
│   │   ├── bls.js                 @noble/curves wrapper, Fr/Fp12/GT helpers
│   │   ├── btx-setup.js           single-server KeyGen (paper Fig. 2)
│   │   ├── btx-setup-threshold.js threshold KeyGen (paper Fig. 3)
│   │   ├── btx-encrypt.js         Enc(ek, m) + Schnorr NIZK attach
│   │   ├── btx-decrypt.js         BDec1 + BDec2 (naive O(B²))
│   │   ├── btx-decrypt-threshold.js  partialDecrypt + verifyShare + combine
│   │   ├── shamir.js              share + Lagrange over Fr
│   │   ├── schnorr.js             Fiat-Shamir with SHA-256 + domain sep
│   │   ├── eip2537.js             byte-exact G1/G2/Fr encoders
│   │   ├── aes.js                 AES-256-GCM wrapper (Node crypto)
│   │   └── order-codec.js         encryptOrder / decryptOrder + orderHash
│   ├── test/                      node:test suite (81 tests)
│   │   └── vectors/               cross-lang test fixtures
│   └── scripts/                   generate-{schnorr,eip2537}-vectors.js
│
├── contracts/                     Solidity (0.8.24, Cancun)
│   ├── lib/
│   │   ├── BLS12381.sol           EIP-2537 precompile wrappers (0x0b..0x11)
│   │   └── BLS12381Helpers.sol    byte-packing helpers for G1MSM / PAIRING_CHECK
│   ├── tokens/
│   │   ├── MockMON.sol            open-mint ERC-20 (18 dec)
│   │   └── MockUSDC.sol           open-mint ERC-20 (6 dec)
│   ├── SchnorrVerifier.sol        byte-identical with js/lib/schnorr.js
│   ├── BTXVerifier.sol            CRS storage + Lagrange + aggregate pairing
│   ├── EncryptedPool.sol          epoch book + escrow + Fisher-Yates + refund
│   ├── SealedAMM.sol              Uniswap V2 x·y=k gated by onlyPool
│   └── test-harness/              unit-test entry point for BLS lib
│
├── test/                          Hardhat tests (57 tests incl. FullPipeline)
│
├── decryptor/                     N=3 threshold committee
│   ├── node.js                    single daemon, NODE_ID from env
│   ├── lib/
│   │   ├── contracts.js           ethers + contract loaders
│   │   ├── epoch-fetch.js         paginated OrderSubmitted queries
│   │   ├── combiner.js            off-chain Lagrange + BDec2 + AES unwrap
│   │   └── rpc-retry.js           exponential backoff
│   └── scripts/
│       └── trusted-setup.js       one-shot τ generation + share distribution
│
├── scripts/
│   ├── full-deploy-local.cjs      trusted-setup + local deploy + frontend sync
│   ├── deploy-monad.cjs           Monad testnet deploy
│   ├── redeploy-dex.cjs           targeted AMM + Pool redeploy
│   ├── smoke-test.js              live end-to-end swap against Monad stack
│   └── manual-combine.cjs         one-shot combiner replay for missed epochs
│
└── frontend/                      Next.js 15 app (wagmi + viem + RainbowKit)
    └── app/
        ├── layout.tsx, providers.tsx
        ├── page.tsx               swap home
        ├── pool/, epochs/, faucet/
        ├── lib/                   mirrors js/lib for in-browser crypto
        └── components/            SwapCard, EpochTimer, CommitteeStatus, ...
```

---

## Quick Start

### Local (Hardhat)

Requires Node 20+.

```bash
git clone https://github.com/Muhammed5500/Betex.git
cd Betex
npm install
cd frontend && npm install && cd ..

npx hardhat --config hardhat.config.cjs node      # terminal A
npm run deploy:local                               # terminal B

npm run committee:0                                # terminal C (combiner)
npm run committee:1                                # terminal D
npm run committee:2                                # terminal E

cd frontend && npm run dev                         # terminal F
# open http://localhost:3000
```

### Monad testnet

```bash
# a. Offline on a secure machine — generate the trusted setup
npm run setup
# writes decryptor/config/public-params.json, deploy-params.json,
# and node{0,1,2}.env (each with a Shamir share — distribute out-of-band)

# b. Set in environment:
#    DEPLOYER_PRIVATE_KEY    deployer wallet (>= 5 MON)
#    NODE0_ADDRESS, NODE1_ADDRESS, NODE2_ADDRESS
#    MONAD_RPC_URL           (optional)
npm run deploy:monad
```

Each committee operator then copies their `decryptor/config/nodeK.env`, sets `PRIVATE_KEY`, and runs `node decryptor/node.js`.

---

## Testing

```bash
npm test          # 81 JS tests — BLS ops, BTX math, Shamir, Schnorr,
                  #               threshold roundtrip, AES, order codec
npm run test:sol  # 57 Hardhat tests — BLS12381, verifiers, pool, AMM,
                  #                    and the FullPipeline integration
```

**`FullPipeline`** integration test covers:
- Single-order happy path
- Multi-order epoch (B=4, randomized execution)
- 1 node offline → 2-of-3 still settles
- 2 nodes offline → combiner below threshold → user claimRefund after timeout

All 138 tests pass on Node 20 + Hardhat 2.28.

---

## Gas Footprint

| Operation | Gas |
|---|---|
| `submitEncryptedOrder` (incl. 1 Schnorr NIZK verify) | ~260k |
| `submitShare` per node | ~75k |
| `combineAndVerify` (B=1) | ~450k |
| `combineAndVerify` (B=8) | ~1.4M |
| `submitDecryptedBatch` (B=8, incl. AMM swaps) | ~2.4M |
| `BTXVerifier` constructor (one-time, Bmax=16) | ~18M |

All well within Monad's 30M block gas limit. The constructor is the single most expensive tx — it writes ~20 KB of CRS into contract storage. `deploy-monad.cjs` passes an explicit 25M gas limit.

---

## What's Next

- **Pessimistic robustness**: identify which node submitted a malicious σ_j instead of failing the whole batch.
- **Distributed key generation (DKG)**: replace trusted dealer with an interactive Pedersen-VSS ceremony — no single party ever holds τ.
- **FFT cross-term** (paper §6): O(B log B) instead of O(B²) BDec2 for larger batches.
- **Multi-asset pool**: hide swap direction (not just slippage) — requires wrapped deposit primitive.
- **Permit2 integration**: one-signature flow instead of approve + submit.
- **Pessimistic & private mempool**: optional Flashbots-style private submission path to remove the cross-venue arbitrage leak between committee reveal and AMM settlement.

---

## References

- **BTX paper** — Amit Agarwal, Sourav Das, Babak Poorebrahim Gilkalaye, Peter Rindal, Victor Shoup. *BTX: Simple and Efficient Batch Threshold Encryption*. Category Labs, 17 Apr 2026. [PDF](https://category-labs.github.io/category-research/BTX-paper.pdf)
- **AGM-Schnorr** — Fuchsbauer, Kiltz, Loss. *The Algebraic Group Model and its Applications*. CRYPTO 2018.
- **BLS12-381** — Barreto, Lynn, Scott. *Constructing Elliptic Curves with Prescribed Embedding Degrees*. 2002. Curve discovered in [this bls12-381 writeup](https://hackmd.io/@benjaminion/bls12-381).
- **EIP-2537** — *Precompile for BLS12-381 curve operations*. Live in Monad (MONAD_FOUR, 2025-10-14).
- **Fiat-Shamir transformation** — Fiat, Shamir. *How to Prove Yourself: Practical Solutions to Identification and Signature Problems*. CRYPTO 1986.
- **Shamir secret sharing** — Adi Shamir. *How to Share a Secret*. CACM 1979.
- **Encrypted mempool design space** — Ferveo, Shutter Network, Radius: complementary approaches to the same class of problems.

---

## License

MIT. See [LICENSE](LICENSE).

Built for the **Monad Kayseri 2026** hackathon by [@Muhammed5500](https://github.com/Muhammed5500).
