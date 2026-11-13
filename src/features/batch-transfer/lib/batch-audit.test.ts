import { describe, expect, it } from 'vitest';
import { buildBatchAudit, countAuditMismatches } from './batch-audit';

const A = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc' as const;
const B = '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955' as const;

describe('buildBatchAudit', () => {
  it('judges each row from the exact wei delta, not the rounded text', () => {
    const rows = [
      { address: A, amount: 150000000000000000n },
      { address: B, amount: 1000000000000n },
    ];
    const before = [10000000000000000000000n, 10000000000000000000000n];
    const after = [10000150000000000000000n, 10000000001000000000000n];

    const audit = buildBatchAudit(rows, before, after);

    expect(audit.map((row) => row.delta)).toEqual([150000000000000000n, 1000000000000n]);
    expect(audit.map((row) => row.status)).toEqual(['matched', 'matched']);
    expect(countAuditMismatches(audit)).toBe(0);
  });

  it('flags a 1 wei deficit as an anomaly instead of 未变化', () => {
    const rows = [{ address: A, amount: 1000000000000n }];
    const audit = buildBatchAudit(rows, [0n], [999999999999n]);

    expect(audit[0]?.delta).toBe(999999999999n);
    expect(audit[0]?.status).toBe('anomaly');
    expect(countAuditMismatches(audit)).toBe(1);
  });

  it('keeps a real zero delta as 未变化', () => {
    const audit = buildBatchAudit([{ address: A, amount: 5n }], [10n], [10n]);

    expect(audit[0]?.delta).toBe(0n);
    expect(audit[0]?.status).toBe('unchanged');
  });

  it('marks unreadable balances as unknown, never as zero', () => {
    const audit = buildBatchAudit([{ address: A, amount: 5n }], [undefined], [10n]);

    expect(audit[0]?.delta).toBeUndefined();
    expect(audit[0]?.status).toBe('unknown');
    expect(countAuditMismatches(audit)).toBe(0);
  });
});
