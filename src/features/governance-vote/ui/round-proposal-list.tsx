import { Link } from 'react-router-dom';
import { copy } from '@/shared/config/copy-pages';
import { formatTokenAmount } from '@/shared/lib/format';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';
import type { VotePower } from '@/entities/gov-core/model/use-vote-power';
import type { RoundProposal } from '@/entities/gov-core/model/use-round-proposals';
import { VOTE_DECIMALS } from '@/features/governance-vote/ui/vote-power-card';

/**
 * 本轮提案列表（`/vote`）：只做「选哪个提案去投」，不再在列表里放输入框
 * （owner 2026-11-22：点任意提案进入独立投票详情页）。
 *
 * 回调提案（`targetMode == 1`）不在这一页投：列出但标原因，不可点进详情。
 */
export function RoundProposalList({
  proposals,
  power,
  symbol,
  roundLabel,
}: {
  readonly proposals: readonly RoundProposal[];
  readonly power: VotePower;
  readonly symbol: string;
  readonly roundLabel: string;
}) {
  return (
    <div className="space-y-3">
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
      <ul className="space-y-3" data-testid="gov-vote-list">
        {proposals.map((proposal) => {
          const id = proposal.proposalId.toString();
          const votes = power.perProposal.get(proposal.proposalId);
          const callback = proposal.targetMode !== 0;
          return (
            <li key={id}>
              <Card data-testid={`gov-vote-proposal-${id}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="truncate">{proposal.title}</CardTitle>
                    <CardDescription>
                      {copy.gov.vote.detail.authorLabel} #{proposal.submitterId.toString()}
                    </CardDescription>
                  </div>
                  <span className="shrink-0 font-mono text-xs text-muted">#{id}</span>
                </div>
                <div className="mt-3 space-y-1 text-xs leading-5 text-muted">
                  <p data-testid={`gov-vote-proposal-total-${id}`}>
                    {votes === undefined || votes.total === undefined
                      ? copy.common.unknown
                      : copy.gov.vote.totalVotesOn(formatTokenAmount(votes.total, VOTE_DECIMALS))}
                  </p>
                  <p data-testid={`gov-vote-proposal-mine-${id}`}>
                    {votes === undefined || votes.mine === undefined
                      ? copy.common.unknown
                      : copy.gov.vote.myVotesOn(formatTokenAmount(votes.mine, VOTE_DECIMALS))}
                  </p>
                </div>
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
