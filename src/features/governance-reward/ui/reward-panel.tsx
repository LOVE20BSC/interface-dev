import { useState } from 'react';
import type { HexAddress } from '@/config/networks';
import { isGovRewardMintable, mintableRounds } from '@/domain/gov-core';
import { copy } from '@/shared/config/copy-pages';
import { formatTokenAmount } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';
import { Sheet } from '@/shared/ui/sheet';
import { TxStuckHint } from '@/shared/ui/tx-stuck-hint';
import type { GovRewardRow, GovRewards } from '@/entities/gov-core/model/use-gov-rewards';
import type { GovRewardReceipt } from '../lib/gov-reward-receipt';
import type { GovRewardWrite } from '../model/use-gov-reward-write';

/** 列表里没有在途轮次时的共享空数组（避免每次渲染新建）。 */
const NO_ROUNDS: readonly bigint[] = [];

/** 「加载更多轮次」时留在屏幕上的上一页快照：新一页在读期间不让列表整块消失。 */
interface KeptRows {
  readonly tokenAddress: HexAddress;
  readonly memberId: bigint;
  readonly rows: readonly GovRewardRow[];
}

export interface RewardPanelProps {
  readonly mintAddress: HexAddress;
  readonly tokenAddress: HexAddress;
  readonly memberId: bigint;
  readonly symbol: string;
  /** 社区代币精度；未知时传 `undefined`，金额显示「—」（绝不当成 0）。 */
  readonly decimals: number | undefined;
  readonly rewards: GovRewards;
  readonly write: GovRewardWrite;
  readonly onRetry: () => void;
}

/**
 * 治理激励面板：摘要（可铸造轮数 + 批量铸造）→ 倒序轮次表 → 分页 footer → 回执。
 *
 * 口径（与 `entities/gov-core/model/use-gov-rewards` 一致）：
 * - 列表是**已加载**的轮次，从新到旧；「批量铸造」只收 `mintableRounds`（确认可铸），
 *   不承诺「一次铸完所有轮」——还没扫到的轮次不在数组里；
 * - 状态列三态：已铸 / 没有投票 / 可铸（按钮）。投票了但这一轮池子为 0 的边角
 *   （合约会以 `MemberRewardRoundedToZero` / `MemberRewardPoolEmpty` 拒绝）没有对应文案，
 *   按「不可铸」渲染成禁用按钮，不编状态词；
 * - 一个写操作在途时所有铸造按钮禁用，并让涉及的行显示「铸造中…」；
 * - 回执数字来自回执里的 `GovRewardMinted` 事件，拿不到就只显示标题与关闭按钮。
 */
