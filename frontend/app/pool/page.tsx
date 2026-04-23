import { CommitteeStatus } from '../components/CommitteeStatus';
import { PoolStats } from '../components/PoolStats';

export default function PoolPage() {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section className="space-y-4">
        <h1 className="text-xl font-semibold text-white">Pool</h1>
        <PoolStats />
        <div className="text-sm text-btx-muted">
          The SealedAMM holds reserves of MON and USDC and settles decrypted orders in a random per-epoch
          order. 0.3% fee. No LP token in the MVP — liquidity is bootstrapped by the deployer.
        </div>
      </section>
      <section className="space-y-4">
        <h1 className="text-xl font-semibold text-white">Committee</h1>
        <CommitteeStatus />
      </section>
    </div>
  );
}
