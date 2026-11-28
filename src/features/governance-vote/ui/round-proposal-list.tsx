import { Link } from 'react-router-dom';
import { VOTE_DECIMALS } from '@/domain/gov-core';
import { copy } from '@/shared/config/copy-pages';
import { formatTokenAmount } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import type { ProposalVotesRead } from '@/entities/gov-core/model/use-proposal-votes';
import type { RoundProposal } from '@/entities/gov-core/model/use-round-proposals';

/**
 * 本轮提案列表（`/vote`）：只做「选哪个提案去投」，不再在列表里放输入框
 * （owner 2026-11-22：点任意提案进入独立投票详情页）。
 *
 * 回调提案（`targetMode == 1`）不在这一页投：列出但标原因，不可点进详情。
 */
export function RoundProposalList({
  proposals,
  votes,
  symbol,
  roundLabel,
}: {
  readonly proposals: readonly RoundProposal[];
  readonly votes: ProposalVotesRead;
  readonly symbol: string;
  readonly roundLabel: string;
}) {
  return (
    <div className="space-y-3" aria-busy={votes.status === 'loading' || undefined}>
      <div className="flex items-baseline justify-between gap-2 px-1" data-testid="gov-vote-round">
        <h2 className="text-base font-semibold text-foreground">{copy.gov.vote.roundTitle}</h2>
        <span className="text-xs text-muted" data-testid="gov-vote-round-label">
          {roundLabel}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="min-w-0 text-xs leading-5 text-muted">{copy.gov.vote.listHint}</p>
        <Link
          to={`/submit?symbol=${encodeURIComponent(symbol)}`}
          data-testid="gov-vote-propose"
          className="inline-flex h-9 shrink-0 items-center justify-center rounded-2xl border border-line bg-surface px-3 text-xs font-medium text-foreground hover:bg-elevated"
        >
          {copy.gov.vote.proposeAction}
        </Link>
      </div>
      {votes.status === 'error' ? (
        <Card data-testid="gov-vote-proposal-votes-error">
          <CardDescription role="alert">{copy.gov.vote.proposalVotesReadFailed}</CardDescription>
          <Button
            type="button"
            variant="secondary"
            className="mt-3"
            data-testid="gov-vote-proposal-votes-retry"
            onClick={votes.refetch}
          >
            {copy.gov.vote.retry}
          </Button>
        </Card>
      ) : null}
      {votes.status === 'loading' ? <span className="sr-only">{copy.common.loading}</span> : null}
      <ul className="space-y-3" data-testid="gov-vote-list">
        {proposals.map((proposal) => {
          const id = proposal.proposalId.toString();
          const count = votes.byId.get(proposal.proposalId);
          const callback = proposal.targetMode !== 0;
          return (
            <li key={id}>
              <Card data-testid={`gov-vote-proposal-${id}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="truncate">{proposal.title}</CardTitle>
                    <CardDescription>
                      {copy.gov.vote.detail.authorLabel} #{proposal.authorId.toString()}
                    </CardDescription>
                  </div>
                  <span className="shrink-0 font-mono text-xs text-muted">#{id}</span>
                </div>
                {votes.status === 'loading' ? (
                  <Skeleton className="mt-3 h-9 w-32" />
                ) : (
                  <div className="mt-3 space-y-1 text-xs leading-5 text-muted">
                    <p data-testid={`gov-vote-proposal-total-${id}`}>
                      {count?.total === undefined
                        ? copy.common.unknown
                        : copy.gov.vote.totalVotesOn(formatTokenAmount(count.total, VOTE_DECIMALS))}
                    </p>
                    <p data-testid={`gov-vote-proposal-mine-${id}`}>
                      {count?.mine === undefined
                        ? copy.common.unknown
                        : copy.gov.vote.myVotesOn(formatTokenAmount(count.mine, VOTE_DECIMALS))}
                    </p>
                  </div>
                )}
                {callback ? (
                  <p
                    className="mt-3 text-xs leading-5 text-muted"
                    data-testid={`gov-vote-proposal-target-${id}`}
                  >
                    {copy.gov.vote.targetUnsupported}
                  </p>
                ) : (
                  <Link
                    to={`/vote/${id}?symbol=${encodeURIComponent(symbol)}`}
                    data-testid={`gov-vote-open-${id}`}
                    className="mt-4 inline-flex h-11 items-center justify-center rounded-2xl border border-line bg-surface px-4 text-sm font-medium text-foreground hover:bg-elevated"
                  >
                    {copy.gov.vote.openProposal}
                  </Link>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
