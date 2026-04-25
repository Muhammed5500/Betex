# Betex committee node — single image, one per committee member (NODE_ID=0,1,2).
# Railway / any container host injects secrets via env vars; no .env file needed.
#
# Required env:  NODE_ID, SHAMIR_SHARE, PRIVATE_KEY, RPC_URL,
#                ENCRYPTED_POOL_ADDRESS, BTX_VERIFIER_ADDRESS, SCHNORR_VERIFIER_ADDRESS
# Optional:      POLL_INTERVAL_MS (default 2000), BTX_BOOT_LOOKBACK_BLOCKS (default 5000)

FROM node:20-alpine

# tini = proper PID 1 (signal handling); build tools for any native modules.
RUN apk add --no-cache tini git python3 make g++

WORKDIR /app

# Install dependencies first — changes rarely, cached layer.
COPY package.json package-lock.json ./
RUN npm ci

# Compile Solidity so decryptor/lib/contracts.js can load ABIs from
# artifacts/. artifacts/ is gitignored, so we always build fresh.
COPY contracts/ ./contracts/
COPY hardhat.config.cjs ./
RUN npx hardhat compile --config hardhat.config.cjs

# Runtime code.
COPY decryptor/ ./decryptor/
COPY js/ ./js/

ENV NODE_ENV=production \
    POLL_INTERVAL_MS=2000 \
    NODE_OPTIONS="--max-old-space-size=384"

# PID 1 must forward SIGTERM/SIGINT to node so restarts are clean.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "decryptor/node.js"]
