import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

export interface ActionStackProps {
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * Primary-action stack for task pages (swap / mint / airdrop / transfer /
 * batch-transfer / liquidity).
 *
 * Owner 2026-11-14 09:30: the action buttons used to be pinned to the mobile
 * viewport bottom (`fixed bottom-0`, formerly `StickyAction`). That dock put the
 * prerequisite step (授权) visually *after* the primary step (兑换) and hid it
 * below the fold, which read as "the 兑换 button is just greyed out for no
 * reason". Buttons now render in the content flow, next to the thing they act
 * on: prerequisite first, primary action after.
 *
 * This component is deliberately dumb — an in-flow vertical stack with no
 * positioning, no surface and no reserved viewport space. Callers decide where
 * the stack belongs (inside the swap card for the approval step, below the
 * details block for the submit button).
 */
export function ActionStack({ children, className }: ActionStackProps) {
  return <div className={cn('space-y-2', className)}>{children}</div>;
}
