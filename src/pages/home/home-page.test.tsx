import { fireEvent, render, screen, within } from '@testing-library/react';
import { Link, MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HomePage } from '@/pages/home/home-page';
import { useMemberIdentity } from '@/entities/member-identity/model/use-member-identity';
import type { MemberIdentityState } from '@/entities/member-identity/model/use-member-identity';
import type { CommunityToken } from '@/entities/community-token/model/use-community-token';
import { useAccount } from 'wagmi';

vi.mock('wagmi', () => ({ useAccount: vi.fn() }));

vi.mock('@/features/connect-wallet/ui/connect-wallet-button', () => ({
  ConnectWalletButton: () => <button type="button">连接钱包</button>,
}));

vi.mock('@/features/switch-community/model/use-community-context', () => ({
  useCommunityContext: () => ({
    symbol: 'TestLOVE20',
    fromUrl: true,
    switchSymbol: vi.fn(),
  }),
}));

vi.mock('@/entities/member-identity/model/use-member-identity', () => ({
  useMemberIdentity: vi.fn(),
}));

const airdrop = vi.hoisted(() => ({
  status: 'other' as 'pending' | 'eligible' | 'other',
}));

vi.mock('@/pages/home/airdrop-reminder', () => ({
  AirdropReminder: ({ primary }: { readonly primary: boolean }) => {
    if (airdrop.status !== 'eligible') return null;
    return (
      <section aria-labelledby="stub-airdrop">
        <h2 id="stub-airdrop">你有空投资格，可铸造 1,000 TestLOVE20</h2>
        <Link
          to="/airdrop?symbol=TestLOVE20"
          className={primary ? 'bg-brand text-white' : 'border border-line'}
        >
          空投铸造
        </Link>
      </section>
    );
  },
}));

const account = vi.mocked(useAccount);
const memberIdentity = vi.mocked(useMemberIdentity);

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
    <MemoryRouter initialEntries={['/?symbol=TestLOVE20']}>
      <HomePage />
    </MemoryRouter>,
  );
}

function greeting(): HTMLElement {
  return screen.getByRole('heading', { level: 1 });
}

beforeEach(() => {
  airdrop.status = 'other';
  account.mockReturnValue({ address: TOKEN.address, isConnected: true } as ReturnType<
    typeof useAccount
  >);
  memberIdentity.mockReturnValue(identity());
});

describe('HomePage greeting', () => {
  it('greets with the current identity NFT name as the single h1, not a link', () => {
    renderPage();

    const heading = greeting();
    expect(heading).toHaveTextContent('你好，Testdev-member-0');
    expect(heading.closest('a')).toBeNull();
    expect(heading.className).toContain('truncate');
    // Balance and the old thin line moved to 我的.
    expect(screen.queryByText(/99,799,100/)).toBeNull();
    expect(screen.queryByTestId('home-thin-line')).toBeNull();
    expect(screen.queryByRole('link', { name: /Testdev-member-0/ })).toBeNull();
  });

  it('greets with 你好 when connected without any identity NFT', () => {
    memberIdentity.mockReturnValue(identity({ status: 'empty', identities: [], selected: null }));
    renderPage();

    expect(greeting()).toHaveTextContent('你好');
    expect(greeting()).not.toHaveTextContent('，');
  });

  it('greets with 你好 while identity is loading or has no selected entry', () => {
    memberIdentity.mockReturnValue(identity({ status: 'loading', selected: null }));
    renderPage();

    expect(greeting()).toHaveTextContent('你好');
  });

  it.each(['loading', 'error'] as const)(
    'does not name a cached identity while status is %s',
    (status) => {
      // ownerOf() has not validated the cached selection, so the greeting must
      // agree with the pill's 「—」 and the error card, not assert a name.
      memberIdentity.mockReturnValue(identity({ status }));
      renderPage();

      expect(greeting()).toHaveTextContent(/^你好$/);
      expect(greeting()).not.toHaveTextContent('Testdev-member-0');
    },
  );

  it('greets with 你好 when the wallet is not connected', () => {
    account.mockReturnValue({ address: undefined, isConnected: false } as ReturnType<
      typeof useAccount
    >);
    memberIdentity.mockReturnValue(identity({ status: 'disconnected', selected: null }));
    renderPage();

    expect(greeting()).toHaveTextContent('你好');
    expect(screen.getByRole('button', { name: '连接钱包' })).toBeVisible();
  });
});

