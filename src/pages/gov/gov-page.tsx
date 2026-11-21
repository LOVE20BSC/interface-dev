import { useState } from 'react';
import { Link } from 'react-router-dom';
import { copy } from '@/shared/config/copy-pages';
import { cn } from '@/shared/lib/cn';
import { formatTokenAmount, UNKNOWN } from '@/shared/lib/format';

import { buttonStyles } from '@/shared/ui/button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';
import { useWalletConnection } from '@/features/connect-wallet/model/use-wallet-connection';
import {
  useGovContext,
  type GovContextValue,
} from '@/features/governance-stake/model/use-gov-context';
import { govSharePercent } from '@/features/governance-stake/lib/gov-share';
import { phaseDurationText, phasesValueText } from '@/features/governance-stake/lib/phase-duration';
import { GovCommunitySummary } from '@/features/governance-stake/ui/gov-community-summary';
import { GovGate, GovTxFeedback } from '@/features/governance-stake/ui/gov-gate';
import { GovStakeLinks, GovStatCell } from '@/features/governance-stake/ui/gov-home-parts';
import { GovIntro } from '@/features/governance-stake/ui/gov-intro';
import { GovQueryPanel } from '@/features/governance-stake/ui/gov-query-panel';
import { MyVotesCard } from '@/features/governance-vote/ui/my-votes-card';
import { hasStakePosition } from '@/features/governance-stake/ui/my-stake-summary';
import { StakeStateCard } from '@/features/governance-stake/ui/stake-controls';

const VOTE_DECIMALS = 18;

type HomeTab = 'mine' | 'community';

/**
 * 治理首页（复刻 TKM `/gov`）：「我的」「社区」两个 tab。
 *
 * owner 2026-11-18 20:05 给了旧版两张截图，要求这两个 tab 的版面照它排：
 * - 「我的」：2×2 统计（有效治理权 / 承诺解锁期 / 治理权占比 / 加速质押占比）
 *   → 两个质押入口 → 「铸造治理激励」；
 * - 「社区」：一个头条数字 → 一个行动入口（投票中的行动；验证中的行动新协议不存在）
 *   → 2×2 统计。
 * 有仓位时的「我的流动性质押」明细卡已按 owner 要求挪到 `/me` 的「质押资产」标签；
 * 旧版的 APY / 预计新增铸币 / SL·ST 凭证在本协议没有对应只读 view，
 * 按硬规则 4 不编数，换成真实口径（见 `GovCommunitySummary` 注释）。
 *
 * 旧版按 `validGovVotes(token, account) > 0` 分叉；本协议按 `govVotes(token, 阶段,
 * memberId)`，主体是身份 NFT 而不是钱包地址。
 */
export function GovPage() {
  const ctx = useGovContext();
  const { isWrongChain } = useWalletConnection();
  const [tab, setTab] = useState<HomeTab>('mine');

  const q = `?symbol=${encodeURIComponent(ctx.symbol)}`;

  return (
    <div className="space-y-4">
      <GovGate ctx={ctx} isWrongChain={isWrongChain}>
        <GovTxFeedback ctx={ctx} />

        <div
          role="tablist"
          aria-label={copy.gov.pageTitles.home}
          className="grid grid-cols-2 gap-1 rounded-2xl border border-line bg-elevated p-1 text-xs"
        >
          {(['mine', 'community'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              data-testid={`gov-home-tab-${value}`}
              onClick={() => setTab(value)}
              className={cn(
                'rounded-xl px-2 py-2 font-medium transition-colors',
                tab === value
                  ? 'bg-surface text-brand-strong shadow-soft'
                  : 'text-muted hover:text-foreground',
              )}
            >
              {copy.gov.home.tabs[value]}
            </button>
          ))}
        </div>

        {tab === 'mine' ? <MineTab ctx={ctx} q={q} /> : <CommunityTab ctx={ctx} />}
      </GovGate>
    </div>
  );
}

