import { useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { copy } from '@/shared/config/copy-pages';
import { EmptyState } from '@/widgets/empty-state/empty-state';
import { useMemberIdentity } from '@/entities/member-identity/model/use-member-identity';
import { ConnectWalletButton } from '@/features/connect-wallet/ui/connect-wallet-button';
import {
  IdentityList,
  type JustMintedIdentity,
} from '@/features/select-identity/ui/identity-list';

interface MintHandoffState {
  readonly mintedMemberId?: unknown;
  readonly mintedName?: unknown;
}

/**
 * `/mint` hands the just-minted row to this page through history state (owner
 * 2026-11-16: 铸造完成后回到我的 NFT 页). Only a numeric member id is accepted;
 * anything else falls back to a plain /my-nft visit.
 */
function readMintedHandoff(state: unknown): JustMintedIdentity | null {
  if (typeof state !== 'object' || state === null) return null;
  const { mintedMemberId, mintedName } = state as MintHandoffState;
  if (typeof mintedMemberId !== 'string' || !/^\d+$/.test(mintedMemberId)) return null;
  if (typeof mintedName !== 'string' || mintedName.length === 0) return null;
  return { tokenId: BigInt(mintedMemberId), name: mintedName };
}

/**
 * 我的 NFT: summary, responsive identity list, local selection and transfer.
 * The list itself owns loading/error/empty/list states so the page has exactly
 * one next step in each one (UX spec §3.2). The page owns the unconfigured line
 * so an environment without MemberNFT never renders as a bare page.
 *
 * It also owns the mint handoff: arriving from a mint receipt must show the new
 * identity immediately (chain reads have a 15 s cache) and highlight it once.
 */
export function MyNftPage() {
  const { isConnected } = useAccount();
  const location = useLocation();
  const justMinted = useMemo(() => readMintedHandoff(location.state), [location.state]);
  const identity = useMemberIdentity();
  const refetch = identity.refetch;
  const didRefetchHandoff = useRef(false);

  useEffect(() => {
    if (justMinted === null || didRefetchHandoff.current) return;
    didRefetchHandoff.current = true;
    // The mint page already read balanceOf; 15 s of stale cache would hide the
    // identity the user was just told about.
    refetch();
  }, [justMinted, refetch]);

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
        <div className="space-y-4">
          {justMinted !== null ? (
            <p
              role="status"
              data-testid="my-nft-just-minted-strip"
              className="rounded-2xl border border-success/20 bg-success-soft/60 px-3 py-2 text-sm text-success"
            >
              {copy.pages.myNft.justMintedStrip(
                justMinted.tokenId.toString(),
                justMinted.name,
              )}
            </p>
          ) : null}
          <IdentityList identity={identity} onRetry={identity.refetch} justMinted={justMinted} />
        </div>
      )}
    </div>
  );
}
