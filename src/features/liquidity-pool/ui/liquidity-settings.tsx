import { useState } from 'react';
import { copy } from '@/shared/config/copy-pages';
import { cn } from '@/shared/lib/cn';
import { formatPercent } from '@/shared/lib/format';
import {
  DEADLINE_MINUTES,
  MAX_SLIPPAGE_PERCENT,
  MIN_SLIPPAGE_PERCENT,
  SLIPPAGE_PRESETS,
} from '@/features/liquidity-pool/lib/liquidity-form';
import { Button } from '@/shared/ui/button';
import { Sheet } from '@/shared/ui/sheet';

export interface LiquiditySettingsProps {
  readonly slippagePercent: number;
  readonly customSlippage: string;
  readonly customSlippageError: string | undefined;
  readonly onSelectPreset: (percent: number) => void;
  readonly onCustomChange: (value: string) => void;
}

/**
 * 交易设置：只放「最多可接受的价格变化」与固定的有效期说明。
 *
 * 滑点默认 0.5%，预设 0.1/0.5/1.0，自定义范围 0.01–50；非法值只提示、不提交。
 * 有效期固定 20 分钟（`deadlineFromNow`），没有可调 entry，避免多一个出错面。
 */
export function LiquiditySettings({
  slippagePercent,
  customSlippage,
  customSlippageError,
  onSelectPreset,
  onCustomChange,
}: LiquiditySettingsProps) {
  const [open, setOpen] = useState(false);
  const isPreset = SLIPPAGE_PRESETS.includes(slippagePercent as (typeof SLIPPAGE_PRESETS)[number]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs leading-5 text-muted">
          {copy.liquidity.settings.slippageLabel}{' '}
          <span className="font-medium text-foreground" data-testid="liquidity-slippage-value">
            {formatPercent(slippagePercent, { minimumFractionDigits: 1 })}%
          </span>
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-testid="liquidity-settings-open"
          className="rounded-full border border-line px-2.5 py-1 text-[11px] font-medium text-brand-strong hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {copy.liquidity.settings.title}
        </button>
      </div>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={copy.liquidity.settings.title}
        description={`${copy.liquidity.settings.slippageLabel}（${MIN_SLIPPAGE_PERCENT}%–${MAX_SLIPPAGE_PERCENT}%）`}
      >
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-muted">
              {copy.liquidity.settings.slippageLabel}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {SLIPPAGE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  data-testid={`liquidity-slippage-${preset}`}
                  onClick={() => onSelectPreset(preset)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-medium',
                    !isPreset
                      ? 'border-line text-muted hover:bg-elevated'
                      : slippagePercent === preset
                        ? 'border-brand bg-brand-soft text-brand-strong'
                        : 'border-line text-foreground hover:bg-elevated',
                  )}
                >
                  {formatPercent(preset, { minimumFractionDigits: 1 })}%
                </button>
              ))}
              <label className="flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-xs text-foreground">
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  data-testid="liquidity-slippage-custom"
                  value={customSlippage}
                  onChange={(event) => onCustomChange(event.target.value)}
                  aria-label={copy.liquidity.settings.slippageCustom}
                  className="w-12 bg-transparent text-right outline-none"
                />
                <span className="text-muted">{copy.liquidity.settings.customUnit}</span>
              </label>
            </div>
            {customSlippageError !== undefined ? (
              <p className="mt-1.5 text-xs leading-5 text-danger-strong">{customSlippageError}</p>
            ) : null}
          </div>
          <div className="rounded-2xl border border-line bg-elevated p-3 text-sm">
            <p className="font-medium text-foreground">
              {copy.liquidity.settings.deadlineLabel}：{copy.liquidity.settings.deadlineValue}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted">
              {copy.liquidity.settings.deadlineNote}
              {copy.liquidity.settings.deadlineMinutes(String(DEADLINE_MINUTES))}
            </p>
          </div>
          <Button variant="primary" size="md" className="w-full" onClick={() => setOpen(false)}>
            {copy.liquidity.settings.done}
          </Button>
        </div>
      </Sheet>
    </>
  );
}
