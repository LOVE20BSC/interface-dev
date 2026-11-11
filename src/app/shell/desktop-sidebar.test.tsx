import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DesktopSidebar } from '@/app/shell/desktop-sidebar';
import { useCommunityToken } from '@/entities/community-token/model/use-community-token';
import type { CommunityToken } from '@/entities/community-token/model/use-community-token';

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

function renderSidebar() {
  return render(
    <MemoryRouter>
      <DesktopSidebar collapsed={false} onToggle={() => {}} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  token.mockReturnValue(FIXTURE);
});

describe('DesktopSidebar navigation', () => {
  it('keeps 即将上线 only on the 治理 / 行动 placeholders', () => {
    renderSidebar();
    expect(screen.getByRole('link', { name: /治理/ })).toHaveTextContent('即将上线');
    expect(screen.getByRole('link', { name: /行动/ })).toHaveTextContent('即将上线');
    expect(screen.getByRole('link', { name: '我的' })).not.toHaveTextContent('即将上线');
    expect(screen.getByRole('link', { name: '应用' })).not.toHaveTextContent('即将上线');
  });
});

describe('DesktopSidebar wordmark', () => {
  it('follows the current community on-chain symbol()', () => {
    renderSidebar();
    expect(screen.getByRole('link', { name: 'TestLOVE20 首页' })).toHaveTextContent('TestLOVE20');
  });

  it('shows the protocol label when no community is resolved', () => {
    token.mockReturnValue({ ...FIXTURE, status: 'unknown', address: undefined });
    renderSidebar();
    expect(screen.getByRole('link', { name: 'LOVE20协议 首页' })).toHaveTextContent('LOVE20协议');
  });
});
