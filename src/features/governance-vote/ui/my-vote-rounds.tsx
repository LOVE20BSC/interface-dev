import { copy } from '@/shared/config/copy-pages';
import { formatTokenAmount } from '@/shared/lib/format';
import { myVoteSharePercent } from '../lib/my-votes-share';
import type { MyVoteRound } from '@/entities/gov-core/model/use-my-votes';

/** 治理票是 18 位小数的数量（`Stake.govVotes`）。 */
const VOTE_DECIMALS = 18;

export interface MyVoteRoundsProps {
  readonly rounds: readonly MyVoteRound[];
  /** testid 前缀：治理首页的卡片与 `/vote/records` 各自一套，互不冲突。 */
  readonly testIdPrefix: string;
}

/**
 * 「我的投票记录」按轮分组的呈现（旧库 `/vote/records` 的内容）：
 * 每轮一行「治理第 R 轮 · 共投出 X 票」，轮内每条 = `#编号 标题` + 「我的投票 X」+「占本轮 Y%」。
 *
 * 治理首页的卡片（预览最近两轮）与独立页 `/vote/records`（可翻页）共用这一份渲染，
 * 避免两处各写一套而慢慢漂移。
 */
export function MyVoteRounds({ rounds, testIdPrefix }: MyVoteRoundsProps) {
  return (
    <ul className="mt-2 space-y-3" data-testid={`${testIdPrefix}-list`}>
      {rounds.map((item) => (
        <li key={item.round.toString()} data-testid={`${testIdPrefix}-round-${item.round}`}>
          <p
            className="text-xs text-muted"
            data-testid={`${testIdPrefix}-round-line-${item.round}`}
          >
            {copy.gov.myVotes.roundHeader(
              item.round.toString(),
              formatTokenAmount(item.myTotalVotes, VOTE_DECIMALS),
            )}
          </p>
          <ul className="mt-1 space-y-1.5 rounded-2xl bg-elevated/60 px-3 py-2">
            {item.entries.map((entry) => {
              // 占比 = 我在这个提案的票数 / 这个提案获得的总票数（owner 2026-11-21）。
              const share = myVoteSharePercent(entry.myVotes, entry.proposalTotalVotes);
              return (
                <li
                  key={entry.proposalId.toString()}
                  data-testid={`${testIdPrefix}-entry-${item.round}-${entry.proposalId}`}
                  className="text-sm text-foreground"
                >
                  <span className="block truncate">
                    {copy.gov.myVotes.entryLine(entry.proposalId.toString(), entry.title)}
                  </span>
                  <span className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
                    <span data-testid={`${testIdPrefix}-mine-${item.round}-${entry.proposalId}`}>
                      {copy.gov.myVotes.entryMine(formatTokenAmount(entry.myVotes, VOTE_DECIMALS))}
                    </span>
                    {share === undefined ? null : (
                      <span data-testid={`${testIdPrefix}-share-${item.round}-${entry.proposalId}`}>
                        {copy.gov.myVotes.entryShare(share)}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}
