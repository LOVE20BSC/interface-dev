import { Link } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { copy } from '@/shared/config/copy';
import { buttonStyles } from '@/shared/ui/button';
import { EmptyState } from '@/widgets/empty-state/empty-state';
import { useMemberIdentity } from '@/entities/member-identity/model/use-member-identity';
import { ConnectWalletButton } from '@/features/connect-wallet/ui/connect-wallet-button';
import { IdentityList } from '@/features/select-identity/ui/identity-list';

export function MyNftPage() {
  const { isConnected } = useAccount();
  const identity = useMemberIdentity();

  return (
    <div>
      <p className="mb-4 text-sm leading-6 text-muted">{copy.identity.myNftIntro}</p>

      {!isConnected ? (
        <EmptyState
          title={copy.identity.disconnectedTitle}
          description={copy.pages.myNft.connectFirst}
          action={<ConnectWalletButton />}
          secondary={
            <Link to="/" className={buttonStyles('secondary', 'md', 'w-full sm:w-auto')}>
              {copy.pages.myNft.backHome}
            </Link>
          }
        />
      ) : identity.status === 'unconfigured' ? (
        <EmptyState
          title={copy.pages.myNft.notDeployedTitle}
          description={copy.pages.myNft.notDeployedBody}
          action={
            <button
              type="button"
              className={buttonStyles('secondary', 'md')}
              onClick={identity.refetch}
            >
              {copy.common.refresh}
            </button>
          }
          secondary={
            <Link to="/" className={buttonStyles('secondary', 'md', 'w-full sm:w-auto')}>
              {copy.pages.myNft.notDeployedNext}
            </Link>
          }
        />
      ) : (
        <IdentityList identity={identity} onRetry={identity.refetch} />
      )}
    </div>
  );
}
