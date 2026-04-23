// Transient-error retry wrapper for ethers calls over public Monad RPC.
// The free endpoint (15 req/s) drops requests as "could not coalesce error"
// or plain timeouts when hit too hard; these are retryable.

const TRANSIENT = [
  'could not coalesce',
  'missing revert data',
  'server error',
  'rate limit',
  'ETIMEDOUT',
  'ECONNRESET',
  'EAI_AGAIN',
];

function isTransient(err) {
  const msg = (err?.shortMessage ?? err?.message ?? '').toLowerCase();
  return TRANSIENT.some((t) => msg.includes(t.toLowerCase()));
}

/**
 * Retry an async function against transient RPC errors.
 * Uses exponential backoff with jitter.
 */
export async function rpcRetry(fn, { attempts = 4, baseDelayMs = 300 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransient(err) || i === attempts - 1) throw err;
      const delay = baseDelayMs * 2 ** i + Math.random() * baseDelayMs;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
