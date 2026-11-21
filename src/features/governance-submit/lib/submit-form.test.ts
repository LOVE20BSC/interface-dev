import { describe, expect, it } from 'vitest';
import { copy } from '@/shared/config/copy-pages';
import { submitRatioPercent } from './submit-form';
import { PRECISION } from '@/domain/gov-core';

/**
 * 走查 2026-11-21（P1）：资格句曾经把 `SUBMIT_MIN_RATIO` 渲染成「0.5」，
 * 读起来像「0.5 倍（50%）」，而真实门槛是 0.5%。百分比必须带单位。
 */
describe('submitRatioPercent', () => {
  it('SUBMIT_MIN_RATIO = 5e15（0.5%）→ 带百分号的文案', () => {
    expect(submitRatioPercent(5n * 10n ** 15n)).toBe('0.5%');
  });

  it('读不到常量时返回 undefined（页面用「—」兜底，不显示 0）', () => {
    expect(submitRatioPercent(undefined)).toBeUndefined();
  });

  it('资格句里必须出现带单位的百分比', () => {
    const ratio = submitRatioPercent(5n * 10n ** 15n) ?? '—';
    const sentence = copy.gov.submit.eligibilityReason('10', '44.7213', ratio);
    expect(sentence).toContain('社区总治理权的 0.5%');
    expect(sentence).not.toContain('社区总治理权的 0.5）');
  });

  it('100% 的极端比例也带单位', () => {
    expect(submitRatioPercent(PRECISION)).toBe('100%');
  });
});
