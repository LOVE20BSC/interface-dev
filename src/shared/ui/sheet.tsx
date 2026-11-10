import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from '@/shared/ui/icons';
import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { copy } from '@/shared/config/copy';

export interface SheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
  /** Build-version mismatch and other blocking states set this to false. */
  readonly dismissible?: boolean;
  readonly className?: string;
}

/**
 * Responsive Radix Dialog: bottom sheet under md, centered dialog above.
 * One implementation for both so the wallet/community menus share exactly the
 * same content on mobile and desktop.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  dismissible = true,
  className,
}: SheetProps) {
  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && !dismissible) return;
        onOpenChange(next);
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="l20-overlay fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          className={cn(
            'l20-sheet fixed inset-x-0 bottom-0 z-50 max-h-[82dvh] overflow-y-auto rounded-t-3xl border border-line bg-surface px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl focus:outline-none',
            'md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:max-h-[80vh] md:w-[28rem] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl md:p-6',
            className,
          )}
          onEscapeKeyDown={(event) => {
            if (!dismissible) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (!dismissible) event.preventDefault();
          }}
        >
          <div
            className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200 md:hidden"
            aria-hidden="true"
          />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-base font-semibold text-foreground">
                {title}
              </DialogPrimitive.Title>
              {description !== undefined ? (
                <DialogPrimitive.Description className="mt-1 text-sm leading-6 text-muted">
                  {description}
                </DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">
                  {title}
                </DialogPrimitive.Description>
              )}
            </div>
            {dismissible ? (
              <DialogPrimitive.Close
                aria-label={copy.common.close}
                className="-mr-1 -mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-slate-100"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </DialogPrimitive.Close>
            ) : null}
          </div>
          <div className="mt-4">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export const SheetClose = DialogPrimitive.Close;
export const SheetTrigger = DialogPrimitive.Trigger;
