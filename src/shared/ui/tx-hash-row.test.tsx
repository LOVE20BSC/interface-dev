import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copy } from '@/shared/config/copy-pages';
import { COPY_FEEDBACK_MS, copyText } from '@/shared/lib/clipboard';
import { TxHashRow } from '@/shared/ui/tx-hash-row';

vi.mock('@/shared/lib/clipboard', async () => {
  // 只换掉 copyText；反馈时长等常量保持真实值（帮助函数已删掉 import() 类型注解）。
  const actual = await vi.importActual<{ COPY_FEEDBACK_MS: number }>('@/shared/lib/clipboard');
  return { ...actual, copyText: vi.fn(async () => true) };
});

const copyTextMock = vi.mocked(copyText);
const HASH = '0x133c893281ff121d15652260c6eead11e0c694de5832cda2b7234d0cd647f1ae';

function renderRow() {
  return render(
    <dl>
      <TxHashRow hash={HASH} testId="row-hash" />
    </dl>,
  );
}

/** §6.1：只按 testid 找元素、按 copy 常量断言，不写死中文文本。 */
beforeEach(() => {
  copyTextMock.mockReset();
  copyTextMock.mockResolvedValue(true);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('TxHashRow', () => {
  it('renders the full hash and the shared vocabulary', () => {
    renderRow();
    expect(screen.getByTestId('row-hash')).toHaveTextContent(HASH);
    expect(screen.getByTestId('row-hash-label')).toHaveTextContent(copy.common.txHashLabel);
    expect(screen.getByTestId('row-hash-copy')).toHaveAccessibleName(copy.common.txHashCopy);
  });

  it('copies the hash and shows the copied state for the shared feedback window', async () => {
    renderRow();
    const button = screen.getByTestId('row-hash-copy');
    await act(async () => {
      fireEvent.click(button);
    });
    expect(copyTextMock).toHaveBeenCalledWith(HASH);
    expect(button).toHaveTextContent(copy.common.copied);

    await act(async () => {
      vi.advanceTimersByTime(COPY_FEEDBACK_MS);
    });
    expect(button).toHaveTextContent(copy.common.copy);
  });

  it('keeps the button idle when the clipboard refuses', async () => {
    copyTextMock.mockResolvedValue(false);
    renderRow();
    const button = screen.getByTestId('row-hash-copy');
    await act(async () => {
      fireEvent.click(button);
    });
    expect(button).not.toHaveTextContent(copy.common.copied);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('re-arms a single feedback timer instead of stacking one per click', async () => {
    renderRow();
    const button = screen.getByTestId('row-hash-copy');
    await act(async () => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(vi.getTimerCount()).toBe(1);
  });

  it('clears the feedback timer on unmount', async () => {
    const { unmount } = renderRow();
    await act(async () => {
      fireEvent.click(screen.getByTestId('row-hash-copy'));
    });
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('honours a caller testid and label override', () => {
    render(
      <dl>
        <TxHashRow hash={HASH} testId="custom-hash" label="交易哈希号" copyLabel="复制哈希" />
      </dl>,
    );
    expect(screen.getByTestId('custom-hash')).toHaveTextContent(HASH);
    expect(screen.getByTestId('custom-hash-label')).toHaveTextContent('交易哈希号');
    expect(screen.getByTestId('custom-hash-copy')).toHaveAccessibleName('复制哈希');
  });
});
