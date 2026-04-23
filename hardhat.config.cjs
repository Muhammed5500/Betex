require('@nomicfoundation/hardhat-toolbox');
require('dotenv').config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
      evmVersion: 'cancun',
    },
  },
  paths: {
    sources: './contracts',
    tests: './test',
    artifacts: './artifacts',
    cache: './cache',
  },
  networks: {
    hardhat: {
      // EIP-2537 BLS12-381 precompiles were activated in Prague.
      // Hardhat's bundled EDR supports this hardfork; the local evm version
      // is set to cancun (the most recent feature-complete target in solc 0.8.24)
      // but the runtime needs Prague to expose 0x0b..0x11.
      hardfork: 'prague',
      chainId: 31337,
      // BTXVerifier constructor at Bmax=16 copies ~20 KB of h_powers +
      // pkCommitments into storage; default 16,777,216 block gas runs out.
      // Match Monad's 200M block limit so we deploy locally under prod-like caps.
      blockGasLimit: 200_000_000,
      gas: 30_000_000,
    },
    // Points at an externally-started `hardhat node`. Uses the default hardhat
    // mnemonic so that signers here match the accounts on the running node and
    // scripts can recover each committee node's private key deterministically.
    localhost: {
      url: 'http://127.0.0.1:8545',
      chainId: 31337,
      accounts: {
        mnemonic: 'test test test test test test test test test test test junk',
        path: "m/44'/60'/0'/0",
        initialIndex: 0,
        count: 20,
      },
    },
    monadTestnet: {
      url: process.env.MONAD_RPC_URL ?? 'https://testnet-rpc.monad.xyz',
      chainId: 10143,
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
  },
  mocha: {
    timeout: 120000,
  },
};
