import { CommitteeStatus } from '../components/CommitteeStatus';
import { EpochTimer } from '../components/EpochTimer';
import { PoolStats } from '../components/PoolStats';
import { SwapCard } from '../components/SwapCard';

export default function SwapPage() {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Swap</h1>
        <p className="text-muted text-sm mt-2 max-w-xl">
          Encrypted locally, submitted on-chain, revealed when the current epoch
          closes. Typical end-to-end time: 5–7 seconds.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px] items-start">
        <div className="space-y-3">
          <EpochTimer />
          <SwapCard />
        </div>
        <aside className="space-y-3">
          <PoolStats />
          <CommitteeStatus />
        </aside>
      </div>
    </div>
  );
}
