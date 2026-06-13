import { EpochHistory } from '../components/EpochHistory';
import { EpochTimer } from '../components/EpochTimer';

export default function EpochsPage() {
  return (
    <div className="space-y-8 max-w-2xl">
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Epochs</h1>
        <p className="text-sm text-muted leading-relaxed">
          An epoch is a five-second window during which Betex collects
          encrypted orders. When the window expires, the committee reveals
          decryption shares, the contract verifies them in a single pairing
          check, shuffles the orders under on-chain randomness, and executes
          them atomically against the pool.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xs font-mono uppercase tracking-[0.16em] text-muted">
          Current epoch
        </h2>
        <EpochTimer />
        <dl className="grid grid-cols-3 gap-3 text-xs text-muted">
          <Legend label="counting" body="Window open. Orders are accepted into this batch." dotClass="bg-purple" />
          <Legend label="settling" body="Window closed. Committee is broadcasting decryption shares." dotClass="bg-purple live-dot" />
          <Legend label="idle" body="Window expired empty. No batch to reveal; rolls over on the next swap." dotClass="bg-dim/60" />
        </dl>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-mono uppercase tracking-[0.16em] text-muted">
          Recent activity
        </h2>
        <EpochHistory />
        <p className="text-xs text-muted leading-relaxed">
          Format <span className="font-mono text-text">Xo · Ys · Zr</span> reads
          as <span className="text-text">X</span> orders submitted,{' '}
          <span className="text-text">Y</span> swaps executed,{' '}
          <span className="text-text">Z</span> refunds claimed. Connect a
          wallet to filter to your own epochs.
        </p>
      </section>
    </div>
  );
}

function Legend({
  label,
  body,
  dotClass,
}: {
  label: string;
  body: string;
  dotClass: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surfaceWarm p-3">
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
        <span className="font-mono text-text">{label}</span>
      </div>
      <p className="leading-snug">{body}</p>
    </div>
  );
}