describe('HomePage reminders', () => {
  it('shows the no-identity NFT reminder first and links it to /mint', () => {
    memberIdentity.mockReturnValue(identity({ status: 'empty', identities: [], selected: null }));
    renderPage();

    expect(screen.getByText('你还没有身份 NFT')).toBeVisible();
    expect(screen.getByRole('link', { name: '铸造身份 NFT' })).toHaveAttribute(
      'href',
      '/mint?symbol=TestLOVE20',
    );
    expect(screen.queryByText('现在没有需要你处理的事。')).toBeNull();
  });

  it('keeps the fixed order and spends only one filled button when both reminders apply', () => {
    memberIdentity.mockReturnValue(identity({ status: 'empty', identities: [], selected: null }));
    airdrop.status = 'eligible';
    renderPage();

    const mint = screen.getByRole('link', { name: '铸造身份 NFT' });
    const airdropLink = screen.getByRole('link', { name: '空投铸造' });
    // The no-identity card comes first, so it owns the one filled button.
    expect(mint.compareDocumentPosition(airdropLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(mint.className).toContain('bg-brand');
    expect(airdropLink.className).not.toContain('bg-brand');
  });

  it('renders the airdrop reminder with the on-chain amount', async () => {
    airdrop.status = 'eligible';
    renderPage();

    expect(await screen.findByText('你有空投资格，可铸造 1,000 TestLOVE20')).toBeVisible();
    expect(screen.getByRole('link', { name: '空投铸造' })).toHaveAttribute(
      'href',
      '/airdrop?symbol=TestLOVE20',
    );
    expect(screen.queryByText('现在没有需要你处理的事。')).toBeNull();
  });

  it('shows only the greeting when nothing is applicable (no footer)', () => {
    renderPage();

    expect(greeting()).toHaveTextContent('你好，Testdev-member-0');
    expect(screen.queryByText('现在没有需要你处理的事。')).toBeNull();
    expect(screen.queryByRole('link', { name: '铸造身份 NFT' })).toBeNull();
    expect(screen.queryByRole('link', { name: '空投铸造' })).toBeNull();
    expect(document.querySelectorAll('section[aria-labelledby^="home-reminder"]')).toHaveLength(0);
    // Footer/docs/technical details now live on /about (§3.8).
    expect(document.querySelector('footer')).toBeNull();
    expect(screen.queryByText('开源文档')).toBeNull();
    expect(screen.queryByText('技术详情')).toBeNull();
  });

  it('asks a wallet holding identity NFTs to pick one, and never shows the empty sentence', () => {
    memberIdentity.mockReturnValue(identity({ status: 'needs-selection', selected: null }));
    renderPage();

    expect(screen.getByText('你还没有选择身份 NFT')).toBeVisible();
    expect(screen.getByRole('link', { name: '选择身份 NFT' })).toHaveAttribute(
      'href',
      '/my-nft?symbol=TestLOVE20',
    );
    expect(screen.queryByText('现在没有需要你处理的事。')).toBeNull();
    // Mutually exclusive with the no-identity card.
    expect(screen.queryByRole('link', { name: '铸造身份 NFT' })).toBeNull();
  });

  it('gives the needs-selection card the only filled button', async () => {
    memberIdentity.mockReturnValue(identity({ status: 'needs-selection', selected: null }));
    airdrop.status = 'eligible';
    renderPage();

    const choose = screen.getByRole('link', { name: '选择身份 NFT' });
    const airdropLink = screen.getByRole('link', { name: '空投铸造' });
    expect(choose.className).toContain('bg-brand');
    expect(airdropLink.className).not.toContain('bg-brand');
    expect(choose.compareDocumentPosition(airdropLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('keeps the greeting while the lazy airdrop chunk is still pending', () => {
    airdrop.status = 'pending';
    renderPage();

    expect(greeting()).toHaveTextContent('你好，Testdev-member-0');
    expect(screen.queryByText('现在没有需要你处理的事。')).toBeNull();
  });
});

describe('HomePage identity read states', () => {
  it('loading: keeps the reminder slot occupied with a compact skeleton card', () => {
    memberIdentity.mockReturnValue(identity({ status: 'loading', selected: null }));
    renderPage();

    const card = screen.getByTestId('home-identity-loading');
    expect(card).toBeVisible();
    expect(card).toHaveAttribute('aria-busy', 'true');
    expect(within(card).getByText('读取身份 NFT 中…')).toBeVisible();
    expect(greeting()).toHaveTextContent('你好');
    // Loading is not actionable: no mint CTA and no filled button.
    expect(screen.queryByRole('link', { name: '铸造身份 NFT' })).toBeNull();
    expect(screen.queryByRole('button', { name: '重试' })).toBeNull();
  });

  it('error: explains the failed read and 重试 refetches identity', () => {
    const state = identity({ status: 'error', selected: null });
    memberIdentity.mockReturnValue(state);
    renderPage();

    const card = screen.getByTestId('home-identity-error');
    expect(card).toBeVisible();
    expect(within(card).getByRole('heading', { name: '身份 NFT 暂时读不到' })).toBeVisible();
    expect(within(card).getByText('网络可能不稳，你的身份 NFT 没有变化。')).toBeVisible();
    expect(screen.queryByRole('link', { name: '铸造身份 NFT' })).toBeNull();

    fireEvent.click(within(card).getByRole('button', { name: '重试' }));
    expect(state.refetch).toHaveBeenCalledTimes(1);
  });

  it('unconfigured: states that this environment has no identity NFT contract, no CTA', () => {
    memberIdentity.mockReturnValue(identity({ status: 'unconfigured', selected: null }));
    renderPage();

    const card = screen.getByTestId('home-identity-unconfigured');
    expect(card).toBeVisible();
    expect(
      within(card).getByRole('heading', { name: '这个环境还没有部署身份 NFT 合约' }),
    ).toBeVisible();
    expect(within(card).getByText('这里暂时不能铸造身份 NFT。')).toBeVisible();
    // No CTA that would fail and no 重试 (retrying cannot deploy a contract).
    expect(screen.queryByRole('button', { name: '重试' })).toBeNull();
    expect(screen.queryByRole('link', { name: '铸造身份 NFT' })).toBeNull();
  });
});

describe('HomePage disconnected', () => {
  it('shows the connect entry and never a reminder or filler sentence', () => {
    account.mockReturnValue({ address: undefined, isConnected: false } as ReturnType<
      typeof useAccount
    >);
    memberIdentity.mockReturnValue(identity({ status: 'disconnected', selected: null }));
    renderPage();

    expect(screen.getByRole('button', { name: '连接钱包' })).toBeVisible();
    expect(screen.getByText('一个钱包可以拥有多个身份 NFT，身份 NFT 才是参与凭证。')).toBeVisible();
    expect(screen.queryByText('现在没有需要你处理的事。')).toBeNull();
    expect(screen.queryByText('你还没有身份 NFT')).toBeNull();
  });
});
