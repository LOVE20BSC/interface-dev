import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { HexAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { validateVoteAllocation } from '@/domain/gov-core';
import { formatTokenAmount } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';
import { Sheet } from '@/shared/ui/sheet';
import { Skeleton } from '@/shared/ui/skeleton';
import { TxWatchCard } from '@/shared/ui/tx-watch-card';
import type { VotePower } from '@/entities/gov-core/model/use-vote-power';
import type { RoundProposal } from '@/entities/gov-core/model/use-round-proposals';
import { buildVoteDraft, type VoteDraftEntry } from '../lib/vote-form';
import type { VoteWrite } from '../model/use-vote-write';

/** 治理票是 18 位小数的数量（`Stake.govVotes`）。 */
const VOTE_DECIMALS = 18;

export interface VotePanelProps {
  readonly voteAddress: HexAddress;
  readonly tokenAddress: HexAddress;
  readonly memberId: bigint;
  readonly symbol: string;
  readonly proposals: readonly RoundProposal[];
  readonly power: VotePower;
  readonly write: VoteWrite;
  readonly roundLabel: string;
  readonly onRefetch: () => void;
}

/**
 * 投票面板：额度 → 本轮提案 → 分票 → 提交 → 回执。
 *
 * 交互口径（UX spec §4）：
 * - 提交前先本地校验（`domain/gov-core#validateVoteAllocation`），错误显示在按钮上方；
 * - 一个写操作在途时按钮禁用并写明原因，不做全屏遮罩；
 * - 回执走自下而上的 `Sheet`，数字来自回执里的 `VoteCast` 事件，不拿输入冒充链上结果。
 */
export function VotePanel({
  voteAddress,
  tokenAddress,
  memberId,
  symbol,
  proposals,
  power,
  write,
  roundLabel,
  onRefetch,
}: VotePanelProps) {
  const [drafts, setDrafts] = useState<Readonly<Record<string, string>>>({});
  const [localError, setLocalError] = useState<string | null>(null);

  const voteable = proposals.filter((proposal) => proposal.targetMode === 0);
  const remaining = power.remaining;
  // 纯函数、条目数 ≤ 一页（20）：直接算比记住依赖更不容易出 bug。
  const draft = buildVoteDraft(
    voteable.map((proposal): VoteDraftEntry => ({
      proposalId: proposal.proposalId,
      raw: drafts[proposal.proposalId.toString()] ?? '',
    })),
  );
  const allocationIssue =
    draft.kind === 'ok' ? validateVoteAllocation(draft.allocations, remaining ?? 0n) : null;

  const busy = write.stage !== 'idle' || write.receipt !== null;
  const noPower = power.status === 'ready' && power.maxVoteAmount === 0n;
  const noRemaining = remaining === 0n;
  // P2-4（走查 2026-11-21）：超额时按钮会禁用，所以原因必须立刻可见，不能等到点提交。
  // review 2026-11-22：额度还在读/读失败（remaining === undefined）时不能算「超额」——
  // 拿 `?? 0n` 会立刻报「合计超过还能投的 0 票。」，等于在未知态给肯定结论（§4.9/§5）。
  const liveError =
    remaining !== undefined && allocationIssue === 'exceeds-remaining'
      ? copy.gov.vote.amountTooMany(formatTokenAmount(remaining, VOTE_DECIMALS))
      : null;
  const canSubmit =
    !busy &&
    remaining !== undefined &&
    remaining > 0n &&
    draft.kind === 'ok' &&
    allocationIssue === null;

  const submit = (): void => {
    setLocalError(null);
    if (draft.kind === 'invalid') {
      setLocalError(copy.gov.vote.amountInvalid);
      return;
    }
    if (draft.kind === 'empty') {
      setLocalError(copy.gov.vote.amountNone);
      return;
    }
    if (allocationIssue === 'exceeds-remaining') {
      setLocalError(copy.gov.vote.amountTooMany(formatTokenAmount(remaining ?? 0n, VOTE_DECIMALS)));
      return;
    }
    if (allocationIssue === 'zero-amount') {
      setLocalError(copy.gov.vote.amountInvalid);
      return;
    }
    if (allocationIssue !== null) {
      setLocalError(copy.gov.vote.amountNone);
      return;
    }
    write.submit({
      voteAddress,
      tokenAddress,
      memberId,
      proposalIds: draft.allocations.map((allocation) => allocation.proposalId),
      voteAmounts: draft.allocations.map((allocation) => allocation.amount),
    });
  };

  return (
    <div className="space-y-4">
      <PowerCard power={power} symbol={symbol} />
      {/* 区段标题不单独占一张卡：空卡只写「本轮提案 + 轮次」会让页面多一块空白。 */}
      <div className="flex items-baseline justify-between gap-2 px-1" data-testid="gov-vote-round">
        <h2 className="text-base font-semibold text-foreground">{copy.gov.vote.roundTitle}</h2>
        <span className="text-xs text-muted" data-testid="gov-vote-round-label">
          {roundLabel}
        </span>
      </div>
      {power.status === 'loading' ? (
        <div className="space-y-2 px-1" data-testid="gov-vote-power-loading">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-28" />
        </div>
      ) : power.status === 'error' ? (
        <Card data-testid="gov-vote-power-error">
          <CardDescription>{copy.gov.vote.readFailed}</CardDescription>
          <Button type="button" variant="secondary" size="md" className="mt-3" onClick={onRefetch}>
            {copy.gov.vote.retry}
          </Button>
        </Card>
      ) : null}

      {proposals.length === 0 ? (
        <Card data-testid="gov-vote-empty">
          <CardTitle>{copy.gov.vote.emptyTitle}</CardTitle>
          <CardDescription>{copy.gov.vote.emptyBody}</CardDescription>
          <Link
            to={`/submit?symbol=${encodeURIComponent(symbol)}`}
            className="mt-4 inline-flex h-11 items-center justify-center rounded-2xl bg-brand px-4 text-sm font-medium text-on-brand"
          >
            {copy.gov.vote.emptyAction}
          </Link>
        </Card>
      ) : (
        <ul className="space-y-3" data-testid="gov-vote-list">
          {proposals.map((proposal) => (
            <li key={proposal.proposalId.toString()}>
              <ProposalVoteCard
                proposal={proposal}
                power={power}
                symbol={symbol}
                value={drafts[proposal.proposalId.toString()] ?? ''}
                disabled={busy || remaining === 0n}
                onChange={(next) =>
                  setDrafts((current) => ({
                    ...current,
                    [proposal.proposalId.toString()]: next,
                  }))
                }
              />
            </li>
          ))}
        </ul>
      )}

      {localError !== null || liveError !== null ? (
        <p role="alert" data-testid="gov-vote-local-error" className="text-sm text-danger-strong">
          {localError ?? liveError}
        </p>
      ) : null}
      {write.error !== null ? (
        <p role="alert" data-testid="gov-vote-error" className="text-sm text-danger-strong">
          {write.error}
        </p>
      ) : null}

      <div className="space-y-2">
        <Button
          type="button"
          variant="primary"
          size="lg"
          className="w-full"
          data-testid="gov-vote-submit"
          disabled={!canSubmit}
          onClick={submit}
        >
          {write.stage === 'wallet'
            ? copy.gov.vote.waitingWallet
            : write.stage === 'pending'
              ? copy.gov.vote.pending
              : copy.gov.vote.submit}
        </Button>
        {noRemaining && !noPower && !busy ? (
          <p className="text-xs text-muted" data-testid="gov-vote-no-remaining">
            {copy.gov.vote.quotaUsed}
          </p>
        ) : null}
        {remaining === undefined ? (
          <p className="text-xs text-muted" data-testid="gov-vote-busy-reason">
            {copy.gov.vote.loading}
          </p>
        ) : null}
      </div>

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

function PowerCard({ power, symbol }: { readonly power: VotePower; readonly symbol: string }) {
  const noPower = power.status === 'ready' && power.maxVoteAmount === 0n;
  return (
    <Card data-testid="gov-vote-power">
      <CardTitle>{copy.gov.vote.powerTitle}</CardTitle>
      {noPower ? (
        <>
          <CardDescription>{copy.gov.vote.noPowerBody}</CardDescription>
          <Link
            to={`/stake/liquidity?symbol=${encodeURIComponent(symbol)}`}
            className="mt-4 inline-flex h-11 items-center justify-center rounded-2xl bg-brand px-4 text-sm font-medium text-on-brand"
          >
            {copy.gov.vote.noPowerAction}
          </Link>
        </>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Stat
            label={copy.gov.vote.powerMax}
            value={power.maxVoteAmount}
            testId="gov-vote-power-max"
          />
          <Stat
            label={copy.gov.vote.powerUsed}
            value={power.usedVoteAmount}
            testId="gov-vote-power-used"
          />
          <Stat
            label={copy.gov.vote.powerRemaining}
            value={power.remaining}
            testId="gov-vote-power-remaining"
          />
        </div>
      )}
      <p className="mt-3 text-xs leading-5 text-muted">{copy.gov.vote.powerNote}</p>
    </Card>
  );
}

function Stat({
  label,
  value,
  testId,
}: {
  readonly label: string;
  readonly value: bigint | undefined;
  readonly testId: string;
}) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-base font-medium text-foreground" data-testid={testId}>
        {formatTokenAmount(value, VOTE_DECIMALS)}
      </p>
      <p className="text-xs text-muted">{copy.gov.vote.powerUnit}</p>
    </div>
  );
}

function ProposalVoteCard({
  proposal,
  power,
  value,
  disabled,
  onChange,
}: {
  readonly proposal: RoundProposal;
  readonly power: VotePower;
  readonly symbol: string;
  readonly value: string;
  readonly disabled: boolean;
  readonly onChange: (next: string) => void;
}) {
  const votes = power.perProposal.get(proposal.proposalId);
  const callback = proposal.targetMode !== 0;
  return (
    <Card data-testid={`gov-vote-proposal-${proposal.proposalId.toString()}`}>
      <CardTitle>{`#${proposal.proposalId.toString()} ${proposal.title}`}</CardTitle>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span data-testid={`gov-vote-proposal-total-${proposal.proposalId.toString()}`}>
          {copy.gov.vote.totalVotes(formatTokenAmount(votes?.total, VOTE_DECIMALS))}
        </span>
        <span data-testid={`gov-vote-proposal-mine-${proposal.proposalId.toString()}`}>
          {copy.gov.vote.mineVotes(formatTokenAmount(votes?.mine, VOTE_DECIMALS))}
        </span>
      </div>
      {callback ? (
        <p
          className="mt-3 text-xs leading-5 text-warning-strong"
          data-testid="gov-vote-callback-note"
        >
          {copy.gov.vote.targetUnsupported}
        </p>
      ) : (
        <label className="mt-3 block">
          <span className="text-xs text-muted">{copy.gov.vote.amountLabel}</span>
          <input
            type="text"
            inputMode="decimal"
            className="mt-1 h-11 w-full rounded-2xl border border-line bg-surface px-3 text-sm text-foreground"
            placeholder={copy.gov.vote.amountPlaceholder}
            data-testid={`gov-vote-amount-${proposal.proposalId.toString()}`}
            value={value}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
          />
        </label>
      )}
    </Card>
  );
}
