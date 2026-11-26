import { AlertTriangle, Check } from '@/shared/ui/icons';
import { copy } from '@/shared/config/copy-pages';
import { cn } from '@/shared/lib/cn';
import { formatVisibleTokenAmount } from '@/shared/lib/format-tiny';
import { useMediaQuery } from '@/shared/lib/use-media-query';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { CopyableAddress } from '@/shared/ui/copyable-address';
import { Sheet } from '@/shared/ui/sheet';
import { TxHashRow } from '@/shared/ui/tx-hash-row';
import { summarizeBatchAudit, type BatchAuditRow } from '@/features/batch-transfer/lib/batch-audit';
import type { BatchReceiptRecord } from '@/features/batch-transfer/lib/batch-receipt';

export interface BatchReceiptProps {
  readonly record: BatchReceiptRecord;
  readonly onDismiss: () => void;
}

function deltaText(row: BatchAuditRow, decimals: number): string {
  if (row.delta === undefined) return copy.batchTransfer.deltaUnknown;
  if (row.status === 'unchanged') return copy.batchTransfer.deltaUnchanged;
  // D3: a non-zero delta below the 6-digit display rule renders `< 0.000001`,
  // never `+0` — the chain did move that money.
  const amount = formatVisibleTokenAmount(row.delta, decimals);
  if (row.status === 'anomaly') return copy.batchTransfer.deltaAnomaly(amount);
  return amount.startsWith('<') ? amount : copy.batchTransfer.deltaPlus(amount);
}

function deltaClass(row: BatchAuditRow): string {
  switch (row.status) {
    case 'matched':
      return 'text-success';
    case 'unchanged':
      return 'text-muted';
    case 'anomaly':
      return 'font-semibold text-danger-strong';
    default:
      return 'text-muted';
  }
}

function ReceiptRow({
  row,
  index,
  decimals,
  symbol,
}: {
  readonly row: BatchAuditRow;
  readonly index: number;
  readonly decimals: number;
  readonly symbol: string;
}) {
  return (
    <li
      data-testid={`batch-transfer-receipt-row-${index}`}
      className="flex items-center justify-between gap-3 py-2 text-xs"
    >
      <span className="min-w-0">
        <CopyableAddress
          address={row.address}
          label={copy.batchTransfer.preBalanceHeaderRecipient}
          front={6}
          back={4}
          className="text-foreground"
        />
        <span
          className="block font-mono text-[10px] text-muted"
          data-testid={`batch-transfer-receipt-amount-${index}`}
        >
          {`${formatVisibleTokenAmount(row.amount, decimals)} ${symbol}`}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span
          className={`block font-mono text-[12px] ${deltaClass(row)}`}
          data-testid={`batch-transfer-receipt-delta-${index}`}
        >
          {deltaText(row, decimals)}
        </span>
        <span className="block text-[10px] text-muted">
          {`${formatVisibleTokenAmount(row.before, decimals)} → ${formatVisibleTokenAmount(row.after, decimals)}`}
        </span>
      </span>
    </li>
  );
}

function ReceiptBody({ record, onDismiss }: BatchReceiptProps) {
  // D1: the conclusion is derived from the audit, never a static success claim.
  const audit = summarizeBatchAudit(record.rows);
  const verified = audit.outcome === 'verified';
  const conclusion =
    audit.outcome === 'unverified'
      ? copy.batchTransfer.receiptUnverified(String(audit.unknownRows))
      : audit.outcome === 'anomaly'
        ? copy.batchTransfer.receiptMismatch(String(audit.mismatchRows))
        : copy.batchTransfer.atomicReceipt;

  return (
    <div className="space-y-4">
      <div className="text-center">
        <span
          className={cn(
            'mx-auto inline-flex h-10 w-10 items-center justify-center rounded-full',
            verified ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning',
          )}
          data-testid="batch-transfer-receipt-status-icon"
          data-status={audit.outcome}
        >
          {verified ? (
            <Check className="h-5 w-5" aria-hidden="true" />
          ) : (
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          )}
        </span>
        <p className="mt-2 text-sm text-muted">{copy.batchTransfer.receiptTotal}</p>
        <p
          className="mt-0.5 break-words text-2xl font-semibold tracking-tight text-foreground"
          data-testid="batch-transfer-receipt-total"
        >
          {`${formatVisibleTokenAmount(record.total, record.decimals)} ${record.symbol}`}
        </p>
        <p className="mt-1 text-xs text-muted" data-testid="batch-transfer-receipt-count">
          {copy.batchTransfer.receiptRecipientCount(String(record.rows.length))}
        </p>
      </div>

      <div className="rounded-2xl border border-line bg-elevated p-3">
        <p className="text-xs font-medium text-muted">{copy.batchTransfer.receiptRowsNote}</p>
        <ul className="mt-1 divide-y divide-line" data-testid="batch-transfer-receipt-rows">
          {record.rows.map((row, index) => (
            <ReceiptRow
              key={row.address}
              row={row}
              index={index}
              decimals={record.decimals}
              symbol={record.symbol}
            />
          ))}
        </ul>
        <p
          className={cn(
            'mt-2 text-[11px] leading-4',
            verified ? 'text-muted' : 'font-medium text-warning',
          )}
          data-testid="batch-transfer-receipt-atomic"
          data-status={audit.outcome}
        >
          {conclusion}
        </p>
        {record.mode === 'token' &&
        record.residualAllowance !== undefined &&
        record.residualAllowance > 0n ? (
          <p
            className="mt-1.5 text-[11px] leading-4 text-warning"
            data-testid="batch-transfer-receipt-residual-allowance"
          >
            {copy.batchTransfer.receiptResidualAllowance(
              formatVisibleTokenAmount(record.residualAllowance, record.decimals),
              record.symbol,
            )}
          </p>
        ) : null}
      </div>

      <dl className="space-y-2.5 rounded-2xl border border-line bg-elevated p-3 text-sm">
        <TxHashRow hash={record.hash} testId="batch-transfer-receipt-hash" />
      </dl>

      {/* Owner 2026-11-16: one button only —「好的」closes the receipt and stays
          here; the batch page owns the success strip below. */}
      <Button variant="primary" size="lg" className="w-full" onClick={onDismiss}>
        {copy.receiptDismiss.dismiss}
      </Button>
    </div>
  );
}

/**
 * Success receipt is a page state (UX spec §4.3): a bottom sheet on phones, the
 * same content in the page flow at md+. Closing it collapses to the success strip
 * so the page never jumps away. Every row's 差额 comes from a post-mined balance
 * re-read; a row that did not receive its exact amount is highlighted.
 */
export function BatchReceipt(props: BatchReceiptProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)');

  if (isDesktop) {
    return (
      <Card>
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          {copy.batchTransfer.receiptTitle}
        </h2>
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
      title={copy.batchTransfer.receiptTitle}
    >
      <ReceiptBody {...props} />
    </Sheet>
  );
}
