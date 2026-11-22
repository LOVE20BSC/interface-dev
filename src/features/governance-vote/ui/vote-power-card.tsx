import { Link } from 'react-router-dom';
import { copy } from '@/shared/config/copy-pages';
import { formatTokenAmount } from '@/shared/lib/format';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';
import type { VotePower } from '@/entities/gov-core/model/use-vote-power';

/** 治理票 18 位小数（`Stake.govVotes`）。 */
export const VOTE_DECIMALS = 18;

/**
 * 「我的投票额度」卡：列表页与详情页共用同一份呈现（owner 2026-11-22 拆出详情页后
 * 两页都要显示可用票数，避免两套数字样式漂移）。
 */
export function VotePowerCard({
  power,
  symbol,
  testId = 'gov-vote-power',
}: {
  readonly power: VotePower;
  readonly symbol: string;
  readonly testId?: string;
}) {
  const noPower = power.status === 'ready' && power.maxVoteAmount === 0n;
  return (
    <Card data-testid={testId}>
      <CardTitle>{copy.gov.vote.powerTitle}</CardTitle>
      {noPower ? (
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
        // owner 2026-11-22：本轮治理权 = 已投 + 还能投，第三个数字是多余的，只留两格。
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Stat
            label={copy.gov.vote.powerUsed}
            value={power.usedVoteAmount}
            testId={`${testId}-used`}
          />
          <Stat
            label={copy.gov.vote.powerRemaining}
            value={power.remaining}
            testId={`${testId}-remaining`}
          />
        </div>
      )}
      <p className="mt-3 text-xs leading-5 text-muted">{copy.gov.vote.powerNote}</p>
    </Card>
  );
}

export function Stat({
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
        {value === undefined ? copy.common.unknown : formatTokenAmount(value, VOTE_DECIMALS)}
      </p>
    </div>
  );
}
