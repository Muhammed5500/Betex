// Handwritten ABI subset matching contracts/ (EncryptedPool, SealedAMM, BTXVerifier,
// SchnorrVerifier, MockMON/USDC). Kept minimal — only the functions/events the
// frontend actually consumes.

const zero = '0x0000000000000000000000000000000000000000' as const;

// Next.js only inlines literal `process.env.NEXT_PUBLIC_*` accesses at build
// time — dynamic `process.env[key]` stays `undefined` on the client. Keep
// these references literal so the values reach the browser bundle.
export const ADDRESSES = {
  encryptedPool: (process.env.NEXT_PUBLIC_ENCRYPTED_POOL_ADDRESS ?? zero) as `0x${string}`,
  sealedAmm: (process.env.NEXT_PUBLIC_SEALED_AMM_ADDRESS ?? zero) as `0x${string}`,
  btxVerifier: (process.env.NEXT_PUBLIC_BTX_VERIFIER_ADDRESS ?? zero) as `0x${string}`,
  schnorrVerifier: (process.env.NEXT_PUBLIC_SCHNORR_VERIFIER_ADDRESS ?? zero) as `0x${string}`,
  mockMon: (process.env.NEXT_PUBLIC_MOCK_MON_ADDRESS ?? zero) as `0x${string}`,
  mockUsdc: (process.env.NEXT_PUBLIC_MOCK_USDC_ADDRESS ?? zero) as `0x${string}`,
} as const;

export const addressesConfigured = !Object.values(ADDRESSES).some((a) => a === zero);

export const ENCRYPTED_POOL_ABI = [
  {
    type: 'function',
    name: 'currentEpochId',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'epochs',
    stateMutability: 'view',
    inputs: [{ type: 'uint256' }],
    outputs: [
      { name: 'startTime', type: 'uint64' },
      { name: 'endTime', type: 'uint64' },
      { name: 'orderCount', type: 'uint32' },
      { name: 'closed', type: 'bool' },
      { name: 'executed', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'epochDuration',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'refundTimeout',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'tokenA',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'tokenB',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'orders',
    stateMutability: 'view',
    inputs: [
      { type: 'uint256' },
      { type: 'uint32' },
    ],
    outputs: [
      { name: 'user', type: 'address' },
      { name: 'depositToken', type: 'address' },
      { name: 'depositAmount', type: 'uint256' },
      { name: 'orderHash', type: 'bytes32' },
      { name: 'executed', type: 'bool' },
      { name: 'refunded', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'submitEncryptedOrder',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'ct_1', type: 'bytes' },
      { name: 'ct_2', type: 'bytes' },
      { name: 'pi_R', type: 'bytes' },
      { name: 'pi_s', type: 'bytes32' },
      { name: 'aes_ct', type: 'bytes' },
      { name: 'orderHash', type: 'bytes32' },
      { name: 'depositAmount', type: 'uint256' },
      { name: 'depositToken', type: 'address' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'claimRefund',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'epochId', type: 'uint256' },
      { name: 'orderIndex', type: 'uint32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'closeEpoch',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'event',
    name: 'EpochStarted',
    inputs: [
      { indexed: true, name: 'epochId', type: 'uint256' },
      { indexed: false, name: 'startTime', type: 'uint64' },
      { indexed: false, name: 'endTime', type: 'uint64' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'EpochClosed',
    inputs: [
      { indexed: true, name: 'epochId', type: 'uint256' },
      { indexed: false, name: 'orderCount', type: 'uint32' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'OrderSubmitted',
    inputs: [
      { indexed: true, name: 'epochId', type: 'uint256' },
      { indexed: true, name: 'orderIndex', type: 'uint32' },
      { indexed: true, name: 'user', type: 'address' },
      { indexed: false, name: 'ct_1', type: 'bytes' },
      { indexed: false, name: 'ct_2', type: 'bytes' },
      { indexed: false, name: 'pi_R', type: 'bytes' },
      { indexed: false, name: 'pi_s', type: 'bytes32' },
      { indexed: false, name: 'aes_ct', type: 'bytes' },
      { indexed: false, name: 'orderHash', type: 'bytes32' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'SwapExecuted',
    inputs: [
      { indexed: true, name: 'epochId', type: 'uint256' },
      { indexed: true, name: 'orderIndex', type: 'uint32' },
      { indexed: true, name: 'user', type: 'address' },
      { indexed: false, name: 'tokenIn', type: 'address' },
      { indexed: false, name: 'amountIn', type: 'uint256' },
      { indexed: false, name: 'tokenOut', type: 'address' },
      { indexed: false, name: 'amountOut', type: 'uint256' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'BatchExecuted',
    inputs: [
      { indexed: true, name: 'epochId', type: 'uint256' },
      { indexed: false, name: 'successCount', type: 'uint32' },
      { indexed: false, name: 'failCount', type: 'uint32' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'RefundClaimed',
    inputs: [
      { indexed: true, name: 'epochId', type: 'uint256' },
      { indexed: true, name: 'orderIndex', type: 'uint32' },
      { indexed: true, name: 'user', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' },
    ],
    anonymous: false,
  },
] as const;

export const SEALED_AMM_ABI = [
  {
    type: 'function',
    name: 'tokenA',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'tokenB',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'reserveA',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'reserveB',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getAmountOut',
    stateMutability: 'view',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'tokenIn', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
] as const;

export const BTX_VERIFIER_ABI = [
  {
    type: 'function',
    name: 'N',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'T_PLUS_1',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'hasSubmitted',
    stateMutability: 'view',
    inputs: [
      { type: 'uint256' },
      { type: 'uint8' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'isVerified',
    stateMutability: 'view',
    inputs: [{ type: 'uint256' }],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'event',
    name: 'ShareSubmitted',
    inputs: [
      { indexed: true, name: 'epochId', type: 'uint256' },
      { indexed: true, name: 'nodeId', type: 'uint8' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'BatchVerified',
    inputs: [
      { indexed: true, name: 'epochId', type: 'uint256' },
      { indexed: false, name: 'chosenV', type: 'uint8[]' },
    ],
    anonymous: false,
  },
] as const;

export const MINTABLE_ERC20_ABI = [
  {
    type: 'function',
    name: 'name',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'string' }],
  },
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'string' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { type: 'address' },
      { type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'mint',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

export type TokenKey = 'MON' | 'USDC';

export const TOKENS: Record<TokenKey, { address: `0x${string}`; decimals: number; symbol: string; faucetAmount: bigint }> = {
  MON: {
    address: ADDRESSES.mockMon,
    decimals: 18,
    symbol: 'MON',
    faucetAmount: 1_000n * 10n ** 18n,
  },
  USDC: {
    address: ADDRESSES.mockUsdc,
    decimals: 6,
    symbol: 'USDC',
    faucetAmount: 5_000n * 10n ** 6n,
  },
};

export function otherToken(t: TokenKey): TokenKey {
  return t === 'MON' ? 'USDC' : 'MON';
}
