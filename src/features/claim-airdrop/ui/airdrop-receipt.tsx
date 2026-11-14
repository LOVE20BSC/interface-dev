import { useState } from 'react';
import { Check, Copy } from '@/shared/ui/icons';
import { NETWORK } from '@/config/networks';
import { formatSharePercent } from '@/domain/airdrop-share';
import { copy } from '@/shared/config/copy-pages';
import { copyText } from '@/shared/lib/clipboard';
import { formatDateTime, formatTokenAmount, UNKNOWN } from '@/shared/lib/format';
import { useMediaQuery } from '@/shared/lib/use-media-query';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Sheet } from '@/shared/ui/sheet';
import type { AirdropClaimReceipt } from '@/features/claim-airdrop/lib/airdrop-claim-record';

export interface AirdropReceiptProps {
  readonly receipt: AirdropClaimReceipt;
  readonly totalShare: bigint | undefined;
  readonly onDismiss: () => void;
}

function ReceiptBody({ receipt, totalShare, onDismiss }: AirdropReceiptProps) {
  const [copied, setCopied] = useState(false);

  const amountKnown =
    receipt.amount !== undefined &&
    receipt.tokenDecimals !== undefined &&
    receipt.tokenDecimals >= 0;
  const amountText = amountKnown
    ? formatTokenAmount(receipt.amount, receipt.tokenDecimals)
    : UNKNOWN;
  const symbolText = receipt.tokenSymbol;
  const amountLine =
    amountKnown && symbolText !== undefined ? `${amountText} ${symbolText}` : amountText;

  const totalShareForPercent = receipt.totalShare ?? totalShare;
  const sharePercent =
    receipt.share !== undefined && totalShareForPercent !== undefined
      ? formatSharePercent(receipt.share, totalShareForPercent)
      : null;
  const remainingPercent =
    receipt.remainingShare !== undefined && totalShareForPercent !== undefined
      ? formatSharePercent(receipt.remainingShare, totalShareForPercent)
      : null;
  const recordedAt =
    receipt.recordedAt !== undefined ? formatDateTime(receipt.recordedAt) : undefined;

  const explorerUrl =
    NETWORK.blockExplorerUrl !== null ? `${NETWORK.blockExplorerUrl}/tx/${receipt.hash}` : null;

  const handleCopy = async () => {
    const ok = await copyText(receipt.hash);
    setCopied(ok);
    if (ok) window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="text-center">
        <span className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-success-soft text-success">
          <Check className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="mt-2 text-sm text-muted">{copy.airdrop.receipt.received}</p>
        <p
          className="mt-0.5 break-words text-2xl font-semibold tracking-tight text-foreground"
          data-testid="airdrop-receipt-amount"
        >
          {amountLine}
        </p>
        <p className="mt-1 text-xs leading-5 text-muted">
          {amountKnown ? copy.airdrop.receipt.amountNote : copy.airdrop.receipt.amountUnknown}
        </p>
      </div>

      <dl className="space-y-2.5 rounded-2xl border border-line bg-elevated p-3 text-sm">
        {sharePercent !== null ? (
          <div className="flex items-start justify-between gap-3">
            <dt className="shrink-0 text-muted">{copy.airdrop.receipt.shareLabel}</dt>
            <dd className="text-right font-medium text-foreground">{sharePercent}</dd>
          </div>
        ) : null}
        {remainingPercent !== null ? (
          <div className="flex items-start justify-between gap-3">
            <dt className="shrink-0 text-muted">{copy.airdrop.receipt.remainingLabel}</dt>
            <dd className="text-right font-medium text-foreground">{remainingPercent}</dd>
          </div>
        ) : null}
        {recordedAt !== undefined ? (
          <div className="flex items-start justify-between gap-3">
            <dt className="shrink-0 text-muted">{copy.airdrop.receipt.dateLabel}</dt>
            <dd className="text-right font-medium text-foreground">{recordedAt}</dd>
          </div>
        ) : null}
        <div className="flex items-start justify-between gap-3">
          <dt className="shrink-0 text-muted">{copy.airdrop.receipt.hashLabel}</dt>
          <dd className="min-w-0 text-right">
            <span
              className="break-all font-mono text-[11px] leading-5 text-foreground"
              data-testid="airdrop-receipt-hash"
            >
              {receipt.hash}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="ml-1 h-7 px-1.5 text-xs"
              leadingIcon={<Copy className="h-3 w-3" aria-hidden="true" />}
              aria-label={copy.airdrop.receipt.copyHash}
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
                {copy.airdrop.receipt.explorer}
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
 * Success receipt is a page state (UX spec §4.3), never a toast. The amount is
 * the AirdropClaimed.amount parsed from this transaction's receipt; on phones it
 * is a bottom sheet, md+ the same content in the page flow, same order.
 */
export function AirdropReceipt(props: AirdropReceiptProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)');

  if (isDesktop) {
    return (
      <Card>
        <h2 className="mb-4 text-lg font-semibold text-foreground">{copy.airdrop.receipt.title}</h2>
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
      title={copy.airdrop.receipt.title}
    >
      <ReceiptBody {...props} />
    </Sheet>
  );
}
