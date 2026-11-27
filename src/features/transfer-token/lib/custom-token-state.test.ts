import { describe, expect, it } from 'vitest';
import type { CustomTokenLookupStatus } from '@/entities/community-token/model/use-custom-token';
import {
  canRetryCustomToken,
  transferCustomTokenStatus,
  type CustomTokenStatus,
} from '@/features/transfer-token/lib/custom-token-state';

/**
 * 候选 A 的投影契约（2026-11-27 补）。
 *
 * 共享判定（`entities/community-token`）只回答「这个地址是什么」；两个页面各自把
 * 状态词投影成自己的产品语言。这条投影原先没有测试：同一份 `malformed` 在转账页
 * 说「这不是一个有效的代币地址」、在加池页什么都不说（交给输入框自己的格式提示），
 * 改错一处不会被任何用例发现。
 */

const LOOKUP_STATUSES: readonly CustomTokenLookupStatus[] = [
  'empty',
  'malformed',
  'checking',
  'no-code',
  'unreadable',
  'ok',
];

describe('transferCustomTokenStatus（转账页投影）', () => {
  it('maps every shared status to the transfer page word', () => {
    const expected: Record<CustomTokenLookupStatus, CustomTokenStatus> = {
      empty: 'idle',
      malformed: 'invalid',
      checking: 'checking',
      'no-code': 'no-code',
      unreadable: 'unreadable',
      ok: 'ok',
    };
    for (const status of LOOKUP_STATUSES) {
      expect(transferCustomTokenStatus(status), status).toBe(expected[status]);
    }
  });

  it('keeps malformed as invalid (the input box does not pre-validate the format)', () => {
    // 回归：这条分叉曾经是「零地址在转账页报格式错」的根因之一，别把它并回 idle。
    expect(transferCustomTokenStatus('malformed')).toBe('invalid');
  });
});

describe('canRetryCustomToken（只有读失败给重新读取）', () => {
  it('only the read failure is retryable', () => {
    expect(canRetryCustomToken('unreadable')).toBe(true);
    for (const status of ['idle', 'invalid', 'checking', 'no-code', 'ok'] as const) {
      expect(canRetryCustomToken(status), status).toBe(false);
    }
  });
});
