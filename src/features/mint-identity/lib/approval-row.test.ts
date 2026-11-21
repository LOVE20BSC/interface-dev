import { describe, expect, it } from 'vitest';
import { approvalRowState } from './approval-row';

/**
 * 走查回归（owner 2026-11-21）：新账户在**没输入名字、价格未知**时，
 * 页面曾显示「已授权」。价格未知必须给 `hidden`，不能落到「已授权」。
 */
describe('approvalRowState', () => {
  it('价格未知 → hidden（新账户不再被误标成「已授权」）', () => {
    expect(approvalRowState({ cost: undefined, allowance: 0n, longTermApproved: false })).toBe(
      'hidden',
    );
    expect(approvalRowState({ cost: undefined, allowance: 123n, longTermApproved: false })).toBe(
      'hidden',
    );
  });

  it('价格已算出但额度还在读 → checking（显示「读取授权额度中…」）', () => {
    expect(approvalRowState({ cost: 100n, allowance: undefined, longTermApproved: false })).toBe(
      'checking',
    );
  });

  it('额度不足 → needs-approval', () => {
    expect(approvalRowState({ cost: 100n, allowance: 0n, longTermApproved: false })).toBe(
      'needs-approval',
    );
    expect(approvalRowState({ cost: 100n, allowance: 99n, longTermApproved: false })).toBe(
      'needs-approval',
    );
  });

  it('额度足够 → approved；长期授权 → long-term', () => {
    expect(approvalRowState({ cost: 100n, allowance: 100n, longTermApproved: false })).toBe(
      'approved',
    );
    expect(approvalRowState({ cost: 100n, allowance: 1000n, longTermApproved: true })).toBe(
      'long-term',
    );
  });
});
