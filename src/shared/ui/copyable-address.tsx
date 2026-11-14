import { useEffect, useRef, useState } from 'react';
import { copy } from '@/shared/config/copy';
import { cn } from '@/shared/lib/cn';
import { copyText } from '@/shared/lib/clipboard';
import { shortenAddress } from '@/shared/lib/format';
import { Check, Copy } from '@/shared/ui/icons';

export type AddressCopyStatus = 'idle' | 'copied' | 'failed';

/** How long the 已复制 / 复制失败 feedback stays on screen. */
export const ADDRESS_COPY_FEEDBACK_MS = 2000;

export interface CopyableAddressProps {
  /** Full address; this exact string is copied and exposed as `title`. */
  readonly address: string;
  /** Human label for the aria-label: `复制地址：{label}`. */
  readonly label: string;
  /** `'short'` abbreviates (default 0x7099…79C8); `'full'` shows every character. */
  readonly display?: 'short' | 'full';
  /** Truncation width in `'short'` mode (hex digits kept before/after the ellipsis). */
  readonly front?: number;
  readonly back?: number;
  readonly testId?: string;
  readonly className?: string;
}

/**
 * 全局地址组件 (owner 2026-11-14 09:30: 「所有出现的合约地址、钱包地址，都应该支持
 * 点击复制」). One contract for every address in the app: the address itself is
 * the button, tapping copies it, an aria-live line confirms 已复制, and a failed
 * clipboard (http / old webviews where both navigator.clipboard and
 * execCommand fall over) says so instead of going silently dead.
 *
 * The full address always stays in `title`, so the abbreviated text is never
 * the only way to read what will be copied.
 */
export function CopyableAddress({
  address,
  label,
  display = 'short',
  front = 4,
  back = 4,
  testId,
  className,
}: CopyableAddressProps) {
  const [status, setStatus] = useState<AddressCopyStatus>('idle');
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (timer.current !== undefined) window.clearTimeout(timer.current);
    };
  }, []);

  const onCopy = () => {
    void copyText(address).then((ok) => {
      setStatus(ok ? 'copied' : 'failed');
      if (timer.current !== undefined) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setStatus('idle'), ADDRESS_COPY_FEEDBACK_MS);
    });
  };

  const text = display === 'full' ? address : shortenAddress(address, front, back);

  return (
    <button
      type="button"
      data-testid={testId}
      title={address}
      onClick={onCopy}
      aria-label={
        status === 'copied' ? copy.address.copiedAria(label) : copy.address.copyAria(label)
      }
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-lg text-left text-muted',
        'hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        className,
      )}
    >
      <span
        className={cn(
          'font-mono text-[11px] leading-5',
          display === 'full' ? 'break-all' : 'shrink-0',
        )}
      >
        {text}
      </span>
      <span className="flex shrink-0 items-center gap-0.5 text-[10px]" aria-live="polite">
        {status === 'copied' ? (
          <Check className="h-3 w-3 text-success" aria-hidden="true" />
        ) : (
          <Copy className="h-3 w-3" aria-hidden="true" />
        )}
        {status === 'copied' ? (
          <span className="text-success">{copy.address.copied}</span>
        ) : status === 'failed' ? (
          <span className="text-danger-strong">{copy.address.copyFailed}</span>
        ) : null}
      </span>
    </button>
  );
}
