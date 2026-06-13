'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatEther, formatUnits, parseEther, parseUnits } from 'viem';
import {
  useAccount,
  useBalance,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';

import {
  ADDRESSES,
  ERC20_ABI,
  TOKENS,
  WMON_ABI,
  addressesConfigured,
} from '../lib/contracts';

const CIRCLE_FAUCET_URL = 'https://faucet.circle.com/';
const MONAD_FAUCET_URL = 'https://testnet.monad.xyz/';

export function FaucetCard() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-4">
        <ExternalFaucet
          symbol="USDC"
          href={CIRCLE_FAUCET_URL}
          description="Circle's official testnet faucet. Pick Monad in the chain selector."
        />
        <ExternalFaucet
          symbol="MON"
          href={MONAD_FAUCET_URL}
          description="Monad testnet faucet for native MON. Used for gas and for wrapping into WMON."
        />
      </div>
      <div className="space-y-4">
        <WrapCard />
        <UnwrapCard />
      </div>
    </div>
  );
}

function ExternalFaucet({
  symbol,
  href,
  description,
}: {
  symbol: string;
  href: string;
  description: string;
}) {
  const { address } = useAccount();
  const balance = useTokenBalance(symbol);

  return (
    <div className="rounded-xl border border-border bg-surface shadow-soft p-5">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-sm font-medium text-text">Get {symbol}</div>
        {address && balance && (
          <div className="text-xs font-mono text-muted">{balance}</div>
        )}
      </div>
      <p className="text-xs text-muted leading-relaxed mb-4">{description}</p>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="focus-ring inline-flex items-center gap-2 px-4 h-10 text-sm rounded-lg border border-border bg-surfaceWarm hover:border-borderHi transition-colors text-text"
      >
        Open faucet ↗
      </a>
    </div>
  );
}

