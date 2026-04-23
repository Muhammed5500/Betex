import { CommitteeStatus } from '../components/CommitteeStatus';
import { PoolStats } from '../components/PoolStats';

export default function PoolPage() {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-[22px] font-semibold tracking-tight">Pool</h1>
        <p className="text-sm text-muted mt-1 max-w-xl">
          SealedAMM holds MON and USDC reserves and settles decrypted orders in a randomized per-epoch
          sequence. 0.3% fee. No LP tokens in the MVP — liquidity is bootstrapped by the deployer.
        </p>
      </header>
      <div className="grid gap-6 md:grid-cols-2">
        <PoolStats />
        <CommitteeStatus />
      </div>
    </div>
  );
}
