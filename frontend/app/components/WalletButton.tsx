'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';

export function WalletButton() {
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        authenticationStatus,
        mounted,
      }) => {
        const ready = mounted && authenticationStatus !== 'loading';
        const connected =
          ready &&
          account &&
          chain &&
          (!authenticationStatus || authenticationStatus === 'authenticated');

        if (!ready) {
          return (
            <div
              aria-hidden
              className="h-9 w-[124px] rounded-md border border-border bg-surface/60 animate-pulse"
            />
          );
        }

        if (!connected) {
          return (
            <button
              type="button"
              onClick={openConnectModal}
              className="focus-ring inline-flex items-center h-9 px-4 rounded-md bg-text text-bg text-sm font-medium hover:bg-textHi transition-colors shadow-soft"
            >
              Connect wallet
            </button>
          );
        }

        if (chain.unsupported) {
          return (
            <button
              type="button"
              onClick={openChainModal}
              className="focus-ring inline-flex items-center gap-2 h-9 px-4 rounded-md border border-danger/40 bg-danger/10 text-danger text-sm font-medium hover:border-danger/60 transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-danger" />
              Wrong network
            </button>
          );
        }

        return (
          <button
            type="button"
            onClick={openAccountModal}
            className="focus-ring inline-flex items-center gap-2.5 h-9 pl-3 pr-3.5 rounded-md border border-border bg-surface text-text text-sm hover:border-borderHi shadow-soft transition-colors"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-success live-dot" />
            {account.displayBalance && (
              <span className="hidden sm:inline font-mono text-muted">
                {account.displayBalance}
              </span>
            )}
            <span className="font-mono">{account.displayName}</span>
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}
