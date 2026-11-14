import { useState } from 'react';
import { Check, Copy } from '@/shared/ui/icons';
import { NETWORK } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { copyText } from '@/shared/lib/clipboard';
import { useMediaQuery } from '@/shared/lib/use-media-query';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { CopyableAddress } from '@/shared/ui/copyable-address';
import { Sheet } from '@/shared/ui/sheet';
import {
  transferAmountText,
  type TransferRecord,
} from '@/features/transfer-token/lib/transfer-receipt';

export interface TransferReceiptProps {
  readonly record: TransferRecord;
  readonly onDismiss: () => void;
}

function ReceiptBody({ record, onDismiss }: TransferReceiptProps) {
  const [copied, setCopied] = useState(false);
  const amountText = transferAmountText(record.amount, record.tokenDecimals, record.tokenSymbol);
  const explorerUrl =
    NETWORK.blockExplorerUrl !== null ? `${NETWORK.blockExplorerUrl}/tx/${record.hash}` : null;

  const handleCopy = async () => {
    const ok = await copyText(record.hash);
    setCopied(ok);
    if (ok) window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="text-center">
        <span className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-success-soft text-success">
          <Check className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="mt-2 text-sm text-muted">{copy.transfer.receiptSent}</p>
        <p
          className="mt-0.5 break-words text-2xl font-semibold tracking-tight text-foreground"
          data-testid="transfer-receipt-amount"
        >
          {amountText}
        </p>
      </div>

      <dl className="space-y-2.5 rounded-2xl border border-line bg-elevated p-3 text-sm">
        <div className="flex items-start justify-between gap-3">
          <dt className="shrink-0 text-muted">{copy.transfer.receiptTo}</dt>
          <dd className="min-w-0 text-right">
            {record.recipientLabel !== undefined ? (
              <span
                className="block text-xs leading-5 text-muted"
                data-testid="transfer-receipt-label"
              >
                {record.recipientLabel}
              </span>
            ) : null}
            <CopyableAddress
              address={record.recipient}
              label={copy.transfer.receiptTo}
              display="full"
              testId="transfer-receipt-recipient"
              className="text-foreground"
            />
          </dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="shrink-0 text-muted">{copy.transfer.receiptHash}</dt>
          <dd className="min-w-0 text-right">
            <span
              className="break-all font-mono text-[11px] leading-5 text-foreground"
              data-testid="transfer-receipt-hash"
            >
              {record.hash}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="ml-1 h-7 px-1.5 text-xs"
              leadingIcon={<Copy className="h-3 w-3" aria-hidden="true" />}
              aria-label={copy.transfer.copyHash}
              onClick={() => {
                void handleCopy();
              }}
            >
              {copied ? copy.common.copied : copy.common.copy}
            </Button>
            {explorerUrl !== null ? (
              <a
                href={explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block text-xs text-brand-strong underline-offset-4 hover:underline"
              >
                {copy.transfer.explorer}
              </a>
            ) : null}
          </dd>
        </div>
      </dl>

      {/* Owner 2026-11-14: one button only — close the receipt and stay here. */}
      <Button variant="primary" size="lg" className="w-full" onClick={onDismiss}>
        {copy.receiptDismiss.stayHere}
      </Button>
    </div>
  );
}

/**
 * Success receipt is a page state (UX spec §4.3), never a toast. On phones it is
 * a bottom sheet, at md+ the same content in the page flow. Closing it collapses
 * to the success strip in the panel, so the page never jumps away or loses the
 * transfer it just made.
 */
export function TransferReceipt(props: TransferReceiptProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)');

  if (isDesktop) {
    return (
      <Card>
        <h2 className="mb-4 text-lg font-semibold text-foreground">{copy.transfer.receiptTitle}</h2>
        <ReceiptBody {...props} />
      </Card>
    );
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) props.onDismiss();
      }}
      title={copy.transfer.receiptTitle}
    >
      <ReceiptBody {...props} />
    </Sheet>
  );
}
