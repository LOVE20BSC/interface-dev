import { Link } from 'react-router-dom';
import type { HexAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { formatTokenAmount } from '@/shared/lib/format';
import { formatSharePercent } from '@/shared/lib/share-percent';
import { Button, buttonStyles } from '@/shared/ui/button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { useMyVotes } from '@/entities/gov-core/model/use-my-votes';
import { useVotePower } from '@/entities/gov-core/model/use-vote-power';

/** 治理票是 18 位小数的数量（`Stake.govVotes`）。 */
const VOTE_DECIMALS = 18;

export interface MyVotesCardProps {
  readonly tokenAddress: HexAddress | undefined;
  readonly memberId: bigint | undefined;
  readonly round: bigint | undefined;
  readonly symbol: string;
}

/**
 * 治理首页「我的投票」卡（owner 2026-11-21：仿旧库 `MyVotingPanel` + `/vote/records` 的
 * 呈现内容，布局重新设计）。
 *
 * 内容对应关系：
 * - 概览三格 ← 旧 `MyVotingPanel` 的「我的已投票数 / 我的未投票数」（新口径：本轮可投 = 治理权）；
 * - 主按钮「去投票」← 旧版同款，只是从两步向导改成我们自己的 `/vote`；
 * - 按轮明细 ← 旧 `/vote/records`：轮次行 + 每条「编号 / 标题 / 我的投票 / 占比」；
 * - 状态：旧版读失败会渲染 0，这里按硬规则 4 给「读不到 + 重试」。
 *
 * 本组件自己取数（不复用 `useGovContext`），因为 `MineTab` 里有多个提前 return，
 * 在它内部调 hook 会破坏 hooks 规则。
 */
export function MyVotesCard({ tokenAddress, memberId, round, symbol }: MyVotesCardProps) {
  const power = useVotePower(tokenAddress, round, memberId, []);
  const votes = useMyVotes(tokenAddress, {
    memberId,
    currentPhase: round,
  });

  const q = `?symbol=${encodeURIComponent(symbol)}`;
  const remaining = power.remaining;
  const rounds = votes.rounds;
  const hasRecord = rounds.length > 0;

  return (
    <Card data-testid="gov-my-votes-card">
      <div className="flex items-baseline justify-between gap-2">
        <CardTitle>{copy.gov.myVotes.title}</CardTitle>
        <span className="text-xs text-muted" data-testid="gov-my-votes-round">
          {round === undefined
            ? copy.common.unknown
            : copy.gov.myVotes.roundLabel(round.toString())}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat
          label={copy.gov.myVotes.statMax}
          value={formatTokenAmount(power.maxVoteAmount, VOTE_DECIMALS)}
          testId="gov-my-votes-max"
        />
        <Stat
          label={copy.gov.myVotes.statVoted}
          value={formatTokenAmount(power.usedVoteAmount, VOTE_DECIMALS)}
          testId="gov-my-votes-used"
        />
        <Stat
          label={copy.gov.myVotes.statRemaining}
          value={formatTokenAmount(remaining, VOTE_DECIMALS)}
          testId="gov-my-votes-remaining"
        />
      </div>

      <div className="mt-3">
        {power.status === 'ready' && power.maxVoteAmount === 0n ? (
          <p className="text-xs leading-5 text-muted" data-testid="gov-my-votes-no-power">
            {copy.gov.myVotes.noPower}
          </p>
        ) : remaining !== undefined && remaining > 0n ? (
          <Link
            to={`/vote${q}`}
            data-testid="gov-my-votes-go-vote"
            className={buttonStyles('secondary', 'md', 'w-full')}
          >
            {copy.gov.myVotes.goVote}
          </Link>
        ) : (
          <Button type="button" variant="secondary" size="md" className="w-full" disabled>
            {copy.gov.myVotes.allVoted}
          </Button>
        )}
      </div>

      <div className="mt-4 border-t border-line pt-3">
        <p className="text-xs font-medium text-muted">{copy.gov.myVotes.recordTitle}</p>

        {votes.status === 'error' ? (
          <div className="mt-2" data-testid="gov-my-votes-error">
            <CardDescription>{copy.gov.myVotes.readFailed}</CardDescription>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-2"
              onClick={votes.refetch}
            >
              {copy.gov.myVotes.retry}
            </Button>
          </div>
        ) : votes.status === 'loading' && rounds.length === 0 ? (
          <div className="mt-2 space-y-2" data-testid="gov-my-votes-loading">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-28" />
          </div>
        ) : hasRecord ? (
          <ul className="mt-2 space-y-3" data-testid="gov-my-votes-records">
            {rounds.map((item) => (
              <li key={item.round.toString()} data-testid={`gov-my-votes-round-${item.round}`}>
                <p
                  className="text-xs text-muted"
                  data-testid={`gov-my-votes-round-line-${item.round}`}
                >
                  {copy.gov.myVotes.roundHeader(
                    item.round.toString(),
                    formatTokenAmount(item.myTotalVotes, VOTE_DECIMALS),
                  )}
                </p>
                <ul className="mt-1 space-y-1.5 rounded-2xl bg-elevated/60 px-3 py-2">
                  {item.entries.map((entry) => {
                    const share = formatSharePercent(entry.myVotes, item.roundTotalVotes);
                    return (
                      <li
                        key={entry.proposalId.toString()}
                        data-testid={`gov-my-votes-entry-${item.round}-${entry.proposalId}`}
                        className="text-sm text-foreground"
                      >
                        <span className="block truncate">
                          {copy.gov.myVotes.entryLine(entry.proposalId.toString(), entry.title)}
                        </span>
                        <span className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
                          <span data-testid={`gov-my-votes-mine-${item.round}-${entry.proposalId}`}>
                            {copy.gov.myVotes.entryMine(
                              formatTokenAmount(entry.myVotes, VOTE_DECIMALS),
                            )}
                          </span>
                          {share === undefined ? null : (
                            <span
                              data-testid={`gov-my-votes-share-${item.round}-${entry.proposalId}`}
                            >
                              {copy.gov.myVotes.entryShare(share)}
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-2" data-testid="gov-my-votes-empty">
            <CardDescription>{copy.gov.myVotes.emptyRecord}</CardDescription>
            <p className="mt-1 text-xs leading-5 text-muted">{copy.gov.myVotes.emptyRecordHint}</p>
          </div>
        )}

        {votes.hasMore && votes.status === 'ready' ? (
          <div className="mt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              data-testid="gov-my-votes-load-more"
              onClick={votes.loadMore}
            >
              {votes.isLoadingMore ? copy.gov.myVotes.loadingMore : copy.gov.myVotes.loadMore}
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function Stat({
  label,
  value,
  testId,
}: {
  readonly label: string;
  readonly value: string;
  readonly testId: string;
}) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-base font-medium text-foreground" data-testid={testId}>
        {value}
      </p>
      <p className="text-xs text-muted">{copy.gov.myVotes.unit}</p>
    </div>
  );
}
