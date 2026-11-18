import { useState } from 'react';
import { copy } from '@/shared/config/copy-pages';
import { phasesToMinutes } from '@/domain/gov-stake';
import { formatTokenAmount } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import type { GovContextValue } from '@/features/governance-stake/model/use-gov-context';
import { IncreasePhasesSheet } from '@/features/governance-stake/ui/increase-phases-sheet';

export interface PromisedPhasesCardProps {
  readonly ctx: GovContextValue;
}

/**
 * 已质押用户的「承诺解锁期」卡（owner 2026-11-18）：
 *
 * - 放在质押页最上面，单独一行显示当前值（阶段 + 约分钟）；
 * - 「调整」按钮打开弹层，只能加大；调整后治理权立即变化；
 * - 新增流动性质押的表单不再提供承诺解锁期选择（与 periphery LOVE20Hub 的语义
 *   一致：Hub 的 stakeLiquidity* 在已有仓位时要求承诺解锁期与当前值完全相同）。
 */
export function PromisedPhasesCard({ ctx }: PromisedPhasesCardProps) {
  const [open, setOpen] = useState(false);
  const { member, clock } = ctx;
  if (member.status !== 'ready' || member.promisedWaitingPhases === undefined) return null;

  const phases = member.promisedWaitingPhases;
  const minutes = phasesToMinutes(phases, clock.secondsPerPhase ?? null);
  const busy = ctx.tx.stage !== 'idle' || ctx.tx.approveStage !== 'idle' || ctx.tx.receipt !== null;

  return (
    <>
      <Card data-testid="gov-phases-card" className="border-brand/25 bg-brand-soft/20">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{copy.gov.phasesAdjust.title}</p>
            <p
              className="mt-1 text-xl font-semibold text-foreground"
              data-testid="gov-phases-card-value"
            >
              {minutes === null
                ? copy.gov.stats.phasesValue(formatTokenAmount(phases, 0))
                : copy.gov.stats.phasesValueWithMinutes(
                    formatTokenAmount(phases, 0),
                    String(minutes),
                  )}
            </p>
            <p className="mt-1 text-[11px] leading-4 text-muted">
              {copy.gov.phasesAdjust.cardHint}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0 whitespace-nowrap"
            data-testid="gov-phases-card-adjust"
            disabled={busy}
            onClick={() => setOpen(true)}
          >
            {copy.gov.phasesAdjust.action}
          </Button>
        </div>
      </Card>
      <IncreasePhasesSheet open={open} onOpenChange={setOpen} ctx={ctx} testIdPrefix="gov-phases" />
    </>
  );
}
