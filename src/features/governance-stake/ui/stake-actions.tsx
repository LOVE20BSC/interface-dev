import { useState } from 'react';
import { stakeAbi } from '@/config/abis';
import { copy } from '@/shared/config/copy-pages';
import {
  increasedPromisedWaitingPhasesVotes,
  isPromisedWaitingPhasesInRange,
  phasesToMinutes,
} from '@/domain/gov-stake';
import { formatTokenAmount } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { Sheet } from '@/shared/ui/sheet';
import {
  PHASE_PRESETS,
  parsePhaseCount,
  stakeDeadline,
} from '@/features/governance-stake/lib/stake-form';
import type { GovContextValue } from '@/features/governance-stake/model/use-gov-context';
import { hasStakePosition } from '@/features/governance-stake/ui/my-stake-summary';

type SheetKind = 'none' | 'increase' | 'unstake' | 'withdraw';

export interface StakeActionsProps {
  readonly ctx: GovContextValue;
  /** 旧页面的按钮顺序：取消质押页把「申请解锁 / 撤出」放主位。 */
  readonly testIdPrefix?: string;
}

/**
 * 质押仓位的三个动作：增加承诺解锁期 / 申请解锁 / 撤出（TKM 旧版把
 * 「取消质押 → 等解锁期 → 取回」做成一条阶梯，这里按新协议同样拆两步）。
 *
 * 按钮按解锁状态出现：正常质押中 → 可增加解锁期或申请解锁；已申请解锁 → 等；
 * 到期 → 只能撤出。合约闸门（`canWithdraw`）优先于前端状态。
 */
export function StakeActions({ ctx, testIdPrefix = 'gov' }: StakeActionsProps) {
  const { member, clock, params, token, stakeAddress, memberId, tx } = ctx;
  const [sheet, setSheet] = useState<SheetKind>('none');
  const [newPhasesInput, setNewPhasesInput] = useState('');

  if (
    member.status !== 'ready' ||
    !hasStakePosition(member) ||
    token === undefined ||
    stakeAddress === undefined ||
    memberId === undefined ||
    member.promisedWaitingPhases === undefined ||
    member.unlockRequestPhase === undefined
  ) {
    return null;
  }

  const busy = tx.stage !== 'idle' || tx.approveStage !== 'idle' || tx.receipt !== null;
  const currentPhases = member.promisedWaitingPhases;
  const unlockRequestPhase = member.unlockRequestPhase;
  const notRequested = unlockRequestPhase === 0n;
  const withdrawReady = member.canWithdraw === true && !notRequested;

  const phasesParsed = parsePhaseCount(newPhasesInput);
  const increaseValid =
    phasesParsed.kind === 'ok' &&
    params.minPhases !== undefined &&
    params.maxPhases !== undefined &&
    isPromisedWaitingPhasesInRange(phasesParsed.value, params.minPhases, params.maxPhases) &&
    phasesParsed.value > currentPhases;

  const increasePreview =
    increaseValid && phasesParsed.kind === 'ok' && member.liquidityShares !== undefined
      ? increasedPromisedWaitingPhasesVotes({
          liquidityShares: member.liquidityShares,
          previousPhases: currentPhases,
          nextPhases: phasesParsed.value,
        })
      : undefined;

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
        args: [token.address, memberId, stakeDeadline()],
      },
      'withdraw',
    );
    setSheet('none');
  };

  const currentPhase = clock.currentPhase ?? null;
  const waitingPhases = (() => {
    if (unlockRequestPhase === 0n || currentPhase === null) return undefined;
    const withdrawAt = unlockRequestPhase + currentPhases;
    if (currentPhase > withdrawAt) return undefined;
    const phases = withdrawAt - currentPhase + 1n;
    return {
      phases,
      minutes: phasesToMinutes(phases, clock.secondsPerPhase ?? null),
    };
  })();

  return (
    <div className="space-y-2">
      {notRequested ? (
        <>
          <Button
            variant="secondary"
            size="md"
            className="w-full"
            onClick={() => {
              setNewPhasesInput(String(currentPhases + 1n));
              setSheet('increase');
            }}
            disabled={busy}
            data-testid={`${testIdPrefix}-increase-phases-button`}
          >
            {copy.gov.mine.increasePhases}
          </Button>
          <Button
            variant="secondary"
            size="md"
            className="w-full"
            onClick={() => setSheet('unstake')}
            disabled={busy}
            data-testid={`${testIdPrefix}-unstake-button`}
          >
            {copy.gov.mine.unstake}
          </Button>
          <p className="text-xs leading-5 text-muted">{copy.gov.mine.unstakeHint}</p>
        </>
      ) : withdrawReady ? (
        <Button
          variant="primary"
          size="md"
          className="w-full"
          onClick={() => setSheet('withdraw')}
          disabled={busy}
          data-testid={`${testIdPrefix}-withdraw-button`}
        >
          {copy.gov.mine.withdraw}
        </Button>
      ) : (
        <>
          <Button
            variant="secondary"
            size="md"
            className="w-full"
            disabled
            data-testid={`${testIdPrefix}-waiting-withdraw`}
          >
            {copy.gov.mine.stateUnlocking}
          </Button>
          {waitingPhases !== undefined ? (
            <p className="text-xs leading-5 text-muted" data-testid={`${testIdPrefix}-unlock-note`}>
              {copy.gov.unstakePage.waiting(
                formatTokenAmount(waitingPhases.phases, 0),
                waitingPhases.minutes === null ? null : String(waitingPhases.minutes),
              )}
            </p>
          ) : null}
        </>
      )}

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
              data-testid={`${testIdPrefix}-increase-phases-input`}
              className="w-20 rounded-xl border border-line bg-surface px-2 py-1.5 text-right text-sm text-foreground focus:border-brand focus:outline-none"
            />
            <span className="text-xs text-muted">{copy.gov.liquidity.phasesUnit}</span>
          </div>
          {increasePreview !== undefined && increasePreview > 0n ? (
            <p
              className="text-sm leading-6 text-foreground"
              data-testid={`${testIdPrefix}-increase-preview`}
            >
              {copy.gov.receipt.votes(formatTokenAmount(increasePreview, 18))}
            </p>
          ) : null}
          {increaseError !== undefined ? (
            <p
              className="text-sm leading-6 text-danger-strong"
              data-testid={`${testIdPrefix}-increase-phases-error`}
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
              data-testid={`${testIdPrefix}-increase-phases-submit`}
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
            data-testid={`${testIdPrefix}-unstake-confirm`}
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
            data-testid={`${testIdPrefix}-withdraw-confirm`}
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
