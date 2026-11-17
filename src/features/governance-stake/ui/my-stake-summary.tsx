import { copy } from '@/shared/config/copy-pages';
import { formatTokenAmount, UNKNOWN } from '@/shared/lib/format';
import { stakeUnlockState } from '@/domain/gov-stake';
import { phasesToMinutes } from '@/domain/gov-stake';
import type { MemberStake } from '@/entities/stake/model/use-member-stake';
import type { PhaseClock } from '@/entities/phase/model/use-phase-clock';
import { StakeStatRow } from '@/features/governance-stake/ui/stake-controls';

const VOTE_DECIMALS = 18;

export interface MyStakeSummaryProps {
  readonly member: MemberStake;
  readonly clock: PhaseClock;
  readonly token: { readonly symbol: string; readonly decimals: number | undefined };
  readonly parent: { readonly symbol: string; readonly decimals: number | undefined };
  readonly testIdPrefix?: string;
}

/** 「我的质押」是否为空仓位：份额与解锁申请都为 0。 */
export function hasStakePosition(member: MemberStake): boolean {
  return (member.liquidityShares ?? 0n) > 0n || (member.unlockRequestPhase ?? 0n) > 0n;
}

/**
 * 我的质押摘要（TKM 旧版 `MyLiquidityStakePanel` / `MyGovInfoPanel` 的等价块，按新
 * 协议换成「治理权 = 流动性质押份额 × 承诺解锁期」这套口径）。
 *
 * 只读：数值都来自 `memberStake` / `govVotes` / `validBoostShares`；未知给「—」。
 */
export function MyStakeSummary({
  member,
  clock,
  token,
  parent,
  testIdPrefix = 'gov-my',
}: MyStakeSummaryProps) {
  const unlock = stakeUnlockState({
    currentPhase: clock.currentPhase ?? null,
    unlockRequestPhase: member.unlockRequestPhase ?? 0n,
    promisedWaitingPhases: member.promisedWaitingPhases ?? 0n,
    secondsPerPhase: clock.secondsPerPhase ?? null,
  });

  const phasesText =
    member.promisedWaitingPhases === undefined
      ? UNKNOWN
      : (() => {
          const minutes = phasesToMinutes(
            member.promisedWaitingPhases,
            clock.secondsPerPhase ?? null,
          );
          const phases = formatTokenAmount(member.promisedWaitingPhases, 0);
          return minutes === null
            ? copy.gov.stats.phasesValue(phases)
            : copy.gov.stats.phasesValueWithMinutes(phases, String(minutes));
        })();

  return (
    <div>
      <StakeStatRow
        label={copy.gov.mine.votes}
        value={formatTokenAmount(member.govVotes, VOTE_DECIMALS)}
        note={copy.gov.stats.formula}
        testId={`${testIdPrefix}-votes`}
      />
      <StakeStatRow
        label={copy.gov.mine.shares}
        value={formatTokenAmount(member.liquidityShares, VOTE_DECIMALS)}
        testId={`${testIdPrefix}-shares`}
      />
      <StakeStatRow
        label={copy.gov.mine.boost}
        value={formatTokenAmount(member.validBoostShares, token.decimals)}
        note={copy.gov.stats.boostNote}
        testId={`${testIdPrefix}-boost`}
      />
      <StakeStatRow
        label={copy.gov.mine.phases}
        value={phasesText}
        testId={`${testIdPrefix}-phases`}
      />
      <StakeStatRow
        label={copy.gov.mine.token}
        value={formatTokenAmount(member.tokenAmountForLiquidity, token.decimals)}
        testId={`${testIdPrefix}-token-amount`}
      />
      <StakeStatRow
        label={copy.gov.mine.parent}
        value={formatTokenAmount(member.parentTokenAmountForLiquidity, parent.decimals)}
        testId={`${testIdPrefix}-parent-amount`}
      />
      {member.boostShares !== undefined && member.boostShares > 0n ? (
        <StakeStatRow
          label={copy.gov.mine.boostAmount}
          value={formatTokenAmount(member.boostShares, token.decimals)}
          testId={`${testIdPrefix}-boost-amount`}
        />
      ) : null}

      <div
        data-testid={`${testIdPrefix}-unlock-state`}
        className="mt-3 rounded-2xl border border-line bg-elevated/60 px-3 py-2"
      >
        <p className="text-sm font-medium text-foreground">
          {unlock.status === 'not-requested'
            ? copy.gov.mine.stateStaked
            : unlock.status === 'unlocking'
              ? copy.gov.mine.stateUnlocking
              : unlock.status === 'withdrawable'
                ? copy.gov.mine.stateWithdrawable
                : copy.gov.mine.stateUnknown}
        </p>
        <p className="mt-1 text-xs leading-5 text-muted">
          {unlock.status === 'not-requested'
            ? copy.gov.mine.stateStakedNote
            : unlock.status === 'unlocking'
              ? copy.gov.mine.stateUnlockingNote(
                  formatTokenAmount(unlock.phasesRemaining, 0),
                  unlock.minutes === null ? null : String(unlock.minutes),
                )
              : unlock.status === 'withdrawable'
                ? copy.gov.mine.stateWithdrawableNote
                : copy.gov.mine.stateUnknown}
        </p>
      </div>
    </div>
  );
}
