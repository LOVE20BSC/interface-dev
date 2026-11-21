import { Link } from 'react-router-dom';
import { configuredAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { Button, buttonStyles } from '@/shared/ui/button';
import { Card, CardDescription } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { useCommunityToken } from '@/entities/community-token/model/use-community-token';
import { useGovAccess } from '@/entities/gov-core/model/use-gov-access';
import { useMyVotes } from '@/entities/gov-core/model/use-my-votes';
import { usePhaseClock } from '@/entities/phase/model/use-phase-clock';
import { useWalletConnection } from '@/features/connect-wallet/model/use-wallet-connection';
import { useCommunityContext } from '@/features/switch-community/model/use-community-context';
import { GOV_POLL_MS } from '@/features/governance-stake/model/use-gov-context';
import { MyVoteRounds } from '@/features/governance-vote/ui/my-vote-rounds';
import { GovAccessGate } from '@/widgets/gov-access-gate/gov-access-gate';

/**
 * 独立页 `/vote/records`（旧库 `/vote/records` 的对应页）：我的投票记录，按轮次倒序。
 *
 * 治理首页的「我的投票」卡只预览最近两轮；这里给完整列表（一页 10 轮 + 加载更多）。
 * 只读：投票入口在标题行右侧「去投票」。
 */
export function VoteRecordsPage() {
  const { symbol } = useCommunityContext();
  const token = useCommunityToken(symbol);
  const { isWrongChain } = useWalletConnection();
  const access = useGovAccess(token.address, ['vote', 'submit', 'phase']);
  const clock = usePhaseClock({ refetchIntervalMs: GOV_POLL_MS });
  const votes = useMyVotes(token.address, {
    memberId: access.memberId,
    currentPhase: clock.currentPhase,
  });

  const q = `?symbol=${encodeURIComponent(symbol)}`;
  const voteAddress = configuredAddress('vote');

  const refetchAll = () => {
    votes.refetch();
    clock.refetch();
    token.refetch();
    access.refetch();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-2">
        <h1 className="text-lg font-bold text-foreground" data-testid="gov-vote-records-title">
          {copy.gov.myVotes.recordsTitle}
        </h1>
        <Link
          to={`/vote${q}`}
          data-testid="gov-vote-records-go-vote"
          className="text-xs font-medium text-brand-strong"
        >
          {copy.gov.myVotes.goVote}
          <span aria-hidden="true"> &gt;&gt;</span>
        </Link>
      </div>
      <p className="text-sm leading-6 text-muted">{copy.gov.myVotes.recordsIntro}</p>

      <GovAccessGate access={access} isWrongChain={isWrongChain} symbol={symbol}>
        {voteAddress === undefined ||
        token.address === undefined ||
        access.memberId === undefined ? (
          <Card data-testid="gov-vote-records-unavailable">
            <CardDescription>{copy.gov.gates.unconfiguredBody}</CardDescription>
          </Card>
        ) : votes.status === 'error' ? (
          <Card data-testid="gov-vote-records-error">
            <CardDescription>{copy.gov.myVotes.readFailed}</CardDescription>
            <Button
              type="button"
              variant="secondary"
              size="md"
              className="mt-3"
              onClick={refetchAll}
            >
              {copy.gov.myVotes.retry}
            </Button>
          </Card>
        ) : votes.status === 'loading' && votes.rounds.length === 0 ? (
          <Card data-testid="gov-vote-records-loading">
            <CardDescription>{copy.gov.myVotes.loading}</CardDescription>
            <div className="mt-3 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          </Card>
        ) : votes.rounds.length === 0 ? (
          <Card data-testid="gov-vote-records-empty">
            <CardDescription>{copy.gov.myVotes.emptyRecord}</CardDescription>
            <p className="mt-1 text-xs leading-5 text-muted">{copy.gov.myVotes.emptyRecordHint}</p>
            <Link
              to={`/vote${q}`}
              data-testid="gov-vote-records-empty-action"
              className={`${buttonStyles('primary', 'md', 'w-full')} mt-4`}
            >
              {copy.gov.myVotes.recordsEmptyAction}
            </Link>
          </Card>
        ) : (
          <Card data-testid="gov-vote-records-body">
            <MyVoteRounds rounds={votes.rounds} testIdPrefix="gov-vote-records" />
            {votes.hasMore ? (
              <div className="mt-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="md"
                  className="w-full"
                  data-testid="gov-vote-records-load-more"
                  disabled={votes.isLoadingMore}
                  onClick={votes.loadMore}
                >
                  {votes.isLoadingMore ? copy.gov.myVotes.loadingMore : copy.gov.myVotes.loadMore}
                </Button>
              </div>
            ) : null}
          </Card>
        )}
      </GovAccessGate>
    </div>
  );
}
