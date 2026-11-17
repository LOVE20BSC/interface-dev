import { useMemo, useState } from 'react';
import { stakeAbi } from '@/config/abis';
import type { HexAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import {
  increasedPromisedWaitingPhasesVotes,
  isPromisedWaitingPhasesInRange,
  phasesToMinutes,
  stakeUnlockState,
} from '@/domain/gov-stake';
import { formatPercent, formatTokenAmount, UNKNOWN } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';
import { Sheet } from '@/shared/ui/sheet';
import type { MemberStake } from '@/entities/stake/model/use-member-stake';
import type { StakeCommunity } from '@/entities/stake/model/use-stake-community';
import type { StakeParams } from '@/entities/stake/model/use-stake-params';
import type { PhaseClock } from '@/entities/phase/model/use-phase-clock';
import { PHASE_PRESETS, parsePhaseCount } from '@/features/governance-stake/lib/stake-form';
import type { StakeTransactionState } from '@/features/governance-stake/model/use-stake-transaction';
import { StakeStatRow, StakeStateCard } from '@/features/governance-stake/ui/stake-controls';

const VOTE_DECIMALS = 18;
const DEADLINE_SECONDS = 20 * 60;

type SheetKind = 'none' | 'increase' | 'unstake' | 'withdraw';

export interface MyStakePanelProps {
  readonly token: {
    readonly address: HexAddress;
    readonly symbol: string;
    readonly decimals: number | undefined;
  };
  readonly parent: {
    readonly address: HexAddress;
    readonly symbol: string;
    readonly decimals: number | undefined;
  };
  readonly stakeAddress: HexAddress;
  readonly memberId: bigint;
  readonly member: MemberStake;
  readonly community: StakeCommunity;
  readonly params: StakeParams;
  readonly clock: PhaseClock;
  readonly tx: StakeTransactionState;
  readonly disabled: boolean;
  readonly onGoStake: () => void;
}

/**
 * 我的质押：治理权 / 份额 / 承诺解锁期 / 解锁进度，以及三个管理动作
 * （增加承诺解锁期、申请解锁、撤出）。
 *
 * 解锁是两步：申请解锁立刻清空治理权，等 `unlockRequestPhase + 承诺解锁期`
 * 个阶段走完（严格大于）才能撤出。撤出按钮只在链上 `canWithdraw` 为真时可点，
 * 其余时间给出「还要等几个阶段、约几分钟」而不是一个永远灰着的按钮。
 */
export function MyStakePanel({
  token,
  parent,
  stakeAddress,
  memberId,
  member,
  community,
  params,
  clock,
  tx,
  disabled,
  onGoStake,
}: MyStakePanelProps) {
  const [sheet, setSheet] = useState<SheetKind>('none');
  const [newPhasesInput, setNewPhasesInput] = useState('');

  const unlock = useMemo(
    () =>
      stakeUnlockState({
        currentPhase: clock.currentPhase ?? null,
        unlockRequestPhase: member.unlockRequestPhase ?? 0n,
        promisedWaitingPhases: member.promisedWaitingPhases ?? 0n,
        secondsPerPhase: clock.secondsPerPhase ?? null,
      }),
    [
      clock.currentPhase,
      clock.secondsPerPhase,
      member.promisedWaitingPhases,
      member.unlockRequestPhase,
    ],
  );

  const hasStake =
    (member.liquidityShares !== undefined && member.liquidityShares > 0n) ||
    (member.unlockRequestPhase !== undefined && member.unlockRequestPhase > 0n);

  const phasesParsed = parsePhaseCount(newPhasesInput);

  const increasePreview = (() => {
    if (phasesParsed.kind !== 'ok') return undefined;
    if (member.liquidityShares === undefined || member.promisedWaitingPhases === undefined) {
      return undefined;
    }
    if (
      params.minPhases === undefined ||
      params.maxPhases === undefined ||
      !isPromisedWaitingPhasesInRange(phasesParsed.value, params.minPhases, params.maxPhases)
    ) {
      return undefined;
    }
    if (phasesParsed.value <= member.promisedWaitingPhases) return 0n;
    return increasedPromisedWaitingPhasesVotes({
      liquidityShares: member.liquidityShares,
      previousPhases: member.promisedWaitingPhases,
      nextPhases: phasesParsed.value,
    });
  })();

  if (member.status === 'loading' || member.status === 'idle') {
    return (
      <Card data-testid="gov-mine-card">
        <CardTitle>{copy.gov.mine.title}</CardTitle>
        <CardDescription>{copy.gov.stats.loading}</CardDescription>
      </Card>
    );
  }

  if (member.status === 'error') {
    return (
      <StakeStateCard
        testId="gov-mine-read-error"
        title={copy.gov.mine.readError}
        description={copy.gov.stats.errorBody}
      >
        <Button variant="secondary" size="md" onClick={member.refetch}>
          {copy.gov.mine.retry}
        </Button>
      </StakeStateCard>
    );
  }

  const currentPhases = member.promisedWaitingPhases ?? 0n;

  /** 弹层里的就地错误：先区分「没加大」，再区分「越界/非法」，不把两者混成一句范围文案。 */
  const increaseError = (() => {
    if (phasesParsed.kind === 'empty') return undefined;
    if (phasesParsed.kind === 'invalid') return copy.gov.mine.increasePhasesInvalid;
    if (phasesParsed.value < currentPhases + 1n) {
      return copy.gov.mine.increasePhasesMin(formatTokenAmount(currentPhases + 1n, 0));
    }
    if (
      params.minPhases !== undefined &&
      params.maxPhases !== undefined &&
      !isPromisedWaitingPhasesInRange(phasesParsed.value, params.minPhases, params.maxPhases)
    ) {
      return copy.gov.liquidity.phasesInvalid(
        formatTokenAmount(params.minPhases, 0),
        formatTokenAmount(params.maxPhases, 0),
      );
    }
    return undefined;
  })();

  const mySharePercent = (() => {
    if (member.govVotes === undefined || community.totalGovVotes === undefined) return undefined;
    if (community.totalGovVotes === 0n) return 0;
    const basisPoints = (member.govVotes * 10_000n) / community.totalGovVotes;
    return Number(basisPoints) / 100;
  })();

  if (!hasStake) {
    return (
      <div className="space-y-4">
        <StakeStateCard
          testId="gov-mine-empty"
          title={copy.gov.mine.emptyTitle}
          description={copy.gov.mine.emptyBody}
        >
          <Button variant="primary" size="md" onClick={onGoStake}>
            {copy.gov.mine.emptyAction}
          </Button>
        </StakeStateCard>
        <CommunityDataCard community={community} token={token} mySharePercent={mySharePercent} />
      </div>
    );
  }

  const busy = disabled || tx.stage !== 'idle';
  const increaseValid =
    phasesParsed.kind === 'ok' &&
    params.minPhases !== undefined &&
    params.maxPhases !== undefined &&
    isPromisedWaitingPhasesInRange(phasesParsed.value, params.minPhases, params.maxPhases) &&
    phasesParsed.value > currentPhases;

  const runIncrease = () => {
    if (!increaseValid || phasesParsed.kind !== 'ok') return;
    void tx.run(
      {
        address: stakeAddress,
        abi: stakeAbi,
        functionName: 'increasePromisedWaitingPhases',
        args: [token.address, memberId, phasesParsed.value],
      },
      'increasePhases',
    );
    setSheet('none');
  };

  const runUnstake = () => {
    void tx.run(
      {
        address: stakeAddress,
        abi: stakeAbi,
        functionName: 'unstake',
        args: [token.address, memberId],
      },
      'unstake',
    );
    setSheet('none');
  };

  const runWithdraw = () => {
    void tx.run(
      {
        address: stakeAddress,
        abi: stakeAbi,
        functionName: 'withdraw',
        args: [token.address, memberId, BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS)],
      },
      'withdraw',
    );
    setSheet('none');
  };

  return (
    <div className="space-y-4">
      <Card data-testid="gov-mine-card">
        <CardTitle>{copy.gov.mine.title}</CardTitle>
        <div className="mt-3">
          <StakeStatRow
            label={copy.gov.mine.votes}
            value={formatTokenAmount(member.govVotes, VOTE_DECIMALS)}
            note={copy.gov.stats.formula}
            testId="gov-my-votes"
          />
          <StakeStatRow
            label={copy.gov.mine.shares}
            value={formatTokenAmount(member.liquidityShares, VOTE_DECIMALS)}
            testId="gov-my-shares"
          />
          <StakeStatRow
            label={copy.gov.mine.boost}
            value={formatTokenAmount(member.validBoostShares, token.decimals)}
            note={copy.gov.stats.boostNote}
            testId="gov-my-boost"
          />
          <StakeStatRow
            label={copy.gov.mine.phases}
            value={
              member.promisedWaitingPhases === undefined
                ? UNKNOWN
                : (() => {
                    const minutes = phasesToMinutes(
                      member.promisedWaitingPhases,
                      clock.secondsPerPhase ?? null,
                    );
                    const phasesText = formatTokenAmount(member.promisedWaitingPhases, 0);
                    return minutes === null
                      ? copy.gov.stats.phasesValue(phasesText)
                      : copy.gov.stats.phasesValueWithMinutes(phasesText, String(minutes));
                  })()
            }
            testId="gov-my-phases"
          />
          <StakeStatRow
            label={copy.gov.mine.token}
            value={formatTokenAmount(member.tokenAmountForLiquidity, token.decimals)}
            testId="gov-my-token-amount"
          />
          <StakeStatRow
            label={copy.gov.mine.parent}
            value={formatTokenAmount(member.parentTokenAmountForLiquidity, parent.decimals)}
            testId="gov-my-parent-amount"
          />
          {member.boostShares !== undefined && member.boostShares > 0n ? (
            <StakeStatRow
              label={copy.gov.mine.boostAmount}
              value={formatTokenAmount(member.boostShares, token.decimals)}
              testId="gov-my-boost-amount"
            />
          ) : null}
        </div>

        <div
          data-testid="gov-unlock-state"
          className="mt-4 rounded-2xl border border-line bg-elevated/60 px-3 py-2"
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

        <div className="mt-4 space-y-2">
          {unlock.status === 'not-requested' ? (
            <>
              <Button
                variant="secondary"
                size="md"
                className="w-full"
                onClick={() => {
                  setNewPhasesInput(String(currentPhases));
                  setSheet('increase');
                }}
                disabled={
                  busy || member.liquidityShares === undefined || member.liquidityShares === 0n
                }
                data-testid="gov-increase-phases-button"
              >
                {copy.gov.mine.increasePhases}
              </Button>
              <Button
                variant="secondary"
                size="md"
                className="w-full"
                onClick={() => setSheet('unstake')}
                disabled={
                  busy || member.liquidityShares === undefined || member.liquidityShares === 0n
                }
                data-testid="gov-unstake-button"
              >
                {copy.gov.mine.unstake}
              </Button>
              <p className="text-xs leading-5 text-muted">{copy.gov.mine.unstakeHint}</p>
            </>
          ) : unlock.status === 'withdrawable' ? (
            <Button
              variant="primary"
              size="md"
              className="w-full"
              onClick={() => setSheet('withdraw')}
              disabled={busy || member.canWithdraw !== true}
              data-testid="gov-withdraw-button"
            >
              {copy.gov.mine.withdraw}
            </Button>
          ) : unlock.status === 'unknown' ? (
            <Button
              variant="secondary"
              size="md"
              className="w-full"
              disabled
              data-testid="gov-waiting-withdraw"
            >
              {copy.common.loading}
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="md"
              className="w-full"
              disabled
              data-testid="gov-waiting-withdraw"
            >
              {copy.gov.mine.stateUnlocking}
            </Button>
          )}
        </div>
      </Card>

      <CommunityDataCard community={community} token={token} mySharePercent={mySharePercent} />

      <Sheet
        open={sheet === 'increase'}
        onOpenChange={(open) => setSheet(open ? 'increase' : 'none')}
        title={copy.gov.mine.increasePhases}
        description={copy.gov.mine.increasePhasesHint}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {PHASE_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setNewPhasesInput(String(preset))}
                className="rounded-xl border border-line bg-surface px-3 py-1.5 text-sm text-foreground hover:bg-elevated"
              >
                {copy.gov.liquidity.phasesPreset(preset)}
              </button>
            ))}
            <input
              type="text"
              inputMode="numeric"
              value={newPhasesInput}
              onChange={(event) => setNewPhasesInput(event.target.value)}
              aria-label={copy.gov.mine.increasePhases}
              data-testid="gov-increase-phases-input"
              className="w-20 rounded-xl border border-line bg-surface px-2 py-1.5 text-right text-sm text-foreground focus:border-brand focus:outline-none"
            />
            <span className="text-xs text-muted">{copy.gov.liquidity.phasesUnit}</span>
          </div>
          {increasePreview !== undefined && increasePreview > 0n ? (
            <p data-testid="gov-increase-preview" className="text-sm leading-6 text-foreground">
              {copy.gov.receipt.votes(formatTokenAmount(increasePreview, VOTE_DECIMALS))}
            </p>
          ) : null}
          {increaseError !== undefined ? (
            <p
              data-testid="gov-increase-phases-error"
              className="text-sm leading-6 text-danger-strong"
            >
              {increaseError}
            </p>
          ) : null}
          <div className="flex flex-col gap-2">
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={runIncrease}
              disabled={!increaseValid || busy}
              data-testid="gov-increase-phases-submit"
            >
              {copy.gov.mine.increasePhasesSubmit}
            </Button>
            <Button variant="ghost" size="md" className="w-full" onClick={() => setSheet('none')}>
              {copy.common.cancel}
            </Button>
          </div>
        </div>
      </Sheet>

      <Sheet
        open={sheet === 'unstake'}
        onOpenChange={(open) => setSheet(open ? 'unstake' : 'none')}
        title={copy.gov.mine.unstakeTitle}
        description={copy.gov.mine.unstakeBody}
      >
        <div className="flex flex-col gap-2">
          <Button
            variant="danger"
            size="lg"
            className="w-full"
            onClick={runUnstake}
            disabled={busy}
            data-testid="gov-unstake-confirm"
          >
            {copy.gov.mine.unstakeConfirm}
          </Button>
          <Button variant="ghost" size="md" className="w-full" onClick={() => setSheet('none')}>
            {copy.common.cancel}
          </Button>
        </div>
      </Sheet>

      <Sheet
        open={sheet === 'withdraw'}
        onOpenChange={(open) => setSheet(open ? 'withdraw' : 'none')}
        title={copy.gov.mine.withdrawTitle}
        description={copy.gov.mine.withdrawBody}
      >
        <div className="flex flex-col gap-2">
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={runWithdraw}
            disabled={busy}
            data-testid="gov-withdraw-confirm"
          >
            {copy.gov.mine.withdrawConfirm}
          </Button>
          <Button variant="ghost" size="md" className="w-full" onClick={() => setSheet('none')}>
            {copy.common.cancel}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

