import { EpochHistory } from '../components/EpochHistory';
import { EpochTimer } from '../components/EpochTimer';

export default function EpochsPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Epochs</h1>
        <p className="text-sm text-muted mt-2">
          Every 5 seconds a batch of encrypted orders is closed and decrypted
          together by the committee.
        </p>
      </header>
      <EpochTimer />
      <EpochHistory />
    </div>
  );
}
