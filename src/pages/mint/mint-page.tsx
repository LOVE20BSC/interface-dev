import { copy } from '@/shared/config/copy';
import { useMemberIdentity } from '@/entities/member-identity/model/use-member-identity';
import { ConnectWalletButton } from '@/features/connect-wallet/ui/connect-wallet-button';
import { MintIdentityPanel } from '@/features/mint-identity/ui/mint-identity-panel';

export function MintPage() {
  const identity = useMemberIdentity();

  return (
    <div>
      <p className="mb-4 text-sm leading-6 text-muted">{copy.pages.mint.description}</p>
      <MintIdentityPanel
        identity={identity}
        connectAction={<ConnectWalletButton />}
        onRetry={identity.refetch}
      />
    </div>
  );
}
