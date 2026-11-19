import { Link } from 'react-router-dom';
import { copy } from '@/shared/config/copy-pages';
import { formatTokenAmount, UNKNOWN } from '@/shared/lib/format';
import { formatTinyPercent } from '@/shared/lib/format-tiny';
import { buttonStyles } from '@/shared/ui/button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';
import { useWalletConnection } from '@/features/connect-wallet/model/use-wallet-connection';
import {
  useGovContext,
  type GovContextValue,
} from '@/features/governance-stake/model/use-gov-context';
import { GovCommunityPanel } from '@/features/governance-stake/ui/gov-community-panel';
import { GovGate, GovTxFeedback } from '@/features/governance-stake/ui/gov-gate';
import { hasStakePosition, MyStakeSummary } from '@/features/governance-stake/ui/my-stake-summary';
import { StakeStatRow } from '@/features/governance-stake/ui/stake-controls';

const VOTE_DECIMALS = 18;

/**
 * 流动性质押数据（复刻 TKM `/stake/liquid`，只读）：社区流动性质押 + 我的明细 +
 * 「去质押」入口。旧版的「待分配手续费」两列在本协议里不存在（手续费按 LP 口径结算
 * 后回购销毁），改为展示手续费凭证与销毁量，并写明口径。
 */
export function StakeLiquidPage() {
  const ctx = useGovContext();
  const { isWrongChain } = useWalletConnection();
  const q = `?symbol=${encodeURIComponent(ctx.symbol)}`;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-foreground">{copy.gov.pageTitles.liquid}</h1>
      <GovGate ctx={ctx} isWrongChain={isWrongChain}>
        <GovTxFeedback ctx={ctx} />
        <LiquidBody ctx={ctx} q={q} />
      </GovGate>
    </div>
  );
}

function LiquidBody({ ctx, q }: { readonly ctx: GovContextValue; readonly q: string }) {
  const { token, parent } = ctx;
  if (token === undefined || parent === undefined) return null;

  const mySharePercent = (() => {
    if (ctx.member.govVotes === undefined || ctx.community.totalGovVotes === undefined)
      return undefined;
    if (ctx.community.totalGovVotes === 0n) return 0;
    return Number((ctx.member.govVotes * 10_000n) / ctx.community.totalGovVotes) / 100;
  })();

  return (
    <div className="space-y-4">
      <GovCommunityPanel
        community={ctx.community}
        params={ctx.params}
        token={token}
        parent={parent}
        myVotes={ctx.member.govVotes}
      />

      <Card data-testid="gov-liquid-mine">
        <CardTitle>{copy.gov.liquidPage.mineTitle}</CardTitle>
        <p className="mt-1 text-[11px] leading-4 text-muted">{copy.gov.liquidPage.feeNote}</p>
        {hasStakePosition(ctx.member) ? (
          <div className="mt-3">
            <StakeStatRow
              label={copy.gov.liquidPage.myShares}
              value={formatTokenAmount(ctx.member.liquidityShares, VOTE_DECIMALS)}
              testId="gov-liquid-my-shares"
            />
            <StakeStatRow
              label={copy.gov.liquidPage.mySharePercent}
              value={
                mySharePercent === undefined ? UNKNOWN : `${formatTinyPercent(mySharePercent)}%`
              }
              testId="gov-liquid-my-share"
            />
            <MyStakeSummary
              member={ctx.member}
              clock={ctx.clock}
              token={token}
              parent={parent}
              testIdPrefix="gov-liquid"
            />
          </div>
        ) : (
          <>
            <CardDescription>{copy.gov.liquidPage.empty}</CardDescription>
            <div className="mt-3">
              <Link to={`/stake/liquidity${q}`} className={buttonStyles('primary', 'md', 'w-full')}>
                {copy.gov.liquidPage.goStake}
              </Link>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
