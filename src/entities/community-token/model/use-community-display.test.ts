import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCommunityToken } from '@/entities/community-token/model/use-community-token';
import { useCommunityDisplay } from '@/entities/community-token/model/use-community-display';
import type { CommunityToken } from '@/entities/community-token/model/use-community-token';

vi.mock('@/entities/community-token/model/use-community-token', () => ({
  useCommunityToken: vi.fn(),
}));

const token = vi.mocked(useCommunityToken);

const FIXTURE: CommunityToken = {
  status: 'ready',
  address: '0x8aCd85898458400f7Db866d53FCFF6f0D49741FF',
  name: 'TestLOVE20@TestWETH',
  symbol: 'TestLOVE20',
  decimals: 18,
  isMetadataLoading: false,
  metadataError: false,
  refetch: () => {},
};

describe('useCommunityDisplay', () => {
  it('shows the chain symbol once the community is resolved', () => {
    token.mockReturnValue(FIXTURE);
    const { result } = renderHook(() => useCommunityDisplay('TestLOVE20'));
    expect(result.current).toEqual({ symbol: 'TestLOVE20', resolved: true, pending: false });
  });

  it('shows the protocol label while metadata is loading, and flags it as pending', () => {
    token.mockReturnValue({ ...FIXTURE, isMetadataLoading: true });
    const { result } = renderHook(() => useCommunityDisplay('TestLOVE20'));
    expect(result.current).toEqual({ symbol: 'LOVE20协议', resolved: false, pending: true });
  });

  it('shows the protocol label when no community is resolved (settled, not pending)', () => {
    token.mockReturnValue({ ...FIXTURE, status: 'unknown', address: undefined });
    const { result } = renderHook(() => useCommunityDisplay('FOO'));
    expect(result.current).toEqual({ symbol: 'LOVE20协议', resolved: false, pending: false });
  });

  it('flags the cold-start lookup as pending before the token address is known', () => {
    token.mockReturnValue({ ...FIXTURE, status: 'loading', address: undefined });
    const { result } = renderHook(() => useCommunityDisplay('TestLOVE20'));
    expect(result.current).toEqual({ symbol: 'LOVE20协议', resolved: false, pending: true });
  });
});
