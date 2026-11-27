import { describe, expect, it } from 'vitest';
import { UNLIMITED_APPROVAL_THRESHOLD } from '@/shared/lib/approval-kind';
import { approvalRowState } from './approval-row';

/**
 * 走查回归（owner 2026-11-21）：新账户在**没输入名字、价格未知**时，
 * 页面曾显示「已授权」。价格未知必须给 `hidden`，不能落到「已授权」。
 */
describe('approvalRowState', () => {
  it('价格未知 → hidden（新账户不再被误标成「已授权」）', () => {
    expect(approvalRowState({ cost: undefined, allowance: 0n })).toBe('hidden');
    expect(approvalRowState({ cost: undefined, allowance: 123n })).toBe('hidden');
  });

  it('价格已算出但额度还在读 → checking（显示「读取授权额度中…」）', () => {
    expect(approvalRowState({ cost: 100n, allowance: undefined })).toBe('checking');
  });

  it('额度不足 → needs-approval', () => {
    expect(approvalRowState({ cost: 100n, allowance: 0n })).toBe('needs-approval');
    expect(approvalRowState({ cost: 100n, allowance: 99n })).toBe('needs-approval');
  });

  it('额度足够 → approved；allowance ≥ 2^255 → long-term（不再由面板另算一次）', () => {
    expect(approvalRowState({ cost: 100n, allowance: 100n })).toBe('approved');
    expect(approvalRowState({ cost: 100n, allowance: 1000n })).toBe('approved');
    // 长期授权由共享判定从 allowance 推出，不再是面板传进来的第二个布尔。
    expect(approvalRowState({ cost: 100n, allowance: UNLIMITED_APPROVAL_THRESHOLD })).toBe(
      'long-term',
    );
  });
});
