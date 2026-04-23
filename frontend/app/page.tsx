import { CommitteeStatus } from './components/CommitteeStatus';
import { EpochTimer } from './components/EpochTimer';
import { PoolStats } from './components/PoolStats';
import { SwapCard } from './components/SwapCard';

export default function HomePage() {
  return (
    <div className="space-y-10">
      <Hero />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px] items-start">
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

function Hero() {
  return (
    <section className="relative text-center py-8 sm:py-12">
      <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-widest text-purple mb-5 px-3 py-1 rounded-full border border-purpleDim bg-purpleDim/30">
        <span className="w-1.5 h-1.5 rounded-full bg-magenta" />
        MEV-resistant · paper-faithful BTX
      </div>
      <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.05]">
        Swap without leaving a <br className="hidden sm:block" />
        <span className="shimmer-text">footprint in the mempool.</span>
      </h1>
      <p className="text-muted mt-5 max-w-xl mx-auto text-sm sm:text-base leading-relaxed">
        Orders are encrypted in your browser, committed on-chain, and decrypted together
        by a 2-of-3 committee after each epoch closes. No bot sees your trade before execution.
      </p>
    </section>
  );
}
