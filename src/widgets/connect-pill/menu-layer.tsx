import { useMemo, type ReactNode, type RefObject } from 'react';
import { useMediaQuery } from '@/shared/lib/use-media-query';
import { Popover, PopoverAnchor, PopoverContent } from '@/shared/ui/popover';
import { Sheet } from '@/shared/ui/sheet';

export interface MenuLayerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description?: string;
  readonly anchor: HTMLElement | null;
  readonly align?: 'start' | 'center' | 'end';
  readonly children: ReactNode;
}

/**
 * Radix Popover on md+, bottom sheet below md, same content in both.
 *
 * The trigger lives in the eager shell, so this layer mounts only after a click
 * and re-anchors with a zero-height spacer at the trigger's rect. That keeps all
 * Radix/Floating UI code out of the first-screen bundle.
 */
export function MenuLayer({
  open,
  onOpenChange,
  title,
  description,
  anchor,
  align = 'end',
  children,
}: MenuLayerProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)');
  // Both layers open without a Radix trigger (the eager buttons live outside the
  // lazy overlay graph), so Radix has no element to restore focus to and would
  // drop it on <body> after Esc / ✕. Take the restore over: preventDefault and
  // focus the anchor button that opened the menu (WAI-ARIA dialog convention).
  const restoreAnchorFocus = (event: Event) => {
    event.preventDefault();
    if (anchor !== null && anchor.isConnected) anchor.focus();
  };

  const virtualRef = useMemo<RefObject<{ getBoundingClientRect(): DOMRect } | null>>(
    () => ({
      current:
        anchor === null ? null : { getBoundingClientRect: () => anchor.getBoundingClientRect() },
    }),
    [anchor],
  );

  if (!isDesktop) {
    return (
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        title={title}
        description={description}
        onCloseAutoFocus={restoreAnchorFocus}
      >
        {children}
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor virtualRef={virtualRef} />
      <PopoverContent align={align} sideOffset={8} onCloseAutoFocus={restoreAnchorFocus}>
        {children}
      </PopoverContent>
    </Popover>
  );
}
