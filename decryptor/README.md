# BTX Decryptor Committee

Three-node threshold decryption committee for the BTX encrypted DEX. Each node
holds a Shamir share of the master secret τ. Any 2 of 3 can collectively
decrypt a batch; no single node can.

## Quick Start

```bash
# 1. Trusted setup (run once — generates shares + public params)
node decryptor/scripts/trusted-setup.js

# 2. Start a local Hardhat node (separate terminal)
npx hardhat --config hardhat.config.cjs node

# 3. Deploy all contracts and patch config files
npm run deploy:local   # or deploy:monad for the testnet

# 4. Start each node in its own terminal
node --env-file decryptor/config/node0.env decryptor/node.js   # combiner
node --env-file decryptor/config/node1.env decryptor/node.js
node --env-file decryptor/config/node2.env decryptor/node.js
```

## Files

| Path | Purpose |
|---|---|
| `scripts/trusted-setup.js` | Generates τ, Shamir-shares it, writes `config/node*.env` + `config/public-params.json` + `config/deploy-params.json`, destroys τ |
| `lib/contracts.js` | ethers loader + Contract instances |
| `lib/epoch-fetch.js` | Pulls `OrderSubmitted` events and reconstructs `(ct_1, ct_2, π, aes_ct)` |
| `lib/combiner.js` | Off-chain `combine()`, AES unwrap, `submitDecryptedBatch` |
| `node.js` | Unified daemon. `NODE_ID=0` acts as combiner |

## Threat Model

- ≤ t = 1 malicious node → batch privacy preserved.
- ≥ t+1 = 2 honest nodes online → liveness.
- Tampered σ_j → aggregate pairing check on-chain reverts → batch aborted → refund after 60 s.
- Trusted setup currently uses a single dealer. Production would use a KZG-style multi-party ceremony.

## Files Under `config/` (generated — do NOT commit)

- `node0.env`, `node1.env`, `node2.env` — Shamir shares (secret per operator)
- `public-params.json` — ek, dk, pkCommitments, omega (public; frontend consumes this)
- `deploy-params.json` — exact bytes for `BTXVerifier` constructor
- `addresses.json` — contract addresses after deploy

## Why `node.js` polls instead of using `ethers.Contract.on(...)`

Event subscription over WebSocket requires a provider that supports
`eth_subscribe`. JSON-RPC polling (every 2 s) works on any node — simpler and
more robust for the hackathon. Production should swap to WebSocket.
