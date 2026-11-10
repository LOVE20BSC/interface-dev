import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppHeader } from '@/app/shell/app-header';
import { useCommunityToken } from '@/entities/community-token/model/use-community-token';
import type { CommunityToken } from '@/entities/community-token/model/use-community-token';

vi.mock('@/widgets/connect-pill/connect-pill', () => ({
  ConnectPill: () => <span data-testid="connect-pill" />,
}));

vi.mock('@/features/switch-community/model/use-community-context', () => ({
  useCommunityContext: () => ({
    symbol: 'TestLOVE20',
    fromUrl: true,
    switchSymbol: () => {},
  }),
}));

vi.mock('@/entities/community-token/model/use-community-token', () => ({
  useCommunityToken: vi.fn(),
}));

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

function renderHeader() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <AppHeader />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  communityToken.mockReturnValue(TOKEN);
});

describe('AppHeader wordmark', () => {
  it('shows the protocol label while community metadata loads, then the chain symbol', () => {
    communityToken.mockReturnValue({ ...TOKEN, isMetadataLoading: true });
    const view = renderHeader();

    expect(screen.getByRole('link', { name: 'LOVE20协议 首页' })).toHaveTextContent('LOVE20协议');

    communityToken.mockReturnValue(TOKEN);
    view.rerender(
      <MemoryRouter initialEntries={['/']}>
        <AppHeader />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'TestLOVE20 首页' })).toHaveTextContent('TestLOVE20');
  });

  it('keeps the protocol label when no community is resolved', () => {
    communityToken.mockReturnValue({ ...TOKEN, status: 'unknown', address: undefined });
    renderHeader();

    expect(screen.getByRole('link', { name: 'LOVE20协议 首页' })).toHaveTextContent('LOVE20协议');
  });
});
