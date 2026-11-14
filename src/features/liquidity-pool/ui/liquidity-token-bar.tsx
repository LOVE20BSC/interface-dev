import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { copy } from '@/shared/config/copy-pages';
import { cn } from '@/shared/lib/cn';
import { shouldShowPrecision } from '@/shared/lib/token-precision';
import type { LiquidityCatalog } from '@/features/liquidity-pool/model/use-liquidity-catalog';
import type { LiquidityToken } from '@/features/liquidity-pool/lib/liquidity-types';
import { Button } from '@/shared/ui/button';

/**
 * 当前池子的一行抬头（owner 2026-11-14）。
 *
 * 页内不再提供社区代币下拉：右上角的社区切换已经能换社区代币，页内再放一份是冗余。
 * 这里只显示「当前社区代币是哪一个」，并把「换个代币地址」收进一个默认折叠的入口
 * （自定义地址不是社区切换的替代品：它用来查看还没有进社区目录的池子）。
 */
export interface LiquidityTokenBarProps {
  readonly catalog: LiquidityCatalog;
  readonly selected: LiquidityToken | undefined;
}

export function LiquidityTokenBar({ catalog, selected }: LiquidityTokenBarProps) {
  const [open, setOpen] = useState(false);
  const custom = catalog.custom;

  const customError = (() => {
    if (customInputIsAddress(catalog.customInput) && custom.status === 'idle') {
      return copy.liquidity.customInvalid;
    }
    if (custom.status === 'no-code') return copy.liquidity.customNoCode;
    if (custom.status === 'unreadable') return copy.liquidity.customUnreadable;
    return undefined;
  })();

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-surface px-4 py-3">
        <div className="min-w-0">
          <p className="text-[11px] leading-4 text-muted">{copy.liquidity.tokenLabel}</p>
          <p
            className="truncate text-sm font-semibold text-foreground"
            data-testid="liquidity-token"
          >
            {selected?.symbol ?? copy.liquidity.query.none}
            {selected?.kind === 'custom' ? (
              <span className="ml-1.5 text-[11px] font-normal text-muted">
                {copy.liquidity.customBadge}
              </span>
            ) : null}
          </p>
        </div>
        <button
          type="button"
          data-testid="liquidity-custom-toggle"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line px-2.5 py-1 text-[11px] font-medium text-brand-strong hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {open ? copy.liquidity.customCollapse : copy.liquidity.customTitle}
          <ChevronDown
            className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')}
            aria-hidden="true"
          />
        </button>
      </div>

      {open ? (
        <div className="rounded-2xl border border-line bg-elevated p-3">
          <label htmlFor="liquidity-custom-address" className="text-xs font-medium text-muted">
            {copy.liquidity.customTitle}
          </label>
          <div className="mt-1.5 flex items-center gap-2">
            <input
              id="liquidity-custom-address"
              data-testid="liquidity-custom-address"
              type="text"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              value={catalog.customInput}
              onChange={(event) => catalog.setCustomInput(event.target.value)}
              placeholder={copy.liquidity.customPlaceholder}
              className="h-9 min-w-0 flex-1 rounded-xl border border-line bg-surface px-2.5 font-mono text-xs text-foreground outline-none placeholder:font-sans placeholder:text-muted focus:border-brand/40 focus:ring-2 focus:ring-brand/20"
            />
            <Button
              variant="secondary"
              size="sm"
              data-testid="liquidity-custom-add"
              onClick={() => catalog.addCustomToken(catalog.customInput)}
              disabled={catalog.customInput.trim().length === 0}
            >
              {copy.liquidity.customAdd}
            </Button>
          </div>
          {custom.status === 'checking' ? (
            <p className="mt-1.5 text-[11px] leading-4 text-muted">
              {copy.liquidity.customChecking}
            </p>
          ) : null}
          {customError !== undefined ? (
            <p
              className="mt-1.5 text-[11px] leading-4 text-danger-strong"
              data-testid="liquidity-custom-error"
            >
              {customError}
            </p>
          ) : null}
          {custom.status === 'ok' && custom.token !== undefined ? (
            <p
              className="mt-1.5 text-[11px] leading-4 text-success"
              data-testid="liquidity-custom-ok"
            >
              {custom.token.symbol}
              {shouldShowPrecision(custom.token.decimals) ? (
                <> · {copy.liquidity.decimalsLabel(String(custom.token.decimals))}</>
              ) : null}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** 只有「长得像地址」的输入才提示格式错误，普通搜索词不打断。 */
function customInputIsAddress(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && /^0x/i.test(trimmed) && trimmed.length !== 42;
}
