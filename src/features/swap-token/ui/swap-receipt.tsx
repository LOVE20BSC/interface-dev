import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy } from '@/shared/ui/icons';
import { NETWORK } from '@/config/networks';
import { copy } from '@/shared/config/copy';
import { copyText } from '@/shared/lib/clipboard';
import { UNKNOWN } from '@/shared/lib/format';
import { useMediaQuery } from '@/shared/lib/use-media-query';
import { Button, buttonStyles } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Sheet } from '@/shared/ui/sheet';
import { formatTokenAmount } from '@/features/swap-token/lib/swap-amount';
import type { SwapRecord } from '@/features/swap-token/lib/swap-receipt-record';

export interface SwapReceiptProps {
  readonly record: SwapRecord;
  readonly onSwapAgain: () => void;
}

function amountLine(amount: bigint | undefined, decimals: number | undefined, symbol: string) {
  if (amount === undefined || decimals === undefined) return UNKNOWN;
  return `${formatTokenAmount(amount, decimals)} ${symbol}`;
}

function ReceiptBody({ record, onSwapAgain }: SwapReceiptProps) {
  const [copied, setCopied] = useState(false);
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

      <dl className="space-y-2.5 rounded-2xl border border-line bg-slate-50/70 p-3 text-sm">
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
          {minKnown ? (
            <p className={belowMinOut ? 'font-medium text-danger' : 'text-success'}>
              {belowMinOut ? copy.swap.receipt.minFailed : copy.swap.receipt.minOk}
            </p>
          ) : (
            <p className="text-muted">{copy.swap.receipt.actualUnknown}</p>
          )}
        </div>
        {paidText !== undefined ? (
          <div className="flex items-start justify-between gap-3">
            <dt className="shrink-0 text-muted">{copy.swap.receipt.paidLabel}</dt>
            <dd className="text-right font-medium text-foreground">{paidText}</dd>
          </div>
        ) : null}
        <div className="flex items-start justify-between gap-3">
          <dt className="shrink-0 text-muted">{copy.swap.receipt.hashLabel}</dt>
          <dd className="min-w-0 text-right">
            <span
              className="break-all font-mono text-[11px] leading-5 text-foreground"
              data-testid="swap-receipt-hash"
            >
              {record.hash}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="ml-1 h-7 px-1.5 text-xs"
              leadingIcon={<Copy className="h-3 w-3" aria-hidden="true" />}
              aria-label={copy.swap.receipt.copyHash}
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
                {copy.swap.receipt.explorer}
              </a>
            ) : null}
          </dd>
        </div>
      </dl>

      <div className="flex flex-col gap-2">
        <Link to="/" className={buttonStyles('primary', 'lg', 'w-full')}>
          {copy.swap.receipt.goHome}
        </Link>
        <Button variant="secondary" size="md" className="w-full" onClick={onSwapAgain}>
          {copy.swap.receipt.swapAgain}
        </Button>
      </div>
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
      onOpenChange={() => {
        // Receipt is the page state; leaving happens through its two actions.
      }}
      title={copy.swap.receipt.title}
      dismissible={false}
    >
      <ReceiptBody {...props} />
    </Sheet>
  );
}
