import { copy } from '@/shared/config/copy-pages';
import { formatVisibleTokenAmount } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { CopyableAddress } from '@/shared/ui/copyable-address';
import { RefreshCw } from '@/shared/ui/icons';
import { Skeleton } from '@/shared/ui/skeleton';
import type { BatchParsedRow } from '@/features/batch-transfer/lib/batch-parse';

export interface BatchEntryTableProps {
  readonly rows: readonly BatchParsedRow[];
  /** Aligned wei values from `nativeBalances` / `erc20Balances`. */
  readonly balances: readonly (bigint | undefined)[];
  /** Aligned bytecode presence; `true` renders the 合约 badge. */
  readonly hasCode: readonly (boolean | undefined)[];
  readonly symbol: string;
  readonly decimals: number;
  readonly loading: boolean;
  readonly error: boolean;
  /** D6: read failures are recoverable — the table offers a re-read action. */
  readonly onRetry?: (() => void) | undefined;
}

/**
 * The pre-submit 核对 table: one row per unique recipient with the amount and the
 * recipient's current balance (read through the batch contract, so the number
 * shown is exactly the number the audit will compare against after mining).
 * Repeated addresses are not rows at all — the panel lists them under the input
 * as 「与第 N 行重复」 and blocks submission until the user deletes one line.
 * Read failures render 「—」; nothing here is ever invented.
 */
export function BatchEntryTable({
  rows,
  balances,
  hasCode,
  symbol,
  decimals,
  loading,
  error,
  onRetry,
}: BatchEntryTableProps) {
  if (rows.length === 0) return null;

  return (
    <div className="mt-3" data-testid="batch-transfer-rows">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted">{copy.batchTransfer.preBalanceTitle}</p>
        {loading ? <Skeleton className="h-3 w-16" /> : null}
      </div>
      <div className="mt-1.5 overflow-hidden rounded-2xl border border-line">
        <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_6rem] gap-2 bg-elevated px-3 py-1.5 text-[11px] font-medium text-muted">
          <span>{copy.batchTransfer.preBalanceHeaderRecipient}</span>
          <span className="text-right">{copy.batchTransfer.preBalanceHeaderAmount}</span>
          <span className="text-right">{copy.batchTransfer.preBalanceHeaderBalance}</span>
        </div>
        <ul className="divide-y divide-line">
          {rows.map((row, index) => {
            const balance = balances[index];
            return (
              <li
                key={row.line}
                data-testid={`batch-transfer-row-${index}`}
                className="grid grid-cols-[minmax(0,1fr)_5.5rem_6rem] items-center gap-2 px-3 py-2 text-xs"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <CopyableAddress
                    address={row.address}
                    label={copy.batchTransfer.preBalanceHeaderRecipient}
                    front={6}
                    back={4}
                    testId={`batch-transfer-row-recipient-${index}`}
                    className="min-w-0 text-foreground"
                  />
                  {hasCode[index] === true ? (
                    <span className="shrink-0 rounded-full bg-warning-soft px-1.5 py-0.5 text-[10px] font-medium text-warning">
                      {copy.batchTransfer.rowContractBadge}
                    </span>
                  ) : null}
                </span>
                <span
                  className="truncate text-right font-mono text-[11px] text-foreground"
                  data-testid={`batch-transfer-row-amount-${index}`}
                >
                  {`${formatVisibleTokenAmount(row.amount, decimals)} ${symbol}`}
                </span>
                <span
                  className="truncate text-right font-mono text-[11px] text-muted"
                  data-testid={`batch-transfer-row-balance-${index}`}
                >
                  {loading && balance === undefined
                    ? copy.batchTransfer.deltaUnknown
                    : error && balance === undefined
                      ? copy.batchTransfer.deltaUnknown
                      : formatVisibleTokenAmount(balance, decimals)}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      {error ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <p className="min-w-0 text-[11px] leading-4 text-muted">
            {copy.batchTransfer.preBalanceError}
          </p>
          {onRetry !== undefined ? (
            <Button
              variant="secondary"
              size="sm"
              data-testid="batch-transfer-rows-retry"
              onClick={onRetry}
              leadingIcon={<RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
            >
              {copy.batchTransfer.retry}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
