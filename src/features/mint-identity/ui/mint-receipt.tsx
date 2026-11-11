import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy } from '@/shared/ui/icons';
import { NETWORK } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { copyText } from '@/shared/lib/clipboard';
import { formatTokenAmount, UNKNOWN } from '@/shared/lib/format';
import { useMediaQuery } from '@/shared/lib/use-media-query';
import { Button, buttonStyles } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Sheet } from '@/shared/ui/sheet';
import type { MintedIdentity } from '@/features/mint-identity/model/use-mint-transaction';

export interface MintReceiptProps {
  readonly receipt: MintedIdentity;
  readonly paymentSymbol: string | undefined;
  readonly paymentDecimals: number | undefined;
  readonly onMintAnother: () => void;
}

function ReceiptBody({ receipt, paymentSymbol, paymentDecimals, onMintAnother }: MintReceiptProps) {
  const [copied, setCopied] = useState(false);

  const explorerUrl =
    NETWORK.blockExplorerUrl !== null ? `${NETWORK.blockExplorerUrl}/tx/${receipt.hash}` : null;
  const burned =
    paymentDecimals !== undefined && paymentSymbol !== undefined
      ? copy.mintIdentity.receipt.value(
          formatTokenAmount(receipt.cost, paymentDecimals),
          paymentSymbol,
        )
      : UNKNOWN;

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
        <p
          className="mt-2 text-2xl font-semibold tracking-tight text-foreground"
          data-testid="mint-receipt-member-id"
        >
          {copy.mintIdentity.receipt.memberId(receipt.memberId.toString())}
        </p>
        <p
          className="mt-1 break-all text-base font-medium text-foreground"
          data-testid="mint-receipt-name"
        >
          {receipt.name}
        </p>
      </div>

      <dl className="space-y-2.5 rounded-2xl border border-line bg-slate-50/70 p-3 text-sm">
        <div className="flex items-start justify-between gap-3">
          <dt className="shrink-0 text-muted">{copy.mintIdentity.receipt.burnedLabel}</dt>
          <dd className="text-right font-medium text-foreground" data-testid="mint-receipt-burned">
            {burned}
          </dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="shrink-0 text-muted">{copy.mintIdentity.receipt.hashLabel}</dt>
          <dd className="min-w-0 text-right">
            <span
              className="break-all font-mono text-[11px] leading-5 text-foreground"
              data-testid="mint-receipt-hash"
            >
              {receipt.hash}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="ml-1 h-7 px-1.5 text-xs"
              leadingIcon={<Copy className="h-3 w-3" aria-hidden="true" />}
              aria-label={copy.mintIdentity.receipt.copyHash}
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
                {copy.mintIdentity.receipt.explorerLink}
              </a>
            ) : null}
          </dd>
        </div>
      </dl>

      <p className="text-xs leading-5 text-muted">{copy.mintIdentity.receipt.notSelected}</p>

      <div className="flex flex-col gap-2">
        <Link to="/my-nft" className={buttonStyles('primary', 'lg', 'w-full')}>
          {copy.mintIdentity.receipt.goMyNft}
        </Link>
        <Link to="/" className={buttonStyles('secondary', 'md', 'w-full')}>
          {copy.mintIdentity.receipt.backHome}
        </Link>
        <Button variant="ghost" size="sm" onClick={onMintAnother}>
          {copy.mintIdentity.receipt.mintAnother}
        </Button>
      </div>
    </div>
  );
}

/**
 * Success receipt is a page state (UX spec §4.3), never a toast + redirect.
 * On phones it is presented as a bottom sheet so the primary "去我的 NFT" stays
 * thumb-reachable; md+ shows the same content in the page flow, same order.
 */
export function MintReceipt(props: MintReceiptProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)');

  if (isDesktop) {
    return (
      <Card>
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          {copy.mintIdentity.receipt.title}
        </h2>
        <ReceiptBody {...props} />
      </Card>
    );
  }

  return (
    <Sheet open onOpenChange={() => {}} title={copy.mintIdentity.receipt.title} dismissible={false}>
      <ReceiptBody {...props} />
    </Sheet>
  );
}
