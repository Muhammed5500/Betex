import { FaucetCard } from '../components/FaucetCard';

export default function FaucetPage() {
  return (
    <div className="space-y-4 max-w-xl">
      <h1 className="text-xl font-semibold text-white">Testnet Faucet</h1>
      <p className="text-sm text-btx-muted">
        Mock MON (18 decimals) and mock USDC (6 decimals) are open-mint ERC-20s. Grab some tokens before
        trying an encrypted swap.
      </p>
      <FaucetCard />
    </div>
  );
}
