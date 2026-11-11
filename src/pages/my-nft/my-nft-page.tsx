import { useAccount } from 'wagmi';
import { copy } from '@/shared/config/copy-pages';
import { EmptyState } from '@/widgets/empty-state/empty-state';
import { useMemberIdentity } from '@/entities/member-identity/model/use-member-identity';
import { ConnectWalletButton } from '@/features/connect-wallet/ui/connect-wallet-button';
import { IdentityList } from '@/features/select-identity/ui/identity-list';

/**
 * 我的 NFT: summary, responsive identity list, local selection and transfer.
 * The list itself owns loading/error/empty/list states so the page has exactly
 * one next step in each one (UX spec §3.2). The page owns the unconfigured line
 * so an environment without MemberNFT never renders as a bare page.
 */
export function MyNftPage() {
  const { isConnected } = useAccount();
  const identity = useMemberIdentity();

  return (
    <div className="space-y-5">
      {!isConnected ? (
        <EmptyState
          title={copy.pages.myNft.disconnectedTitle}
          description={copy.pages.myNft.disconnectedBody}
          action={<ConnectWalletButton />}
        />
      ) : identity.status === 'unconfigured' ? (
        <EmptyState
          title={copy.identity.notDeployedTitle}
          description={copy.identity.notDeployedBody}
        />
      ) : (
        <IdentityList identity={identity} onRetry={identity.refetch} />
      )}
    </div>
  );
}
