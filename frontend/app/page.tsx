import { CommitteeStatus } from './components/CommitteeStatus';
import { EpochTimer } from './components/EpochTimer';
import { PoolStats } from './components/PoolStats';
import { SwapCard } from './components/SwapCard';

export default function HomePage() {
  return (
    <div className="grid gap-6 md:grid-cols-[1fr_320px] items-start">
      <div className="space-y-4">
        <EpochTimer />
        <SwapCard />
      </div>
      <aside className="space-y-4">
        <PoolStats />
        <CommitteeStatus />
      </aside>
    </div>
  );
}
