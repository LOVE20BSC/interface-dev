import { useLocation } from 'react-router-dom';
import { NotFoundPage } from '@/pages/not-found/not-found-page';
import { GovPage } from '@/pages/gov/gov-page';
import { StakeLiquidityPage } from '@/pages/gov/stake-liquidity-page';
import { StakeTokenPage } from '@/pages/gov/stake-token-page';
import { UnstakePage } from '@/pages/gov/unstake-page';
import { StakeLiquidPage } from '@/pages/gov/stake-liquid-page';
import { VoteDetailPage } from '@/pages/gov/vote-detail-page';
import { VotePage } from '@/pages/gov/vote-page';
import { VoteRecordsPage } from '@/pages/gov/vote-records-page';
import { SubmitPage } from '@/pages/gov/submit-page';
import { RewardsPage } from '@/pages/gov/rewards-page';
import { ProposalRewardsPage } from '@/pages/gov/proposal-rewards-page';
import { GovPlaceholderPage } from '@/pages/gov/gov-placeholder-page';

/**
 * 治理域的单入口（/gov、/stake/*、以及 TKM 旧版的 /vote /verify /submit /acting /
 * action 占位页）。
 *
 * 这些页面全部只在进入治理域后才需要，合并成一个懒加载分区：首屏路由表只留一个
 * 入口，省下十几条 loader/route 的 eager 字节（首屏包体预算只有 160 kB）。
 */
export function GovSection() {
  const { pathname } = useLocation();
  // 去掉尾斜杠（旧库 Next.js 配置的是 trailingSlash，外部链接可能带 /）
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/gov') return <GovPage />;
  if (path === '/stake/liquidity') return <StakeLiquidityPage />;
  if (path === '/stake/staketoken') return <StakeTokenPage />;
  if (path === '/stake/unstake') return <UnstakePage />;
  if (path === '/stake/liquid') return <StakeLiquidPage />;
  if (path === '/gov/rewards') return <RewardsPage />;
  if (path === '/gov/proposal-rewards') return <ProposalRewardsPage />;
  if (path === '/vote/records') return <VoteRecordsPage />;
  if (path === '/vote') return <VotePage />;
  if (path.startsWith('/vote/')) return <VoteDetailPage />;
  if (path === '/submit' || path.startsWith('/submit/')) return <SubmitPage />;
  if (/^\/(verify|acting|action)(\/|$)/.test(path)) {
    return <GovPlaceholderPage />;
  }
  return <NotFoundPage />;
}
