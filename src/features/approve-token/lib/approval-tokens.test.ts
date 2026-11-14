import { describe, expect, it } from 'vitest';
import type { TransferToken } from '@/features/transfer-token/lib/transfer-types';
import {
  findTokenByAddress,
  pickDefaultApprovalToken,
} from '@/features/approve-token/lib/approval-tokens';

const COMMUNITY: TransferToken = {
  kind: 'community',
  address: '0x8aCd85898458400f7Db866d53FCFF6f0D49741FF',
  symbol: 'TestLOVE20',
  decimals: 18,
};
const WRAPPED: TransferToken = {
  kind: 'wrapped',
  address: '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9',
  symbol: 'TestWETH',
  decimals: 18,
};
const LP: TransferToken = {
  kind: 'lp',
  address: '0x3FC12a5abAe69C8Eee58C37cEDC266751507620D',
  symbol: 'UNI-V2',
  decimals: 18,
};

describe('代币授权默认代币（D1）', () => {
  it('waits instead of picking the wrapped fallback before the community directory settles', () => {
    expect(
      pickDefaultApprovalToken({
        communityTokens: [],
        wrappedToken: WRAPPED,
        lpToken: LP,
        communityLoading: true,
      }),
    ).toBeUndefined();
  });

  it('picks the first community token once the directory has loaded', () => {
    expect(
      pickDefaultApprovalToken({
        communityTokens: [COMMUNITY],
        wrappedToken: WRAPPED,
        lpToken: LP,
        communityLoading: false,
      }),
    ).toBe(COMMUNITY);
  });

  it('falls back to wrapped, then LP, only after the directory settled empty or failed', () => {
    expect(
      pickDefaultApprovalToken({
        communityTokens: [],
        wrappedToken: WRAPPED,
        lpToken: LP,
        communityLoading: false,
      }),
    ).toBe(WRAPPED);
    expect(
      pickDefaultApprovalToken({
        communityTokens: [],
        wrappedToken: undefined,
        lpToken: LP,
        communityLoading: false,
      }),
    ).toBe(LP);
    expect(
      pickDefaultApprovalToken({
        communityTokens: [],
        wrappedToken: undefined,
        lpToken: undefined,
        communityLoading: false,
      }),
    ).toBeUndefined();
  });
});

describe('按地址找内置代币（D4）', () => {
  it('matches ignoring case and skips native tokens without an address', () => {
    const native: TransferToken = {
      kind: 'native',
      address: undefined,
      symbol: 'ETH',
      decimals: 18,
    };
    expect(
      findTokenByAddress([native, COMMUNITY, WRAPPED], WRAPPED.address?.toLowerCase() ?? ''),
    ).toBe(WRAPPED);
    expect(findTokenByAddress([native], '0xdc64a140aa3e981100a9beca4e685f962f0cf6c9')).toBe(
      undefined,
    );
  });
});
