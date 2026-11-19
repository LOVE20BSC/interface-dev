import { Link } from 'react-router-dom';
import { copy } from '@/shared/config/copy-pages';

/**
 * 治理首页「我的 / 社区」两个 tab 复用的版块（owner 2026-11-18 20:05 按 TKM 旧版
 * 截图重排）：两栏统计格 + 两个质押入口。旧版这两块在截图里各出现一次，所以提出来
 * 只留一份实现，两个 tab 不会漂移。
 */

export interface GovStatCellProps {
  readonly label: string;
  readonly value: string;
  readonly note?: string | undefined;
  readonly testId: string;
}

/** 两栏统计格：标签（灰） + 数值（大、深色） + 可选小字（灰）。未知值传「—」。 */
export function GovStatCell({ label, value, note, testId }: GovStatCellProps) {
  return (
    <div className="min-w-0">
      <p className="text-sm leading-5 text-muted">{label}</p>
      <p
        className="mt-1 break-words text-xl font-semibold leading-7 tracking-tight text-foreground"
        data-testid={testId}
      >
        {value}
      </p>
      {note !== undefined ? (
        <p className="mt-0.5 text-[11px] leading-4 text-muted">{note}</p>
      ) : null}
    </div>
  );
}

/** 两个质押入口：流动性质押 → 治理权；加速质押 → 加速激励。 */
export function GovStakeLinks({ q }: { readonly q: string }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 border-t border-line/60 pt-3">
      <Link
        to={`/stake/liquidity${q}`}
        className="whitespace-nowrap text-[13px] font-medium text-brand-strong underline-offset-4 hover:underline"
      >
        {copy.gov.home.liquidityLink}
        <span aria-hidden="true"> &gt;&gt;</span>
      </Link>
      <Link
        to={`/stake/staketoken${q}`}
        className="whitespace-nowrap text-[13px] font-medium text-brand-strong underline-offset-4 hover:underline"
      >
        {copy.gov.home.boostLink}
        <span aria-hidden="true"> &gt;&gt;</span>
      </Link>
    </div>
  );
}
