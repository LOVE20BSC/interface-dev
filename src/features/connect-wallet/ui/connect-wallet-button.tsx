import { Wallet } from '@/shared/ui/icons';
import { Suspense, useState } from 'react';
import { copy } from '@/shared/config/copy';
import { toWalletErrorMessage } from '@/features/connect-wallet/lib/wallet-errors';
import { Button, type ButtonSize, type ButtonVariant } from '@/shared/ui/button';
import { hasInjectedProvider } from '@/features/connect-wallet/lib/injected';
import { useInjectedWalletStatus } from '@/features/connect-wallet/model/use-injected-wallet-status';
import { useWalletConnection } from '@/features/connect-wallet/model/use-wallet-connection';
import {
  LazyNoWalletDialog,
  LazyWalletErrorDialog,
  preloadWalletDialogs,
} from '@/features/connect-wallet/ui/lazy-dialogs';

export interface ConnectWalletButtonProps {
  /** The header pill is outline/secondary so a page CTA stays the only solid button. */
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly className?: string;
}

/**
 * Disconnected state: one button, no fake disabled affordances.
 * If no provider is found within 3 s, clicking opens the fallback sheet.
 */
export function ConnectWalletButton({
  variant = 'primary',
  size = 'md',
  className,
}: ConnectWalletButtonProps = {}) {
  const walletStatus = useInjectedWalletStatus();
  const { connect, isConnecting } = useWalletConnection();
  const [localBusy, setLocalBusy] = useState(false);
  const [noWalletOpen, setNoWalletOpen] = useState(false);
  const [errorOpen, setErrorOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [retry, setRetry] = useState<(() => void) | null>(null);

  const busy = localBusy || isConnecting;
  const checking = walletStatus === 'checking';

  const runConnect = async () => {
    if (walletStatus === 'missing' || !hasInjectedProvider()) {
      setNoWalletOpen(true);
      return;
    }
    setLocalBusy(true);
    try {
      await connect();
    } catch (error) {
      if (!hasInjectedProvider()) {
        setNoWalletOpen(true);
        return;
      }
      setErrorMessage(toWalletErrorMessage(error));
      setRetry(() => () => {
        void runConnect();
      });
      setErrorOpen(true);
    } finally {
      setLocalBusy(false);
    }
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={() => {
          preloadWalletDialogs();
          void runConnect();
        }}
        onPointerEnter={preloadWalletDialogs}
        loading={busy}
        disabled={checking}
        leadingIcon={<Wallet className="h-4 w-4" aria-hidden="true" />}
        aria-label={copy.wallet.connect}
      >
        {checking
          ? copy.wallet.checkingWallet
          : busy
            ? copy.wallet.connecting
            : copy.wallet.connect}
      </Button>
      {noWalletOpen ? (
        <Suspense fallback={null}>
          <LazyNoWalletDialog open={noWalletOpen} onOpenChange={setNoWalletOpen} />
        </Suspense>
      ) : null}
      {errorOpen ? (
        <Suspense fallback={null}>
          <LazyWalletErrorDialog
            open={errorOpen}
            onOpenChange={setErrorOpen}
            title={copy.wallet.connectErrorTitle}
            message={errorMessage}
            {...(retry !== null ? { onRetry: retry } : {})}
          />
        </Suspense>
      ) : null}
    </>
  );
}
