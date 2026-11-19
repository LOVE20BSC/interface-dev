import { formatSharePercent } from '@/shared/lib/share-percent';

/**
 * 治理域占比的显示文本（首页「我的治理权占比 / 加速质押占比」、查询面板与
 * `/stake/liquid` 共用）。规则见 `shared/lib/share-percent`：
 * ≥0.01% 两位截断；极小占比用 `0.{x}yyyy`，永不显示 0%。
 */
export const govSharePercent = formatSharePercent;