interface CommunityDataCardProps {
  readonly community: StakeCommunity;
  readonly token: {
    readonly address: HexAddress;
    readonly symbol: string;
    readonly decimals: number | undefined;
  };
  readonly mySharePercent: number | undefined;
}

/**
 * 社区治理数据卡：空态（撤出后）也要显示——用户仍想知道社区盘子的规模与自己的
 * 占比变成 0，而不是整块消失（三线 §3 的「撤出后仍显示社区数据」）。
 */
function CommunityDataCard({ community, token, mySharePercent }: CommunityDataCardProps) {
  return (
    <Card data-testid="gov-community-card">
      <CardTitle>{copy.gov.community.title}</CardTitle>
      <div className="mt-3">
        <StakeStatRow
          label={copy.gov.community.totalVotes}
          value={
            community.status === 'error'
              ? copy.gov.community.unavailable
              : formatTokenAmount(community.totalGovVotes, VOTE_DECIMALS)
          }
          testId="gov-community-votes"
        />
        <StakeStatRow
          label={copy.gov.community.totalShares}
          value={formatTokenAmount(community.totalLiquidityShares, VOTE_DECIMALS)}
          testId="gov-community-shares"
        />
        <StakeStatRow
          label={copy.gov.community.myShare}
          value={mySharePercent === undefined ? UNKNOWN : `${formatPercent(mySharePercent)}%`}
          testId="gov-community-share"
        />
        <StakeStatRow
          label={copy.gov.community.totalBoost}
          value={formatTokenAmount(community.totalValidBoostShares, token.decimals)}
          testId="gov-community-boost"
        />
        <StakeStatRow
          label={copy.gov.community.burned}
          value={formatTokenAmount(community.totalBurnedToken, token.decimals)}
          testId="gov-community-burned"
        />
      </div>
    </Card>
  );
}
