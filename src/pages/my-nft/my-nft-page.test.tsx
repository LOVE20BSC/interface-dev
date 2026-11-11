import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAccount } from 'wagmi';
import { MyNftPage } from '@/pages/my-nft/my-nft-page';
import { useMemberIdentity } from '@/entities/member-identity/model/use-member-identity';
import type { MemberIdentityState } from '@/entities/member-identity/model/use-member-identity';

vi.mock('wagmi', () => ({ useAccount: vi.fn() }));

vi.mock('@/entities/member-identity/model/use-member-identity', () => ({
  useMemberIdentity: vi.fn(),
}));

vi.mock('@/features/connect-wallet/ui/connect-wallet-button', () => ({
  ConnectWalletButton: () => <button type="button">连接钱包</button>,
}));

vi.mock('@/features/select-identity/ui/identity-list', () => ({
  IdentityList: () => <div data-testid="identity-list" />,
}));

const account = vi.mocked(useAccount);
const memberIdentity = vi.mocked(useMemberIdentity);

function identity(overrides: Partial<MemberIdentityState> = {}): MemberIdentityState {
  return {
    status: 'ready',
    identities: [{ tokenId: 1n, name: 'Testdev-member-0' }],
    balance: 1n,
    selected: { tokenId: 1n, name: 'Testdev-member-0' },
    isInvalidated: false,
    isTruncated: false,
    memberNftAddress: '0x610178dA211FEF7D417bC0e6FeD39F05609AD788',
    select: vi.fn(),
    clear: vi.fn(),
    refetch: vi.fn(),
    ...overrides,
  };
}

function renderPage(): void {
  render(
    <MemoryRouter initialEntries={['/my-nft?symbol=TestLOVE20']}>
      <MyNftPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  account.mockReturnValue({
    address: '0x8b3a350Cf5C34c9194ca85829a2df0ec3153bE5d',
    isConnected: true,
  } as unknown as ReturnType<typeof useAccount>);
  memberIdentity.mockReturnValue(identity());
});

describe('MyNftPage identity states', () => {
  it('connected and ready: delegates the list as before', () => {
    renderPage();

    expect(screen.getByTestId('identity-list')).toBeVisible();
  });

  it('unconfigured: explains the missing contract instead of a bare page', () => {
    memberIdentity.mockReturnValue(
      identity({ status: 'unconfigured', identities: [], selected: null }),
    );
    renderPage();

    expect(screen.getByRole('heading', { name: '这个环境还没有部署身份 NFT 合约' })).toBeVisible();
    expect(screen.getByText('这里暂时不能铸造身份 NFT。')).toBeVisible();
    expect(screen.queryByTestId('identity-list')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
