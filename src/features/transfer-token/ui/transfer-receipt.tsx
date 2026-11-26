import { Check } from '@/shared/ui/icons';
import { copy } from '@/shared/config/copy-pages';
import { useMediaQuery } from '@/shared/lib/use-media-query';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { CopyableAddress } from '@/shared/ui/copyable-address';
import { Sheet } from '@/shared/ui/sheet';
import { TxHashRow } from '@/shared/ui/tx-hash-row';
import {
  transferAmountText,
  type TransferRecord,
} from '@/features/transfer-token/lib/transfer-receipt';

export interface TransferReceiptProps {
  readonly record: TransferRecord;
  readonly onDismiss: () => void;
}

function ReceiptBody({ record, onDismiss }: TransferReceiptProps) {
  const amountText = transferAmountText(record.amount, record.tokenDecimals, record.tokenSymbol);

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
              testId="transfer-receipt-recipient"
              className="text-foreground"
            />
          </dd>
        </div>
        <TxHashRow hash={record.hash} testId="transfer-receipt-hash" />
      </dl>

      {/* Owner 2026-11-16: one button only —「好的」closes the receipt and stays
          here. */}
      <Button variant="primary" size="lg" className="w-full" onClick={onDismiss}>
        {copy.receiptDismiss.dismiss}
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
