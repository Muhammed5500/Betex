import Link from 'next/link';

import { CommitteeStatus } from './components/CommitteeStatus';
import { PoolStats } from './components/PoolStats';

export default function HomePage() {
  return (
    <div className="space-y-24 sm:space-y-28 pb-12">
      <Hero />
      <Entry
        num="§ 2"
        margin={
          <>
            live data{' '}
            <span className="marker">↘</span>
          </>
        }
      >
        <h2 className="font-serif font-medium text-display tracking-tight mb-2">
          On-chain field log.
        </h2>
        <p className="text-muted leading-relaxed mb-7">
          Three independent processes form the decryptor committee. Each closes
          its own polling loop against Monad RPC; the combiner (Node 0) waits
          for two shares before sealing the batch.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CommitteeStatus />
          <PoolStats />
        </div>
      </Entry>

      <Entry
        num="§ 3"
        margin={
          <>
            three steps,
            <br />
            one block <span className="marker">←</span>
          </>
        }
      >
        <h2 className="font-serif font-medium text-display tracking-tight mb-2">
          The mechanism, sketched.
        </h2>
        <p className="text-muted leading-relaxed">
          A threshold-encrypted committee sits between your wallet and the AMM.
          The plaintext of an order is never broadcast; only its commitment
          hash and an opaque ciphertext leave the browser. Three steps replace
          the public mempool:
        </p>
        <Steps />
        <p className="text-muted leading-relaxed mt-7">
          The settlement transaction is atomic. Aggregate pairing check, hash
          binding, Fisher-Yates shuffle, and individual AMM calls happen inside
          a single block — there is no surface for a bot to interleave on.
        </p>
      </Entry>

      <Entry
        num="§ 4"
        margin={
          <span className="font-mono text-marginal text-ink not-italic block leading-relaxed">
            e(ct₁,h_l) · e(σ,−G₂) = 1<sub className="text-[0.6em]">G_T</sub>
            <br />
            <span className="text-dim">— paper §5.2</span>
          </span>
        }
      >
        <h2 className="font-serif font-medium text-display tracking-tight mb-2">
          The foundation.
        </h2>
        <p className="text-muted leading-relaxed mb-7">
          Betex is the first working DEX built on{' '}
          <Link
            href="https://category-labs.github.io/category-research/BTX-paper.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="text-text underline decoration-borderHi underline-offset-3 hover:decoration-purple"
          >
            BTX: Simple and Efficient Batch Threshold Encryption
          </Link>
          <sup className="cite">[1]</sup>. Each committee server broadcasts a
          single G₁ element per epoch, regardless of how many orders the batch
          contains — communication per server is{' '}
          <span className="highlight">
            <code className="font-mono text-[0.95em]">O(1)</code> in the batch
            size
          </span>
          . That property makes the scheme scale to validator-set-sized
          committees without exploding bandwidth.
        </p>

        <div className="formula">
          σ_j = Σ<sub className="text-[0.6em]">l ∈ U</sub> τ<sup>l</sup>
          <sub className="text-[0.6em]">j</sub> · ct
          <sub className="text-[0.6em]">l,1</sub> &nbsp; ∈ G₁
        </div>

        <p className="text-muted leading-relaxed mt-7">
          Sections §4 through §7 of the paper are realised in Solidity and
          JavaScript: punctured CRS, Shamir-over-powers key generation,
          aggregate pairing check via EIP-2537{' '}
          <code className="font-mono text-[0.92em]">PAIRING_CHECK</code>,
          Schnorr NIZK under the Algebraic Group Model, KEM-DEM ciphertext
          wrapping. §8 — the encrypted mempool — is wrapped as a working DEX
          with a Uniswap V2-style AMM<sup className="cite">[2]</sup>.
        </p>

        <SpecGrid />
      </Entry>

      <Entry num="§ 5" margin={<>try it ↘</>}>
        <h2 className="font-serif font-medium text-display tracking-tight mb-2">
          On Monad testnet, today.
        </h2>
        <p className="text-muted leading-relaxed mb-8">
          Mint mock USDC and MON from the in-app faucet, place a swap, and
          watch the encrypted batch settle in five seconds. All three committee
          nodes run as independent processes; the contracts are verified on
          Monad explorer.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/swap"
            className="focus-ring inline-flex items-center gap-2 px-6 py-3 rounded-md bg-text text-bg font-medium hover:bg-textHi transition-colors"
          >
            Launch app <span aria-hidden>→</span>
          </Link>
          <Link
            href="/faucet"
            className="focus-ring inline-flex items-center gap-2 px-6 py-3 rounded-md bg-bg text-text font-medium border border-border hover:border-borderHi transition-colors"
          >
            Get testnet tokens
          </Link>
          <Link
            href="/epochs"
            className="focus-ring inline-flex items-center gap-1.5 px-3 py-2 text-muted hover:text-text transition-colors"
          >
            Browse epochs →
          </Link>
        </div>
      </Entry>

      <References />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hero — § 1                                                          */
/* ------------------------------------------------------------------ */

function Hero() {
  return (
    <section className="grid lg:grid-cols-[60px_1fr_220px] gap-x-8 gap-y-6 pt-4 sm:pt-8">
      <div className="hidden lg:block section-num pt-2">§ 1</div>

      <div className="max-w-2xl">
        <div className="font-mono text-eyebrow uppercase text-muted mb-6">
          Entry · 2026-04-25
        </div>

        <h1 className="font-serif font-medium text-display-xl text-text">
          Encrypted swaps.
          <br />
          <span className="scribble-under">Sandwich-resistant</span> by
          construction.
        </h1>

        <p className="mt-9 text-mutedHi text-lg leading-relaxed max-w-xl drop-cap">
          A working implementation of <em>BTX threshold encryption</em>
          <sup className="cite">[1]</sup> wrapped as a DEX. Every order is
          encrypted in your browser and revealed only by a 2-of-3 committee
          after the epoch closes. Sandwich attacks become{' '}
          <span className="highlight">mathematically impossible</span> — not
          merely hard.
        </p>

        <p className="mt-4 text-mutedHi text-lg leading-relaxed max-w-xl">
          The settlement is atomic. Execution order inside the batch is
          shuffled by on-chain randomness. The AMM is gated by{' '}
          <code className="font-mono text-[0.92em]">onlyPool</code>; no
          external contract can interleave between reveal and settle.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
          <Link
            href="/swap"
            className="focus-ring inline-flex items-center gap-2 px-6 py-3 rounded-md bg-text text-bg font-medium hover:bg-textHi transition-colors"
          >
            Launch app <span aria-hidden>→</span>
          </Link>
          <Link
            href="https://category-labs.github.io/category-research/BTX-paper.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="focus-ring text-muted hover:text-text underline decoration-border underline-offset-3 hover:decoration-purple"
          >
            Read the paper
          </Link>
          <span className="text-dim">·</span>
          <Link
            href="https://github.com/Muhammed5500/Betex"
            target="_blank"
            rel="noopener noreferrer"
            className="focus-ring text-muted hover:text-text underline decoration-border underline-offset-3 hover:decoration-purple"
          >
            Source code
          </Link>
        </div>
      </div>

      <aside className="hidden lg:block pt-4 pl-1 border-l border-border">
        <div className="marginalia">
          new to BTX?
          <br />
          start with §5.2 <span className="marker">→</span>
          <br />
          <br />
          138 tests pass
          <br />
          on every push.
          <br />
          <br />
          <span className="text-dim font-sans text-marginal not-italic">
            — M.
          </span>
        </div>
      </aside>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Entry — generic notebook section with margin column                 */
/* ------------------------------------------------------------------ */

function Entry({
  num,
  margin,
  children,
}: {
  num: string;
  margin?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="grid lg:grid-cols-[60px_1fr_220px] gap-x-8 gap-y-4 scroll-mt-24">
      <div className="hidden lg:block section-num pt-2">{num}</div>
      <div className="max-w-2xl">{children}</div>
      <aside className="hidden lg:block pt-2 pl-1 border-l border-border">
        {margin && <div className="marginalia">{margin}</div>}
      </aside>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Steps                                                               */
/* ------------------------------------------------------------------ */

function Steps() {
  const items = [
    {
      n: 'I',
      title: 'Encrypt locally',
      body: 'Direction, amount, slippage, recipient — all encrypted to a threshold public key under BLS12-381. The plaintext never leaves your device.',
    },
    {
      n: 'II',
      title: 'Batch for one epoch',
      body: 'Orders submitted inside the same five-second window are grouped together. Each ciphertext is bound to a public commitment hash that the contract will check on reveal.',
    },
    {
      n: 'III',
      title: 'Reveal & settle',
      body: 'When the epoch closes, the committee broadcasts decryption shares. The contract verifies a single aggregate pairing, shuffles execution order, and runs every swap atomically.',
    },
  ];

  return (
    <ol className="!mt-7 border-y border-border divide-y divide-border">
      {items.map((s) => (
        <li
          key={s.n}
          className="grid grid-cols-[2.5rem_1fr] sm:grid-cols-[3.5rem_1fr] gap-5 py-6"
        >
          <div className="font-serif italic text-2xl text-dim leading-none pt-1">
            {s.n}.
          </div>
          <div>
            <h3 className="text-text font-medium tracking-tight">{s.title}</h3>
            <p className="text-muted mt-2 leading-relaxed text-[15px]">
              {s.body}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------------ */
/* Spec grid                                                           */
/* ------------------------------------------------------------------ */

function SpecGrid() {
  const specs = [
    { k: 'Curve', v: 'BLS12-381' },
    { k: 'Precompile', v: 'EIP-2537' },
    { k: 'NIZK', v: 'AGM-Schnorr' },
    { k: 'KDF', v: 'KEM-DEM' },
    { k: 'Threshold', v: '2-of-3' },
    { k: 'Bmax', v: '16' },
    { k: 'Epoch', v: '5 s' },
    { k: 'Tests', v: '138' },
  ];
  return (
    <dl className="!mt-8 grid grid-cols-2 sm:grid-cols-4 gap-y-6 gap-x-6 border-t border-border pt-6">
      {specs.map((s) => (
        <div key={s.k}>
          <dt className="font-mono text-eyebrow uppercase text-muted">
            {s.k}
          </dt>
          <dd className="mt-1.5 font-mono text-sm text-text">{s.v}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ------------------------------------------------------------------ */
/* References                                                          */
/* ------------------------------------------------------------------ */

function References() {
  const refs = [
    {
      tag: '[1]',
      author: 'Agarwal, Das, Gilkalaye, Rindal, Shoup',
      title: 'BTX: Simple and Efficient Batch Threshold Encryption',
      pub: 'Category Labs, 17 Apr 2026',
      href: 'https://category-labs.github.io/category-research/BTX-paper.pdf',
    },
    {
      tag: '[2]',
      author: 'Adams, Zinsmeister, Salem, Keefer, Robinson',
      title: 'Uniswap v2 Core',
      pub: '2020',
    },
    {
      tag: '[3]',
      author: 'Fuchsbauer, Kiltz, Loss',
      title: 'The Algebraic Group Model and its Applications',
      pub: 'CRYPTO 2018',
    },
    {
      tag: '[4]',
      author: 'EIP-2537',
      title: 'Precompile for BLS12-381 curve operations',
      pub: 'Live in Monad (MONAD_FOUR), 2025-10-14',
    },
  ];

  return (
    <section className="grid lg:grid-cols-[60px_1fr_220px] gap-x-8 gap-y-4">
      <div className="hidden lg:block section-num pt-2">References</div>
      <div className="max-w-2xl">
        <ol className="space-y-4 text-sm">
          {refs.map((r) => (
            <li
              key={r.tag}
              className="grid grid-cols-[2.5rem_1fr] gap-x-3 leading-relaxed"
            >
              <span className="font-mono text-dim">{r.tag}</span>
              <span className="text-muted">
                <span className="text-text">{r.author}.</span>{' '}
                {r.href ? (
                  <Link
                    href={r.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="italic underline decoration-border underline-offset-2 hover:decoration-purple"
                  >
                    {r.title}
                  </Link>
                ) : (
                  <span className="italic">{r.title}</span>
                )}
                . <span className="text-dim">{r.pub}.</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
      <div className="hidden lg:block" />
    </section>
  );
}
