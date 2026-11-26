import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyText } from '@/shared/lib/clipboard';
import { TxHashRow } from '@/shared/ui/tx-hash-row';

vi.mock('@/shared/lib/clipboard', () => ({
  copyText: vi.fn(async () => true),
}));

const copyTextMock = vi.mocked(copyText);
const HASH = '0x133c893281ff121d15652260c6eead11e0c694de5832cda2b7234d0cd647f1ae';

function renderRow() {
  return render(
    <dl>
      <TxHashRow hash={HASH} testId="row-hash" />
    </dl>,
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

describe('TxHashRow', () => {
  it('renders the full hash and the shared vocabulary', () => {
    renderRow();
    expect(screen.getByTestId('row-hash').textContent).toBe(HASH);
    expect(screen.getByText('交易哈希')).toBeTruthy();
    expect(screen.getByLabelText('复制交易哈希')).toBeTruthy();
  });

  it('copies the hash and shows 已复制 for 2 seconds', async () => {
    renderRow();
    await act(async () => {
      fireEvent.click(screen.getByLabelText('复制交易哈希'));
    });
    expect(copyTextMock).toHaveBeenCalledWith(HASH);
    expect(screen.getByText('已复制')).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByText('复制')).toBeTruthy();
  });

  it('keeps the button idle when the clipboard refuses', async () => {
    copyTextMock.mockResolvedValue(false);
    renderRow();
    await act(async () => {
      fireEvent.click(screen.getByLabelText('复制交易哈希'));
    });
    expect(screen.queryByText('已复制')).toBeNull();
  });

  it('honours a caller testid and label override', () => {
    render(
      <dl>
        <TxHashRow hash={HASH} testId="custom-hash" label="交易哈希号" copyLabel="复制哈希" />
      </dl>,
    );
    expect(screen.getByTestId('custom-hash').textContent).toBe(HASH);
    expect(screen.getByText('交易哈希号')).toBeTruthy();
    expect(screen.getByLabelText('复制哈希')).toBeTruthy();
  });
});
