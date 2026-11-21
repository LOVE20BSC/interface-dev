import type { HexAddress } from '@/config/networks';
import { minProposalVoteAmount } from '@/domain/gov-core';
import type {
  ProposalRewardRow,
  ProposalRewards,
} from '@/entities/gov-core/model/use-proposal-rewards';
import type { RoundProposals } from '@/entities/gov-core/model/use-round-proposals';
import { copy } from '@/shared/config/copy-pages';
import { cn } from '@/shared/lib/cn';
import { formatTokenAmount } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { Card, CardTitle } from '@/shared/ui/card';
import { ArrowLeft, ArrowRight } from '@/shared/ui/icons';
import { Sheet } from '@/shared/ui/sheet';
import { Skeleton } from '@/shared/ui/skeleton';
import { TxWatchCard } from '@/shared/ui/tx-watch-card';
import {
  GOV_VOTE_DECIMALS,
  proposalRewardRowAmount,
  proposalRewardRowView,
  type ProposalRewardTone,
} from '../lib/proposal-reward-row';
import type { ProposalRewardWrite } from '../model/use-proposal-reward-write';

const TONE_CLASS: Readonly<Record<ProposalRewardTone, string>> = {
  neutral: 'text-muted',
  success: 'text-success',
  danger: 'text-danger-strong',
};

/** 表头与行共用同一套列宽，窄屏下票数格允许换行（两个数各占一行）。 */
const COLUMNS = 'grid grid-cols-[minmax(0,1fr)_4.5rem_5rem_3.5rem] gap-2';

export interface ProposalRewardPanelProps {
  readonly tokenAddress: HexAddress;
  readonly mintAddress: HexAddress;
  readonly symbol: string;
  readonly decimals: number | undefined;
  /** 当前查看的轮次；阶段时钟还没回来 / 没有已结束轮次时为 undefined。 */
  readonly round: bigint | undefined;
  /** 最近一个已结束的轮次（`currentPhase - 1`），上界。 */
  readonly newestRound: bigint | undefined;
  readonly proposals: RoundProposals;
  readonly rewards: ProposalRewards;
  readonly write: ProposalRewardWrite;
  readonly onPrev: () => void;
  readonly onNext: () => void;
  readonly onRefetch: () => void;
}

/**
 * 提案激励结算面板：轮次选择 → 汇总 → 逐提案结算表 → 销毁回执。
 *
 * 交互口径（UX spec §4 / 规范 §6.6.1）：
 * - 一页只有一个写操作：销毁在途时所有按钮禁用，并在选择器下方写明当前阶段；
 * - 达标提案不给铸造按钮（`onlyProposalTarget`，core 覆盖范围内铸不了），只写
 *   `eligibleHint`；票数 0 的提案不给销毁按钮（合约静默无操作），只写 `noVoteHint`；
 * - 数字走 `format.*`，未知值渲染「—」；回执金额只来自回执里的 `ProposalRewardBurned`。
 */
