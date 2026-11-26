import { describe, expect, it } from 'vitest';
import type { HexAddress } from '@/config/networks';
import {
  buildBatchAudit,
  countAuditMismatches,
  summarizeBatchAudit,
  type BatchAuditInputRow,
  type BatchAuditStatus,
} from './batch-audit';

/**
 * 属性/边界测试：批量转账到账核对（`features/batch-transfer/lib/batch-audit`）。
 *
 * 测什么不变量：
 * - 回执行差额严格等于 `到账后余额 − 到账前基线`，用整 wei 计算（不经过显示层舍入）；
 * - 1 wei 到账 / 接近 2^53 的大余额 +1 wei 都必须判 `matched`，不能塌成「未变化」；
 * - 状态映射完整：delta === amount → matched；delta === 0 → unchanged；其它 → anomaly；
 *   任一余额读失败 → unknown（页面显示「—」，不猜）；
 * - 回执结论优先级：只要有一行 unknown 就是 unverified（哪怕同时有 anomaly），
 *   全部 matched 才是 verified；countAuditMismatches 只数 anomaly + unchanged。
 *
 * 为什么重要：这是「钱到底到没到」的唯一证据链；差额算错或把 1 wei 看成 0，
 * 回执就会对用户说假话。
 *
 * 确定性：固定种子 32 位 LCG，每个属性 200 次迭代。
 */

const SEED = 0xa0d1_7127;

function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function randomInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function randomAmount(rng: () => number, maxDigits = 24): bigint {
  const digits = randomInt(rng, 1, maxDigits);
  let text = String(randomInt(rng, 1, 9));
  for (let index = 1; index < digits; index += 1) text += String(randomInt(rng, 0, 9));
  return BigInt(text);
}

function addressFor(index: number): HexAddress {
  return `0x${index.toString(16).padStart(2, '0')}${'cd'.repeat(19)}` as HexAddress;
}

function expectedStatus(delta: bigint | undefined, amount: bigint): BatchAuditStatus {
  if (delta === undefined) return 'unknown';
  if (delta === amount) return 'matched';
  if (delta === 0n) return 'unchanged';
  return 'anomaly';
}

describe('buildBatchAudit 属性：差额与状态', () => {
  it('delta 恒等于 after − before（整 wei），状态与差额一致', () => {
    const rng = makeRng(SEED);
    for (let iteration = 0; iteration < 200; iteration += 1) {
      const count = randomInt(rng, 1, 10);
      const rows: BatchAuditInputRow[] = [];
      const before: (bigint | undefined)[] = [];
      const after: (bigint | undefined)[] = [];
      for (let index = 0; index < count; index += 1) {
        const amount = randomAmount(rng);
        rows.push({ address: addressFor(index + 1), amount });
        const beforeValue = rng() < 0.9 ? randomAmount(rng, 26) : undefined;
        // 90% 的行故意重算成「恰好到账」；其余用随机 after 制造 anomaly。
        after.push(
          rng() < 0.9 && beforeValue !== undefined ? beforeValue + amount : randomAmount(rng, 26),
        );
        before.push(beforeValue);
      }
      const audit = buildBatchAudit(rows, before, after);
      expect(audit).toHaveLength(count);
      for (let index = 0; index < count; index += 1) {
        const row = audit[index];
        const rowInput = rows[index];
        expect(row?.address).toBe(rowInput?.address);
        expect(row?.amount).toBe(rowInput?.amount);
        const beforeValue = before[index];
        const afterValue = after[index];
        const delta =
          beforeValue !== undefined && afterValue !== undefined
            ? afterValue - beforeValue
            : undefined;
        expect(row?.delta).toBe(delta);
        expect(row?.status).toBe(expectedStatus(delta, rowInput?.amount ?? 0n));
      }
    }
  });

  it('1 wei 到账与 10^30 量级余额 +1 wei 都判 matched，不塌成 unchanged', () => {
    const oneWeiRows: BatchAuditInputRow[] = [{ address: addressFor(1), amount: 1n }];
    expect(buildBatchAudit(oneWeiRows, [10n ** 18n], [10n ** 18n + 1n])[0]?.status).toBe('matched');
    expect(buildBatchAudit(oneWeiRows, [10n ** 18n], [10n ** 18n + 1n])[0]?.delta).toBe(1n);

    const before = 10n ** 30n;
    expect(buildBatchAudit(oneWeiRows, [before], [before + 1n])[0]?.status).toBe('matched');
    expect(buildBatchAudit(oneWeiRows, [before], [before])[0]?.status).toBe('unchanged');
  });

  it('任一余额读失败都是 unknown（delta 缺失），不把未知当成 0', () => {
    const rows: BatchAuditInputRow[] = [
      { address: addressFor(1), amount: 5n },
      { address: addressFor(2), amount: 5n },
      { address: addressFor(3), amount: 5n },
    ];
    const audit = buildBatchAudit(rows, [undefined, 100n, 100n], [105n, undefined, 105n]);
    expect(audit.map((row) => row.status)).toEqual(['unknown', 'unknown', 'matched']);
    expect(audit.map((row) => row.delta)).toEqual([undefined, undefined, 5n]);
  });

  it('少到账 / 多到账 / 没收到的差额分别判 anomaly / anomaly / unchanged', () => {
    const rows: BatchAuditInputRow[] = [
      { address: addressFor(1), amount: 100n },
      { address: addressFor(2), amount: 100n },
      { address: addressFor(3), amount: 100n },
      { address: addressFor(4), amount: 100n },
    ];
    const audit = buildBatchAudit(rows, [0n, 0n, 0n, 0n], [99n, 101n, 0n, 100n]);
    expect(audit.map((row) => row.status)).toEqual(['anomaly', 'anomaly', 'unchanged', 'matched']);
    expect(audit.map((row) => row.delta)).toEqual([99n, 101n, 0n, 100n]);
  });
});

