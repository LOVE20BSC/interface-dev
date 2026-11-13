import { useState } from 'react';
import { Check, Copy } from '@/shared/ui/icons';
import { NETWORK } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { copyText } from '@/shared/lib/clipboard';
import { Button } from '@/shared/ui/button';
import { Sheet } from '@/shared/ui/sheet';
import type { LiquidityReceipt } from '@/features/liquidity-pool/model/use-liquidity-transaction';

export interface LiquidityReceiptSheetProps {
  readonly record: LiquidityReceipt | null;
  readonly onDismiss: () => void;
  readonly onAgain: () => void;
}

/**
 * 可关闭的回执：留在原页，关闭后已提交状态不丢（按钮恢复、池子数据已刷新）。
 * 回执只显示这笔交易实际提交的内容与哈希，不重复展示报价。
 */
export function LiquidityReceiptSheet({ record, onDismiss, onAgain }: LiquidityReceiptSheetProps) {
  const [copied, setCopied] = useState(false);
  if (record === null) return null;
  const explorerUrl =
    NETWORK.blockExplorerUrl !== null ? `${NETWORK.blockExplorerUrl}/tx/${record.hash}` : null;

  const handleCopy = async () => {
    const ok = await copyText(record.hash);
    setCopied(ok);
    if (ok) window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Sheet open onOpenChange={(next) => (next ? undefined : onDismiss())} title={record.title}>
      <div className="space-y-4">
        <div className="text-center">
          <span className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-success-soft text-success">
            <Check className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="mt-2 text-base font-medium text-foreground" data-testid="liquidity-receipt-title">
            {record.title}
          </p>
          {record.detail !== undefined ? (
            <p
              className="mt-1 break-words text-sm leading-6 text-muted"
              data-testid="liquidity-receipt-detail"
            >
              {record.detail}
            </p>
          ) : null}
        </div>
        <dl className="space-y-2.5 rounded-2xl border border-line bg-elevated p-3 text-sm">
          <div className="flex items-start justify-between gap-3">
            <dt className="shrink-0 text-muted">{copy.liquidity.receipt.hash}</dt>
            <dd className="min-w-0 text-right">
              <span
                className="break-all font-mono text-[11px] leading-5 text-foreground"
                data-testid="liquidity-receipt-hash"
              >
                {record.hash}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="ml-1"
                onClick={() => {
                  void handleCopy();
                }}
                leadingIcon={<Copy className="h-3.5 w-3.5" aria-hidden="true" />}
              >
                {copied ? copy.common.copied : copy.liquidity.receipt.copyHash}
              </Button>
            </dd>
          </div>
        </dl>
        <p className="text-xs leading-5 text-muted">{copy.liquidity.receipt.pendingNote}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="primary" size="md" className="w-full sm:flex-1" onClick={onDismiss}>
            {copy.liquidity.receipt.stayHere}
          </Button>
          <Button variant="secondary" size="md" className="w-full sm:flex-1" onClick={onAgain}>
            {copy.receiptDismiss.swapStripAgain}
          </Button>
        </div>
        {explorerUrl !== null ? (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="block text-center text-xs font-medium text-brand-strong underline-offset-4 hover:underline"
          >
            {copy.liquidity.receipt.explorer}
          </a>
        ) : null}
      </div>
    </Sheet>
  );
}
