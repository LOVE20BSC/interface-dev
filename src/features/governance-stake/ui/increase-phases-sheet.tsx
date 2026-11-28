import { useEffect, useState } from 'react';
import { stakeAbi } from '@/config/abis';
import { copy } from '@/shared/config/copy-pages';
import {
  govPowerAddedByIncreasingPhases,
  isPromisedWaitingPhasesInRange,
} from '@/domain/gov-stake';
import { formatTokenAmount } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { Sheet } from '@/shared/ui/sheet';
import { phaseDurationText } from '@/features/governance-stake/lib/phase-duration';
import { PHASE_PRESETS, parsePhaseCount } from '@/features/governance-stake/lib/stake-form';
import type { GovContextValue } from '@/features/governance-stake/model/use-gov-context';

export interface IncreasePhasesSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly ctx: GovContextValue;
  readonly testIdPrefix?: string;
}

/**
 * 「调整承诺解锁期」弹层（owner 2026-11-18：对已有流动性质押的用户，承诺解锁期
 * 是单独可调整的一项，不在新增质押时选择）。
 *
 * 合约规则：只能加大、不能缩短；每加 1 个阶段，治理权按流动性质押份额增加。
 * 加完后治理权立刻变化（治理权 = 份额 × 承诺解锁期）。
 */
export function IncreasePhasesSheet({
  open,
  onOpenChange,
  ctx,
  testIdPrefix = 'gov-phases',
}: IncreasePhasesSheetProps) {
  const { member, params, token, stakeAddress, memberId, tx } = ctx;
  const [input, setInput] = useState('');

  const currentPhases = member.promisedWaitingPhases ?? 0n;

  // 每次打开都把输入重置为「当前值 + 1」：上一次的输入不应该留到下一次调整。
  /* eslint-disable react-hooks/set-state-in-effect -- 打开弹层时重置本地输入 */
  useEffect(() => {
    if (open) setInput(String(currentPhases + 1n));
  }, [open, currentPhases]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const parsed = parsePhaseCount(input);
  const valid =
    parsed.kind === 'ok' &&
    params.minPhases !== undefined &&
    params.maxPhases !== undefined &&
    isPromisedWaitingPhasesInRange(parsed.value, params.minPhases, params.maxPhases) &&
    parsed.value > currentPhases;

  const preview =
    valid && parsed.kind === 'ok' && member.liquidityShares !== undefined
      ? govPowerAddedByIncreasingPhases({
          liquidityShares: member.liquidityShares,
          previousPhases: currentPhases,
          nextPhases: parsed.value,
        })
      : undefined;

  const error = (() => {
    if (parsed.kind === 'empty') return undefined;
    if (parsed.kind === 'invalid') return copy.gov.mine.increasePhasesInvalid;
    if (parsed.value < currentPhases + 1n) {
      return copy.gov.mine.increasePhasesMin(formatTokenAmount(currentPhases + 1n, 0));
    }
    if (
      params.minPhases !== undefined &&
      params.maxPhases !== undefined &&
      !isPromisedWaitingPhasesInRange(parsed.value, params.minPhases, params.maxPhases)
    ) {
      return copy.gov.liquidity.phasesInvalid(
        formatTokenAmount(params.minPhases, 0),
        formatTokenAmount(params.maxPhases, 0),
      );
    }
    return undefined;
  })();

  const busy = tx.stage !== 'idle' || tx.approveStage !== 'idle' || tx.receipt !== null;
  const ready =
    valid && !busy && token !== undefined && stakeAddress !== undefined && memberId !== undefined;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={copy.gov.phasesAdjust.title}
      description={copy.gov.phasesAdjust.body}
    >
      <div className="space-y-4">
        <p className="text-sm leading-6 text-muted">
          {copy.gov.phasesAdjust.current(
            formatTokenAmount(currentPhases, 0),
            phaseDurationText(currentPhases, ctx.clock.secondsPerPhase ?? null),
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {PHASE_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setInput(String(preset))}
              className="rounded-xl border border-line bg-surface px-3 py-1.5 text-sm text-foreground hover:bg-elevated"
            >
              {copy.gov.liquidity.phasesPreset(preset)}
            </button>
          ))}
          <input
            type="text"
            inputMode="numeric"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            aria-label={copy.gov.phasesAdjust.title}
            data-testid={`${testIdPrefix}-input`}
            className="w-20 rounded-xl border border-line bg-surface px-2 py-1.5 text-right text-sm text-foreground focus:border-brand-strong focus:outline-none"
          />
          <span className="text-xs text-muted">{copy.gov.liquidity.phasesUnit}</span>
        </div>
        {preview !== undefined && preview > 0n ? (
          <p className="text-sm leading-6 text-foreground" data-testid={`${testIdPrefix}-preview`}>
            {copy.gov.receipt.govPowerAdded(formatTokenAmount(preview, 18))}
          </p>
        ) : null}
        {error !== undefined ? (
          <p className="text-sm leading-6 text-danger-strong" data-testid={`${testIdPrefix}-error`}>
            {error}
          </p>
        ) : null}
        <div className="flex flex-col gap-2">
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            disabled={!ready}
            data-testid={`${testIdPrefix}-submit`}
            onClick={() => {
              if (
                !ready ||
                parsed.kind !== 'ok' ||
                token === undefined ||
                stakeAddress === undefined ||
                memberId === undefined
              ) {
                return;
              }
              void tx.run(
                {
                  address: stakeAddress,
                  abi: stakeAbi,
                  functionName: 'increasePromisedWaitingPhases',
                  args: [token.address, memberId, parsed.value],
                },
                'increasePhases',
              );
              onOpenChange(false);
            }}
          >
            {copy.gov.mine.increasePhasesSubmit}
          </Button>
          <Button variant="ghost" size="md" className="w-full" onClick={() => onOpenChange(false)}>
            {copy.common.cancel}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
