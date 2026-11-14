import { describe, expect, it } from 'vitest';
import {
  addSideIssue,
  approvalNeed,
  DEADLINE_SECONDS,
  deadlineFromNow,
  DEFAULT_SLIPPAGE_PERCENT,
  isSlippageValid,
  parseAmount,
  percentToBps,
  poolNoticeKind,
} from '@/features/liquidity-pool/lib/liquidity-form';

describe('parseAmount', () => {
  it('parses exact decimals and truncation rules', () => {
    expect(parseAmount('100000', 18)).toEqual({ kind: 'ok', value: 100000n * 10n ** 18n });
    expect(parseAmount('0.5', 18)).toEqual({ kind: 'ok', value: 5n * 10n ** 17n });
    expect(parseAmount('', 18)).toEqual({ kind: 'empty' });
    expect(parseAmount('-1', 18)).toEqual({ kind: 'invalid' });
    expect(parseAmount('abc', 18)).toEqual({ kind: 'invalid' });
    // 19 位小数在 18 位精度下被拒绝，而不是悄悄截断。
    expect(parseAmount('1.0000000000000000001', 18)).toEqual({
      kind: 'too-precise',
      digits: 18,
    });
  });
});

describe('滑点校验', () => {
  it('accepts the default and rejects out-of-range values', () => {
    expect(DEFAULT_SLIPPAGE_PERCENT).toBe(0.5);
    expect(percentToBps(DEFAULT_SLIPPAGE_PERCENT)).toBe(50);
    expect(isSlippageValid(0.5)).toBe(true);
    expect(isSlippageValid(0.01)).toBe(true);
    expect(isSlippageValid(50)).toBe(true);
    expect(isSlippageValid(0)).toBe(false);
    expect(isSlippageValid(50.01)).toBe(false);
    expect(isSlippageValid(Number.NaN)).toBe(false);
  });
});

describe('deadline', () => {
  it('is now + 20 minutes in seconds', () => {
    expect(DEADLINE_SECONDS).toBe(1200);
    expect(deadlineFromNow(1_700_000_000_000)).toBe(1_700_001_200n);
  });
});

describe('addSideIssue（QA D6/D7）', () => {
  const wei = 10n ** 18n;
  const base = { tokenRaw: '', nativeRaw: '', tokenAmount: 0n, nativeAmount: 0n };

  it('treats untouched inputs as no issue', () => {
    expect(addSideIssue({ ...base, routerPath: false })).toBe('none');
    expect(addSideIssue({ ...base, routerPath: true })).toBe('none');
  });

  it('explains a missing other side on the Router path instead of "amount must be > 0"', () => {
    expect(
      addSideIssue({ ...base, tokenRaw: '100', tokenAmount: 100n * wei, routerPath: true }),
    ).toBe('missing-other-side');
    expect(
      addSideIssue({ ...base, nativeRaw: '0.01', nativeAmount: wei / 100n, routerPath: true }),
    ).toBe('missing-other-side');
    // Hub 单边（routerPath=false）只填一侧是正常的。
    expect(
      addSideIssue({ ...base, tokenRaw: '100000', tokenAmount: 100000n * wei, routerPath: false }),
    ).toBe('none');
  });

  it('reports an explicit 0 as zero', () => {
    expect(addSideIssue({ ...base, tokenRaw: '0', routerPath: false })).toBe('zero');
    expect(
      addSideIssue({ ...base, tokenRaw: '0', nativeRaw: '1', nativeAmount: wei, routerPath: true }),
    ).toBe('zero');
    // 两侧都填了 0。
    expect(addSideIssue({ ...base, tokenRaw: '0', nativeRaw: '0', routerPath: true })).toBe('zero');
  });

  it('has no issue when both sides carry a positive amount', () => {
    expect(
      addSideIssue({
        tokenRaw: '1000',
        tokenAmount: 1000n * wei,
        nativeRaw: '0.5',
        nativeAmount: wei / 2n,
        routerPath: true,
      }),
    ).toBe('none');
  });
});

describe('poolNoticeKind（QA D3）', () => {
  const ready = { smartMode: true, hubConfigured: true, hasLiquidity: true, isLoading: false, isError: false };

  it('never claims the pool is empty while it is still loading', () => {
    expect(poolNoticeKind({ ...ready, hasLiquidity: false, isLoading: true })).toBe('loading');
  });

  it('reports an empty pool only after the read finished', () => {
    expect(poolNoticeKind({ ...ready, hasLiquidity: false })).toBe('empty');
  });

  it('reports a read failure separately from an empty pool', () => {
    expect(poolNoticeKind({ ...ready, hasLiquidity: false, isError: true })).toBe('read-failed');
  });

  it('keeps smart mode off and hub-missing precedence', () => {
    expect(poolNoticeKind({ ...ready, smartMode: false, hasLiquidity: false })).toBe('none');
    expect(
      poolNoticeKind({ ...ready, hubConfigured: false, hasLiquidity: false, isLoading: true }),
    ).toBe('hub-missing');
    expect(poolNoticeKind(ready)).toBe('none');
  });
});

describe('approvalNeed（QA D8）', () => {
  it('does not label a native-only deposit as approved', () => {
    expect(approvalNeed(0n, 0n)).toBe('not-needed');
    expect(approvalNeed(0n, undefined)).toBe('not-needed');
  });

  it('requires an approval only when the allowance is short', () => {
    expect(approvalNeed(100n, undefined)).toBe('required');
    expect(approvalNeed(100n, 99n)).toBe('required');
    expect(approvalNeed(100n, 100n)).toBe('satisfied');
    expect(approvalNeed(100n, 2n ** 255n)).toBe('satisfied');
  });
});
