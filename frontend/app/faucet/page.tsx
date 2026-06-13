import { FaucetCard } from '../components/FaucetCard';

export default function FaucetPage() {
  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Faucet</h1>
        <p className="text-sm text-muted mt-2 leading-relaxed max-w-xl">
          Real Circle USDC and canonical WMON on Monad testnet. Mint USDC and
          MON from their respective faucets on the left, then wrap MON to WMON
          on the right to swap on Betex.
        </p>
      </header>
      <FaucetCard />
    </div>
  );
}
