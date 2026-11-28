import { Link } from 'react-router-dom';
import { VOTE_DECIMALS } from '@/domain/gov-core';
import { copy } from '@/shared/config/copy-pages';
import { formatTokenAmount } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import type { VoteQuota } from '@/entities/gov-core/model/use-vote-quota';

/**
 * 「我的投票额度」卡：列表页与详情页共用同一份呈现（owner 2026-11-22 拆出详情页后
 * 两页都要显示可用票数，避免两套数字样式漂移）。
 */
export function VoteQuotaCard({
  quota,
  symbol,
  testId = 'gov-vote-quota',
}: {
  readonly quota: VoteQuota;
  readonly symbol: string;
  readonly testId?: string;
}) {
  return (
    <Card data-testid={testId} aria-busy={quota.status === 'loading' || undefined}>
      <CardTitle>{copy.gov.vote.quotaTitle}</CardTitle>
      {quota.status === 'error' ? (
        <>
          <CardDescription role="alert">{copy.gov.vote.quotaReadFailed}</CardDescription>
          <Button variant="secondary" className="mt-3" onClick={quota.refetch}>
            {copy.gov.vote.retry}
          </Button>
        </>
      ) : quota.status === 'loading' ? (
        <>
          <span className="sr-only">{copy.common.loading}</span>
          <Skeleton className="mt-3 h-10 w-full" />
        </>
      ) : quota.maxVoteAmount === 0n && quota.usedVoteAmount === 0n ? (
        <>
          <CardDescription>{copy.gov.vote.noPowerBody}</CardDescription>
          <Link
            to={`/stake/liquidity?symbol=${encodeURIComponent(symbol)}`}
            className="mt-4 inline-flex h-11 items-center justify-center rounded-2xl bg-brand px-4 text-sm font-medium text-on-brand"
          >
            {copy.gov.vote.noPowerAction}
          </Link>
        </>
      ) : (
        // owner 2026-11-22：只保留已投与还能投，方便看当轮用掉多少票。
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Stat
            label={copy.gov.vote.quotaUsedLabel}
            value={quota.usedVoteAmount}
            testId={`${testId}-used`}
          />
          <Stat
            label={copy.gov.vote.quotaRemaining}
            value={quota.remaining}
            testId={`${testId}-remaining`}
          />
        </div>
      )}
      <p className="mt-3 text-xs leading-5 text-muted">{copy.gov.stats.formula}</p>
    </Card>
  );
}

function Stat({
  label,
  value,
  testId,
}: {
  readonly label: string;
  readonly value: bigint | undefined;
  readonly testId: string;
}) {
  return (
    <div>
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-foreground" data-testid={testId}>
        {value === undefined
          ? copy.common.unknown
          : copy.gov.vote.count(formatTokenAmount(value, VOTE_DECIMALS))}
      </p>
    </div>
  );
}
