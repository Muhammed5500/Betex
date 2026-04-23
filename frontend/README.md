# BTX-Monad Frontend

Next.js 15 + wagmi 2 + viem 2 + RainbowKit 2 UI for the encrypted DEX. All BTX
cryptography runs in the browser via `@noble/curves` BLS12-381; the byte
format is byte-for-byte compatible with the Solidity verifier (EIP-2537
128-byte uncompressed G1).

## Structure

```
app/
├── layout.tsx           — shell + header
├── page.tsx             — swap home
├── providers.tsx        — WagmiProvider + QueryClientProvider + RainbowKitProvider
├── globals.css          — Tailwind entry
├── pool/page.tsx        — AMM reserves + committee board
├── epochs/page.tsx      — live epoch + history
├── faucet/page.tsx      — MON / USDC self-mint
├── lib/
│   ├── chains.ts          Monad testnet / local hardhat
│   ├── contracts.ts       addresses (from env) + ABI subsets
│   ├── eip2537.ts         G1/G2/Fr ↔ EIP-2537 bytes (mirrors js/lib/eip2537.js)
│   ├── schnorr.ts         Schnorr Fiat-Shamir prove/verify
│   ├── aes.ts             Web Crypto AES-256-GCM (wire format = js/lib/aes.js)
│   ├── public-params.ts   /public-params.json loader (ek only)
│   └── btx-encrypt.ts     orderHash + AES wrap + BTX encrypt (mirrors order-codec.js)
└── components/          SwapCard, EpochTimer, PoolStats, CommitteeStatus,
                         EpochHistory, FaucetCard, WalletButton
```

## Setup

```bash
cd frontend
npm install
cp .env.local.example .env.local
# fill in contract addresses after running `npm run deploy:local` (or :monad)
# which also copies public-params.json into public/ automatically
npm run dev
# http://localhost:3000
```

## Environment

All `NEXT_PUBLIC_*` vars are baked in at build time. For Monad testnet the
default RPC and chain id are used if unset:

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_CHAIN_ID` | 10143 (Monad testnet) or 31337 (local hardhat) |
| `NEXT_PUBLIC_RPC_URL` | optional RPC override |
| `NEXT_PUBLIC_ENCRYPTED_POOL_ADDRESS` | `EncryptedPool` |
| `NEXT_PUBLIC_SEALED_AMM_ADDRESS` | `SealedAMM` |
| `NEXT_PUBLIC_BTX_VERIFIER_ADDRESS` | `BTXVerifier` |
| `NEXT_PUBLIC_SCHNORR_VERIFIER_ADDRESS` | `SchnorrVerifier` |
| `NEXT_PUBLIC_MOCK_MON_ADDRESS` | `MockMON` |
| `NEXT_PUBLIC_MOCK_USDC_ADDRESS` | `MockUSDC` |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | optional — enables WC v2 QR |

## Runtime requirements

- `public/public-params.json` must be present. The deploy script copies it
  automatically from `decryptor/config/public-params.json`.
- Browser must support BigInt, Web Crypto AES-GCM, `crypto.getRandomValues` —
  all evergreen browsers qualify.

## Swap flow

1. Allowance check → `approve(EncryptedPool, amountIn)` if needed.
2. `ek` fetched from `/public-params.json` (cached).
3. Client-side: sample `r ∈ Fr`, `m ∈ GT`; build `ct_1 = rG`, `ct_2 = m·ek^r`,
   Schnorr `π = (R, s)`, AES-GCM wrap `orderJson` under `SHA256(Fp12.toBytes(m))`.
4. `submitEncryptedOrder(...)` — Solidity verifies the NIZK and escrows the
   deposit token.
5. Epoch closes (default 10 s). Decryptor committee submits `σ_j`, combiner
   submits the decrypted batch; `SwapExecuted` fires.

Perceived latency on a commodity laptop: ~100 ms encrypt + ~400 ms tx + 10 s
epoch + a few seconds decrypt = well under 15 s end-to-end.
