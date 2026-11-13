import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HexAddress } from '@/config/networks';
import type * as NetworksModule from '@/config/networks';
import { configuredAddress } from '@/config/networks';
import { AppsPage } from '@/pages/apps/apps-page';

vi.mock('@/config/networks', async (importOriginal) => {
  const actual = await importOriginal<typeof NetworksModule>();
  return { ...actual, configuredAddress: vi.fn() };
});

const configured = vi.mocked(configuredAddress);

/** 40 hex chars: configuredAddress is typed to return a HexAddress. */
const CONFIGURED_ADDRESS = '0x0000000000000000000000000000000000000001' as HexAddress;

function configure(slots: readonly string[]): void {
  configured.mockImplementation((key) => (slots.includes(key) ? CONFIGURED_ADDRESS : undefined));
}

function renderPage(path = '/apps?symbol=LOVE20&utm=test'): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  configure(['airdropDistributor', 'memberNFT', 'router']);
});

describe('AppsPage', () => {
  it('renders every configured entry in owner order with name, description and chevron', () => {
    renderPage();

    const links = screen.getAllByRole('link');
    // Four categories today, so the DOM is grouped: 代币 (创世空投, 代币兑换,
    // 代币转账), 身份 NFT, 资料 (开源文档), then 设置 (主题). Catalog order inside
    // each group is preserved.
    expect(links.map((link) => link.textContent)).toEqual([
      expect.stringContaining('创世空投'),
      expect.stringContaining('代币兑换'),
      expect.stringContaining('代币转账'),
      expect.stringContaining('身份 NFT'),
      expect.stringContaining('开源文档'),
      expect.stringContaining('主题'),
    ]);
    expect(screen.getByText('按快照份额铸造创世代币')).toBeVisible();
    expect(screen.getByText('查看、切换与转让你的身份 NFT')).toBeVisible();
    expect(screen.getByText('在任意代币之间互换')).toBeVisible();
    expect(screen.getByText('把代币转到另一个地址')).toBeVisible();
    expect(screen.getByText('文档、合约地址与链上数据')).toBeVisible();
    expect(screen.getByText('切换浅色或深色界面配色')).toBeVisible();
    expect(links.every((link) => link.querySelector('svg') !== null)).toBe(true);
  });

  it('groups sections only when the catalog has more than one category', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: '代币' })).toBeVisible();
    expect(screen.getByRole('heading', { name: '身份 NFT' })).toBeVisible();
    expect(screen.getByRole('heading', { name: '资料' })).toBeVisible();
    expect(screen.getByRole('heading', { name: '设置' })).toBeVisible();
    // 代币 group: 创世空投 + 代币兑换 + 代币转账; 身份 NFT: 身份 NFT;
    // 资料: 开源文档; 设置: 主题.
    expect(screen.getAllByRole('list')).toHaveLength(4);
  });

  it('keeps ?symbol= and every other query on each route', () => {
    renderPage();

    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(hrefs).toEqual([
      '/airdrop?symbol=LOVE20&utm=test',
      '/swap?symbol=LOVE20&utm=test',
      '/transfer?symbol=LOVE20&utm=test',
      '/my-nft?symbol=LOVE20&utm=test',
      '/about?symbol=LOVE20&utm=test',
      '/theme?symbol=LOVE20&utm=test',
    ]);
  });

  it('renders an entry with no configured target as a disabled row with its reason', () => {
    configure(['memberNFT', 'router']);
    renderPage();

    // 创世空投 is no longer a navigable row...
    expect(screen.queryByRole('link', { name: /创世空投/ })).toBeNull();
    expect(screen.getByText('这个环境还没有配置空投铸造。')).toBeVisible();
    const row = screen.getByText('创世空投').closest('[aria-disabled="true"]');
    expect(row).not.toBeNull();
    expect(row).toHaveAttribute('data-app-id', 'airdrop');

    // ...while the other entries still navigate.
    expect(screen.getByRole('link', { name: /身份 NFT/ })).toBeVisible();
    expect(screen.getByRole('link', { name: /代币兑换/ })).toBeVisible();
    expect(screen.getByRole('link', { name: /代币转账/ })).toBeVisible();
    expect(screen.getByRole('link', { name: /开源文档/ })).toBeVisible();
  });

  it('keeps 开源文档、主题 and 代币转账 available even when the whole address book is empty', () => {
    configure([]);
    renderPage();

    expect(screen.getByRole('link', { name: /开源文档/ })).toBeVisible();
    expect(screen.getByRole('link', { name: /主题/ })).toBeVisible();
    expect(screen.getByRole('link', { name: /代币转账/ })).toBeVisible();
    expect(screen.queryByRole('link', { name: /创世空投/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /身份 NFT/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /代币兑换/ })).toBeNull();
  });

  it('does not render a filled button (one filled button per screen max, none needed)', () => {
    renderPage();
    // No <button> at all: rows are links and the shell owns connect/back.
    expect(screen.queryByRole('button')).toBeNull();
  });
});
