import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { BottomNav } from '@/app/shell/bottom-nav';
import { NAV_ITEMS } from '@/app/navigation/navigation';

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <BottomNav />
    </MemoryRouter>,
  );
  return screen.getByRole('navigation', { name: '主导航' });
}

describe('BottomNav', () => {
  it('renders the five configured tabs, in order, from one config', () => {
    const nav = renderAt('/?symbol=LOVE20');
    const links = within(nav).getAllByRole('link');
    expect(links).toHaveLength(5);
    expect(links.map((link) => link.textContent?.replace(/（即将上线）/, '').trim())).toEqual([
      '首页',
      '治理',
      '行动',
      '链群',
      '我的',
    ]);
    // M0: the 行动 page is a placeholder, so this build has no raised center tab.
    expect(NAV_ITEMS.some((item) => 'raised' in item)).toBe(false);
  });

  it('marks the active tab and preserves ?symbol= on every link', () => {
    const nav = renderAt('/gov?symbol=LOVE20');
    const gov = within(nav).getByRole('link', { name: /治理/ });
    expect(gov).toHaveAttribute('aria-current', 'page');
    for (const link of within(nav).getAllByRole('link')) {
      expect(link.getAttribute('href')).toContain('symbol=LOVE20');
    }
  });

  it('renders the center action tab as a normal tab, not a raised disc', () => {
    const nav = renderAt('/?symbol=LOVE20');
    const action = within(nav).getByRole('link', { name: /行动/ });
    const peer = within(nav).getByRole('link', { name: /治理/ });
    expect(action.getAttribute('href')).toContain('/act');
    expect(action.getAttribute('href')).toContain('symbol=LOVE20');
    // Same treatment as every other tab: no disc wrapper, no extra label offset.
    expect(action.className).toBe(peer.className);
    expect(action.querySelector('span')?.className).toBe(peer.querySelector('span')?.className);
  });
});
