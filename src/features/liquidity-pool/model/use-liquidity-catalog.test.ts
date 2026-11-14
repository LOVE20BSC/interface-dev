import { describe, expect, it } from 'vitest';
import { customTokenStatus } from '@/features/liquidity-pool/model/use-liquidity-catalog';

/**
 * QA D9 回归：粘贴零地址点「读取这个代币」不能静默 no-op，必须落到 `no-code`
 * （页面文案「这个地址上没有合约，不能作为代币。」）。
 */
const ZERO = '0x0000000000000000000000000000000000000000';
const TOKEN = '0x8aCd85898458400f7Db866d53FCFF6f0D49741FF';

function status(overrides: Partial<Parameters<typeof customTokenStatus>[0]> = {}) {
  return customTokenStatus({
    candidate: TOKEN,
    codeLoading: false,
    codeError: false,
    codeData: '0x6080',
    symbol: 'TestLOVE20',
    decimals: 18,
    metadataLoading: false,
    ...overrides,
  });
}

describe('customTokenStatus（QA D9）', () => {
  it('treats the zero address as no-code without waiting for RPC', () => {
    expect(status({ candidate: ZERO, codeLoading: true, codeData: undefined })).toBe('no-code');
  });

  it('keeps the format-error state for malformed input (owned by the address input)', () => {
    expect(status({ candidate: '0x1234' })).toBe('idle');
    expect(status({ candidate: undefined })).toBe('idle');
  });

  it('reports loading / no-code / unreadable / ok for a valid address', () => {
    expect(status({ codeLoading: true, codeData: undefined })).toBe('checking');
    expect(status({ codeError: true })).toBe('unreadable');
    expect(status({ codeData: '0x' })).toBe('no-code');
    expect(status({ metadataLoading: true, symbol: undefined, decimals: undefined })).toBe(
      'checking',
    );
    expect(status({ symbol: undefined, decimals: undefined })).toBe('unreadable');
    expect(status()).toBe('ok');
  });
});
