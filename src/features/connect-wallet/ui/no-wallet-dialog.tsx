import { Check, Copy, Wallet } from '@/shared/ui/icons';
import { useState } from 'react';
import { copy } from '@/shared/config/copy';
import { copyText } from '@/shared/lib/clipboard';
import { Button } from '@/shared/ui/button';
import { Sheet } from '@/shared/ui/sheet';

export interface NoWalletDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/**
 * The fallback state for users inside an in-app browser (WeChat/Telegram/etc.)
 * or a desktop browser without an injected wallet. It offers a next step instead
 * of leaving a disabled "检测钱包中…" button on screen.
 */
export function NoWalletDialog({ open, onOpenChange }: NoWalletDialogProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const ok = await copyText(window.location.href);
    setCopied(ok);
    if (ok) {
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={copy.wallet.noWalletTitle}
      description={copy.wallet.noWalletBody}
    >
      <div className="flex items-start gap-3 rounded-2xl bg-elevated p-4">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-strong">
          <Wallet className="h-4 w-4" aria-hidden="true" />
        </span>
        <ol className="list-decimal space-y-2 pl-4 text-sm leading-6 text-foreground">
          <li>{copy.wallet.noWalletStepInApp}</li>
          <li>{copy.wallet.noWalletStepInstall}</li>
        </ol>
      </div>
      <div className="mt-4 flex flex-col gap-2">
        <Button
          variant="secondary"
          leadingIcon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          onClick={() => {
            void handleCopy();
          }}
        >
          {copied ? copy.common.copied : copy.wallet.noWalletCopyLink}
        </Button>
        <Button variant="primary" onClick={() => onOpenChange(false)}>
          {copy.wallet.noWalletDismiss}
        </Button>
      </div>
    </Sheet>
  );
}
