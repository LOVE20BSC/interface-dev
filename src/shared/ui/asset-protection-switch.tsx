import { copy } from '@/shared/config/copy-pages';
import { cn } from '@/shared/lib/cn';
import { useAssetProtection } from '@/shared/lib/use-asset-protection';

export interface AssetProtectionSwitchProps {
  /**
   * Page-scoped prefix: the block is `${testId}`, the toggle is `${testId}-toggle`,
   * the hint is `${testId}-hint`. Every transfer surface uses the same default so
   * one test id works on 代币转账 / 身份 NFT 转让 / 批量转账.
   */
  readonly testId?: string;
  readonly disabled?: boolean;
  readonly className?: string;
}

/**
 * 智能资产保护 switch (owner 2026-11-16), shared by every transfer surface.
 *
 * The state is NOT a prop: it comes from the shared preference
 * (`shared/lib/ui-preferences.ts`, key `love20:transfer:assetProtectionEnabled`,
 * default on), so all three pages show and change the same value. Pages only
 * consume `useAssetProtection().enabled` to decide whether a known contract is
 * intercepted; they never own a copy of the boolean.
 */
export function AssetProtectionSwitch({
  testId = 'asset-protection',
  disabled = false,
  className,
}: AssetProtectionSwitchProps) {
  const { enabled, setEnabled } = useAssetProtection();

  return (
    <div
      data-testid={testId}
      data-enabled={enabled}
      className={cn('rounded-2xl border border-line bg-elevated/60 p-3', className)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{copy.assetProtection.title}</p>
          <p className="mt-0.5 text-[11px] leading-4 text-muted" data-testid={`${testId}-hint`}>
            {enabled ? copy.assetProtection.onHint : copy.assetProtection.offHint}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={copy.assetProtection.toggleAria}
          data-testid={`${testId}-toggle`}
          disabled={disabled}
          onClick={() => setEnabled(!enabled)}
          className={cn(
            'relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong',
            enabled ? 'border-brand-strong bg-brand' : 'border-line bg-surface',
            disabled ? 'opacity-60' : '',
          )}
        >
          <span
            className={cn(
              // A button centers its inline content, so an absolutely positioned
              // thumb needs an explicit left anchor — without it the static
              // position is the centered one and the knob leaks out of the pill.
              // 与 liquidity 的智能模式开关一致：w-11(44) 的胶囊里放 w-5(20) 的
              // 滑块，left-0.5 起 / 到 right-0.5 止 = 位移 18px，左右各留 2px。
              'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-surface shadow-soft transition-transform',
              enabled ? 'translate-x-[18px]' : 'translate-x-0',
            )}
            aria-hidden="true"
          />
        </button>
      </div>
    </div>
  );
}
