import { useState } from 'react';
import { Link } from 'react-router-dom';
import { copy } from '@/shared/config/copy-pages';
import { cn } from '@/shared/lib/cn';
import { buttonStyles } from '@/shared/ui/button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';
import { useWalletConnection } from '@/features/connect-wallet/model/use-wallet-connection';
import {
  useGovContext,
  type GovContextValue,
} from '@/features/governance-stake/model/use-gov-context';
import { GovCommunityPanel } from '@/features/governance-stake/ui/gov-community-panel';
import { GovGate, GovTxFeedback } from '@/features/governance-stake/ui/gov-gate';
import { GovIntro } from '@/features/governance-stake/ui/gov-intro';
import { GovPublicCard } from '@/features/governance-stake/ui/gov-public-card';
import { GovQueryPanel } from '@/features/governance-stake/ui/gov-query-panel';
import { hasStakePosition, MyStakeSummary } from '@/features/governance-stake/ui/my-stake-summary';
import { StakeActions } from '@/features/governance-stake/ui/stake-actions';

type HomeTab = 'mine' | 'community';

/**
 * 治理首页（复刻 TKM `/gov`）：「我的」「社区」两个 tab。
 *
 * - 我的：我的治理资产摘要（治理权 / 份额 / 解锁期 / 解锁状态）→ 有治理权时给出
 *   投票 / 验证 / 链群 / 发射 四张入口卡（对应页面本轮为占位）；没有治理权时给
 *   「立即成为治理者」引导 + 治理权说明。
 * - 社区：社区治理数据 + 治理权查询。
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
          aria-label={copy.gov.home.tabs.mine}
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
  const hasStake = hasStakePosition(ctx.member);
  const hasVotes = (ctx.member.govVotes ?? 0n) > 0n;

  return (
    <div className="space-y-4">
      <Card data-testid="gov-my-assets">
        <div className="flex items-start justify-between gap-2">
          <CardTitle>{copy.gov.home.myAssetsTitle}</CardTitle>
          <Link to={`/gov/rewards${q}`} className="text-xs font-medium text-brand-strong">
            {copy.gov.home.rewardsAction}
          </Link>
        </div>
        {hasStake ? (
          <>
            <div className="mt-3">
              <MyStakeSummary
                member={ctx.member}
                clock={ctx.clock}
                token={{ symbol: ctx.token?.symbol ?? '', decimals: ctx.token?.decimals }}
                parent={{ symbol: ctx.parent?.symbol ?? '', decimals: ctx.parent?.decimals }}
              />
            </div>
            <div className="mt-3">
              <StakeActions ctx={ctx} testIdPrefix="gov-home" />
            </div>
          </>
        ) : (
          <>
            <CardDescription>{copy.gov.mine.emptyBody}</CardDescription>
            <div className="mt-3">
              <Link to={`/stake/stakelp${q}`} className={buttonStyles('primary', 'md', 'w-full')}>
                {copy.gov.home.becomeAction}
              </Link>
            </div>
          </>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link to={`/stake/stakelp${q}`} className={buttonStyles('secondary', 'sm')}>
            {copy.gov.home.stakeLpAction}
          </Link>
          <Link to={`/stake/staketoken${q}`} className={buttonStyles('secondary', 'sm')}>
            {copy.gov.home.stakeBoostAction}
          </Link>
          <Link to={`/stake/unstake${q}`} className={buttonStyles('secondary', 'sm')}>
            {copy.gov.home.unstakeAction}
          </Link>
          <Link to={`/stake/liquid${q}`} className={buttonStyles('secondary', 'sm')}>
            {copy.gov.home.liquidAction}
          </Link>
        </div>
      </Card>

      {hasVotes ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <PlaceholderEntry
            title={copy.gov.home.votingCard}
            body={copy.gov.home.votingBody}
            action={copy.gov.home.votingAction}
            to={`/vote${q}`}
            testId="gov-entry-vote"
          />
          <PlaceholderEntry
            title={copy.gov.home.verifyingCard}
            body={copy.gov.home.verifyingBody}
            action={copy.gov.home.verifyingAction}
            to={`/verify${q}`}
            testId="gov-entry-verify"
          />
          <PlaceholderEntry
            title={copy.gov.home.groupsCard}
            body={copy.gov.home.groupsBody}
            action={copy.gov.home.groupsAction}
            to="/group"
            testId="gov-entry-groups"
          />
          <PlaceholderEntry
            title={copy.gov.home.deployCard}
            body={copy.gov.home.deployBody}
            action={copy.gov.home.deployAction}
            to="/apps"
            testId="gov-entry-deploy"
          />
        </div>
      ) : (
        <Card data-testid="gov-become-governor">
          <CardTitle>{copy.gov.home.becomeTitle}</CardTitle>
          <CardDescription>{copy.gov.home.becomeBody}</CardDescription>
          <div className="mt-3">
            <Link to={`/stake/stakelp${q}`} className={buttonStyles('primary', 'md', 'w-full')}>
              {copy.gov.home.becomeAction}
            </Link>
          </div>
        </Card>
      )}

      <GovPublicCard q={q} />
      <GovIntro />
    </div>
  );
}

function CommunityTab({ ctx }: { readonly ctx: GovContextValue }) {
  const q = `?symbol=${encodeURIComponent(ctx.symbol)}`;
  return (
    <div className="space-y-4">
      <GovPublicCard q={q} />
      <GovCommunityPanel
        community={ctx.community}
        params={ctx.params}
        token={{ symbol: ctx.token?.symbol ?? '', decimals: ctx.token?.decimals }}
        parent={{ symbol: ctx.parent?.symbol ?? '', decimals: ctx.parent?.decimals }}
        myVotes={ctx.member.govVotes}
      />
      <GovQueryPanel ctx={ctx} />
    </div>
  );
}

function PlaceholderEntry({
  title,
  body,
  action,
  to,
  testId,
}: {
  readonly title: string;
  readonly body: string;
  readonly action: string;
  readonly to: string;
  readonly testId: string;
}) {
  return (
    <Card data-testid={testId}>
      <CardTitle>{title}</CardTitle>
      <CardDescription>{body}</CardDescription>
      <div className="mt-3">
        <Link to={to} className={buttonStyles('secondary', 'sm', 'w-full')}>
          {action}
        </Link>
      </div>
    </Card>
  );
}
