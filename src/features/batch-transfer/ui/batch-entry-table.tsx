import { copy } from '@/shared/config/copy-pages';
import { formatTokenAmount, shortenAddress } from '@/shared/lib/format';
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
}

/**
 * The pre-submit 核对 table: one row per *merged* recipient with the amount and
 * the recipient's current balance (read through the batch contract, so the number
 * shown is exactly the number the audit will compare against after mining).
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
                key={row.address}
                data-testid={`batch-transfer-row-${index}`}
                className="grid grid-cols-[minmax(0,1fr)_5.5rem_6rem] items-center gap-2 px-3 py-2 text-xs"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className="truncate font-mono text-[11px] text-foreground"
                    title={row.address}
                    data-testid={`batch-transfer-row-recipient-${index}`}
                  >
                    {shortenAddress(row.address, 6, 4)}
                  </span>
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
                  {`${formatTokenAmount(row.amount, decimals)} ${symbol}`}
                </span>
                <span
                  className="truncate text-right font-mono text-[11px] text-muted"
                  data-testid={`batch-transfer-row-balance-${index}`}
                >
                  {loading && balance === undefined
                    ? copy.batchTransfer.deltaUnknown
                    : error && balance === undefined
                      ? copy.batchTransfer.deltaUnknown
                      : formatTokenAmount(balance, decimals)}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      {error ? (
        <p className="mt-1.5 text-[11px] leading-4 text-muted">
          {copy.batchTransfer.preBalanceError}
        </p>
      ) : null}
    </div>
  );
}
