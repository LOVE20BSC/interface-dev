import { Check } from '@/shared/ui/icons';
import { copy } from '@/shared/config/copy-pages';
import { formatTokenAmount, UNKNOWN } from '@/shared/lib/format';
import { useMediaQuery } from '@/shared/lib/use-media-query';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Sheet } from '@/shared/ui/sheet';
import { TxHashRow } from '@/shared/ui/tx-hash-row';
import type { SwapRecord } from '@/features/swap-token/lib/swap-receipt-record';

export interface SwapReceiptProps {
  readonly record: SwapRecord;
  readonly onDismiss: () => void;
}

function amountLine(amount: bigint | undefined, decimals: number | undefined, symbol: string) {
  if (amount === undefined || decimals === undefined) return UNKNOWN;
  return `${formatTokenAmount(amount, decimals)} ${symbol}`;
}

function ReceiptBody({ record, onDismiss }: SwapReceiptProps) {
  const actualText = amountLine(record.actualOut, record.toDecimals, record.toSymbol);
  const minText =
    record.minOut !== undefined && record.toDecimals !== undefined
      ? `${formatTokenAmount(record.minOut, record.toDecimals)} ${record.toSymbol}`
      : UNKNOWN;
  const paidText =
    record.paidIn !== undefined && record.fromDecimals !== undefined
      ? `${formatTokenAmount(record.paidIn, record.fromDecimals)} ${record.fromSymbol}`
      : undefined;
  const pathText = record.pathSymbols.length > 0 ? record.pathSymbols.join(' → ') : UNKNOWN;
  const minKnown =
    record.actualOut !== undefined &&
    record.minOut !== undefined &&
    record.toDecimals !== undefined;
  const belowMinOut = record.belowMinOut;

  return (
    <div className="space-y-4">
      <div className="text-center">
        <span className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-success-soft text-success">
          <Check className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="mt-2 text-sm text-muted">{copy.swap.receipt.received}</p>
        <p
          className="mt-0.5 break-words text-2xl font-semibold tracking-tight text-foreground"
          data-testid="swap-receipt-amount"
        >
          {actualText}
        </p>
        <p className="mt-1 text-xs leading-5 text-muted">
          {record.actualOut === undefined
            ? copy.swap.receipt.actualUnknown
            : copy.swap.receipt.actualNote}
        </p>
      </div>

      <dl className="space-y-2.5 rounded-2xl border border-line bg-elevated p-3 text-sm">
        <div className="flex items-start justify-between gap-3">
          <dt className="shrink-0 text-muted">{copy.swap.receipt.pathLabel}</dt>
          <dd
            className="min-w-0 break-words text-right font-mono text-[11px] leading-5 text-foreground"
            data-testid="swap-receipt-path"
          >
            {pathText}
          </dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="shrink-0 text-muted">{copy.swap.receipt.minLabel}</dt>
          <dd className="text-right font-medium text-foreground" data-testid="swap-receipt-min">
            {minText}
          </dd>
        </div>
        <div
          className="text-xs leading-5"
          data-testid="swap-receipt-min-check"
          role={belowMinOut ? 'alert' : undefined}
        >
          {belowMinOut ? (
            <p className="font-medium text-danger-strong">{copy.swap.receipt.minFailed}</p>
          ) : !minKnown ? (
            <p className="text-muted">{copy.swap.receipt.actualUnknown}</p>
          ) : null}
        </div>
        {paidText !== undefined ? (
          <div className="flex items-start justify-between gap-3">
            <dt className="shrink-0 text-muted">{copy.swap.receipt.paidLabel}</dt>
            <dd className="text-right font-medium text-foreground">{paidText}</dd>
          </div>
        ) : null}
        <TxHashRow hash={record.hash} testId="swap-receipt-hash" />
      </dl>

      {/* Owner 2026-11-16: one button only —「好的」closes the receipt and stays
          here. Navigation is the bottom tab bar + page header, never a receipt
          link. */}
      <Button variant="primary" size="lg" className="w-full" onClick={onDismiss}>
        {copy.receiptDismiss.dismiss}
      </Button>
    </div>
  );
}

/**
 * Success receipt is a page state (UX spec §4.3), never a toast. On phones it is
 * a bottom sheet, at md+ the same content in the page flow, same order. The
 * amount is the actual output parsed from the receipt, not the quote.
 */
export function SwapReceipt(props: SwapReceiptProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)');

  if (isDesktop) {
    return (
      <Card>
        <h2 className="mb-4 text-lg font-semibold text-foreground">{copy.swap.receipt.title}</h2>
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
      title={copy.swap.receipt.title}
    >
      <ReceiptBody {...props} />
    </Sheet>
  );
}
