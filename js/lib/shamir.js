// Shamir secret sharing over the BLS12-381 scalar field Fr.
// Polynomial f(X) = secret + a_1·X + ... + a_t·X^t with random a_i ∈ Fr.
// Shares x_j = f(ω_j). Reconstruction uses Lagrange interpolation at X=0.

import { FR_ORDER, randomFr } from './bls.js';

const P = FR_ORDER;

function modNorm(x) {
  const r = x % P;
  return r < 0n ? r + P : r;
}

/**
 * Fermat's little theorem inverse: a^(p-2) mod p.
 */
function modInverse(a) {
  let base = modNorm(a);
  if (base === 0n) throw new Error('modInverse: 0 has no inverse');
  let exp = P - 2n;
  let result = 1n;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % P;
    exp >>= 1n;
    base = (base * base) % P;
  }
  return result;
}

/**
 * Horner evaluation of polynomial with coefficients [a_0, a_1, ..., a_t] at x.
 */
function polyEval(coeffs, x) {
  let result = 0n;
  const xN = modNorm(x);
  for (let i = coeffs.length - 1; i >= 0; i--) {
    result = (result * xN + coeffs[i]) % P;
  }
  return modNorm(result);
}

/**
 * Share a secret into N shares with corruption threshold t (reconstruct needs t+1).
 * @param {bigint} secret
 * @param {number} N
 * @param {number} t
 * @param {bigint[]} omega  evaluation domain, length N, distinct non-zero values
 * @returns {bigint[]} shares of length N
 */
export function share(secret, N, t, omega) {
  if (omega.length !== N) {
    throw new Error(`share: omega length ${omega.length} !== N ${N}`);
  }
  if (t < 0 || t >= N) {
    throw new Error(`share: t=${t} must be in [0, N-1]`);
  }
  // Sanity: ω must be distinct.
  const seen = new Set();
  for (const w of omega) {
    const k = (w % P).toString();
    if (seen.has(k)) throw new Error(`share: duplicate ω ${w}`);
    seen.add(k);
    if (modNorm(w) === 0n) throw new Error('share: ω contains 0');
  }

  const coeffs = [modNorm(secret)];
  for (let i = 0; i < t; i++) coeffs.push(randomFr());

  const shares = new Array(N);
  for (let j = 0; j < N; j++) shares[j] = polyEval(coeffs, omega[j]);
  return shares;
}

/**
 * Lagrange coefficients L_j for reconstructing f(0) from f(ω_j) at j ∈ V.
 * L_j = Π_{k ∈ V, k ≠ j} (-ω_k) / (ω_j - ω_k)  mod p
 * @param {number[]} V    0-indexed subset of [0, N)
 * @param {bigint[]} omega
 * @returns {bigint[]}    Lagrange coefficients, same order as V
 */
export function lagrange(V, omega) {
  const L = new Array(V.length);
  for (let i = 0; i < V.length; i++) {
    const j = V[i];
    let num = 1n;
    let den = 1n;
    for (let k = 0; k < V.length; k++) {
      if (k === i) continue;
      const jj = V[k];
      num = (num * modNorm(-omega[jj])) % P;
      den = (den * modNorm(omega[j] - omega[jj])) % P;
    }
    L[i] = (num * modInverse(den)) % P;
  }
  return L;
}

/**
 * Reconstruct secret = Σ_{j ∈ V} L_j · share[j].
 * @param {number[]} V         0-indexed subset
 * @param {bigint[]} shares    full share vector of length N; V selects which to use
 * @param {bigint[]} omega
 * @returns {bigint}
 */
export function reconstruct(V, shares, omega) {
  const L = lagrange(V, omega);
  let secret = 0n;
  for (let i = 0; i < V.length; i++) {
    secret = (secret + L[i] * shares[V[i]]) % P;
  }
  return modNorm(secret);
}