describe('summarizeBatchAudit 属性：回执结论', () => {
  it('outcome 只能是 verified / unverified / anomaly，且 unknown 优先于 anomaly', () => {
    const matchedRow = buildBatchAudit([{ address: addressFor(1), amount: 1n }], [0n], [1n]);
    const anomalyRow = buildBatchAudit([{ address: addressFor(1), amount: 2n }], [0n], [1n]);
    const unchangedRow = buildBatchAudit([{ address: addressFor(1), amount: 2n }], [0n], [0n]);
    const unknownRow = buildBatchAudit([{ address: addressFor(1), amount: 1n }], [undefined], [1n]);

    expect(summarizeBatchAudit([])).toEqual({
      outcome: 'verified',
      unknownRows: 0,
      mismatchRows: 0,
    });
    expect(summarizeBatchAudit(matchedRow).outcome).toBe('verified');
    expect(summarizeBatchAudit(anomalyRow).outcome).toBe('anomaly');
    expect(summarizeBatchAudit(unchangedRow).outcome).toBe('anomaly');
    expect(summarizeBatchAudit(unknownRow).outcome).toBe('unverified');
    expect(summarizeBatchAudit([...anomalyRow, ...unknownRow]).outcome).toBe('unverified');
  });

  it('计数与逐行状态严格一致：unknownRows / mismatchRows / countAuditMismatches', () => {
    const rng = makeRng(SEED + 1);
    for (let iteration = 0; iteration < 200; iteration += 1) {
      const count = randomInt(rng, 0, 8);
      const rows: BatchAuditInputRow[] = [];
      const before: (bigint | undefined)[] = [];
      const after: (bigint | undefined)[] = [];
      for (let index = 0; index < count; index += 1) {
        const amount = randomAmount(rng);
        rows.push({ address: addressFor(index + 1), amount });
        const beforeValue = rng() < 0.8 ? randomAmount(rng, 24) : undefined;
        const behavior = randomInt(rng, 0, 3);
        if (beforeValue === undefined) {
          after.push(randomAmount(rng, 24));
        } else if (behavior === 0) {
          after.push(beforeValue + amount);
        } else if (behavior === 1) {
          after.push(beforeValue);
        } else if (behavior === 2) {
          after.push(beforeValue + amount + 1n);
        } else {
          after.push(undefined);
        }
        before.push(beforeValue);
      }
      const audit = buildBatchAudit(rows, before, after);
      const summary = summarizeBatchAudit(audit);
      const unknownRows = audit.filter((row) => row.status === 'unknown').length;
      const mismatchRows = audit.filter(
        (row) => row.status === 'anomaly' || row.status === 'unchanged',
      ).length;
      expect(summary.unknownRows).toBe(unknownRows);
      expect(summary.mismatchRows).toBe(mismatchRows);
      expect(countAuditMismatches(audit)).toBe(mismatchRows);
      expect(summary.outcome).toBe(
        unknownRows > 0 ? 'unverified' : mismatchRows > 0 ? 'anomaly' : 'verified',
      );
    }
  });

  it('全部 matched 时，matched 行的 delta 之和等于承诺金额之和', () => {
    const rng = makeRng(SEED + 2);
    for (let iteration = 0; iteration < 100; iteration += 1) {
      const count = randomInt(rng, 1, 8);
      const rows: BatchAuditInputRow[] = [];
      const before: bigint[] = [];
      const after: bigint[] = [];
      let expectedTotal = 0n;
      for (let index = 0; index < count; index += 1) {
        const amount = randomAmount(rng, 20);
        expectedTotal += amount;
        rows.push({ address: addressFor(index + 1), amount });
        const beforeValue = randomAmount(rng, 24);
        before.push(beforeValue);
        after.push(beforeValue + amount);
      }
      const audit = buildBatchAudit(rows, before, after);
      expect(audit.every((row) => row.status === 'matched')).toBe(true);
      expect(audit.reduce((sum, row) => sum + (row.delta ?? 0n), 0n)).toBe(expectedTotal);
      expect(summarizeBatchAudit(audit).outcome).toBe('verified');
    }
  });
});
