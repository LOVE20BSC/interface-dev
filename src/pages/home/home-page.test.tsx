import { useEffect } from 'react';
import { render, screen } from '@testing-library/react';
import { Link, MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HomePage } from '@/pages/home/home-page';
import { useCommunityBalance } from '@/entities/community-token/model/use-community-balance';
import { useCommunityToken } from '@/entities/community-token/model/use-community-token';
import { useMemberIdentity } from '@/entities/member-identity/model/use-member-identity';
import type { MemberIdentityState } from '@/entities/member-identity/model/use-member-identity';
import type { CommunityToken } from '@/entities/community-token/model/use-community-token';
import type { TokenBalance } from '@/entities/community-token/model/use-community-balance';
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

vi.mock('@/entities/community-token/model/use-community-balance', () => ({
  useCommunityBalance: vi.fn(),
}));

const airdrop = vi.hoisted(() => ({
  status: 'other' as 'pending' | 'eligible' | 'other',
}));

vi.mock('@/pages/home/airdrop-reminder', () => ({
  AirdropReminder: ({
    primary,
    onStatusChange,
  }: {
    readonly primary: boolean;
    readonly onStatusChange: (status: 'pending' | 'eligible' | 'other') => void;
  }) => {
    useEffect(() => {
      onStatusChange(airdrop.status);
    }, [onStatusChange]);
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

beforeEach(() => {
  airdrop.status = 'other';
  account.mockReturnValue({ address: TOKEN.address, isConnected: true } as ReturnType<
    typeof useAccount
  >);
  memberIdentity.mockReturnValue(identity());
  communityToken.mockReturnValue(TOKEN);
  communityBalance.mockReturnValue(BALANCE);
});

describe('HomePage thin line', () => {
  it('shows the current identity name and the formatted community balance in one link to /me', () => {
    renderPage();

    const link = screen.getByRole('link', { name: /Testdev-member-0/ });
    expect(link).toHaveAttribute('href', '/me?symbol=TestLOVE20');
    expect(link).toHaveTextContent('Testdev-member-0');
    expect(link).toHaveTextContent('99,799,100 TestLOVE20');
    expect(link).not.toHaveTextContent('99799100');
    // The old greeting / identity pill / 切换身份 entry is gone from home.
    expect(screen.queryByText('你好，Testdev-member-0')).toBeNull();
    expect(screen.queryByRole('link', { name: '切换身份' })).toBeNull();
  });

  it('falls back to 还没有身份 when the wallet holds no identity', () => {
    memberIdentity.mockReturnValue(identity({ status: 'empty', identities: [], selected: null }));
    renderPage();

    expect(screen.getByRole('link', { name: /还没有身份/ })).toBeVisible();
  });

  it('keeps unknown identity and balance as 「—」, never as 0', () => {
    memberIdentity.mockReturnValue(identity({ status: 'loading', selected: null }));
    communityBalance.mockReturnValue({ status: 'loading', value: undefined, decimals: 18 });
    renderPage();

    const link = screen.getByRole('link', { name: /—/ });
    expect(link).toHaveTextContent('——');
    expect(link).not.toHaveTextContent('0');
  });
});

describe('HomePage reminders', () => {
  it('shows the no-identity reminder first and links it to /mint', () => {
    memberIdentity.mockReturnValue(identity({ status: 'empty', identities: [], selected: null }));
    renderPage();

    expect(screen.getByText('你还没有身份')).toBeVisible();
    expect(screen.getByRole('link', { name: '铸造身份' })).toHaveAttribute(
      'href',
      '/mint?symbol=TestLOVE20',
    );
    expect(screen.queryByText('现在没有需要你处理的事。')).toBeNull();
  });

  it('keeps the fixed order and spends only one filled button when both reminders apply', () => {
    memberIdentity.mockReturnValue(identity({ status: 'empty', identities: [], selected: null }));
    airdrop.status = 'eligible';
    renderPage();

    const mint = screen.getByRole('link', { name: '铸造身份' });
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

  it('shows exactly one muted sentence when nothing is applicable', async () => {
    renderPage();

    const sentence = await screen.findByText('现在没有需要你处理的事。');
    expect(sentence).toBeVisible();
    expect(screen.getAllByText('现在没有需要你处理的事。')).toHaveLength(1);
    expect(screen.queryByRole('link', { name: '铸造身份' })).toBeNull();
    expect(screen.queryByRole('link', { name: '空投铸造' })).toBeNull();
  });

  it('asks a wallet holding identities to pick one, and never shows the empty sentence', () => {
    memberIdentity.mockReturnValue(identity({ status: 'needs-selection', selected: null }));
    renderPage();

    expect(screen.getByText('你还没有选择身份')).toBeVisible();
    expect(screen.getByRole('link', { name: '选择身份' })).toHaveAttribute(
      'href',
      '/my-nft?symbol=TestLOVE20',
    );
    expect(screen.queryByText('现在没有需要你处理的事。')).toBeNull();
    // Mutually exclusive with the no-identity card.
    expect(screen.queryByRole('link', { name: '铸造身份' })).toBeNull();
  });

  it('gives the needs-selection card the only filled button', async () => {
    memberIdentity.mockReturnValue(identity({ status: 'needs-selection', selected: null }));
    airdrop.status = 'eligible';
    renderPage();

    const choose = screen.getByRole('link', { name: '选择身份' });
    const airdropLink = screen.getByRole('link', { name: '空投铸造' });
    expect(choose.className).toContain('bg-brand');
    expect(airdropLink.className).not.toContain('bg-brand');
    expect(choose.compareDocumentPosition(airdropLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('hides the empty sentence while the lazy airdrop chunk is still pending', () => {
    airdrop.status = 'pending';
    renderPage();

    expect(screen.queryByText('现在没有需要你处理的事。')).toBeNull();
  });
});

describe('HomePage disconnected', () => {
  it('shows the existing connect entry and never the empty sentence', () => {
    account.mockReturnValue({ address: undefined, isConnected: false } as ReturnType<
      typeof useAccount
    >);
    memberIdentity.mockReturnValue(identity({ status: 'disconnected', selected: null }));
    renderPage();

    expect(screen.getByRole('button', { name: '连接钱包' })).toBeVisible();
    expect(screen.queryByText('现在没有需要你处理的事。')).toBeNull();
    expect(screen.queryByText('你还没有身份')).toBeNull();
  });
});
