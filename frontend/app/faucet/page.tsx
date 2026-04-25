import { FaucetCard } from '../components/FaucetCard';

export default function FaucetPage() {
  return (
    <div className="space-y-6 max-w-md">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Faucet</h1>
        <p className="text-sm text-muted mt-2">
          Mock MON (18 dec) and USDC (6 dec). Open-mint — grab as much as you
          need.
        </p>
      </header>
      <FaucetCard />
    </div>
  );
}
