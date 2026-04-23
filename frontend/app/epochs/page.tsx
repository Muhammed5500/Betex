import { EpochHistory } from '../components/EpochHistory';
import { EpochTimer } from '../components/EpochTimer';

export default function EpochsPage() {
  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-xl font-semibold text-white">Epochs</h1>
      <EpochTimer />
      <EpochHistory />
    </div>
  );
}
