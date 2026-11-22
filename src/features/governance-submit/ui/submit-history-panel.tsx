import { Link } from 'react-router-dom';
import type { HexAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { Button } from '@/shared/ui/button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';
import { Sheet } from '@/shared/ui/sheet';
import { Skeleton } from '@/shared/ui/skeleton';
import { TxWatchCard } from '@/shared/ui/tx-watch-card';
import type { ProposalHistory } from '@/entities/gov-core/model/use-proposal-history';
import type { SubmitExistingWrite } from '../model/use-submit-existing';

export interface SubmitHistoryPanelProps {
  readonly submitAddress: HexAddress;
  readonly symbol: string;
  readonly tokenAddress: HexAddress;
  readonly memberId: bigint;
  /** 本轮还能不能推举（门槛 + 每轮一个）；false 时按钮禁用并给原因。 */
  readonly canSubmit: boolean;
  /** 本轮这个身份已经推举的提案编号（0/undefined = 还没推举）。 */
  readonly submittedThisRoundId: bigint | undefined;
  /** 当前页（页码从 1 开始由页面换算成 offset）。 */
  readonly page: number;
  readonly totalPages: number | undefined;
  readonly history: ProposalHistory;
  readonly write: SubmitExistingWrite;
  readonly onRefetch: () => void;
  readonly onPageChange: (page: number) => void;
}

/**
 * `/submit` 的历史提案列表（owner 2026-11-22：这一页默认就是列表，创建表单在 `/submit/new`）。
 *
 * - 行：`#编号 标题` + `提案人 #id`，右侧「推举」；
 * - 分页：每页 10 条（`Submit.proposalIds` 倒序 + `proposalInfosByProposalIds`），
 *   底部「上一页 / 第 N / M 页 / 下一页」；
 * - 右上「推举新提案」进创建页；本轮已经推举过（同一身份每轮一个）时整段只读：
 *   顶部给说明、行内状态文字、右上按钮收起。
 */
export function SubmitHistoryPanel({
  submitAddress,
  symbol,
  tokenAddress,
  memberId,
  canSubmit,
  submittedThisRoundId,
  page,
  totalPages,
  history,
  write,
  onRefetch,
  onPageChange,
}: SubmitHistoryPanelProps) {
  const busy = write.stage !== 'idle' || write.receipt !== null;
  const alreadySubmitted = submittedThisRoundId !== undefined && submittedThisRoundId !== 0n;
  const canGoPrev = page > 1;
  const canGoNext = totalPages !== undefined && page < totalPages;

  return (
    <Card data-testid="gov-submit-history">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>{copy.gov.submit.listTitle}</CardTitle>
          <CardDescription className="mt-1">{copy.gov.submit.listIntro}</CardDescription>
        </div>
        {alreadySubmitted ? null : (
          <Link
            to={`/submit/new?symbol=${encodeURIComponent(symbol)}`}
            data-testid="gov-submit-history-new"
            className="inline-flex h-9 shrink-0 items-center justify-center rounded-2xl border border-line bg-surface px-3 text-xs font-medium text-foreground hover:bg-elevated"
          >
            {copy.gov.submit.newAction}
          </Link>
        )}
      </div>

      {alreadySubmitted ? (
        <p
          className="mt-3 rounded-2xl border border-line bg-elevated px-3 py-2 text-xs leading-5 text-muted"
          data-testid="gov-submit-history-blocked"
        >
          {copy.gov.submit.historyBlockedSubmitted(submittedThisRoundId.toString())}
        </p>
      ) : canSubmit ? null : (
        <p
          className="mt-3 rounded-2xl border border-line bg-elevated px-3 py-2 text-xs leading-5 text-muted"
          data-testid="gov-submit-history-blocked"
        >
          {copy.gov.submit.historyBlockedNoPower}
        </p>
      )}

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
            {history.items.map((proposal) => {
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
                    {/* 「本轮已推举」只由右侧状态列表达，行内不再重复一遍（owner 2026-11-22 去重口径）。 */}
                    <p className="mt-0.5 text-[11px] leading-4 text-muted">
                      {copy.gov.vote.proposalAuthor} #{proposal.submitterId.toString()}
                    </p>
                  </div>
                  {alreadySubmitted ? (
                    <span
                      data-testid={`gov-submit-history-action-${id}`}
                      className="shrink-0 text-[11px] leading-4 text-muted"
                    >
                      {proposal.submittedThisRound
                        ? copy.gov.submit.historySubmittedBadge
                        : copy.gov.submit.historyNextRoundBadge}
                    </span>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="shrink-0"
                      data-testid={`gov-submit-history-action-${id}`}
                      disabled={blocked}
                      onClick={() => {
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
                  )}
                </li>
              );
            })}
          </ul>

          <div className="mt-3 flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              data-testid="gov-submit-history-prev"
              disabled={!canGoPrev || history.status !== 'ready'}
              onClick={() => onPageChange(page - 1)}
            >
              {copy.gov.submit.pagePrev}
            </Button>
            <span className="text-[11px] text-muted" data-testid="gov-submit-history-page">
              {totalPages === undefined
                ? copy.common.unknown
                : copy.gov.submit.pageLabel(page.toString(), totalPages.toString())}
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              data-testid="gov-submit-history-next"
              disabled={!canGoNext || history.status !== 'ready'}
              onClick={() => onPageChange(page + 1)}
            >
              {copy.gov.submit.pageNext}
            </Button>
          </div>
          {history.total !== undefined ? (
            <p className="mt-2 text-[11px] text-muted" data-testid="gov-submit-history-total">
              {copy.gov.submit.historyTotal(history.total.toString())}
            </p>
          ) : null}
        </>
      )}

      {write.error !== null ? (
        <p
          role="alert"
          className="mt-2 text-sm text-danger-strong"
          data-testid="gov-submit-history-error-text"
        >
          {write.error}
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
