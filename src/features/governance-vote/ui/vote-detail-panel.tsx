import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { HexAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { validateVoteAllocation } from '@/domain/gov-core';
import { formatTokenAmount, shortenAddress } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';
import { Sheet } from '@/shared/ui/sheet';
import { Skeleton } from '@/shared/ui/skeleton';
import { TxWatchCard } from '@/shared/ui/tx-watch-card';
import type { ProposalDetail } from '@/entities/gov-core/model/use-proposal-detail';
import type { VotePower } from '@/entities/gov-core/model/use-vote-power';
import { parseVoteAmount } from '../lib/vote-form';
import { VOTE_QUICK_PERCENTS, votesForPercent, votesToInputText } from '../lib/vote-share';
import type { VoteWrite } from '../model/use-vote-write';
import { VOTE_DECIMALS, VotePowerCard } from './vote-power-card';

export interface VoteDetailPanelProps {
  readonly voteAddress: HexAddress;
  readonly tokenAddress: HexAddress;
  readonly memberId: bigint;
  readonly symbol: string;
  readonly roundLabel: string;
  readonly detail: ProposalDetail;
  readonly power: VotePower;
  readonly write: VoteWrite;
  readonly onRefetch: () => void;
}

/**
 * 提案投票详情页（owner 2026-11-22）。
 *
 * 与列表页的分工：列表只负责「点哪个提案」，这里负责「投多少」。快捷按钮把
 * **还能投的票数**按 25% / 50% / 100% 折算成票数（`lib/vote-share`），也允许直接填；
 * 提交仍是同一个 `Vote.vote`（单提案），回执数字来自 `VoteCast` 事件。
 */
export function VoteDetailPanel({
  voteAddress,
  tokenAddress,
  memberId,
  symbol,
  roundLabel,
  detail,
  power,
  write,
  onRefetch,
}: VoteDetailPanelProps) {
  const [raw, setRaw] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const remaining = power.remaining;
  const busy = write.stage !== 'idle' || write.receipt !== null;
  const parsed = parseVoteAmount(raw);
  const allocationIssue =
    parsed.kind === 'ok'
      ? validateVoteAllocation(
          [{ proposalId: detail.proposalId, amount: parsed.value }],
          remaining ?? 0n,
        )
      : null;
  const canSubmit =
    detail.status === 'ready' &&
    !busy &&
    remaining !== undefined &&
    remaining > 0n &&
    parsed.kind === 'ok' &&
    allocationIssue === null;

  const submit = (): void => {
    setLocalError(null);
    if (parsed.kind === 'empty' || parsed.kind === 'zero') {
      setLocalError(copy.gov.vote.amountNone);
      return;
    }
    if (parsed.kind === 'invalid') {
      setLocalError(copy.gov.vote.amountInvalid);
      return;
    }
    if (allocationIssue === 'exceeds-remaining') {
      setLocalError(copy.gov.vote.amountTooMany(formatTokenAmount(remaining ?? 0n, VOTE_DECIMALS)));
      return;
    }
    write.submit({
      voteAddress,
      tokenAddress,
      memberId,
      proposalIds: [detail.proposalId],
      voteAmounts: [parsed.value],
    });
  };

  if (detail.status === 'not-found') {
    return (
      <Card data-testid="gov-vote-detail-not-found">
        <CardTitle>{copy.gov.vote.detail.notFoundTitle}</CardTitle>
        <CardDescription>{copy.gov.vote.detail.notFoundBody}</CardDescription>
        <Link
          to={`/vote?symbol=${encodeURIComponent(symbol)}`}
          className="mt-4 inline-flex h-11 items-center justify-center rounded-2xl bg-brand px-4 text-sm font-medium text-on-brand"
        >
          {copy.gov.vote.detail.backToList}
        </Link>
      </Card>
    );
  }

  if (detail.status === 'loading' || detail.status === 'unconfigured') {
    return (
      <div className="space-y-2" data-testid="gov-vote-detail-loading">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (detail.status === 'error') {
    return (
      <Card data-testid="gov-vote-detail-error">
        <CardDescription>{copy.gov.vote.detail.readFailed}</CardDescription>
        <Button type="button" variant="secondary" size="md" className="mt-3" onClick={onRefetch}>
          {copy.gov.vote.detail.retry}
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <ProposalCard detail={detail} roundLabel={roundLabel} />

      <VotePowerCard power={power} symbol={symbol} testId="gov-vote-detail-power" />

      <Card data-testid="gov-vote-detail-quick">
        <CardTitle>{copy.gov.vote.detail.quickTitle}</CardTitle>
        <label
          htmlFor="gov-vote-detail-amount"
          className="mt-3 block text-xs font-medium text-muted"
        >
          {copy.gov.vote.amountLabel}
        </label>
        <input
          id="gov-vote-detail-amount"
          data-testid="gov-vote-detail-amount"
          inputMode="decimal"
          value={raw}
          onChange={(event) => {
            setRaw(event.target.value);
            setLocalError(null);
          }}
          placeholder={copy.gov.vote.amountPlaceholder}
          className="mt-1 h-11 w-full rounded-2xl border border-line bg-surface px-3 text-sm text-foreground outline-none placeholder:text-muted focus:border-brand-strong/40 focus:ring-2 focus:ring-brand-strong/20"
        />
        <div className="mt-3 grid grid-cols-3 gap-2">
          {VOTE_QUICK_PERCENTS.map((percent) => {
            const amount = votesForPercent(remaining, percent);
            return (
              <Button
                key={percent}
                type="button"
                variant="secondary"
                size="md"
                data-testid={`gov-vote-detail-percent-${percent}`}
                disabled={amount === undefined || busy}
                onClick={() => {
                  if (amount === undefined) return;
                  setRaw(votesToInputText(amount));
                  setLocalError(null);
                }}
              >
                {copy.gov.vote.detail.quickPercent(percent)}
              </Button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] leading-4 text-muted" data-testid="gov-vote-detail-hint">
          {remaining === undefined
            ? copy.common.unknown
            : copy.gov.vote.detail.amountHint(formatTokenAmount(remaining, VOTE_DECIMALS))}
        </p>
      </Card>

      {localError !== null ? (
        <p
          role="alert"
          data-testid="gov-vote-detail-error-text"
          className="text-sm text-danger-strong"
        >
          {localError}
        </p>
      ) : null}
      {write.error !== null ? (
        <p role="alert" className="text-sm text-danger-strong">
          {write.error}
        </p>
      ) : null}

      <Button
        type="button"
        variant="primary"
        size="lg"
        className="w-full"
        data-testid="gov-vote-detail-submit"
        disabled={!canSubmit}
        onClick={submit}
      >
        {write.stage === 'wallet'
          ? copy.gov.vote.waitingWallet
          : write.stage === 'pending'
            ? copy.gov.vote.pending
            : detail.mine !== undefined && detail.mine > 0n
              ? copy.gov.vote.detail.resumeSubmit
              : copy.gov.vote.detail.submit}
      </Button>

      <TxWatchCard watch={write.watch} onResubmit={write.resubmit} />

      <Sheet
        open={write.receipt !== null}
        onOpenChange={(open) => {
          if (!open) write.closeReceipt();
        }}
        title={copy.gov.vote.receiptTitle}
      >
        <div className="space-y-3" data-testid="gov-vote-receipt">
          {write.receipt?.map((line) => (
            <p
              key={line.proposalId.toString()}
              className="text-sm text-foreground"
              data-testid="gov-vote-receipt-line"
            >
              {copy.gov.vote.receiptLine(
                line.proposalId.toString(),
                formatTokenAmount(line.voteAmount, VOTE_DECIMALS),
              )}
            </p>
          ))}
          <p className="text-sm text-muted" data-testid="gov-vote-receipt-total">
            {copy.gov.vote.receiptTotal(
              formatTokenAmount(
                write.receipt?.reduce((sum, line) => sum + line.voteAmount, 0n) ?? 0n,
                VOTE_DECIMALS,
              ),
            )}
          </p>
          <Button
            type="button"
            variant="secondary"
            size="md"
            className="w-full"
            data-testid="gov-vote-receipt-close"
            onClick={write.closeReceipt}
          >
            {copy.gov.receipt.close}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

function ProposalCard({
  detail,
  roundLabel,
}: {
  readonly detail: ProposalDetail;
  readonly roundLabel: string;
}) {
  return (
    <Card data-testid="gov-vote-detail-proposal">
      <div className="flex items-start justify-between gap-3">
        <CardTitle className="min-w-0 break-words">{detail.title ?? copy.common.unknown}</CardTitle>
        <span className="shrink-0 font-mono text-xs text-muted" data-testid="gov-vote-detail-id">
          #{detail.proposalId.toString()}
        </span>
      </div>
      <CardDescription className="mt-2 whitespace-pre-wrap">
        {detail.details ?? copy.common.unknown}
      </CardDescription>
      <div className="mt-3 space-y-1 text-xs leading-5 text-muted">
        <p data-testid="gov-vote-detail-total">
          {detail.total === undefined
            ? copy.common.unknown
            : copy.gov.vote.totalVotesOn(formatTokenAmount(detail.total, VOTE_DECIMALS))}
        </p>
        <p data-testid="gov-vote-detail-mine">
          {detail.mine === undefined
            ? copy.common.unknown
            : copy.gov.vote.myVotesOn(formatTokenAmount(detail.mine, VOTE_DECIMALS))}
        </p>
        <p data-testid="gov-vote-detail-target">
          {copy.gov.vote.detail.targetLabel}：
          {detail.target === undefined ? copy.common.unknown : shortenAddress(detail.target)}
        </p>
        <p data-testid="gov-vote-detail-round">{roundLabel}</p>
      </div>
    </Card>
  );
}
