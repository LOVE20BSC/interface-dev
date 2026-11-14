import { useState } from 'react';
import { Check, Copy } from '@/shared/ui/icons';
import { NETWORK } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { copyText } from '@/shared/lib/clipboard';
import { formatTokenAmount, shortenAddress } from '@/shared/lib/format';
import { useMediaQuery } from '@/shared/lib/use-media-query';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Sheet } from '@/shared/ui/sheet';
import type { BatchAuditRow } from '@/features/batch-transfer/lib/batch-audit';
import type { BatchReceiptRecord } from '@/features/batch-transfer/lib/batch-receipt';

export interface BatchReceiptProps {
  readonly record: BatchReceiptRecord;
  readonly onDismiss: () => void;
}

function deltaText(row: BatchAuditRow, decimals: number): string {
  if (row.delta === undefined) return copy.batchTransfer.deltaUnknown;
  if (row.status === 'unchanged') return copy.batchTransfer.deltaUnchanged;
  const amount = formatTokenAmount(row.delta, decimals);
  if (row.status === 'anomaly') return copy.batchTransfer.deltaAnomaly(amount);
  return copy.batchTransfer.deltaPlus(amount);
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
        <span className="block truncate font-mono text-[11px] text-foreground" title={row.address}>
          {shortenAddress(row.address, 6, 4)}
        </span>
        <span
          className="block font-mono text-[10px] text-muted"
          data-testid={`batch-transfer-receipt-amount-${index}`}
        >
          {`${formatTokenAmount(row.amount, decimals)} ${symbol}`}
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
          {`${formatTokenAmount(row.before, decimals)} → ${formatTokenAmount(row.after, decimals)}`}
        </span>
      </span>
    </li>
  );
}

function ReceiptBody({ record, onDismiss }: BatchReceiptProps) {
  const [copied, setCopied] = useState(false);
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
        <p className="mt-2 text-sm text-muted">{copy.batchTransfer.receiptTotal}</p>
        <p
          className="mt-0.5 break-words text-2xl font-semibold tracking-tight text-foreground"
          data-testid="batch-transfer-receipt-total"
        >
          {`${formatTokenAmount(record.total, record.decimals)} ${record.symbol}`}
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
        <p className="mt-2 text-[11px] leading-4 text-muted" data-testid="batch-transfer-receipt-atomic">
          {copy.batchTransfer.atomicReceipt}
        </p>
      </div>

      <dl className="space-y-2.5 rounded-2xl border border-line bg-elevated p-3 text-sm">
        <div className="flex items-start justify-between gap-3">
          <dt className="shrink-0 text-muted">{copy.batchTransfer.receiptHash}</dt>
          <dd className="min-w-0 text-right">
            <span
              className="break-all font-mono text-[11px] leading-5 text-foreground"
              data-testid="batch-transfer-receipt-hash"
            >
              {record.hash}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="ml-1 h-7 px-1.5 text-xs"
              leadingIcon={<Copy className="h-3 w-3" aria-hidden="true" />}
              aria-label={copy.batchTransfer.copyHash}
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
                {copy.batchTransfer.explorer}
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
