import { describe, expect, it } from 'vitest';
import {
  customTokenLookupStatus,
  type CustomTokenLookupStatus,
} from '@/entities/community-token/model/use-custom-token';

/**
 * QA D9 回归 + 候选 A 的两处分叉回归。
 *
 * 背景：同一个「这个地址是不是真代币」原来在转账页与加池页各写一份，已经分叉——
 * 零地址在加池页说「这个地址上没有合约」、在转账页说「这不是一个有效的代币地址」
 * （格式完全正确的地址被说成格式错）；精度读不到时加池不放入列表、转账按 18 猜。
 * 现在判定只有这一份，下面把两条分叉钉死。
 */
const ZERO = '0x0000000000000000000000000000000000000000';
const TOKEN = '0x8aCd85898458400f7Db866d53FCFF6f0D49741FF';

function status(overrides: Partial<Parameters<typeof customTokenLookupStatus>[0]> = {}) {
  return customTokenLookupStatus({
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

function expectStatus(value: CustomTokenLookupStatus, expected: CustomTokenLookupStatus) {
  expect(value).toBe(expected);
}

describe('customTokenLookupStatus（QA D9 + 候选 A）', () => {
  it('treats the zero address as no-code without waiting for RPC', () => {
    expectStatus(status({ candidate: ZERO, codeLoading: true, codeData: undefined }), 'no-code');
    // 回归：零地址以前在转账页落到 invalid（对格式正确的地址说格式错）。
    expectStatus(status({ candidate: ZERO }), 'no-code');
  });

  it('separates empty from malformed so each page can show its own message', () => {
    expectStatus(status({ candidate: '0x1234' }), 'malformed');
    expectStatus(status({ candidate: undefined }), 'empty');
    expectStatus(status({ candidate: '' }), 'empty');
  });

  it('reports loading / no-code / unreadable / ok for a valid address', () => {
    expectStatus(status({ codeLoading: true, codeData: undefined }), 'checking');
    expectStatus(status({ codeError: true }), 'unreadable');
    expectStatus(status({ codeData: '0x' }), 'no-code');
    expectStatus(
      status({ metadataLoading: true, symbol: undefined, decimals: undefined }),
      'checking',
    );
  });

  it('never reports ok when the precision is unreadable (no 18 fallback)', () => {
    expectStatus(status({ symbol: 'TestLOVE20', decimals: undefined }), 'unreadable');
    expectStatus(status({ symbol: undefined, decimals: 18 }), 'unreadable');
    expectStatus(status({ symbol: undefined, decimals: undefined }), 'unreadable');
    expectStatus(status(), 'ok');
  });
});
