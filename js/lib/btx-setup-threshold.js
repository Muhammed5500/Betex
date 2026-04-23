// Threshold BTX KeyGen (Paper Figure 3).
// For each power τ^i (i ∈ [1, Bmax]) a FRESH Shamir polynomial is sampled and
// N shares are produced. Each server j holds sk_j = (τ^1_j, ..., τ^Bmax_j).
//
// Public outputs:
//   ek = [[τ^(Bmax+1)]]_T              (encryption key, GT)
//   dk = { h_i = [[τ^i]]_2 }            (punctured CRS, G2)
//   pkCommitments[j][i-1] = [[τ^i_j]]_2  (per-share commitments, for aggregate check)
//   omega = evaluation domain           (defaults to [1, 2, ..., N])

import { G1, Fp12, pairing, g2Mul, randomFr, powerTable, FR_ORDER } from './bls.js';
import { share } from './shamir.js';

/**
 * Threshold KeyGen.
 * @param {number} Bmax
 * @param {number} N
 * @param {number} t
 * @param {bigint[]} [omega]  optional custom evaluation domain
 */
export function keyGenThreshold(Bmax, N, t, omega = null) {
  if (!Number.isInteger(Bmax) || Bmax < 1) throw new Error(`Bmax=${Bmax} invalid`);
  if (!Number.isInteger(N) || N < 2) throw new Error(`N=${N} invalid`);
  if (!Number.isInteger(t) || t < 1 || t >= N) throw new Error(`t=${t} invalid for N=${N}`);

  const omegaArr = omega
    ? omega.map((w) => (w % FR_ORDER + FR_ORDER) % FR_ORDER)
    : Array.from({ length: N }, (_, j) => BigInt(j + 1));

  const tau = randomFr();
  const powers = powerTable(tau, 2 * Bmax); // powers[i-1] = τ^i

  // Shamir-share each power separately.
  // sharesByPower[i-1][j] = τ^i_j
  const sharesByPower = new Array(Bmax);
  for (let i = 1; i <= Bmax; i++) {
    sharesByPower[i - 1] = share(powers[i - 1], N, t, omegaArr);
  }

  // sk[j][i-1] = τ^i_j  (each server's vector of length Bmax)
  const sk = new Array(N);
  for (let j = 0; j < N; j++) {
    const sk_j = new Array(Bmax);
    for (let i = 0; i < Bmax; i++) sk_j[i] = sharesByPower[i][j];
    sk[j] = sk_j;
  }

  // Public dk (same as single-server, punctured at Bmax+1).
  const dk = new Array(2 * Bmax + 1).fill(null);
  for (let i = 1; i <= 2 * Bmax; i++) {
    if (i === Bmax + 1) continue;
    dk[i] = g2Mul(powers[i - 1]);
  }

  // pkCommitments[j][i-1] = [[τ^i_j]]_2.
  const pkCommitments = new Array(N);
  for (let j = 0; j < N; j++) {
    const pk_j = new Array(Bmax);
    for (let i = 0; i < Bmax; i++) pk_j[i] = g2Mul(sharesByPower[i][j]);
    pkCommitments[j] = pk_j;
  }

  // ek
  const tauMidG2 = g2Mul(powers[Bmax]);
  const ek = pairing(G1, tauMidG2);

  return {
    ek,
    dk,
    pkCommitments,
    sk,
    omega: omegaArr,
    Bmax,
    N,
    t,
    tau, // returned for tests only; real setup script MUST NOT retain this
  };
}
