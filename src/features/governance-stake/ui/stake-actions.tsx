import { useState } from 'react';
import { stakeAbi } from '@/config/abis';
import { copy } from '@/shared/config/copy-pages';
import { phasesToMinutes } from '@/domain/gov-stake';
import { formatTokenAmount } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { Sheet } from '@/shared/ui/sheet';
import { stakeDeadline } from '@/features/governance-stake/lib/stake-form';
import type { GovContextValue } from '@/features/governance-stake/model/use-gov-context';
import { IncreasePhasesSheet } from '@/features/governance-stake/ui/increase-phases-sheet';
import { hasStakePosition } from '@/features/governance-stake/ui/my-stake-summary';

type SheetKind = 'none' | 'increase' | 'unstake' | 'withdraw';

export interface StakeActionsProps {
  readonly ctx: GovContextValue;
  /** 旧页面的按钮顺序：取消质押页把「申请解锁 / 撤出」放主位。 */
  readonly testIdPrefix?: string;
}

/**
 * 质押仓位的动作：调整承诺解锁期 / 申请解锁 / 撤出（TKM 旧版把
 * 「取消质押 → 等解锁期 → 取回」做成一条阶梯，这里按新协议拆两步）。
 *
 * 申请解锁与撤出的按钮按解锁状态出现；调整承诺解锁期复用与质押页同一张弹层
 * （owner 2026-11-18：承诺解锁期是单独可调整的一项，不在新增质押里选择）。
 */
export function StakeActions({ ctx, testIdPrefix = 'gov' }: StakeActionsProps) {
  const { member, clock, token, stakeAddress, memberId, tx } = ctx;
  const [sheet, setSheet] = useState<SheetKind>('none');

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
            onClick={() => setSheet('increase')}
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

      <IncreasePhasesSheet
        open={sheet === 'increase'}
        onOpenChange={(open) => setSheet(open ? 'increase' : 'none')}
        ctx={ctx}
        testIdPrefix={`${testIdPrefix}-increase-phases`}
      />

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
