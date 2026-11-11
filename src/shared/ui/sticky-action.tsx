import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

export interface StickyActionProps {
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * Mobile primary-action dock for the swap/mint/airdrop pages.
 *
 * It pins the page's single primary CTA directly above the mobile tab bar
 * (`--bottom-navigation-height` already includes the safe-area inset) while the
 * page scrolls behind it. The dock is anchored to the viewport bottom and pads
 * itself by the tab-bar height, so its opaque surface also runs behind the tab
 * bar and the safe area: no page content can show through the seam. On md+ the
 * same children stay in the normal flow next to the card, so desktop layout is
 * unchanged. The app shell reserves `--sticky-action-height` at the bottom of
 * the scroll container, so content under the dock is always reachable.
 *
 * The `max-md:mb-0` matters: these pages place the dock inside `space-y-*`
 * sections, and a fixed element's margins are subtracted from `bottom`, which
 * would otherwise lift the dock off the tab bar by the row gap.
 *
 * States that replace the CTA (receipt sheets, insufficient-funds branch,
 * disconnected cards) return before this component, so the dock never
 * double-renders.
 */
export function StickyAction({ children, className }: StickyActionProps) {
  return (
    <div
      className={cn(
        'fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[var(--bottom-navigation-height)]',
        'max-md:mb-0',
        'md:static md:z-auto md:border-0 md:bg-transparent md:pb-0',
        className,
      )}
    >
      <div className="mx-auto w-full max-w-[32rem] px-4 py-2.5 md:max-w-none md:p-0">
        {children}
      </div>
    </div>
  );
}