function WrapCard() {
  const { address } = useAccount();
  const [amount, setAmount] = useState('');
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();

  const native = useBalance({
    address,
    query: { enabled: Boolean(address), refetchInterval: 15_000 },
  });
  const { data: wmonBalance, refetch: refetchWmon } = useReadContract({
    abi: ERC20_ABI,
    address: ADDRESSES.wmon,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) && addressesConfigured, refetchInterval: 15_000 },
  });

  const parsed = useMemo(() => {
    if (!amount) return 0n;
    try {
      return parseEther(amount);
    } catch {
      return 0n;
    }
  }, [amount]);

  const { writeContractAsync, isPending } = useWriteContract();
  const { isLoading: isMining, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (isSuccess) {
      setAmount('');
      setTxHash(undefined);
      refetchWmon();
      native.refetch();
    }
  }, [isSuccess, native, refetchWmon]);

  async function wrap() {
    if (!address || parsed <= 0n) return;
    const hash = await writeContractAsync({
      abi: WMON_ABI,
      address: ADDRESSES.wmon,
      functionName: 'deposit',
      value: parsed,
    });
    setTxHash(hash);
  }

  const busy = isPending || isMining;
  const insufficient = native.data && parsed > native.data.value;
  const cta = !address
    ? 'Connect wallet'
    : busy
      ? 'Wrapping…'
      : insufficient
        ? 'Insufficient MON'
        : 'Wrap to WMON';

  return (
    <div className="rounded-xl border border-border bg-surface shadow-soft p-5">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-sm font-medium text-text">Wrap MON → WMON</div>
        <div className="text-xs font-mono text-muted">
          {wmonBalance !== undefined
            ? `${formatUnits(wmonBalance as bigint, 18)} WMON`
            : '—'}
        </div>
      </div>
      <p className="text-xs text-muted leading-relaxed mb-4">
        Native MON is not ERC-20. Wrap it to WMON to swap on Betex. 1:1, no fee.
      </p>
      <div className="rounded-lg border border-border bg-surfaceWarm p-3 mb-3">
        <div className="flex items-center justify-between text-xs text-muted mb-1.5">
          <span>Amount</span>
          {native.data && (
            <span className="font-mono">{formatEther(native.data.value)} MON</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.0"
            className="flex-1 bg-transparent outline-none text-xl font-mono tracking-tight"
          />
          <span className="text-sm text-text">MON</span>
        </div>
      </div>
      <button
        type="button"
        onClick={wrap}
        disabled={!address || busy || parsed <= 0n || Boolean(insufficient)}
        className="focus-ring w-full h-10 text-sm rounded-lg bg-text text-bg font-medium hover:bg-textHi disabled:opacity-40 disabled:cursor-not-allowed transition-all"
      >
        {cta}
      </button>
    </div>
  );
}

function UnwrapCard() {
  const { address } = useAccount();
  const [amount, setAmount] = useState('');
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();

  const { data: wmonBalance, refetch: refetchWmon } = useReadContract({
    abi: ERC20_ABI,
    address: ADDRESSES.wmon,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) && addressesConfigured, refetchInterval: 15_000 },
  });

  const parsed = useMemo(() => {
    if (!amount) return 0n;
    try {
      return parseUnits(amount, 18);
    } catch {
      return 0n;
    }
  }, [amount]);

  const { writeContractAsync, isPending } = useWriteContract();
  const { isLoading: isMining, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (isSuccess) {
      setAmount('');
      setTxHash(undefined);
      refetchWmon();
    }
  }, [isSuccess, refetchWmon]);

  async function unwrap() {
    if (!address || parsed <= 0n) return;
    const hash = await writeContractAsync({
      abi: WMON_ABI,
      address: ADDRESSES.wmon,
      functionName: 'withdraw',
      args: [parsed],
    });
    setTxHash(hash);
  }

  const busy = isPending || isMining;
  const insufficient = wmonBalance !== undefined && parsed > (wmonBalance as bigint);
  const cta = !address
    ? 'Connect wallet'
    : busy
      ? 'Unwrapping…'
      : insufficient
        ? 'Insufficient WMON'
        : 'Unwrap to MON';

  return (
    <div className="rounded-xl border border-border bg-surface shadow-soft p-5">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-sm font-medium text-text">Unwrap WMON → MON</div>
      </div>
      <p className="text-xs text-muted leading-relaxed mb-4">
        Convert WMON back to native MON for gas or transfers.
      </p>
      <div className="rounded-lg border border-border bg-surfaceWarm p-3 mb-3">
        <div className="flex items-center justify-between text-xs text-muted mb-1.5">
          <span>Amount</span>
          {wmonBalance !== undefined && (
            <span className="font-mono">
              {formatUnits(wmonBalance as bigint, 18)} WMON
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.0"
            className="flex-1 bg-transparent outline-none text-xl font-mono tracking-tight"
          />
          <span className="text-sm text-text">WMON</span>
        </div>
      </div>
      <button
        type="button"
        onClick={unwrap}
        disabled={!address || busy || parsed <= 0n || Boolean(insufficient)}
        className="focus-ring w-full h-10 text-sm rounded-lg border border-border bg-surfaceWarm hover:border-borderHi text-text disabled:opacity-40 disabled:cursor-not-allowed transition-all"
      >
        {cta}
      </button>
    </div>
  );
}

function useTokenBalance(symbol: string): string | null {
  const { address } = useAccount();
  const cfg = symbol === 'USDC' ? TOKENS.USDC : TOKENS.MON;
  const isNativeMon = symbol === 'MON';

  const native = useBalance({
    address,
    query: { enabled: Boolean(address) && isNativeMon, refetchInterval: 15_000 },
  });
  const { data: erc20Bal } = useReadContract({
    abi: ERC20_ABI,
    address: cfg.address,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address) && addressesConfigured && !isNativeMon,
      refetchInterval: 15_000,
    },
  });

  if (!address) return null;
  if (isNativeMon) {
    return native.data ? `${formatEther(native.data.value)} MON` : '—';
  }
  return erc20Bal !== undefined
    ? `${formatUnits(erc20Bal as bigint, cfg.decimals)} ${cfg.symbol}`
    : '—';
}
