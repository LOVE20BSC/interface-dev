import { Link } from 'react-router-dom';
import type { HexAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { formatTokenAmount } from '@/shared/lib/format';
import { Button, buttonStyles } from '@/shared/ui/button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { useMyVotes } from '@/entities/gov-core/model/use-my-votes';
import { useVotePower } from '@/entities/gov-core/model/use-vote-power';
import { MyVoteRounds } from './my-vote-rounds';

/** 治理票是 18 位小数的数量（`Stake.govVotes`）。 */
const VOTE_DECIMALS = 18;
/** 卡片只预览最近两轮，完整记录在 `/vote/records`（owner 2026-11-21）。 */
const PREVIEW_ROUNDS = 2;

export interface MyVotesCardProps {
  readonly tokenAddress: HexAddress | undefined;
  readonly memberId: bigint | undefined;
  readonly round: bigint | undefined;
  readonly symbol: string;
}

/**
 * 治理首页「我的投票」卡（owner 2026-11-21：仿旧库 `MyVotingPanel` + `/vote/records`，
 * 布局重新设计；同日复核后去掉「本轮可投」——它等于上面摘要卡里的「有效治理权」，
 * 同页重复展示，只留「已投 / 未投」）。
 *
 * 内容对应关系：
 * - 两格 ← 旧 `MyVotingPanel` 的「我的已投票数 / 我的未投票数」；
 * - 主按钮「去投票」← 旧版同款入口（本轮投完变禁用，无治理权改引导句）；
 * - 记录区 ← 旧 `MyVotingPanel` 的右链接「我的投票记录 >>」+ `/vote/records` 的预览；
 *   卡片只给最近两轮，完整列表在独立页 `/vote/records`。
 *
 * 读失败给「读不到 + 重试」，不把未知渲染成 0（硬规则 4）。
 */
export function MyVotesCard({ tokenAddress, memberId, round, symbol }: MyVotesCardProps) {
  const power = useVotePower(tokenAddress, round, memberId, []);
  const votes = useMyVotes(tokenAddress, {
    memberId,
    currentPhase: round,
    pageSize: PREVIEW_ROUNDS,
  });

  const q = `?symbol=${encodeURIComponent(symbol)}`;
  const remaining = power.remaining;
  const hasRecord = votes.rounds.length > 0;

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

      {/* 「本轮可投」不在这里重复：它等于上面摘要卡的「我的有效治理权」。 */}
      <div className="mt-3 grid grid-cols-2 gap-2">
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
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-xs font-medium text-muted">{copy.gov.myVotes.recordTitle}</p>
          <Link
            to={`/vote/records${q}`}
            data-testid="gov-my-votes-all-link"
            className="text-xs font-medium text-brand-strong"
          >
            {copy.gov.myVotes.previewLink}
            <span aria-hidden="true"> &gt;&gt;</span>
          </Link>
        </div>

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
        ) : votes.status === 'loading' ? (
          <div className="mt-2 space-y-2" data-testid="gov-my-votes-loading">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-28" />
          </div>
        ) : hasRecord ? (
          <MyVoteRounds rounds={votes.rounds} testIdPrefix="gov-my-votes" />
        ) : (
          <div className="mt-2" data-testid="gov-my-votes-empty">
            <CardDescription>{copy.gov.myVotes.emptyRecord}</CardDescription>
            <p className="mt-1 text-xs leading-5 text-muted">{copy.gov.myVotes.emptyRecordHint}</p>
          </div>
        )}
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
