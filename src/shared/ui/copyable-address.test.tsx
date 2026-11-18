import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADDRESS_COPY_FEEDBACK_MS, CopyableAddress } from '@/shared/ui/copyable-address';
import { copyText } from '@/shared/lib/clipboard';

vi.mock('@/shared/lib/clipboard', () => ({
  copyText: vi.fn(async () => true),
}));

const copyTextMock = vi.mocked(copyText);
const ROUTER = '0x0165878A594ca255338adfa4d48449f69242Eb8F';

function renderAddress(display?: 'short' | 'full' | 'auto') {
  return render(
    <CopyableAddress
      address={ROUTER}
      label="路由合约"
      {...(display !== undefined ? { display } : {})}
      testId="copy-address"
    />,
  );
}

beforeEach(() => {
  copyTextMock.mockReset();
  copyTextMock.mockResolvedValue(true);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CopyableAddress 全局地址组件', () => {
  it('renders the abbreviated address but keeps the full one in title and copies it', async () => {
    renderAddress();
    const button = screen.getByTestId('copy-address');
    expect(button).toHaveTextContent('0x0165…Eb8F');
    expect(button).toHaveAttribute('title', ROUTER);
    expect(button).toHaveAccessibleName('复制地址：路由合约');

    await act(async () => {
      fireEvent.click(button);
    });
    expect(copyTextMock).toHaveBeenCalledWith(ROUTER);
    expect(button).toHaveTextContent('已复制');
    expect(button).toHaveAccessibleName('地址已复制：路由合约');
  });

  it('resets the 已复制 feedback after the timeout', async () => {
    renderAddress();
    const button = screen.getByTestId('copy-address');
    await act(async () => {
      fireEvent.click(button);
    });
    expect(button).toHaveTextContent('已复制');
    act(() => {
      vi.advanceTimersByTime(ADDRESS_COPY_FEEDBACK_MS);
    });
    expect(button).not.toHaveTextContent('已复制');
    expect(button).toHaveAccessibleName('复制地址：路由合约');
  });

  it('falls back to an explicit failure instead of a silently dead button', async () => {
    copyTextMock.mockResolvedValue(false);
    renderAddress();
    const button = screen.getByTestId('copy-address');
    await act(async () => {
      fireEvent.click(button);
    });
    expect(button).toHaveTextContent('复制失败，请手动选中地址');
  });

  it('shows the full address when display="full" (关于页 keeps every character)', () => {
    renderAddress('full');
    const button = screen.getByTestId('copy-address');
    expect(button).toHaveTextContent(ROUTER);
    expect(button).toHaveAttribute('title', ROUTER);
  });

  it('auto: shows the full address when it fits, the middle-elided form when it overflows', () => {
    // jsdom 没有排版：手动给出宽度，验证 auto 的两条分支（owner 2026-11-19）。
    const scrollWidth = vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockReturnValue(100);
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(100);

    const fits = renderAddress('auto');
    const full = screen.getByTestId('copy-address');
    expect(full).toHaveTextContent(ROUTER);
    expect(full).toHaveAttribute('title', ROUTER);
    fits.unmount();

    // 放不下才退回中间省略；title / 复制的仍是完整地址。
    scrollWidth.mockReturnValue(400);
    renderAddress('auto');
    const elided = screen.getByTestId('copy-address');
    expect(elided).toHaveTextContent('0x0165…Eb8F');
    expect(elided).toHaveAttribute('title', ROUTER);
  });

  it('adds <wbr> break points every 4 hex chars so the last line is never 1 char', () => {
    renderAddress('full');
    const button = screen.getByTestId('copy-address');
    // 0x + 40 hex characters, 4 characters per soft-break group.
    expect(button.querySelectorAll('wbr')).toHaveLength(10);
    // Break points are markup only: the copyable text and the title are unchanged.
    expect(button).toHaveTextContent(ROUTER);
    expect(button).toHaveAttribute('title', ROUTER);
  });
});
