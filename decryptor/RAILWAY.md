# Running a Betex committee node on Railway

One Railway service per node (0, 1, 2). Same Docker image, different env vars.

## One-time setup (you)

1. Run the trusted setup **offline**:
   ```bash
   npm run setup
   ```
   Produces `decryptor/config/node0.env`, `node1.env`, `node2.env`,
   `public-params.json`, `deploy-params.json`. Keep the three `node*.env`
   files secret. `public-params.json` is safe to commit and ship in the
   frontend bundle.

2. Deploy contracts on Monad testnet:
   ```bash
   npm run deploy:monad
   ```
   Writes contract addresses back into each `nodeK.env`.

## Creating a Railway service

Per node, create a new service in the same Railway project:

- **Source**: GitHub repo (or Railway CLI deploy)
- **Dockerfile path**: `./Dockerfile` (repo root)
- **Root directory**: `/`
- **Restart policy**: `ON_FAILURE`
- **Memory**: 512 MB  ·  **CPU**: 0.5 vCPU

## Environment variables (per service)

Open the service → Variables → paste. Values come from the matching
`decryptor/config/nodeK.env` file you generated.

| Var | Example | Notes |
|---|---|---|
| `NODE_ID` | `0`, `1`, or `2` | Unique per service |
| `SHAMIR_SHARE` | comma-separated hex | **Secret** — never log |
| `PRIVATE_KEY` | `0x…` | EOA for gas; fund with ~1 MON |
| `RPC_URL` | `https://…` | Use a **dedicated** RPC, not the public endpoint |
| `ENCRYPTED_POOL_ADDRESS` | `0x3c36…` | Same across all 3 services |
| `BTX_VERIFIER_ADDRESS` | `0x3850…` | Same across all 3 services |
| `SCHNORR_VERIFIER_ADDRESS` | `0xD93A…` | Same across all 3 services |
| `POLL_INTERVAL_MS` | `2000` | Optional (default 2000) |
| `BTX_BOOT_LOOKBACK_BLOCKS` | `5000` | Optional (default 5000 ≈ 33 min on Monad) |

## Dedicated RPC

The public Monad endpoint (`testnet-rpc.monad.xyz`) rate-limits to ~50
requests/second across all callers. Three committee nodes polling every 2s
will hit the cap during epoch bursts. Use one of:

- **QuickNode** (Monad testnet endpoints, free tier)
- **Alchemy** (when Monad is added)
- Self-hosted Monad RPC

Give each node a **distinct** endpoint if your provider supports it —
rate-limit isolation keeps one noisy node from starving the others.

## Verifying

After deploy, logs should show within ~10s of the first swap:

```
[node0] online  rpc=…  pool=…  poll=2000ms
[node0] epoch 1: |U|=1, submitting σ_0
[node0] σ_0 submitted (tx 0x…)
[combiner] epoch 1 finalized: V=[0,1] decrypted=1 tx=0x…
```

## Liveness notes

- `closeEpoch()` is called by **any** node whose poll detects an expired
  epoch. Nodes 1 and 2 wait 400 ms × NODE_ID before trying, so node 0 wins
  under normal conditions but others step in if node 0 is down.
- The combiner role (assembling shares, submitting decrypted batch) is
  still only performed by NODE_ID=0. If node 0 stays down past
  `refundTimeout` (60 s), pending orders can be refunded via
  `claimRefund(epochId)`.
- Failed combines (e.g. bad σ_j) cause the whole batch to revert —
  pessimistic identification of the bad node is V2.
