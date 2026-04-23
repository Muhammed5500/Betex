'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatUnits, parseUnits } from 'viem';
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';

import { encryptOrder, type OrderData } from '../lib/btx-encrypt';
import {
  ADDRESSES,
  ENCRYPTED_POOL_ABI,
  MINTABLE_ERC20_ABI,
  SEALED_AMM_ABI,
  TOKENS,
  type TokenKey,
  addressesConfigured,
  otherToken,
} from '../lib/contracts';
import { getEK } from '../lib/public-params';

type Step = 'idle' | 'approving' | 'encrypting' | 'submitting' | 'confirming' | 'done' | 'error';

const TOKEN_COLOR: Record<TokenKey, string> = {
  MON: 'text-monToken',
  USDC: 'text-usdcToken',
};
const TOKEN_BG: Record<TokenKey, string> = {
  MON: 'bg-monToken/15 border-monToken/30',
  USDC: 'bg-usdcToken/15 border-usdcToken/30',
};

function randomNonce(): bigint {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let n = 0n;
  for (const b of bytes) n = (n << 8n) + BigInt(b);
  return n;
}

export function SwapCard() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const [tokenIn, setTokenIn] = useState<TokenKey>('USDC');
  const [amountStr, setAmountStr] = useState('');
  const [step, setStep] = useState<Step>('idle');
  const [message, setMessage] = useState<string>('');
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [lastSuccessTx, setLastSuccessTx] = useState<`0x${string}` | undefined>();

  const tokenOut = otherToken(tokenIn);
  const cfgIn = TOKENS[tokenIn];
  const cfgOut = TOKENS[tokenOut];

  const parsed = useMemo(() => {
    if (!amountStr) return 0n;
    try {
      return parseUnits(amountStr, cfgIn.decimals);
    } catch {
      return 0n;
    }
  }, [amountStr, cfgIn.decimals]);

  const { data: balance } = useReadContract({
    abi: MINTABLE_ERC20_ABI,
    address: cfgIn.address,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) && addressesConfigured, refetchInterval: 5_000 },
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    abi: MINTABLE_ERC20_ABI,
    address: cfgIn.address,
    functionName: 'allowance',
    args: address ? [address, ADDRESSES.encryptedPool] : undefined,
    query: { enabled: Boolean(address) && addressesConfigured },
  });

  const { data: amountOut } = useReadContract({
    abi: SEALED_AMM_ABI,
    address: ADDRESSES.sealedAmm,
    functionName: 'getAmountOut',
    args: parsed > 0n ? [parsed, cfgIn.address] : undefined,
    query: { enabled: addressesConfigured && parsed > 0n },
  });

  const { writeContractAsync: approveAsync } = useWriteContract();
  const { writeContractAsync: submitAsync } = useWriteContract();
  const { isSuccess: txConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (step === 'confirming' && txConfirmed && txHash) {
      // Immediate unlock: banner carries the success, button resets instantly.
      setLastSuccessTx(txHash);
      setStep('idle');
      setAmountStr('');
      setMessage('');
      setTxHash(undefined);
      const t = setTimeout(() => setLastSuccessTx(undefined), 12_000);
      return () => clearTimeout(t);
    }
  }, [step, txConfirmed, txHash]);

  // Dismiss success banner + clear error as soon as user starts typing again.
  useEffect(() => {
    if (amountStr !== '') {
      if (lastSuccessTx) setLastSuccessTx(undefined);
      if (step === 'error') {
        setStep('idle');
        setMessage('');
      }
    }
  }, [amountStr, lastSuccessTx, step]);

  async function handleSwap() {
    if (!address) return;
    if (!addressesConfigured) {
      setStep('error');
      setMessage('Contract addresses not configured.');
      return;
    }
    if (parsed <= 0n) return;
    if (balance !== undefined && parsed > (balance as bigint)) {
      setStep('error');
      setMessage(`Insufficient ${cfgIn.symbol} balance.`);
      return;
    }

    try {
      setMessage('');
      if ((allowance as bigint | undefined) === undefined || (allowance as bigint) < parsed) {
        setStep('approving');
        const approveHash = await approveAsync({
          abi: MINTABLE_ERC20_ABI,
          address: cfgIn.address,
          functionName: 'approve',
          args: [ADDRESSES.encryptedPool, parsed],
        });
        if (publicClient) {
          await publicClient.waitForTransactionReceipt({ hash: approveHash });
        }
        await refetchAllowance();
      }

      setStep('encrypting');
      const ek = await getEK();
      const nonce = randomNonce();
      const order: OrderData = {
        user: address,
        tokenIn: cfgIn.address,
        amountIn: parsed,
        tokenOut: cfgOut.address,
        minAmountOut: 0n,
        nonce,
      };
      const payload = await encryptOrder(order, ek);

      setStep('submitting');
      const submitHash = await submitAsync({
        abi: ENCRYPTED_POOL_ABI,
        address: ADDRESSES.encryptedPool,
        functionName: 'submitEncryptedOrder',
        args: [
          payload.ct_1,
          payload.ct_2,
          payload.pi_R,
          payload.pi_s,
          payload.aes_ct,
          payload.orderHash,
          parsed,
          cfgIn.address,
        ],
      });
      setTxHash(submitHash);
      setStep('confirming');
    } catch (err: unknown) {
      setStep('error');
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  const disabled = !isConnected || parsed <= 0n || step !== 'idle' || !addressesConfigured;

  const cta = !isConnected
    ? 'Connect wallet'
    : step === 'approving'
      ? `Approving ${cfgIn.symbol}…`
      : step === 'encrypting'
        ? 'Encrypting locally…'
        : step === 'submitting'
          ? 'Submitting encrypted order…'
          : step === 'confirming'
            ? 'Waiting for confirmation…'
            : 'Swap encrypted';

  return (
    <div className="rounded-lg border border-border bg-gradient-surface backdrop-blur-sm card-lift">
      <div className="flex items-center justify-between px-5 pt-5 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-gradient-cta flex items-center justify-center shadow-glow-purple">
            <LockIcon />
          </div>
          <h2 className="text-[15px] font-semibold">Encrypted Swap</h2>
        </div>
        <span className="text-[10px] px-2.5 py-1 rounded-full bg-purpleDim/40 border border-purpleDim text-purpleHi font-mono uppercase tracking-wider">
          2-of-3 · BTX
        </span>
      </div>

      <div className="px-5 pb-5 space-y-1">
        <FormRow
          label="Pay"
          token={tokenIn}
          amountStr={amountStr}
          balance={balance as bigint | undefined}
          onChangeAmount={setAmountStr}
          editable
        />

        <div className="flex justify-center -my-2.5 relative z-10">
          <button
            type="button"
            onClick={() => setTokenIn(tokenOut)}
            className="w-9 h-9 rounded-full border border-border bg-bg text-muted hover:text-text hover:border-purple hover:shadow-glow-purple flex items-center justify-center transition-all"
            aria-label="flip tokens"
          >
            <SwapIcon />
          </button>
        </div>

        <FormRow
          label="Receive (estimated)"
          token={tokenOut}
          amountStr={
            amountOut !== undefined ? formatUnits(amountOut as bigint, cfgOut.decimals) : ''
          }
          editable={false}
        />
      </div>

      <div className="px-5 pb-5">
        <button
          type="button"
          onClick={handleSwap}
          disabled={disabled}
          className="cta-glow w-full h-13 py-3.5 rounded-lg bg-gradient-cta hover:bg-gradient-cta-hover text-white font-semibold text-[15px] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          {cta}
        </button>

        {lastSuccessTx && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-success/30 bg-success/10 px-3 py-2.5 text-[12px]">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-1.5 h-1.5 rounded-full bg-success pulse-dot flex-shrink-0" />
              <span className="truncate">
                Order submitted — settling after this epoch closes
              </span>
            </div>
            <a
              href={`https://testnet.monadexplorer.com/tx/${lastSuccessTx}`}
              target="_blank"
              rel="noreferrer"
              className="flex-shrink-0 font-mono text-success hover:underline"
            >
              {lastSuccessTx.slice(0, 8)}↗
            </a>
          </div>
        )}

        {message && (
          <p className={`mt-3 text-xs ${step === 'error' ? 'text-danger' : 'text-mutedHi'}`}>
            {message}
          </p>
        )}

        {txHash && step === 'confirming' && (
          <p className="mt-3 text-xs font-mono text-muted">
            pending:{' '}
            <a
              href={`https://testnet.monadexplorer.com/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
              className="text-purple hover:text-purpleHi transition-colors"
            >
              {txHash.slice(0, 10)}…{txHash.slice(-8)} ↗
            </a>
          </p>
        )}
      </div>

      <div className="border-t border-border px-5 py-3 flex items-center gap-2 text-[11px] text-mutedHi leading-relaxed">
        <ShieldIcon />
        <span>
          Encrypted in your browser · BTX + AES-256-GCM · Schnorr NIZK binding · committee-revealed after epoch close
        </span>
      </div>
    </div>
  );
}

function FormRow({
  label,
  token,
  amountStr,
  balance,
  onChangeAmount,
  editable,
}: {
  label: string;
  token: TokenKey;
  amountStr: string;
  balance?: bigint;
  onChangeAmount?: (v: string) => void;
  editable: boolean;
}) {
  const cfg = TOKENS[token];
  return (
    <div className="rounded-lg border border-border bg-bg/60 p-4 hover:border-borderHi transition-colors">
      <div className="flex items-center justify-between text-[11px] text-muted mb-2.5">
        <span className="uppercase tracking-wider">{label}</span>
        {balance !== undefined && (
          <span className="font-mono">
            bal: {formatUnits(balance, cfg.decimals)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <input
          type="number"
          value={amountStr}
          disabled={!editable}
          onChange={(e) => onChangeAmount?.(e.target.value)}
          placeholder="0.0"
          className="flex-1 bg-transparent outline-none text-[30px] font-mono tracking-tight disabled:text-muted"
        />
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md border font-semibold text-sm ${TOKEN_BG[token]} ${TOKEN_COLOR[token]}`}
        >
          <TokenDot token={token} />
          {cfg.symbol}
        </div>
      </div>
    </div>
  );
}

function TokenDot({ token }: { token: TokenKey }) {
  const color = token === 'MON' ? 'bg-monToken' : 'bg-usdcToken';
  return <span className={`w-1.5 h-1.5 rounded-full ${color}`} />;
}

function SwapIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M7 3v14m0 0l-4-4m4 4l4-4M17 21V7m0 0l-4 4m4-4l4 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="5" y="11" width="14" height="10" rx="2" stroke="white" strokeWidth="2" />
      <path d="M8 11V7a4 4 0 018 0v4" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="flex-shrink-0 text-purple"
    >
      <path
        d="M12 2l8 3v6c0 5-3.5 9.5-8 11-4.5-1.5-8-6-8-11V5l8-3z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
