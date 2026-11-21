import { describe, expect, it } from 'vitest';
import { VOTE_QUICK_PERCENTS, votesForPercent, votesToInputText } from './vote-share';

const ONE = 10n ** 18n;

describe('votesForPercent', () => {
  it('按「还能投」的 25/50/100% 取票数，一律截断', () => {
    const remaining = 4472n * ONE + 123456789012345678n; // 4472.123456789012345678
    expect(votesForPercent(remaining, 100)).toBe(remaining);
    expect(votesForPercent(remaining, 50)).toBe(2236n * ONE + 61728394506172839n);
    expect(votesForPercent(remaining, 25)).toBe(1118n * ONE + 30864197253086419n);
  });

  it('百分比列表就是 25 / 50 / 100', () => {
    expect([...VOTE_QUICK_PERCENTS]).toEqual([25, 50, 100]);
  });

  it('额度未知或为 0 时不给数字（页面据此禁用按钮）', () => {
    expect(votesForPercent(undefined, 25)).toBeUndefined();
    expect(votesForPercent(0n, 100)).toBeUndefined();
  });

  it('余量不足 1 票时按比例给小数（合约接受小数票），但绝不返回 0', () => {
    // 0.5 票的 25% = 0.125 票（合约按 wei 记，可以投）
    expect(votesForPercent(ONE / 2n, 25)).toBe(125000000000000000n);
    // 恰好 1 票：100% 就是 1 票
    expect(votesForPercent(ONE, 100)).toBe(ONE);
    // 只有 1 wei 时任何比例都会截断成 0 → 不给数字（否则合约零票报错）
    expect(votesForPercent(1n, 25)).toBeUndefined();
  });

  it('余量大于 1 票但百分比截断为 0 时兜底 1 票（例如 3 票的 25% = 0.75 票）', () => {
    expect(votesForPercent(3n * ONE, 25)).toBe(750000000000000000n);
    // 极小余量（1.5 票）的 25% = 0.375 票 → 截断不为 0，不触发兜底
    expect(votesForPercent(ONE + ONE / 2n, 25)).toBe(375000000000000000n);
  });
});

describe('votesToInputText', () => {
  it('整数票不带小数点', () => {
    expect(votesToInputText(100n * ONE)).toBe('100');
  });
  it('小数去掉尾随 0', () => {
    expect(votesToInputText(ONE + ONE / 2n)).toBe('1.5');
    expect(votesToInputText(ONE + 25n * 10n ** 16n)).toBe('1.25');
  });
  it('极小票数原样显示（不塌成 0）', () => {
    expect(votesToInputText(1n)).toBe('0.000000000000000001');
  });
});
