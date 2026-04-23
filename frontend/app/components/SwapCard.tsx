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
    if (step === 'confirming' && txConfirmed) {
      setStep('done');
      setMessage(`Order accepted. It will settle after the current epoch closes.`);
      setAmountStr('');
      const t = setTimeout(() => setStep('idle'), 6_000);
      return () => clearTimeout(t);
    }
  }, [step, txConfirmed]);

  async function handleSwap() {
    if (!address) return;
    if (!addressesConfigured) {
      setStep('error');
      setMessage('Contract addresses not configured. Check .env.local.');
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
        // Wait inline so we don't race the submit tx against the approve mine.
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

  const cta =
    step === 'approving'
      ? `Approving ${cfgIn.symbol}…`
      : step === 'encrypting'
        ? 'Encrypting (BTX)…'
        : step === 'submitting'
          ? 'Submitting encrypted order…'
          : step === 'confirming'
            ? 'Waiting for confirmation…'
            : step === 'done'
              ? 'Order submitted ✓'
              : !isConnected
                ? 'Connect wallet'
                : 'Swap Securely';

  return (
    <div className="rounded-2xl border border-btx-border bg-btx-panel p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Encrypted Swap</h2>
        <span className="text-xs px-2 py-0.5 rounded-full bg-btx-accentDim/30 text-btx-accent">
          BTX · 2-of-3 threshold
        </span>
      </div>

      <div className="space-y-2">
        <FormRow
          label="You pay"
          token={tokenIn}
          amountStr={amountStr}
          balance={balance as bigint | undefined}
          onChangeAmount={setAmountStr}
          onToggleToken={() => setTokenIn(tokenOut)}
          editable
        />

        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setTokenIn(tokenOut)}
            className="w-8 h-8 rounded-full border border-btx-border bg-btx-bg text-btx-muted hover:text-white"
            aria-label="flip tokens"
          >
            ⇅
          </button>
        </div>

        <FormRow
          label="You receive (estimated)"
          token={tokenOut}
          amountStr={
            amountOut !== undefined ? formatUnits(amountOut as bigint, cfgOut.decimals) : ''
          }
          editable={false}
        />
      </div>

      <button
        type="button"
        onClick={handleSwap}
        disabled={disabled}
        className="mt-4 w-full py-3 rounded-xl bg-btx-accent text-btx-bg font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {cta}
      </button>

      {message && (
        <p
          className={`mt-3 text-xs ${
            step === 'error' ? 'text-btx-danger' : 'text-btx-muted'
          }`}
        >
          {message}
        </p>
      )}

      {txHash && (step === 'confirming' || step === 'done') && (
        <p className="mt-2 text-xs text-btx-muted break-all">
          tx:&nbsp;
          <a
            href={`https://testnet.monadexplorer.com/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono"
          >
            {txHash}
          </a>
        </p>
      )}

      <div className="mt-4 text-xs text-btx-muted">
        Order is encrypted in your browser (BTX + AES-256-GCM), committed on-chain with a Schnorr NIZK, and
        decrypted by the committee only after the epoch closes.
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
  onToggleToken: _onToggleToken,
  editable,
}: {
  label: string;
  token: TokenKey;
  amountStr: string;
  balance?: bigint;
  onChangeAmount?: (v: string) => void;
  onToggleToken?: () => void;
  editable: boolean;
}) {
  const cfg = TOKENS[token];
  return (
    <div className="rounded-xl bg-btx-bg/40 border border-btx-border p-3">
      <div className="text-xs text-btx-muted mb-1">{label}</div>
      <div className="flex items-center gap-3">
        <input
          type="number"
          value={amountStr}
          disabled={!editable}
          onChange={(e) => onChangeAmount?.(e.target.value)}
          placeholder="0"
          className="flex-1 bg-transparent outline-none text-2xl font-mono text-white disabled:text-btx-muted"
        />
        <div className="px-3 py-1.5 rounded-md bg-btx-panel border border-btx-border font-mono text-sm">
          {cfg.symbol}
        </div>
      </div>
      {balance !== undefined && (
        <div className="mt-1 text-xs text-btx-muted">
          Balance: {formatUnits(balance, cfg.decimals)} {cfg.symbol}
        </div>
      )}
    </div>
  );
}

