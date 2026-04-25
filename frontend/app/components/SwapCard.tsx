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
import { SwapTimeline } from './SwapTimeline';

type Step = 'idle' | 'approving' | 'encrypting' | 'submitting' | 'confirming' | 'done' | 'error';

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
    query: { enabled: Boolean(address) && addressesConfigured, refetchInterval: 15_000 },
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
      setLastSuccessTx(txHash);
      setStep('idle');
      setAmountStr('');
      setMessage('');
      setTxHash(undefined);
      const t = setTimeout(() => setLastSuccessTx(undefined), 12_000);
      return () => clearTimeout(t);
    }
  }, [step, txConfirmed, txHash]);

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
        ? 'Encrypting…'
        : step === 'submitting'
          ? 'Submitting…'
          : step === 'confirming'
            ? 'Waiting for confirmation…'
            : 'Swap';

  return (
    <div className="rounded-xl border border-border bg-surface shadow-soft hover:shadow-soft-lg transition-shadow duration-500 ease-paper">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <h2 className="text-sm font-medium text-text">Encrypted Swap</h2>
        <span className="text-eyebrow uppercase text-muted font-mono">2-of-3 · BTX</span>
      </div>

      <div className="px-5 py-5 space-y-1">
        <FormRow
          label="Pay"
          token={tokenIn}
          amountStr={amountStr}
          balance={balance as bigint | undefined}
          onChangeAmount={setAmountStr}
          editable
        />

        <div className="flex justify-center -my-2 relative z-10">
          <button
            type="button"
            onClick={() => setTokenIn(tokenOut)}
            className="focus-ring w-9 h-9 rounded-full border border-border bg-surface shadow-soft text-muted hover:text-text hover:border-borderHi flex items-center justify-center transition-all duration-300 ease-paper hover:scale-105"
            aria-label="flip tokens"
          >
            <SwapIcon />
          </button>
        </div>

        <FormRow
          label="Receive"
          token={tokenOut}
          amountStr={
            amountOut !== undefined ? formatUnits(amountOut as bigint, cfgOut.decimals) : ''
          }
          editable={false}
        />
      </div>

      <div className="px-5 pb-5 space-y-3">
        {step !== 'idle' && step !== 'error' && <SwapTimeline step={step} />}

        <button
          type="button"
          onClick={handleSwap}
          disabled={disabled}
          className="focus-ring w-full h-12 rounded-lg bg-text hover:bg-textHi text-bg font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-300 ease-paper shadow-soft hover:shadow-soft-lg active:translate-y-px"
        >
          {cta}
        </button>

        {lastSuccessTx && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surfaceWarm px-3 py-2.5 text-xs text-mutedHi">
            <span className="flex items-center gap-2 min-w-0">
              <span className="w-1.5 h-1.5 rounded-full bg-success live-dot shrink-0" />
              <span className="truncate">Order submitted. Settling after epoch close.</span>
            </span>
            <a
              href={`https://testnet.monadexplorer.com/tx/${lastSuccessTx}`}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 font-mono text-text hover:text-purple transition-colors"
            >
              {lastSuccessTx.slice(0, 8)} →
            </a>
          </div>
        )}

        {message && (
          <p className={`text-xs ${step === 'error' ? 'text-danger' : 'text-muted'}`}>
            {message}
          </p>
        )}

        {txHash && step === 'confirming' && (
          <p className="text-xs font-mono text-muted">
            pending:{' '}
            <a
              href={`https://testnet.monadexplorer.com/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
              className="text-text hover:text-purple transition-colors"
            >
              {txHash.slice(0, 10)}…{txHash.slice(-8)} →
            </a>
          </p>
        )}
      </div>

      <div className="border-t border-border px-5 py-3 text-xs text-muted leading-relaxed">
        Encrypted with BTX + AES-256-GCM. Schnorr NIZK binds the ciphertext to
        your wallet. Revealed only after the committee combines shares.
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
    <div className="rounded-lg border border-border bg-surfaceWarm p-4 transition-colors duration-300 ease-paper hover:border-borderHi">
      <div className="flex items-center justify-between text-xs text-muted mb-2">
        <span>{label}</span>
        {balance !== undefined && (
          <span className="font-mono">Balance {formatUnits(balance, cfg.decimals)}</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <input
          type="number"
          value={amountStr}
          disabled={!editable}
          onChange={(e) => onChangeAmount?.(e.target.value)}
          placeholder="0.0"
          className="flex-1 bg-transparent outline-none text-2xl font-mono tracking-tight disabled:text-muted"
        />
        <div className="text-sm font-medium text-text">{cfg.symbol}</div>
      </div>
    </div>
  );
}

function SwapIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
      <path
        d="M7 3v14m0 0l-4-4m4 4l4-4M17 21V7m0 0l-4 4m4-4l4 4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
