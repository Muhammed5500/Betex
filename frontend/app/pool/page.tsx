import { CommitteeStatus } from '../components/CommitteeStatus';
import { PoolStats } from '../components/PoolStats';

export default function PoolPage() {
  return (
    <div className="space-y-8 max-w-3xl">
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Pool</h1>
        <p className="text-sm text-muted leading-relaxed max-w-xl">
          SealedAMM is a Uniswap V2-style constant-product pool holding MON
          and USDC reserves. It only accepts swaps from the EncryptedPool
          contract, so individual users cannot trade against it directly. The
          fee is 0.3%. There are no LP tokens in the MVP; liquidity is
          bootstrapped by the deployer.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xs font-mono uppercase tracking-[0.16em] text-muted">
          Reserves
        </h2>
        <PoolStats />
        <p className="text-xs text-muted leading-relaxed max-w-xl">
          Reserves move only when an epoch settles. Each successful swap
          inside a batch updates the on-chain balances atomically; failed
          slots refund their deposit and leave reserves untouched.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-mono uppercase tracking-[0.16em] text-muted">
          Decryptor committee
        </h2>
        <CommitteeStatus />
        <p className="text-xs text-muted leading-relaxed max-w-xl">
          Three independent nodes each hold a Shamir share of the BTX secret
          key. After each epoch closes they broadcast a single G₁ partial
          decryption to the verifier contract; any two of three are enough to
          reveal the batch. Node 0 doubles as the combiner that aggregates
          the shares and submits the plaintext orders for settlement.
        </p>
      </section>
    </div>
  );
}
