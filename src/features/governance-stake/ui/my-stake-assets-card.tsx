import { useState } from 'react';
import { Link } from 'react-router-dom';
import { copy } from '@/shared/config/copy-pages';
import { stakeUnlockState } from '@/domain/gov-stake';
import { formatTokenAmount, UNKNOWN } from '@/shared/lib/format';
import { Card } from '@/shared/ui/card';
import { Info } from '@/shared/ui/icons';
import { Sheet } from '@/shared/ui/sheet';
import type { GovContextValue } from '@/features/governance-stake/model/use-gov-context';
import { hasStakePosition } from '@/features/governance-stake/ui/my-stake-summary';
import { StakeStateCard } from '@/features/governance-stake/ui/stake-controls';

const VOTE_DECIMALS = 18;

/** 金额 + 代币符号；精度或符号缺失时按「未知」处理，不拼出半个单位。 */
function amountText(
  value: bigint | undefined,
  decimals: number | undefined,
  symbol: string | undefined,
): string {
  if (decimals === undefined || symbol === undefined || symbol === '') return UNKNOWN;
  return `${formatTokenAmount(value, decimals)} ${symbol}`;
}

export interface MyStakeAssetsCardProps {
  readonly ctx: GovContextValue;
}

/** 信息弹层里的一行：标签 + 数值（未知显示「—」）。 */
function InfoRow({
  label,
  value,
  testId,
}: {
  readonly label: string;
  readonly value: string;
  readonly testId: string;
}) {
  return (
    <div className="flex items-start justify-between gap-2 py-1.5 text-xs leading-5">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd
        className="min-w-0 break-words text-right font-medium text-foreground"
        data-testid={testId}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * 「我的」页 → 质押资产 tab 的流动性质押卡（owner 2026-11-18 23:20 从治理首页挪来并按
 * 他的要求精简）：
 *
 * - 只留两行：流动性质押份额（旁边一个信息按钮，点开显示份额与预计可取回代币）、
 *   加速激励质押量（数据源 = `memberStake.boostShares`，即已质押的加速量；不按阶段折算，
 *   也不再出现「只统计本阶段有效」的小字）；
 * - 「正常质押中」与「提高承诺解锁期」都删掉：解锁状态只在解锁中/可撤出时提示，
 *   提高承诺解锁期在流动性质押 / 加速激励质押页顶部统一调整；
 * - 申请解锁（或撤出 / 查看解锁进度）改成卡片右上角的链接，而不是按钮。
 */
export function MyStakeAssetsCard({ ctx }: MyStakeAssetsCardProps) {
  const { member, clock, token, parent, selected } = ctx;
  const [infoOpen, setInfoOpen] = useState(false);
  const memberLabel =
    selected === null ? copy.common.unknown : copy.identity.memberId(selected.tokenId.toString());
  const memberName = selected?.name ?? copy.common.unknown;
  const q = `?symbol=${encodeURIComponent(ctx.symbol)}`;
  const unstakePath = `/stake/unstake${q}`;
  const goStakePath = `/stake/liquidity${q}`;

  if (member.status === 'loading' || member.status === 'idle') {
    return (
      <StakeStateCard
        testId="me-stake-loading"
        title={copy.gov.myLiquidityTitle}
        description={copy.gov.stats.loading}
      />
    );
  }

  if (member.status === 'error') {
    return (
      <StakeStateCard
        testId="me-stake-error"
        title={copy.gov.stats.errorTitle}
        description={copy.gov.stats.errorBody}
      >
        <button type="button" className="text-sm font-medium text-brand-strong" onClick={ctx.retry}>
          {copy.gov.stats.retry}
        </button>
      </StakeStateCard>
    );
  }

  if (!hasStakePosition(member)) {
    return (
      <StakeStateCard
        testId="me-stake-empty"
        title={copy.gov.mine.emptyTitle}
        description={copy.gov.mine.emptyBody}
      >
        <Link to={goStakePath} className="text-sm font-medium text-brand-strong">
          {copy.gov.mine.emptyAction}
        </Link>
      </StakeStateCard>
    );
  }

  const unlock = stakeUnlockState({
    currentPhase: clock.currentPhase ?? null,
    unlockRequestPhase: member.unlockRequestPhase ?? 0n,
    promisedWaitingPhases: member.promisedWaitingPhases ?? 0n,
    secondsPerPhase: clock.secondsPerPhase ?? null,
  });

  // 已申请解锁但当前阶段读不到时不能显示「申请解锁」（会误导用户以为还没申请）。
  const actionLabel =
    unlock.status === 'withdrawable'
      ? copy.gov.mine.withdraw
      : unlock.status === 'unlocking' || unlock.status === 'unknown'
        ? copy.gov.mine.unlockProgressLink
        : copy.gov.mine.unstake;

  return (
    <Card data-testid="me-stake-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {/* owner 2026-11-19：标题位改为身份 NFT 的编号与名字 */}
          <span className="shrink-0 font-mono text-base font-semibold text-foreground">
            {memberLabel}
          </span>
          <span className="min-w-0 truncate text-sm font-medium text-muted">{memberName}</span>
          <button
            type="button"
            aria-label={copy.gov.mine.infoAria}
            data-testid="me-stake-info"
            onClick={() => setInfoOpen(true)}
            className="shrink-0 rounded-full p-1 text-muted transition-colors hover:bg-elevated hover:text-brand-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong"
          >
            <Info aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
        <Link
          to={unstakePath}
          data-testid="me-stake-action-link"
          className="shrink-0 whitespace-nowrap text-sm font-medium text-brand-strong underline-offset-4 hover:underline"
        >
          {actionLabel}
        </Link>
      </div>

      <dl className="mt-2 divide-y divide-line">
        <div className="flex items-center justify-between gap-3 py-2.5">
          <dt className="text-sm text-muted">{copy.gov.mine.shares}</dt>
          <dd
            className="min-w-0 truncate text-sm font-medium text-foreground"
            data-testid="me-stake-shares"
          >
            {formatTokenAmount(member.liquidityShares, VOTE_DECIMALS)}
          </dd>
        </div>

        <div className="flex items-center justify-between gap-3 py-2.5">
          <dt className="text-sm text-muted">{copy.gov.mine.boostStake}</dt>
          <dd
            className="min-w-0 truncate text-sm font-medium text-foreground"
            data-testid="me-stake-boost"
          >
            {formatTokenAmount(member.boostShares, token?.decimals)}
          </dd>
        </div>
      </dl>

      {unlock.status === 'unlocking' ? (
        <p className="mt-2 text-xs leading-5 text-muted" data-testid="me-stake-unlock-note">
          {copy.gov.unstakePage.waiting(
            formatTokenAmount(unlock.phasesRemaining, 0),
            unlock.minutes === null ? null : String(unlock.minutes),
          )}
        </p>
      ) : unlock.status === 'unknown' ? (
        <p className="mt-2 text-xs leading-5 text-muted" data-testid="me-stake-unlock-note">
          {copy.gov.mine.stateUnknown}
        </p>
      ) : null}

      <Sheet open={infoOpen} onOpenChange={setInfoOpen} title={copy.gov.mine.infoTitle}>
        <div data-testid="me-stake-info-panel">
          <dl className="divide-y divide-line/60">
            <InfoRow
              label={copy.gov.mine.shares}
              value={formatTokenAmount(member.liquidityShares, VOTE_DECIMALS)}
              testId="me-stake-info-shares"
            />
            <InfoRow
              label={copy.gov.mine.token}
              value={amountText(member.tokenAmountForLiquidity, token?.decimals, token?.symbol)}
              testId="me-stake-info-token"
            />
            <InfoRow
              label={copy.gov.mine.parent}
              value={amountText(
                member.parentTokenAmountForLiquidity,
                parent?.decimals,
                parent?.symbol,
              )}
              testId="me-stake-info-parent"
            />
            {member.boostShares !== undefined && member.boostShares > 0n ? (
              <InfoRow
                label={copy.gov.mine.boostAmount}
                value={amountText(member.boostShares, token?.decimals, token?.symbol)}
                testId="me-stake-info-boost"
              />
            ) : null}
          </dl>
        </div>
      </Sheet>
    </Card>
  );
}