export function RewardPanel({
  mintAddress,
  tokenAddress,
  memberId,
  symbol,
  decimals,
  rewards,
  write,
  onRetry,
}: RewardPanelProps) {
  const [keptRows, setKeptRows] = useState<KeptRows | null>(null);
  // 在途 = 正在签名/等待上链；回执面板还开着时也不许再点一次铸造（回执关掉才算这笔结束）。
  const busy = write.stage !== 'idle' || write.receipt !== null;
  const activeRounds = write.stage === 'idle' ? NO_ROUNDS : write.submittingRounds;

  const loadingMore =
    rewards.status === 'loading' &&
    rewards.rows.length === 0 &&
    keptRows !== null &&
    keptRows.tokenAddress === tokenAddress &&
    keptRows.memberId === memberId;
  const rows = loadingMore && keptRows !== null ? keptRows.rows : rewards.rows;
  const mintable = mintableRounds(rows);

  const submit = (rounds: readonly bigint[]): void => {
    if (rounds.length === 0) return;
    write.submit({ mintAddress, tokenAddress, memberId, rounds });
  };

  const loadMore = (): void => {
    if (rows.length > 0) setKeptRows({ tokenAddress, memberId, rows });
    rewards.loadMore();
  };

  if (rewards.status === 'error') {
    return (
      <div className="space-y-3" data-testid="gov-rewards-error">
        <p role="alert" className="text-sm text-danger-strong">
          {copy.gov.rewards.readFailed}
        </p>
        <Button type="button" variant="secondary" size="md" onClick={onRetry}>
          {copy.gov.rewards.retry}
        </Button>
      </div>
    );
  }

  if (rows.length === 0) {
    if (rewards.status === 'loading') {
      return (
        <p className="text-sm text-muted" data-testid="gov-rewards-loading">
          {copy.gov.rewards.loading}
        </p>
      );
    }
    return (
      <Card data-testid="gov-rewards-empty">
        <CardTitle>{copy.gov.rewards.emptyTitle}</CardTitle>
        <CardDescription>{copy.gov.rewards.emptyBody}</CardDescription>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card data-testid="gov-rewards-summary">
        <CardTitle>{copy.gov.rewards.summaryTitle}</CardTitle>
        <p
          className="mt-3 text-2xl font-semibold text-foreground"
          data-testid="gov-rewards-mintable-count"
        >
          {copy.gov.rewards.summaryRounds(mintable.length.toString())}
        </p>
        <Button
          type="button"
          variant="primary"
          size="lg"
          className="mt-4 w-full"
          data-testid="gov-rewards-mint-all"
          disabled={mintable.length === 0 || busy}
          onClick={() => submit(mintable)}
        >
          {copy.gov.rewards.mintAll(mintable.length.toString())}
        </Button>
        {write.stage !== 'idle' ? (
          <p className="mt-2 text-xs text-muted" data-testid="gov-rewards-stage">
            {write.stage === 'wallet' ? copy.gov.rewards.waitingWallet : copy.gov.rewards.pending}
          </p>
        ) : null}
        {write.error !== null ? (
          <p
            role="alert"
            className="mt-2 text-sm text-danger-strong"
            data-testid="gov-rewards-error-text"
          >
            {write.error}
          </p>
        ) : null}
      </Card>

      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full text-left text-sm" data-testid="gov-rewards-list">
          <thead className="bg-elevated text-xs text-muted">
            <tr>
              <th scope="col" className="px-3 py-2.5 font-medium">
                {copy.gov.rewards.tableRound}
              </th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">
                {copy.gov.rewards.tableVote}
              </th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">
                {copy.gov.rewards.tableBoost}
              </th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">
                {copy.gov.rewards.tableStatus}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <RewardRow
                key={row.round.toString()}
                row={row}
                decimals={decimals}
                busy={busy}
                minting={activeRounds.includes(row.round)}
                onMint={() => submit([row.round])}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-2">
        {loadingMore ? (
          <p className="text-center text-xs text-muted" data-testid="gov-rewards-loading-more">
            {copy.gov.rewards.loadingMore}
          </p>
        ) : rewards.hasMore ? (
          <Button
            type="button"
            variant="secondary"
            size="md"
            className="w-full"
            data-testid="gov-rewards-load-more"
            onClick={loadMore}
          >
            {copy.gov.rewards.loadMore}
          </Button>
        ) : (
          <p className="text-center text-xs text-muted" data-testid="gov-rewards-exhausted">
            {copy.gov.rewards.exhausted}
          </p>
        )}
      </div>

      <TxStuckHint watch={write.watch} />

      <Sheet
        open={write.receipt !== null}
        onOpenChange={(open) => {
          if (!open) write.closeReceipt();
        }}
        title={copy.gov.rewards.receiptTitle}
      >
        <div className="space-y-3" data-testid="gov-rewards-receipt">
          {write.receipt !== null ? (
            <ReceiptLine receipt={write.receipt} symbol={symbol} decimals={decimals} />
          ) : null}
          <Button
            type="button"
            variant="secondary"
            size="md"
            className="w-full"
            data-testid="gov-rewards-receipt-close"
            onClick={write.closeReceipt}
          >
            {copy.gov.receipt.close}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

interface RewardRowProps {
  readonly row: GovRewardRow;
  readonly decimals: number | undefined;
  readonly busy: boolean;
  readonly minting: boolean;
  readonly onMint: () => void;
}

function RewardRow({ row, decimals, busy, minting, onMint }: RewardRowProps) {
  const round = row.round.toString();
  return (
    <tr className="border-t border-line bg-surface" data-testid={`gov-rewards-row-${round}`}>
      <td className="whitespace-nowrap px-3 py-3 text-foreground">
        {copy.gov.rewards.roundLabel(round)}
      </td>
      <td
        className="whitespace-nowrap px-3 py-3 text-right text-foreground"
        data-testid={`gov-rewards-vote-${round}`}
      >
        {formatTokenAmount(row.voteReward, decimals)}
      </td>
      <td
        className="whitespace-nowrap px-3 py-3 text-right text-foreground"
        data-testid={`gov-rewards-boost-${round}`}
      >
        {formatTokenAmount(row.boostReward, decimals)}
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-right">
        <StatusCell row={row} busy={busy} minting={minting} onMint={onMint} />
      </td>
    </tr>
  );
}

interface StatusCellProps {
  readonly row: GovRewardRow;
  readonly busy: boolean;
  readonly minting: boolean;
  readonly onMint: () => void;
}

function StatusCell({ row, busy, minting, onMint }: StatusCellProps) {
  const round = row.round.toString();
  if (row.minted) {
    return <span className="text-xs text-muted">{copy.gov.rewards.minted}</span>;
  }
  if (row.myVoteAmount === 0n) {
    return <span className="text-xs text-muted">{copy.gov.rewards.noVote}</span>;
  }
  // 投过票但这一轮算出来是 0（池子空 / 向下取整成 0）时合约也拒绝铸造：没有对应文案，
  // 按不可铸渲染（金额列显示 0），不让用户点出一笔必然回滚的交易。
  const mintable = isGovRewardMintable(row.voteReward, row.boostReward, row.minted);
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      data-testid={`gov-rewards-mint-${round}`}
      disabled={busy || !mintable}
      onClick={onMint}
    >
      {minting ? copy.gov.rewards.mintingOne : copy.gov.rewards.mint}
    </Button>
  );
}

interface ReceiptLineProps {
  readonly receipt: GovRewardReceipt;
  readonly symbol: string;
  readonly decimals: number | undefined;
}

function ReceiptLine({ receipt, symbol, decimals }: ReceiptLineProps) {
  if (receipt.amount === undefined) return null;
  const amount = formatTokenAmount(receipt.amount, decimals);
  const [first] = receipt.rounds;
  const line =
    receipt.rounds.length === 1 && first !== undefined
      ? copy.gov.rewards.receiptLineOne(first.toString(), amount, symbol)
      : copy.gov.rewards.receiptLineMany(receipt.rounds.length.toString(), amount, symbol);
  return (
    <p className="text-sm text-foreground" data-testid="gov-rewards-receipt-line">
      {line}
    </p>
  );
}
