import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MenuLayer } from '@/widgets/connect-pill/menu-layer';

/**
 * D-1 (QA 2026-11-14): both connect-pill menus open without a Radix trigger, so
 * Radix has nothing to restore focus to on close and used to leave
 * `document.activeElement` on <body> after Esc / ✕. MenuLayer now owns the
 * restore through onCloseAutoFocus; these tests cover the bottom sheet (mobile)
 * and the anchored popover (desktop) branches.
 */
function Harness() {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);

  return (
    <div>
      <button ref={setAnchor} type="button" onClick={() => setOpen(true)}>
        打开社区菜单
      </button>
      {open ? (
        <MenuLayer
          open
          onOpenChange={(next) => {
            if (!next) setOpen(false);
          }}
          title="代币社区"
          anchor={anchor}
        >
          <button type="button">菜单内容</button>
        </MenuLayer>
      ) : null}
    </div>
  );
}

async function openMenu() {
  render(<Harness />);
  const trigger = screen.getByRole('button', { name: '打开社区菜单' });
  trigger.focus();
  fireEvent.click(trigger);
  expect(await screen.findByRole('button', { name: '菜单内容' })).toBeInTheDocument();
  return trigger;
}

function pressEscape() {
  fireEvent.keyDown(document.activeElement ?? document.body, {
    key: 'Escape',
    code: 'Escape',
  });
}

describe('MenuLayer close focus restore (bottom sheet / mobile)', () => {
  it('Esc gives focus back to the anchor button', async () => {
    const trigger = await openMenu();

    pressEscape();

    await waitFor(() => expect(screen.queryByRole('button', { name: '菜单内容' })).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it('the ✕ close button gives focus back to the anchor button', async () => {
    const trigger = await openMenu();

    fireEvent.click(screen.getByRole('button', { name: '关闭' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: '菜单内容' })).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });
});

describe('MenuLayer close focus restore (anchored popover / desktop)', () => {
  it('Esc gives focus back to the anchor button', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: query.includes('min-width: 768px'),
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        }) as MediaQueryList,
    );
    const trigger = await openMenu();

    pressEscape();

    await waitFor(() => expect(screen.queryByRole('button', { name: '菜单内容' })).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });
});