export function ProposalRewardPanel({
  tokenAddress,
  mintAddress,
  symbol,
  decimals,
  round,
  newestRound,
  proposals,
  rewards,
  write,
  onPrev,
  onNext,
  onRefetch,
}: ProposalRewardPanelProps) {
  const busy = write.stage !== 'idle';
  const roundText =
    round === undefined ? copy.common.unknown : copy.gov.vote.roundHint(round.toString());
  const prevLabel =
    round === undefined
      ? copy.gov.proposalRewards.roundHint
      : copy.gov.vote.roundHint((round - 1n).toString());
  const nextLabel =
    round === undefined
      ? copy.gov.proposalRewards.roundHint
      : copy.gov.vote.roundHint((round + 1n).toString());
  const canPrev = !busy && round !== undefined && round > 1n;
  const canNext = !busy && round !== undefined && newestRound !== undefined && round < newestRound;

  const reading =
    round === undefined || proposals.status === 'loading' || rewards.status === 'loading';
  const failed =
    !reading &&
    (proposals.status === 'error' ||
      rewards.status === 'error' ||
      proposals.items.length !== rewards.rows.length);
  const empty = !reading && !failed && proposals.items.length === 0;

  const titles = new Map<bigint, string>(
    proposals.items.map((item): [bigint, string] => [item.proposalId, item.title]),
  );
  const threshold =
    rewards.totalVoteAmount !== undefined && rewards.minVoteRatio !== undefined
      ? minProposalVoteAmount(rewards.totalVoteAmount, rewards.minVoteRatio)
      : rewards.rows[0]?.minVoteAmount;

  const burn = (proposalId: bigint): void => {
    if (round === undefined) return;
    write.submit({ mintAddress, tokenAddress, round, proposalId });
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label={prevLabel}
            data-testid="gov-proposal-rewards-prev"
            disabled={!canPrev}
            onClick={onPrev}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <div className="min-w-0 text-center">
            <p className="text-xs text-muted">{copy.gov.proposalRewards.roundHint}</p>
            <p
              className="mt-1 text-sm font-semibold text-foreground"
              data-testid="gov-proposal-rewards-round"
            >
              {roundText}
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label={nextLabel}
            data-testid="gov-proposal-rewards-next"
            disabled={!canNext}
            onClick={onNext}
          >
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </Card>

      {busy ? (
        <p className="text-xs leading-5 text-muted" data-testid="gov-proposal-rewards-busy">
          {write.stage === 'wallet'
            ? copy.gov.proposalRewards.waitingWallet
            : copy.gov.proposalRewards.pending}
        </p>
      ) : null}

      {reading ? (
        <div className="space-y-3" data-testid="gov-proposal-rewards-loading" aria-busy="true">
          <span className="sr-only" role="status">
            {copy.gov.proposalRewards.loading}
          </span>
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : failed ? (
        <Card data-testid="gov-proposal-rewards-read-error">
          <CardTitle role="alert">{copy.gov.proposalRewards.readFailed}</CardTitle>
          <Button type="button" variant="secondary" size="md" className="mt-3" onClick={onRefetch}>
            {copy.gov.proposalRewards.retry}
          </Button>
        </Card>
      ) : (
        <>
          <Card data-testid="gov-proposal-rewards-summary">
            <div className="grid grid-cols-3 gap-2">
              <SummaryStat
                label={copy.gov.proposalRewards.poolLabel}
                value={formatTokenAmount(rewards.roundPool, decimals)}
                testId="gov-proposal-rewards-pool"
              />
              <SummaryStat
                label={copy.gov.proposalRewards.totalVotesLabel}
                value={formatTokenAmount(rewards.totalVoteAmount, GOV_VOTE_DECIMALS)}
                testId="gov-proposal-rewards-total-votes"
              />
              <SummaryStat
                label={copy.gov.proposalRewards.thresholdLabel}
                value={formatTokenAmount(threshold, GOV_VOTE_DECIMALS)}
                testId="gov-proposal-rewards-threshold"
              />
            </div>
            {rewards.roundPool === 0n ? (
              <p
                className="mt-3 text-xs leading-5 text-muted"
                data-testid="gov-proposal-rewards-pool-empty"
              >
                {copy.gov.proposalRewards.poolEmpty}
              </p>
            ) : null}
          </Card>

          {empty ? (
            <div
              className="rounded-3xl border border-dashed border-line bg-surface/70 px-5 py-8 text-center"
              data-testid="gov-proposal-rewards-empty"
            >
              <h2 className="text-base font-semibold text-foreground">
                {copy.gov.proposalRewards.emptyTitle}
              </h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted">
                {copy.gov.proposalRewards.emptyBody}
              </p>
            </div>
          ) : (
            <div
              className="overflow-hidden rounded-2xl border border-line bg-surface"
              data-testid="gov-proposal-rewards-list"
            >
              <div
                className={cn(
                  COLUMNS,
                  'items-center bg-elevated px-3 py-1.5 text-[11px] font-medium text-muted',
                )}
              >
                <span>{copy.gov.proposalRewards.tableProposal}</span>
                <span className="text-right">{copy.gov.proposalRewards.tableVotes}</span>
                <span className="text-right">{copy.gov.proposalRewards.tableAmount}</span>
                <span className="text-right">{copy.gov.proposalRewards.tableStatus}</span>
              </div>
              <ul className="divide-y divide-line">
                {rewards.rows.map((row) => (
                  <ProposalRewardRowItem
                    key={row.proposalId.toString()}
                    row={row}
                    title={titles.get(row.proposalId) ?? copy.common.unknown}
                    pool={rewards.roundPool}
                    totalVoteAmount={rewards.totalVoteAmount}
                    decimals={decimals}
                    burning={busy && write.activeProposalId === row.proposalId}
                    disabled={busy}
                    onBurn={burn}
                  />
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {write.error !== null ? (
        <p
          role="alert"
          data-testid="gov-proposal-rewards-error"
          className="text-sm text-danger-strong"
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
        title={copy.gov.proposalRewards.receiptTitle}
      >
        <div className="space-y-3" data-testid="gov-proposal-rewards-receipt">
          {write.receipt !== null && write.receipt.amount !== null ? (
            <p
              className="text-sm leading-6 text-foreground"
              data-testid="gov-proposal-rewards-receipt-line"
            >
              {copy.gov.proposalRewards.receiptLine(
                write.receipt.proposalId.toString(),
                formatTokenAmount(write.receipt.amount, decimals),
                symbol,
              )}
            </p>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            size="md"
            className="w-full"
            data-testid="gov-proposal-rewards-receipt-close"
            onClick={write.closeReceipt}
          >
            {copy.gov.receipt.close}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  testId,
}: {
  readonly label: string;
  readonly value: string;
  readonly testId: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-foreground" data-testid={testId}>
        {value}
      </p>
    </div>
  );
}

function ProposalRewardRowItem({
  row,
  title,
  pool,
  totalVoteAmount,
  decimals,
  burning,
  disabled,
  onBurn,
}: {
  readonly row: ProposalRewardRow;
  readonly title: string;
  readonly pool: bigint | undefined;
  readonly totalVoteAmount: bigint | undefined;
  readonly decimals: number | undefined;
  readonly burning: boolean;
  readonly disabled: boolean;
  readonly onBurn: (proposalId: bigint) => void;
}) {
  const view = proposalRewardRowView(row);
  const amount = proposalRewardRowAmount(row, pool, totalVoteAmount);
  const id = row.proposalId.toString();
  return (
    <li
      data-testid={`gov-proposal-rewards-row-${id}`}
      className={cn(COLUMNS, 'items-start px-3 py-2.5')}
    >
      <span
        className="min-w-0 truncate text-xs font-medium text-foreground"
        data-testid={`gov-proposal-rewards-row-title-${id}`}
      >{`#${id} ${title}`}</span>
      <span
        className="break-words text-right font-mono text-[11px] leading-4 text-muted"
        data-testid={`gov-proposal-rewards-row-votes-${id}`}
      >
        {`${formatTokenAmount(row.voteAmount, GOV_VOTE_DECIMALS)} / ${formatTokenAmount(
          row.minVoteAmount,
          GOV_VOTE_DECIMALS,
        )}`}
      </span>
      <span
        className="truncate text-right font-mono text-[11px] leading-4 text-foreground"
        data-testid={`gov-proposal-rewards-row-amount-${id}`}
      >
        {formatTokenAmount(amount, decimals)}
      </span>
      <span
        className={cn('text-right text-[11px] font-medium leading-4', TONE_CLASS[view.tone])}
        data-testid={`gov-proposal-rewards-row-status-${id}`}
      >
        {view.status}
      </span>
      <div className="col-span-4">
        <p
          className="text-[11px] leading-4 text-muted"
          data-testid={`gov-proposal-rewards-row-hint-${id}`}
        >
          {view.hint}
        </p>
        {view.canBurn ? (
          <div className="mt-2">
            <Button
              type="button"
              variant="danger-outline"
              size="sm"
              data-testid={`gov-proposal-rewards-burn-${id}`}
              disabled={disabled}
              onClick={() => onBurn(row.proposalId)}
            >
              {burning ? copy.gov.proposalRewards.burning : copy.gov.proposalRewards.burn}
            </Button>
            <p
              className="mt-1.5 text-[11px] leading-4 text-muted"
              data-testid={`gov-proposal-rewards-burn-note-${id}`}
            >
              {copy.gov.proposalRewards.burnNote}
            </p>
          </div>
        ) : null}
      </div>
    </li>
  );
}
