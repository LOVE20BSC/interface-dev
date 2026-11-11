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
      '应用',
      '我的',
    ]);
    // M0: the 行动 page is a placeholder, so this build has no raised center tab.
    expect(NAV_ITEMS.some((item) => 'raised' in item)).toBe(false);
    expect(NAV_ITEMS.map((item) => item.key)).toEqual(['home', 'gov', 'act', 'apps', 'me']);
    // Owner 2026-11-11: the 链群 tab is replaced by the 应用 feature directory.
    expect(within(nav).queryByRole('link', { name: /链群/ })).toBeNull();
    // 我的 is a real page now: no 即将上线 suffix/badge. 治理 / 行动 keep it.
    expect(within(nav).getByRole('link', { name: '我的' })).not.toHaveTextContent('即将上线');
    expect(within(nav).getByRole('link', { name: /治理/ })).toHaveTextContent('即将上线');
    expect(within(nav).getByRole('link', { name: /行动/ })).toHaveTextContent('即将上线');
  });

  it('marks the active tab and preserves ?symbol= on every link', () => {
    const nav = renderAt('/gov?symbol=LOVE20');
    const gov = within(nav).getByRole('link', { name: /治理/ });
    expect(gov).toHaveAttribute('aria-current', 'page');
    for (const link of within(nav).getAllByRole('link')) {
      expect(link.getAttribute('href')).toContain('symbol=LOVE20');
    }
  });

  it('marks 应用 active on /apps and keeps ?symbol= on the tab link', () => {
    const nav = renderAt('/apps?symbol=LOVE20');
    const apps = within(nav).getByRole('link', { name: '应用' });
    expect(apps).toHaveAttribute('aria-current', 'page');
    expect(apps.getAttribute('href')).toBe('/apps?symbol=LOVE20');
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
