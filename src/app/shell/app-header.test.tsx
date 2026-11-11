import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppHeader } from '@/app/shell/app-header';

vi.mock('@/widgets/connect-pill/connect-pill', () => ({
  ConnectPill: () => <span data-testid="connect-pill" />,
}));

function renderHeader(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppHeader />
    </MemoryRouter>,
  );
}

describe('AppHeader', () => {
  it('home has no wordmark link, keeps the pill area and the landmark', () => {
    renderHeader('/');

    // The mobile wordmark was removed by owner request (2026-11-11): the
    // community symbol lives in the top-right pill, not a left home link.
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('link', { name: /首页/ })).toBeNull();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByTestId('connect-pill')).toBeVisible();
  });

  it('desktop home keeps the page label as plain text, not a link', () => {
    renderHeader('/');

    expect(screen.getByText('首页')).toBeInTheDocument();
    expect(screen.getByText('首页').closest('a')).toBeNull();
  });

  it('secondary pages still render the back control, title and pill', () => {
    renderHeader('/my-nft');

    expect(screen.getByRole('button', { name: '返回上一页' })).toBeVisible();
    expect(screen.getByRole('heading', { name: '我的 NFT' })).toBeVisible();
    expect(screen.getByTestId('connect-pill')).toBeVisible();
    expect(screen.queryByText('首页')).toBeNull();
  });
});
