import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MePage } from '@/pages/me/me-page';
import { useCommunityBalance } from '@/entities/community-token/model/use-community-balance';
import { useCommunityToken } from '@/entities/community-token/model/use-community-token';
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

// 质押资产 tab 的真实面板会挂 wagmi + 治理域读（15 s 轮询），单测里只留一个壳，
// 用来断言「切到该标签时它才挂载」。
vi.mock('@/pages/me/stake-assets-panel', () => ({
  StakeAssetsPanel: () => <div data-testid="stake-assets-panel" />,
}));

const communityToken = vi.mocked(useCommunityToken);
const communityBalance = vi.mocked(useCommunityBalance);

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
    // owner 2026-11-19: 账户 / 关于 sections are gone — wallet address & network
    // moved into the wallet dropdown; version / docs moved to /about.
    expect(screen.queryByRole('heading', { name: '账户' })).toBeNull();
    expect(screen.queryByRole('heading', { name: '关于' })).toBeNull();
    expect(screen.queryByText('钱包地址')).toBeNull();
    expect(screen.queryByText('开源文档')).toBeNull();
    expect(screen.queryByRole('link', { name: '前往文档' })).toBeNull();
  });

  it('renders the 钱包余额 / 质押资产 tabs and defaults to 钱包余额 (owner 2026-11-18 23:20)', () => {
    renderPage();

    expect(screen.getByRole('tablist', { name: '我的' })).toBeVisible();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.getByTestId('me-tab-balance')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('me-tab-stake')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: '钱包余额' })).toBeVisible();
    expect(screen.getByRole('tab', { name: '质押资产' })).toBeVisible();
    // The default tab still shows the old 我的余额 section; the stake panel is not mounted.
    expect(screen.getByRole('heading', { name: '我的余额' })).toBeVisible();
    expect(screen.queryByTestId('stake-assets-panel')).toBeNull();
  });

  it('mounts 质押资产 only on its tab and restores the balance section when switching back', () => {
    renderPage();

    fireEvent.click(screen.getByTestId('me-tab-stake'));

    expect(screen.getByTestId('stake-assets-panel')).toBeVisible();
    expect(screen.getByTestId('me-tab-stake')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('me-tab-balance')).toHaveAttribute('aria-selected', 'false');
    expect(screen.queryByRole('heading', { name: '我的余额' })).toBeNull();
    expect(screen.queryByText('99,799,100 TestLOVE20')).toBeNull();

    fireEvent.click(screen.getByTestId('me-tab-balance'));

    expect(screen.queryByTestId('stake-assets-panel')).toBeNull();
    expect(screen.getByTestId('me-tab-balance')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: '我的余额' })).toBeVisible();
    expect(screen.getByText('99,799,100 TestLOVE20')).toBeVisible();
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

  it('never renders a filled button: the page is two tabs over a plain balance card', () => {
    renderPage();

    // owner 2026-11-19: the 全局地址复制 affordance moved out with the 账户 section,
    // so the only <button> elements are the two tabs — both expose role="tab",
    // never role="button". No role="button" and no filled (.bg-brand) action means
    // the one-filled-button rule stays satisfied.
    expect(document.querySelectorAll('button')).toHaveLength(2);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    const filled = document.querySelectorAll('.bg-brand');
    expect(filled).toHaveLength(0);
  });
});
