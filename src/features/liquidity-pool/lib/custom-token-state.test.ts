import { describe, expect, it } from 'vitest';
import type { CustomTokenLookupStatus } from '@/entities/community-token/model/use-custom-token';
import {
  liquidityCustomTokenStatus,
  type CustomTokenStatus,
} from '@/features/liquidity-pool/lib/custom-token-state';

/**
 * 候选 A 的投影契约（加池页侧，2026-11-27 补）。
 *
 * 与转账页的有意差异只有一处：格式不对 / 空输入都落 `idle`（输入框自己给格式
 * 提示），而转账页把 `malformed` 叫 `invalid`。旧实现还把这个页面永远不会产生的
 * `invalid` 写进了 union——现在不产生、也不在类型里。
 */

const LOOKUP_STATUSES: readonly CustomTokenLookupStatus[] = [
  'empty',
  'malformed',
  'checking',
  'no-code',
  'unreadable',
  'ok',
];

describe('liquidityCustomTokenStatus（加池页投影）', () => {
  it('maps every shared status to the liquidity page word', () => {
    const expected: Record<CustomTokenLookupStatus, CustomTokenStatus> = {
      empty: 'idle',
      malformed: 'idle',
      checking: 'checking',
      'no-code': 'no-code',
      unreadable: 'unreadable',
      ok: 'ok',
    };
    for (const status of LOOKUP_STATUSES) {
      expect(liquidityCustomTokenStatus(status), status).toBe(expected[status]);
    }
  });

  it('never produces invalid (zero-address is no-code, malformed is idle)', () => {
    // 零地址在共享判定里就是 no-code，不会走到 malformed；这条曾经在转账页变成
    // 「对一个格式完全正确的地址说格式错」（QA D9 P3）。加池页可产生的状态只有 5 个。
    const produced = new Set(LOOKUP_STATUSES.map(liquidityCustomTokenStatus));
    expect([...produced].sort()).toEqual(['checking', 'idle', 'no-code', 'ok', 'unreadable']);
  });
});
