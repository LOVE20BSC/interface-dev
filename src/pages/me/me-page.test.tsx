import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MePage } from '@/pages/me/me-page';
import { useCommunityBalance } from '@/entities/community-token/model/use-community-balance';
import { useCommunityToken } from '@/entities/community-token/model/use-community-token';
import { useWalletConnection } from '@/features/connect-wallet/model/use-wallet-connection';
import type { CommunityToken } from '@/entities/community-token/model/use-community-token';
import type { TokenBalance } from '@/entities/community-token/model/use-community-balance';

vi.mock('@/features/switch-community/model/use-community-context', () => ({
  useCommunityContext: () => ({ symbol: 'TestLOVE20', fromUrl: true, switchSymbol: vi.fn() }),
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

function renderPage(): void {
  render(
    <MemoryRouter initialEntries={['/me?symbol=TestLOVE20']}>
      <MePage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
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
  it('no longer renders the identity NFT card (owner 2026-11-14)', () => {
    renderPage();

    expect(screen.queryByRole('heading', { name: '我的身份 NFT' })).toBeNull();
    expect(document.querySelector('section[aria-labelledby="me-identity-title"]')).toBeNull();
    expect(screen.queryByRole('link', { name: '切换身份 NFT' })).toBeNull();
    expect(screen.queryByRole('link', { name: '转让' })).toBeNull();
    expect(screen.queryByRole('link', { name: '查看全部' })).toBeNull();
    expect(screen.queryByRole('link', { name: '铸造身份 NFT' })).toBeNull();
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

  it('keeps the 账户 and 关于 sections after the identity card removal', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: '账户' })).toBeVisible();
    expect(screen.getByText('钱包地址')).toBeVisible();
    expect(screen.getByText(/^0x1234…5678$/)).toBeVisible();
    expect(screen.getByRole('heading', { name: '关于' })).toBeVisible();
    expect(screen.getByRole('link', { name: '开源文档' })).toBeVisible();
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

    // The only button is the 全局地址复制 affordance (owner 2026-11-14): the page
    // itself stays a settings-ish list with no primary/filled action.
    const buttons = screen.queryAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName('复制地址：钱包地址');
    const filled = document.querySelectorAll('.bg-brand');
    expect(filled).toHaveLength(0);
  });
});
