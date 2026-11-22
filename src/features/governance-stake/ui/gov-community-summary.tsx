import { Link } from 'react-router-dom';
import { copy } from '@/shared/config/copy-pages';
import { formatTokenAmount } from '@/shared/lib/format';
import { Button, buttonStyles } from '@/shared/ui/button';
import { Card, CardDescription } from '@/shared/ui/card';
import type { StakeCommunity } from '@/entities/stake/model/use-stake-community';
import { GovStatCell } from '@/features/governance-stake/ui/gov-home-parts';

const VOTE_DECIMALS = 18;

export interface GovCommunitySummaryProps {
  readonly community: StakeCommunity;
  readonly tokenDecimals: number | undefined;
  /** 当前社区 symbol 的查询串，带在「本轮提案」入口上。 */
  readonly q: string;
}

/**
 * 治理首页「社区」tab 的摘要卡（owner 2026-11-18 20:05 按 TKM 旧版截图重排，
 * 23:20 再去掉「治理公示」标题/外框与两个质押入口）：
 *
 * 上面一个头条数字 + 一个行动入口按钮（投票中的行动；验证中的行动在新协议已不存在）+ 下面 2×2 统计。
 * 旧版头条是「预估年化收益率 APY」，本协议没有对应的只读 view（`Stake` 没有年化/
 * 奖励金额），按硬规则 4 不编数，换成同位置的真实口径「社区总治理权」；旧版的
 * 「预计新增铸币 / SL / ST 凭证」同样没有对应对象，换成社区份额、流动性凭证总量、
 * 本阶段有效加速份额与累计销毁量。
 *
 * 详细口径（手续费凭证、可撤出 LP、累计本金、手续费比例）仍在 `/stake/liquid` 的
 * `GovCommunityPanel` 里，首页只放截图里的四个数。
 */
export function GovCommunitySummary({ community, tokenDecimals, q }: GovCommunitySummaryProps) {
  if (community.status === 'error') {
    return (
      <Card data-testid="gov-community-panel">
        <CardDescription>{copy.gov.community.unavailable}</CardDescription>
        <div className="mt-4">
          <Button variant="secondary" size="md" onClick={community.refetch}>
            {copy.gov.stats.retry}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card data-testid="gov-community-panel">
      <div className="text-center">
        <p className="text-sm leading-5 text-muted">{copy.gov.home.communityVotes}</p>
        <p
          className="mt-1 break-words text-3xl font-semibold leading-10 text-brand-strong"
          data-testid="gov-community-votes"
        >
          {formatTokenAmount(community.totalGovVotes, VOTE_DECIMALS)}
        </p>
      </div>

      <div className="mt-4">
        {/*
          2026-11-22 修：这里原本链到旧库的 `/vote/actions`，投票改成一屏一个提案后
          该路径会落进 `/vote/*` 详情页并显示「没有找到这个提案」。入口改指 `/vote`，
          文案按新协议用「提案」而不是「行动」（`copy.gov.vote.roundTitle`）。
        */}
        <Link
          to={`/vote${q}`}
          data-testid="gov-entry-vote"
          className={buttonStyles('secondary', 'sm', 'w-full')}
        >
          {copy.gov.vote.roundTitle}
          <span aria-hidden="true"> &gt;&gt;</span>
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4">
        <GovStatCell
          label={copy.gov.home.communityShares}
          value={formatTokenAmount(community.totalLiquidityShares, VOTE_DECIMALS)}
          testId="gov-community-shares"
        />
        <GovStatCell
          label={copy.gov.home.communityLp}
          value={formatTokenAmount(community.totalLp, VOTE_DECIMALS)}
          testId="gov-community-total-lp"
        />
        <GovStatCell
          label={copy.gov.home.communityBoost}
          value={formatTokenAmount(community.totalValidBoostShares, tokenDecimals)}
          testId="gov-community-boost"
        />
        <GovStatCell
          label={copy.gov.home.communityBurned}
          value={formatTokenAmount(community.totalBurnedToken, tokenDecimals)}
          testId="gov-community-burned"
        />
      </div>
    </Card>
  );
}
