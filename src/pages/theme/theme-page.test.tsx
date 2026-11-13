import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ThemePage } from '@/pages/theme/theme-page';
import { applyTheme } from '@/shared/lib/theme';

const STORAGE_KEY = 'love20:theme';

beforeEach(() => {
  window.localStorage.clear();
  applyTheme('light', { persist: false });
});

describe('ThemePage', () => {
  it('offers exactly the two explicit palettes (no follow-system option)', () => {
    render(<ThemePage />);

    const options = screen.getAllByRole('radio');
    expect(options).toHaveLength(2);
    expect(options.map((option) => option.getAttribute('data-theme-id'))).toEqual([
      'light',
      'dark',
    ]);
    expect(screen.getByRole('radio', { name: '浅色' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '深色' })).not.toBeChecked();
    expect(screen.queryByText(/跟随系统/)).toBeNull();
  });

  it('renders one literal palette preview per card', () => {
    render(<ThemePage />);

    const previews = screen.getAllByTestId('theme-preview');
    expect(previews).toHaveLength(2);
    // jsdom serialises inline colours as rgb(); both cards show their own literal palette.
    expect(previews[0]?.getAttribute('style')).toContain('rgb(246, 247, 251)');
    expect(previews[1]?.getAttribute('style')).toContain('rgb(11, 14, 17)');
  });

  it('applies the dark palette immediately and remembers it', () => {
    render(<ThemePage />);

    fireEvent.click(screen.getByRole('radio', { name: '深色' }));

    expect(screen.getByRole('radio', { name: '深色' })).toBeChecked();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('dark');
  });

  it('switches back to light without a reload', () => {
    applyTheme('dark', { persist: false });
    render(<ThemePage />);

    expect(screen.getByRole('radio', { name: '深色' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: '浅色' }));

    expect(screen.getByRole('radio', { name: '浅色' })).toBeChecked();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('light');
  });

  it('moves the selection with the arrow keys on the radiogroup', () => {
    render(<ThemePage />);

    fireEvent.keyDown(screen.getByRole('radio', { name: '浅色' }), { key: 'ArrowRight' });

    expect(screen.getByRole('radio', { name: '深色' })).toBeChecked();
  });
});
