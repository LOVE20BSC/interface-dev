import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { HexAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import {
  isProposalRewardEligible,
  minProposalVoteAmount,
  validateVoteAllocation,
} from '@/domain/gov-core';
import { formatTokenAmount } from '@/shared/lib/format';
import { formatSharePercent } from '@/shared/lib/share-percent';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';
import { CopyableAddress } from '@/shared/ui/copyable-address';
import { Sheet } from '@/shared/ui/sheet';
import { Skeleton } from '@/shared/ui/skeleton';
import { TxStuckHint } from '@/shared/ui/tx-stuck-hint';
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

  const noPower = power.status === 'ready' && power.maxVoteAmount === 0n;
  const exhausted = !noPower && remaining === 0n;

  return (
    <div className="space-y-4">
      {/* 0. 投多少票：输入 + 快捷百分比 + 提交（owner 2026-11-22 布局） */}
      {noPower ? (
        <VotePowerCard power={power} symbol={symbol} testId="gov-vote-detail-power" />
      ) : null}
      {exhausted ? (
        <Card data-testid="gov-vote-detail-exhausted">
          <CardDescription>{copy.gov.vote.quotaUsed}</CardDescription>
          <Link
            to={`/stake/liquidity?symbol=${encodeURIComponent(symbol)}`}
            className="mt-3 inline-flex h-11 items-center justify-center rounded-2xl bg-brand px-4 text-sm font-medium text-on-brand"
          >
            {copy.gov.vote.noPowerAction}
          </Link>
        </Card>
      ) : null}
      {noPower || exhausted ? null : (
        <Card data-testid="gov-vote-detail-quick">
          <label htmlFor="gov-vote-detail-amount" className="block text-xs font-medium text-muted">
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
          {(localError ?? write.error !== null) ? (
            <p
              role="alert"
              data-testid="gov-vote-detail-error-text"
              className="mt-2 text-sm text-danger-strong"
            >
              {localError ?? write.error}
            </p>
          ) : null}
          <Button
            type="button"
            variant="primary"
            size="lg"
            className="mt-4 w-full"
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
        </Card>
      )}

      <TxStuckHint watch={write.watch} />

      {/* 1~3. 提案信息：编号 + 标题 + 内容 / 目标地址 + 创建人 + 本轮推举人 / 得票 + 两个占比 */}
      <ProposalInfoCard detail={detail} roundLabel={roundLabel} />

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

/**
 * 提案信息卡（owner 2026-11-22 布局）：
 * 1. 提案编号 + 标题 + 内容
 * 2. 提案目标地址 + 提案创建人 + 提案本轮推举人
 * 3. 当轮得票 + 「当轮总投票占比」+「总治理权占比」，并用徽标区分是否过了激励阈值
 *    （合约口径：`Mint._minProposalVoteAmount` = ceil(当轮总票数 × PROPOSAL_REWARD_MIN_VOTE_RATIO)，
 *    所以真正决定过线的是「当轮总投票占比」那一项；总治理权占比只作参考）。
 */
function ProposalInfoCard({
  detail,
  roundLabel,
}: {
  readonly detail: ProposalDetail;
  readonly roundLabel: string;
}) {
  const votes = detail.total;
  const thresholdVotes =
    detail.roundTotalVotes === undefined || detail.minVoteRatio === undefined
      ? undefined
      : minProposalVoteAmount(detail.roundTotalVotes, detail.minVoteRatio);
  const passed =
    votes === undefined || thresholdVotes === undefined
      ? undefined
      : isProposalRewardEligible(votes, thresholdVotes);
  const roundShare = formatSharePercent(votes, detail.roundTotalVotes);
  const govShare = formatSharePercent(votes, detail.roundGovVotes);
  const ratioText = formatSharePercent(detail.minVoteRatio, 10n ** 18n);

  return (
    <Card data-testid="gov-vote-detail-proposal">
      {/* 1. 编号 + 标题 + 内容 */}
      <div className="flex items-start gap-2">
        <span className="shrink-0 font-mono text-xs text-muted" data-testid="gov-vote-detail-id">
          #{detail.proposalId.toString()}
        </span>
        <h2
          className="min-w-0 break-words text-base font-semibold text-foreground"
          data-testid="gov-vote-detail-proposal-title"
        >
          {detail.title ?? copy.common.unknown}
        </h2>
      </div>
      <CardDescription className="mt-2 whitespace-pre-wrap" data-testid="gov-vote-detail-body">
        {detail.details ?? copy.common.unknown}
      </CardDescription>

      {/* 2. 目标地址 + 创建人 + 本轮推举人 */}
      <dl className="mt-4 grid gap-2 text-xs leading-5 sm:grid-cols-3">
        <div>
          <dt className="text-muted">{copy.gov.vote.detail.targetLabel}</dt>
          <dd className="mt-0.5 font-medium text-foreground" data-testid="gov-vote-detail-target">
            {detail.target === undefined ? (
              copy.common.unknown
            ) : (
              <CopyableAddress
                address={detail.target}
                label={copy.gov.vote.detail.targetLabel}
                className="text-foreground"
              />
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted">{copy.gov.vote.detail.authorLabel}</dt>
          <dd className="mt-0.5 font-medium text-foreground" data-testid="gov-vote-detail-author">
            {detail.authorId === undefined ? copy.common.unknown : `#${detail.authorId.toString()}`}
          </dd>
        </div>
        <div>
          <dt className="text-muted">{copy.gov.vote.detail.submitterLabel}</dt>
          <dd
            className="mt-0.5 font-medium text-foreground"
            data-testid="gov-vote-detail-submitter"
          >
            {detail.submitterId === undefined
              ? copy.common.unknown
              : `#${detail.submitterId.toString()}`}
          </dd>
        </div>
      </dl>

      {/* 3. 当轮得票 + 两个占比（阈值状态） */}
      <div className="mt-4 space-y-2 border-t border-line pt-3 text-xs leading-5">
        <p className="text-muted">
          <span data-testid="gov-vote-detail-round">{roundLabel}</span>
          {' · '}
          {copy.gov.vote.detail.roundVotesLabel}{' '}
          <span className="font-semibold text-foreground" data-testid="gov-vote-detail-total">
            {votes === undefined ? copy.common.unknown : formatTokenAmount(votes, VOTE_DECIMALS)}
          </span>{' '}
          {copy.gov.vote.powerUnit}
        </p>
        <p className="text-muted" data-testid="gov-vote-detail-mine">
          {detail.mine === undefined
            ? copy.common.unknown
            : copy.gov.vote.myVotesOn(formatTokenAmount(detail.mine, VOTE_DECIMALS))}
        </p>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted">{copy.gov.vote.detail.roundShareLabel}</span>
          <span className="flex items-center gap-2">
            <span
              className="font-semibold text-foreground"
              data-testid="gov-vote-detail-round-share"
            >
              {roundShare === undefined ? copy.common.unknown : `${roundShare}%`}
            </span>
            <Badge
              tone={passed === true ? 'success' : passed === false ? 'warning' : 'neutral'}
              data-testid="gov-vote-detail-threshold-state"
            >
              {passed === true
                ? copy.gov.vote.detail.thresholdPassed
                : passed === false
                  ? copy.gov.vote.detail.thresholdFailed
                  : copy.gov.vote.detail.thresholdUnknown}
            </Badge>
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted">{copy.gov.vote.detail.govShareLabel}</span>
          <span className="flex items-center gap-2">
            <span className="font-semibold text-foreground" data-testid="gov-vote-detail-gov-share">
              {govShare === undefined ? copy.common.unknown : `${govShare}%`}
            </span>
            <Badge tone="neutral" data-testid="gov-vote-detail-gov-share-badge">
              {copy.gov.vote.detail.referenceBadge}
            </Badge>
          </span>
        </div>
        <p className="text-[11px] leading-4 text-muted" data-testid="gov-vote-detail-threshold">
          {ratioText === undefined || thresholdVotes === undefined
            ? copy.gov.vote.detail.thresholdUnknown
            : copy.gov.vote.detail.thresholdLine(
                `${ratioText}%`,
                formatTokenAmount(thresholdVotes, VOTE_DECIMALS),
              )}
        </p>
      </div>
    </Card>
  );
}
