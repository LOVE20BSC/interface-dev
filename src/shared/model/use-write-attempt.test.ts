import type { TransactionReceipt } from 'viem';
import { describe, expect, it, vi } from 'vitest';
import { resolveWriteAttemptAdapter } from '@/shared/model/use-write-attempt';

const RECEIPT = { transactionHash: '0xabc' } as unknown as TransactionReceipt;

/** 不落盘形态：只给 `send` 与 `parseReceipt`，其余全由接口默认补。 */
function ephemeralAdapter() {
  return {
    persist: 'none' as const,
    reverted: '回滚了',
    send: vi.fn(async () => '0xhash' as const),
    parseReceipt: vi.fn(() => 'receipt'),
  };
}

describe('resolveWriteAttemptAdapter', () => {
  it('fills the ephemeral form: approve none, default translate, no record ports', () => {
    const resolved = resolveWriteAttemptAdapter(ephemeralAdapter());
    expect(resolved.persist).toBe('none');
    expect(resolved.approve).toBe('none');
    expect(resolved.readRecord()).toBeNull();
    expect(resolved.writeRecord({ hash: '0xhash' } as never)).toBeUndefined();
    expect(resolved.clearRecord()).toBeUndefined();
    // `ownerChanged` 在不落盘形态下永远不会被读取，给中性值只为形状统一。
    expect(resolved.ownerChanged).toBe('');
  });

  it('translates send failures with the shared user-message mapping by default', () => {
    const resolved = resolveWriteAttemptAdapter(ephemeralAdapter());
    const error = resolved.translate(new Error('boom'));
    expect(typeof error.message).toBe('string');
    expect(error.message.length).toBeGreaterThan(0);
  });

  it('keeps a flow-provided translate instead of the default', () => {
    const custom = () => ({ message: '自定义' });
    const resolved = resolveWriteAttemptAdapter({ ...ephemeralAdapter(), translate: custom });
    expect(resolved.translate(new Error('boom'))).toEqual({ message: '自定义' });
  });

  it('keeps the persisted form ports and owner-change copy as given', () => {
    const readRecord = vi.fn(() => null);
    const writeRecord = vi.fn(() => 'stored');
    const clearRecord = vi.fn();
    const resolved = resolveWriteAttemptAdapter({
      persist: 'afterHash',
      ownerChanged: '换了钱包',
      reverted: '回滚了',
      readRecord,
      writeRecord,
      clearRecord,
      send: vi.fn(async () => '0xhash' as const),
      parseReceipt: vi.fn(() => null),
    });
    expect(resolved.persist).toBe('afterHash');
    expect(resolved.ownerChanged).toBe('换了钱包');
    resolved.writeRecord({ hash: '0xhash' } as never);
    expect(writeRecord).toHaveBeenCalledOnce();
    resolved.clearRecord();
    expect(clearRecord).toHaveBeenCalledOnce();
  });

  it('defaults the approval policy to none and honours an explicit one', () => {
    expect(resolveWriteAttemptAdapter(ephemeralAdapter()).approve).toBe('none');
    expect(resolveWriteAttemptAdapter({ ...ephemeralAdapter(), approve: 'single' }).approve).toBe(
      'single',
    );
    expect(resolveWriteAttemptAdapter({ ...ephemeralAdapter(), approve: 'keyed' }).approve).toBe(
      'keyed',
    );
  });

  it('forwards the receipt parser unchanged', () => {
    const adapter = ephemeralAdapter();
    const resolved = resolveWriteAttemptAdapter(adapter);
    expect(resolved.parseReceipt('main', RECEIPT)).toBe('receipt');
    expect(adapter.parseReceipt).toHaveBeenCalledWith('main', RECEIPT);
  });

  it('落盘 adapter 的 reverted getter 不会被解析过程读取（回归：成功交易被当成回滚）', () => {
    // 批量转账把 `reverted` 写成 getter，读取即记下「这次尝试回滚过」；它必须在
    // core 真要回滚文案时才被调用。`{ ...adapter }` 会在解析时无条件触发 getter，
    // 结果连成功的交易也拿不到收据（2026-11-26 全量 e2e 用例 A）。
    let reads = 0;
    const adapter = {
      persist: 'afterHash' as const,
      ownerChanged: '',
      get reverted() {
        reads += 1;
        return '回滚了';
      },
      readRecord: () => null,
      writeRecord: () => undefined,
      clearRecord: () => undefined,
      send: async () => '0xhash' as const,
      parseReceipt: () => null,
      translate: () => ({ message: 'x' }),
    };
    const resolved = resolveWriteAttemptAdapter(adapter);
    expect(reads).toBe(0);
    expect(resolved.reverted).toBe('回滚了');
    expect(reads).toBe(1);
  });
});
