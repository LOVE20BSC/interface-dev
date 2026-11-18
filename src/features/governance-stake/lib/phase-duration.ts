import { copy } from '@/shared/config/copy-pages';
import { phasesToDuration } from '@/domain/gov-stake';
import { formatTokenAmount } from '@/shared/lib/format';

/**
 * 承诺解锁期的展示口径（owner 2026-11-18 20:05）：
 *
 * - 值：`N 个阶段`（阶段是协议唯一的时钟刻度，不换算成「天」当主单位）；
 * - 估算：`约 X 分钟 / 约 x.x 小时 / 约 x.x 天`，阶段长度未知时不给估算；
 * - 下拉选项：`N 个阶段 · 约 X`。
 *
 * 换算在 `@/domain/gov-stake`（纯函数、有单测），中文只在 copy 层，组件只拼装。
 */
export function phaseDurationText(phases: bigint, secondsPerPhase: number | null): string | null {
  const duration = phasesToDuration(phases, secondsPerPhase);
  switch (duration.kind) {
    case 'unknown':
      return null;
    case 'minutes':
      return copy.gov.stats.durationMinutes(String(duration.minutes));
    case 'hours':
      return copy.gov.stats.durationHours(String(duration.hours));
    case 'days':
      return copy.gov.stats.durationDays(String(duration.days));
  }
}

/** `N 个阶段`；时长未知时只给阶段数。 */
export function phasesValueText(phases: bigint): string {
  return copy.gov.stats.phasesValue(formatTokenAmount(phases, 0));
}

/** 下拉选项：`N 个阶段 · 约 X`；时长未知时只给阶段数。 */
export function phaseOptionText(phases: bigint, secondsPerPhase: number | null): string {
  const count = formatTokenAmount(phases, 0);
  const duration = phaseDurationText(phases, secondsPerPhase);
  return duration === null
    ? phasesValueText(phases)
    : copy.gov.stats.phasesWithDuration(count, duration);
}
