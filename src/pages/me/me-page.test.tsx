import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MePage } from '@/pages/me/me-page';
import { useCommunityBalance } from '@/entities/community-token/model/use-community-balance';
import { useCommunityToken } from '@/entities/community-token/model/use-community-token';
import { useMemberIdentity } from '@/entities/member-identity/model/use-member-identity';
import { useWalletConnection } from '@/features/connect-wallet/model/use-wallet-connection';
import type { MemberIdentityState } from '@/entities/member-identity/model/use-member-identity';
import type { CommunityToken } from '@/entities/community-token/model/use-community-token';
import type { TokenBalance } from '@/entities/community-token/model/use-community-balance';

vi.mock('@/features/switch-community/model/use-community-context', () => ({
  useCommunityContext: () => ({ symbol: 'TestLOVE20', fromUrl: true, switchSymbol: vi.fn() }),
}));

vi.mock('@/entities/member-identity/model/use-member-identity', () => ({
  useMemberIdentity: vi.fn(),
}));

vi.mock('@/entities/community-token/model/use-community-token', () => ({
  useCommunityToken: vi.fn(),
}));

vi.mock('@/entities/community-token/model/use-community-balance', () => ({
  useCommunityBalance: vi.fn(),
}));

vi.mock('@/features/connect-wallet/model/use-wallet-connection', () => ({
  useWalletConnection: vi.fn(),
}));

const memberIdentity = vi.mocked(useMemberIdentity);
const communityToken = vi.mocked(useCommunityToken);
const communityBalance = vi.mocked(useCommunityBalance);
const wallet = vi.mocked(useWalletConnection);

const TOKEN: CommunityToken = {
  status: 'ready',
  address: '0x8aCd85898458400f7Db866d53FCFF6f0D49741FF',
  name: 'TestLOVE20@TestWETH',
  symbol: 'TestLOVE20',
  decimals: 18,
  isMetadataLoading: false,
  metadataError: false,
  refetch: () => {},
};

const BALANCE: TokenBalance = {
  status: 'ready',
  value: 99_799_100n * 10n ** 18n,
  decimals: 18,
};

function identity(overrides: Partial<MemberIdentityState> = {}): MemberIdentityState {
  return {
    status: 'ready',
    identities: [{ tokenId: 1n, name: 'Testdev-member-0' }],
    balance: 1n,
    selected: { tokenId: 1n, name: 'Testdev-member-0' },
    isInvalidated: false,
    isTruncated: false,
    memberNftAddress: TOKEN.address,
    select: vi.fn(),
    clear: vi.fn(),
    refetch: vi.fn(),
    ...overrides,
  };
}

function renderPage(): void {
  render(
    <MemoryRouter initialEntries={['/me?symbol=TestLOVE20']}>
      <MePage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  memberIdentity.mockReturnValue(identity());
  communityToken.mockReturnValue(TOKEN);
  communityBalance.mockReturnValue(BALANCE);
  wallet.mockReturnValue({
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
  });
});

describe('MePage', () => {
  it('carries the current identity with name, memberId and the three links', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: '我的身份 NFT' })).toBeVisible();
    expect(screen.getByText('Testdev-member-0')).toBeVisible();
    expect(screen.getByText('NFT #1')).toBeVisible();
    for (const name of ['切换身份 NFT', '转让', '查看全部']) {
      expect(screen.getByRole('link', { name })).toHaveAttribute(
        'href',
        '/my-nft?symbol=TestLOVE20',
      );
    }
  });

  it('carries the current community balance and an inline 兑换 link with ?symbol=', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: '我的余额' })).toBeVisible();
    expect(screen.getByText('99,799,100 TestLOVE20')).toBeVisible();
    expect(screen.getByRole('link', { name: '兑换' })).toHaveAttribute(
      'href',
      '/swap?symbol=TestLOVE20',
    );
  });

  it('offers 铸造身份 NFT when the wallet has no identity NFT', () => {
    memberIdentity.mockReturnValue(identity({ status: 'empty', identities: [], selected: null }));
    renderPage();

    expect(screen.getByText('你还没有身份 NFT')).toBeVisible();
    expect(screen.getByRole('link', { name: '铸造身份 NFT' })).toHaveAttribute(
      'href',
      '/mint?symbol=TestLOVE20',
    );
  });

  it('shows an honest unavailable line when the community token is not configured', () => {
    communityToken.mockReturnValue({
      ...TOKEN,
      status: 'unconfigured',
      address: undefined,
      symbol: 'TestLOVE20',
    });
    communityBalance.mockReturnValue({
      status: 'unconfigured',
      value: undefined,
      decimals: undefined,
    });
    renderPage();

    expect(screen.getByText('这个环境还没有配置社区代币，暂时看不到余额。')).toBeVisible();
    expect(screen.queryByRole('link', { name: '兑换' })).toBeNull();
  });

  it('never renders a filled button: the page is a settings-ish list', () => {
    renderPage();

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    const filled = document.querySelectorAll('.bg-brand');
    expect(filled).toHaveLength(0);
  });
});
