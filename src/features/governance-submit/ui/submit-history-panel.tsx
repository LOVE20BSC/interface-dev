import { useState } from 'react';
import type { HexAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { Button } from '@/shared/ui/button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';
import { Sheet } from '@/shared/ui/sheet';
import { Skeleton } from '@/shared/ui/skeleton';
import { TxWatchCard } from '@/shared/ui/tx-watch-card';
import type { ProposalHistory } from '@/entities/gov-core/model/use-proposal-history';
import type { SubmitExistingWrite } from '../model/use-submit-existing';

const PAGE_SIZE = 5;

export interface SubmitHistoryPanelProps {
  readonly submitAddress: HexAddress;
  readonly tokenAddress: HexAddress;
  readonly memberId: bigint;
  /** 本轮还能不能推举（门槛 + 每轮一个）；false 时按钮禁用并给原因。 */
  readonly canSubmit: boolean;
  readonly history: ProposalHistory;
  readonly write: SubmitExistingWrite;
  readonly onRefetch: () => void;
}

/**
 * 「推举历史提案」段（owner 2026-11-22）。
 *
 * 数据来自 `Submit.proposalIds` + `proposalInfosByProposalIds`（倒序、分页），
 * 每行一个「推举」按钮；本轮已经被推举的提案标「本轮已推举」并禁用（同一个提案不能在一轮里
 * 被推举两次）。写链走 `useSubmitExisting`，回执是 `ProposalSubmitted` 的轮次 + 编号。
 */
export function SubmitHistoryPanel({
  submitAddress,
  tokenAddress,
  memberId,
  canSubmit,
  history,
  write,
  onRefetch,
}: SubmitHistoryPanelProps) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [localError, setLocalError] = useState<string | null>(null);
  const busy = write.stage !== 'idle' || write.receipt !== null;
  const more = history.total !== undefined && BigInt(history.items.length) < history.total;

  return (
    <Card data-testid="gov-submit-history">
      <CardTitle>{copy.gov.submit.historyTitle}</CardTitle>
      <CardDescription className="mt-1">{copy.gov.submit.historyIntro}</CardDescription>

      {history.status === 'loading' ? (
        <div className="mt-3 space-y-2" data-testid="gov-submit-history-loading">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-28" />
        </div>
      ) : history.status === 'error' ? (
        <div className="mt-3" data-testid="gov-submit-history-error">
          <p role="alert" className="text-sm text-danger-strong">
            {copy.gov.submit.historyReadFailed}
          </p>
          <Button type="button" variant="secondary" size="md" className="mt-2" onClick={onRefetch}>
            {copy.gov.submit.historyRetry}
          </Button>
        </div>
      ) : history.items.length === 0 ? (
        <p className="mt-3 text-sm text-muted" data-testid="gov-submit-history-empty">
          {copy.gov.submit.historyEmpty}
        </p>
      ) : (
        <>
          <ul className="mt-3 space-y-2" data-testid="gov-submit-history-list">
            {history.items.slice(0, limit).map((proposal) => {
              const id = proposal.proposalId.toString();
              const blocked = !canSubmit || proposal.submittedThisRound || busy;
              return (
                <li
                  key={id}
                  data-testid={`gov-submit-history-row-${id}`}
                  className="flex items-start justify-between gap-3 rounded-2xl border border-line/70 bg-surface px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      <span className="font-mono text-xs text-muted">#{id}</span> {proposal.title}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-4 text-muted">
                      {copy.gov.vote.proposalAuthor} #{proposal.submitterId.toString()}
                      {proposal.submittedThisRound
                        ? ` · ${copy.gov.submit.historySubmittedBadge}`
                        : ''}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="shrink-0"
                    data-testid={`gov-submit-history-action-${id}`}
                    disabled={blocked}
                    onClick={() => {
                      setLocalError(null);
                      write.submit({
                        submitAddress,
                        tokenAddress,
                        memberId,
                        proposalId: proposal.proposalId,
                      });
                    }}
                  >
                    {proposal.submittedThisRound
                      ? copy.gov.submit.historySubmittedBadge
                      : copy.gov.submit.historyAction}
                  </Button>
                </li>
              );
            })}
          </ul>
          {more ? (
            <Button
              type="button"
              variant="secondary"
              size="md"
              className="mt-3 w-full"
              data-testid="gov-submit-history-more"
              onClick={() => setLimit((current) => current + PAGE_SIZE)}
            >
              {copy.gov.submit.historyLoadMore}
            </Button>
          ) : null}
          {history.total !== undefined ? (
            <p className="mt-2 text-[11px] text-muted" data-testid="gov-submit-history-total">
              {copy.gov.submit.historyTotal(history.total.toString())}
            </p>
          ) : null}
        </>
      )}

      {(localError ?? write.error !== null) ? (
        <p
          role="alert"
          className="mt-2 text-sm text-danger-strong"
          data-testid="gov-submit-history-error-text"
        >
          {localError ?? write.error}
        </p>
      ) : null}

      <TxWatchCard watch={write.watch} onResubmit={write.resubmit} />

      <Sheet
        open={write.receipt !== null}
        onOpenChange={(open) => {
          if (!open) write.closeReceipt();
        }}
        title={copy.gov.submit.historyReceiptTitle}
      >
        <div className="space-y-3" data-testid="gov-submit-history-receipt">
          <p className="text-sm text-foreground">
            {write.receipt === null
              ? copy.common.unknown
              : copy.gov.submit.historyReceiptLine(
                  write.receipt.proposalId?.toString() ?? copy.common.unknown,
                  write.receipt.round?.toString() ?? copy.common.unknown,
                )}
          </p>
          <Button
            type="button"
            variant="secondary"
            size="md"
            className="w-full"
            data-testid="gov-submit-history-receipt-close"
            onClick={write.closeReceipt}
          >
            {copy.gov.receipt.close}
          </Button>
        </div>
      </Sheet>
    </Card>
  );
}
