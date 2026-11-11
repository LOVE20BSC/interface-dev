import { render, screen } from '@testing-library/react';
import { Link, MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HomePage } from '@/pages/home/home-page';
import { useCommunityToken } from '@/entities/community-token/model/use-community-token';
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

vi.mock('@/entities/community-token/model/use-community-token', () => ({
  useCommunityToken: vi.fn(),
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
const communityToken = vi.mocked(useCommunityToken);

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
  communityToken.mockReturnValue(TOKEN);
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

  it('shows only the greeting and footer when nothing is applicable', () => {
    renderPage();

    expect(greeting()).toHaveTextContent('你好，Testdev-member-0');
    expect(screen.queryByText('现在没有需要你处理的事。')).toBeNull();
    expect(screen.queryByRole('link', { name: '铸造身份 NFT' })).toBeNull();
    expect(screen.queryByRole('link', { name: '空投铸造' })).toBeNull();
    expect(document.querySelectorAll('section[aria-labelledby^="home-reminder"]')).toHaveLength(0);
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
