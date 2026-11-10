import { AlertTriangle } from '@/shared/ui/icons';
import { Suspense, useState } from 'react';
import { copy } from '@/shared/config/copy';
import { toWalletErrorMessage } from '@/features/connect-wallet/lib/wallet-errors';
import { Button } from '@/shared/ui/button';
import { useWalletConnection } from '@/features/connect-wallet/model/use-wallet-connection';
import {
  LazyWalletErrorDialog,
  preloadWalletDialogs,
} from '@/features/connect-wallet/ui/lazy-dialogs';

type SwitchStage = 'idle' | 'switching';

/**
 * Wrong-chain state. EIP-3085/3326: try switching first, add the chain from the
 * environment package when the wallet reports 4902, then switch again.
 */
export function WrongNetworkButton() {
  const { switchToTargetChain, isSwitching } = useWalletConnection();
  const [stage, setStage] = useState<SwitchStage>('idle');
  const [errorOpen, setErrorOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const busy = stage !== 'idle' || isSwitching;

  const runSwitch = async () => {
    setStage('switching');
    setErrorMessage('');
    try {
      await switchToTargetChain();
    } catch (error) {
      setErrorMessage(toWalletErrorMessage(error));
      setErrorOpen(true);
    } finally {
      setStage('idle');
    }
  };

  const label = busy ? copy.wallet.switchingNetwork : copy.wallet.wrongNetwork;

  return (
    <>
      <Button
        variant="danger"
        onClick={() => {
          preloadWalletDialogs();
          void runSwitch();
        }}
        onPointerEnter={preloadWalletDialogs}
        loading={busy}
        leadingIcon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
        aria-label={copy.wallet.wrongNetwork}
      >
        {label}
      </Button>
      {errorOpen ? (
        <Suspense fallback={null}>
          <LazyWalletErrorDialog
            open={errorOpen}
            onOpenChange={setErrorOpen}
            title={copy.wallet.networkErrorTitle}
            message={errorMessage}
            onRetry={() => {
              void runSwitch();
            }}
          />
        </Suspense>
      ) : null}
    </>
  );
}
