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
 * page scrolls behind it. On md+ the same children stay in the normal flow next
 * to the card, so desktop layout is unchanged. The app shell reserves
 * `--sticky-action-height` at the bottom of the scroll container, so content
 * under the dock is always reachable.
 *
 * States that replace the CTA (receipt sheets, insufficient-funds branch,
 * disconnected cards) return before this component, so the dock never
 * double-renders.
 */
export function StickyAction({ children, className }: StickyActionProps) {
  return (
    <div
      className={cn(
        'fixed inset-x-0 bottom-[var(--bottom-navigation-height)] z-30 border-t border-line bg-surface/95 backdrop-blur',
        'md:static md:z-auto md:border-0 md:bg-transparent md:backdrop-blur-none',
        className,
      )}
    >
      <div className="mx-auto w-full max-w-[32rem] px-4 py-2.5 md:max-w-none md:p-0">
        {children}
      </div>
    </div>
  );
}
