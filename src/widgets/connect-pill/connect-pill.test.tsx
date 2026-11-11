import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectPill } from '@/widgets/connect-pill/connect-pill';
import { useCommunityToken } from '@/entities/community-token/model/use-community-token';
import type { CommunityToken } from '@/entities/community-token/model/use-community-token';

vi.mock('@/features/connect-wallet/model/use-wallet-connection', () => ({
  useWalletConnection: () => ({
    address: '0x1234567890abcdef1234567890abcdef12345678',
    isConnected: true,
    isConnecting: false,
    isSwitching: false,
    chainId: 31337,
    targetChainId: 31337,
    isWrongChain: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    switchToTargetChain: vi.fn(),
  }),
}));

vi.mock('@/entities/member-identity/model/use-member-identity', () => ({
  useMemberIdentity: () => ({
    status: 'empty',
    identities: [],
    balance: 0n,
    selected: null,
    isInvalidated: false,
    isTruncated: false,
    memberNftAddress: undefined,
    select: vi.fn(),
    clear: vi.fn(),
    refetch: vi.fn(),
  }),
}));

vi.mock('@/features/switch-community/model/use-community-context', () => ({
  useCommunityContext: () => ({
    symbol: 'TestLOVE20',
    fromUrl: true,
    switchSymbol: vi.fn(),
  }),
}));

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

function renderPill() {
  return render(
    <MemoryRouter>
      <ConnectPill />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  token.mockReturnValue(FIXTURE);
});

describe('ConnectPill community chip', () => {
  it('renders the chain symbol of the resolved community', () => {
    renderPill();
    expect(
      screen.getByRole('button', { name: '当前代币社区 TestLOVE20，打开社区菜单' }),
    ).toHaveTextContent('TestLOVE20');
  });

  it('falls back to the protocol label when no community is resolved', () => {
    token.mockReturnValue({ ...FIXTURE, status: 'unknown', address: undefined });
    renderPill();
    expect(
      screen.getByRole('button', { name: '当前代币社区 LOVE20协议，打开社区菜单' }),
    ).toHaveTextContent('LOVE20协议');
  });
});