function MineTab({ ctx, q }: { readonly ctx: GovContextValue; readonly q: string }) {
  if (ctx.member.status === 'error') {
    return (
      <StakeStateCard
        testId="gov-my-error"
        title={copy.gov.stats.errorTitle}
        description={copy.gov.stats.errorBody}
      >
        <button type="button" className={buttonStyles('secondary', 'md')} onClick={ctx.retry}>
          {copy.gov.stats.retry}
        </button>
      </StakeStateCard>
    );
  }

  if (ctx.member.status === 'loading' || ctx.member.status === 'idle') {
    return (
      <StakeStateCard
        testId="gov-my-loading"
        title={copy.gov.mine.title}
        description={copy.gov.stats.loading}
      />
    );
  }

  if (!hasStakePosition(ctx.member)) {
    return (
      <div className="space-y-4">
        <div data-testid="gov-my-assets">
          <Card data-testid="gov-become-governor">
            <CardTitle>{copy.gov.home.becomeTitle}</CardTitle>
            <CardDescription>{copy.gov.home.becomeBody}</CardDescription>
            <div className="mt-3">
              <Link to={`/stake/liquidity${q}`} className={buttonStyles('primary', 'md', 'w-full')}>
                {copy.gov.home.becomeAction}
              </Link>
            </div>
          </Card>
        </div>
        <GovIntro />
      </div>
    );
  }

  // 已申请解锁：治理权清零、四项数据不再显示，只给状态与去解锁页的入口（owner 2026-11-19）。
  if ((ctx.member.unlockRequestPhase ?? 0n) > 0n) {
    return (
      <div className="space-y-4">
        <Card data-testid="gov-my-unlocking">
          <CardTitle>{copy.gov.mine.unlockingTitle}</CardTitle>
          <CardDescription>{copy.gov.mine.unlockingBody}</CardDescription>
          <div className="mt-3">
            <Link
              to={`/stake/unstake${q}`}
              data-testid="gov-my-unlocking-link"
              className={buttonStyles('primary', 'md', 'w-full')}
            >
              {copy.gov.mine.unlockProgressLink}
            </Link>
          </div>
        </Card>
        <GovIntro />
      </div>
    );
  }

  const phases = ctx.member.promisedWaitingPhases;
  const myShare = govSharePercent(ctx.member.govVotes, ctx.community.totalGovVotes);
  const boostShare = govSharePercent(
    ctx.member.validBoostShares,
    ctx.community.totalValidBoostShares,
  );
  const phasesDuration =
    phases === undefined ? null : phaseDurationText(phases, ctx.clock.secondsPerPhase ?? null);

  return (
    <div className="space-y-4">
      <Card data-testid="gov-my-assets">
        <div className="grid grid-cols-2 gap-x-3 gap-y-4">
          <GovStatCell
            label={copy.gov.home.myVotes}
            value={formatTokenAmount(ctx.member.govVotes, VOTE_DECIMALS)}
            testId="gov-my-votes"
          />
          <GovStatCell
            label={copy.gov.home.myPhases}
            value={phases === undefined ? UNKNOWN : phasesValueText(phases)}
            note={phasesDuration ?? undefined}
            testId="gov-my-phases-summary"
          />
          <GovStatCell
            label={copy.gov.home.myShare}
            value={myShare === undefined ? UNKNOWN : `${myShare}%`}
            testId="gov-my-share"
          />
          <GovStatCell
            label={copy.gov.home.myBoostShare}
            value={boostShare === undefined ? UNKNOWN : `${boostShare}%`}
            testId="gov-my-boost-share"
          />
        </div>

        <div className="mt-4">
          <GovStakeLinks q={q} />
        </div>

        <Link
          to={`/gov/rewards${q}`}
          data-testid="gov-my-rewards-link"
          className={`${buttonStyles('secondary', 'md', 'w-full')} mt-4`}
        >
          {copy.gov.home.mintRewardAction}
          <span aria-hidden="true"> &gt;&gt;</span>
        </Link>
      </Card>

      {/* owner 2026-11-21：仿旧库 `MyVotingPanel` + `/vote/records`，加一张「我的投票」卡。 */}
      <MyVotesCard
        tokenAddress={ctx.token?.address}
        memberId={ctx.memberId}
        round={ctx.clock.currentPhase}
        symbol={ctx.symbol}
      />

      <GovIntro />
    </div>
  );
}

function CommunityTab({ ctx }: { readonly ctx: GovContextValue }) {
  const q = `?symbol=${encodeURIComponent(ctx.symbol)}`;
  return (
    <div className="space-y-4">
      <GovCommunitySummary community={ctx.community} tokenDecimals={ctx.token?.decimals} q={q} />
      <GovQueryPanel ctx={ctx} />
    </div>
  );
}
