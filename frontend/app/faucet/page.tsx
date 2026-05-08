import { FaucetCard } from '../components/FaucetCard';

export default function FaucetPage() {
  return (
    <div className="space-y-6 max-w-md">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Faucet</h1>
        <p className="text-sm text-muted mt-2 leading-relaxed">
          Real Circle USDC and canonical WMON on Monad testnet. Get USDC and
          MON from their respective faucets, then wrap MON to WMON below to
          swap on Betex.
        </p>
      </header>
      <FaucetCard />
    </div>
  );
}
