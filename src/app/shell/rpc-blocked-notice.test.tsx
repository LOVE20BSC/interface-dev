import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { RpcBlockedNotice } from '@/app/shell/rpc-blocked-notice';
import { clearSessionFlag, hasSessionFlag } from '@/shared/lib/cache';

const HTTP_ORIGIN = 'http://127.0.0.1:5180';
const HTTPS_ORIGIN = 'https://love20bsc.github.io';
const LOOPBACK_RPC = ['http://127.0.0.1:8545'];
const FALLBACK_RPC = ['https://bsc-dataseed.binance.org'];

function renderNotice(origin: string, rpcUrls: readonly string[]) {
  return render(<RpcBlockedNotice origin={origin} rpcUrls={rpcUrls} />);
}

beforeEach(() => {
  clearSessionFlag('rpcBlockedNoticeSeen');
});

describe('RpcBlockedNotice', () => {
  it('renders the loopback explanation on an HTTPS page pointing at a local chain', () => {
    renderNotice(HTTPS_ORIGIN, LOOPBACK_RPC);

    const notice = screen.getByTestId('rpc-blocked-notice');
    expect(notice).toBeVisible();
    expect(screen.getByText('线上页面不能访问本地链')).toBeVisible();
    expect(notice).toHaveTextContent('浏览器会拦截 HTTPS 页面对本地链');
    expect(notice).toHaveTextContent('pnpm dev');
    expect(notice).toHaveTextContent('http://localhost:5180');
  });

  it('shows the same notice for localhost and IPv6 loopback RPCs', () => {
    const { unmount } = renderNotice(HTTPS_ORIGIN, ['http://localhost:8545']);
    expect(screen.getByTestId('rpc-blocked-notice')).toBeVisible();
    unmount();
    clearSessionFlag('rpcBlockedNoticeSeen');
    renderNotice(HTTPS_ORIGIN, ['http://[::1]:8545']);
    expect(screen.getByTestId('rpc-blocked-notice')).toBeVisible();
  });

  it('never renders on an HTTP page, where the browser allows loopback calls', () => {
    renderNotice(HTTP_ORIGIN, LOOPBACK_RPC);

    expect(screen.queryByTestId('rpc-blocked-notice')).toBeNull();
  });

  it('never renders when the configured RPC is reachable over HTTPS', () => {
    renderNotice(HTTPS_ORIGIN, FALLBACK_RPC);

    expect(screen.queryByTestId('rpc-blocked-notice')).toBeNull();
  });

  it('renders once per browser session, not once per route mount', () => {
    const first = renderNotice(HTTPS_ORIGIN, LOOPBACK_RPC);
    expect(screen.getByTestId('rpc-blocked-notice')).toBeVisible();
    expect(hasSessionFlag('rpcBlockedNoticeSeen')).toBe(true);
    first.unmount();

    // A route change remounts the shell around a different page; the session
    // flag keeps the already-explained constraint from reappearing.
    renderNotice(HTTPS_ORIGIN, LOOPBACK_RPC);
    expect(screen.queryByTestId('rpc-blocked-notice')).toBeNull();
  });

  it('dismisses immediately and stays hidden for the rest of the session', () => {
    const first = renderNotice(HTTPS_ORIGIN, LOOPBACK_RPC);
    fireEvent.click(screen.getByRole('button', { name: '知道了' }));
    expect(screen.queryByTestId('rpc-blocked-notice')).toBeNull();
    first.unmount();

    renderNotice(HTTPS_ORIGIN, LOOPBACK_RPC);
    expect(screen.queryByTestId('rpc-blocked-notice')).toBeNull();
  });
});
