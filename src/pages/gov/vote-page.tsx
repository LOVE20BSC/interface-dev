import { Link } from 'react-router-dom';
import { copy } from '@/shared/config/copy-pages';
import { configuredAddress } from '@/config/networks';
import { usePhaseClock } from '@/entities/phase/model/use-phase-clock';
import { useCommunityToken } from '@/entities/community-token/model/use-community-token';
import { useGovAccess } from '@/entities/gov-core/model/use-gov-access';
import { useRoundProposals } from '@/entities/gov-core/model/use-round-proposals';
import { useVotePower } from '@/entities/gov-core/model/use-vote-power';
import { useWalletConnection } from '@/features/connect-wallet/model/use-wallet-connection';
import { useCommunityContext } from '@/features/switch-community/model/use-community-context';
import { GOV_POLL_MS } from '@/features/governance-stake/model/use-gov-context';
import { RoundProposalList } from '@/features/governance-vote/ui/round-proposal-list';
import { VotePowerCard } from '@/features/governance-vote/ui/vote-power-card';
import { GovAccessGate } from '@/widgets/gov-access-gate/gov-access-gate';
import { buttonStyles } from '@/shared/ui/button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';

/**
 * 治理·投票（core `Vote`）——**本轮提案列表**。
 *
 * owner 2026-11-22：列表只负责「点哪个提案」，投票动作在独立详情页 `/vote/:proposalId`
 * （快捷 25% / 50% / 100% + 自定义）。有目标合约回调的提案（`targetMode == 1`）不在
 * core 覆盖范围，列表里标原因、不给入口。
 */
export function VotePage() {
  const { symbol } = useCommunityContext();
  const token = useCommunityToken(symbol);
  const { isWrongChain } = useWalletConnection();
  const access = useGovAccess(token.address, ['vote', 'submit', 'phase']);
  const clock = usePhaseClock({ refetchIntervalMs: GOV_POLL_MS });
  const round = clock.currentPhase;

  const proposals = useRoundProposals(token.address, { round });
  const power = useVotePower(
    token.address,
    round,
    access.memberId,
    proposals.items.map((proposal) => proposal.proposalId),
  );
  const voteAddress = configuredAddress('vote');

  const refetchAll = () => {
    proposals.refetch();
    power.refetch();
    clock.refetch();
    token.refetch();
    access.refetch();
  };

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-foreground" data-testid="gov-vote-title">
        {copy.gov.vote.title}
      </h1>
      <p className="text-sm leading-6 text-muted">{copy.gov.vote.intro}</p>
      <GovAccessGate access={access} isWrongChain={isWrongChain} symbol={symbol}>
        {proposals.status === 'error' ? (
          <div className="space-y-3" data-testid="gov-vote-list-error">
            <p role="alert" className="text-sm text-danger-strong">
              {copy.gov.vote.readFailed}
            </p>
            <button
              type="button"
              className="h-11 rounded-2xl border border-line bg-surface px-4 text-sm text-foreground"
              onClick={refetchAll}
            >
              {copy.gov.vote.retry}
            </button>
          </div>
        ) : proposals.status === 'loading' ? (
          <p className="text-sm text-muted" data-testid="gov-vote-loading">
            {copy.gov.vote.loading}
          </p>
        ) : voteAddress === undefined || token.address === undefined ? (
          <p className="text-sm text-muted" data-testid="gov-vote-unavailable">
            {copy.gov.gates.unconfiguredBody}
          </p>
        ) : (
          <>
            <VotePowerCard power={power} symbol={symbol} />
            {proposals.items.length === 0 ? (
              <Card data-testid="gov-vote-empty">
                <CardTitle>{copy.gov.vote.emptyTitle}</CardTitle>
                <CardDescription>{copy.gov.vote.emptyBody}</CardDescription>
                <Link
                  to={`/submit?symbol=${encodeURIComponent(symbol)}`}
                  className="mt-4 inline-flex h-11 items-center justify-center rounded-2xl bg-brand px-4 text-sm font-medium text-on-brand"
                >
                  {copy.gov.vote.emptyAction}
                </Link>
              </Card>
            ) : (
              <RoundProposalList
                proposals={proposals.items}
                power={power}
                symbol={symbol}
                roundLabel={
                  round === undefined
                    ? copy.common.unknown
                    : copy.gov.vote.roundHint(round.toString())
                }
              />
            )}
            <Link
              to={`/vote/records?symbol=${encodeURIComponent(symbol)}`}
              data-testid="gov-vote-records-link"
              className={buttonStyles('secondary', 'md', 'w-full')}
            >
              {copy.gov.myVotes.recordsTitle}
            </Link>
          </>
        )}
      </GovAccessGate>
    </div>
  );
}
