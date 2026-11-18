import { copy } from '@/shared/config/copy-pages';
import { formatPercent, formatTinyPercent, formatTokenAmount, UNKNOWN } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';
import type { StakeCommunity } from '@/entities/stake/model/use-stake-community';
import type { StakeParams } from '@/entities/stake/model/use-stake-params';
import { StakeStatRow } from '@/features/governance-stake/ui/stake-controls';

const VOTE_DECIMALS = 18;

export interface GovCommunityPanelProps {
  readonly community: StakeCommunity;
  readonly params: StakeParams;
  readonly token: { readonly symbol: string; readonly decimals: number | undefined };
  readonly parent: { readonly symbol: string; readonly decimals: number | undefined };
  readonly myVotes: bigint | undefined;
}

/**
 * 社区治理数据（TKM 旧版 `GovernanceDataPanel` 的等价块，按新协议换口径）。
 *
 * 旧版的 APY / 待分配代币 / 验证激励 在本协议里没有对应对象，按「无法适配」不实现；
 * 这里给的都是合约真实 view：治理权总量、份额、LP 口径、累计本金、加速份额、销毁量。
 */
export function GovCommunityPanel({
  community,
  params,
  token,
  parent,
  myVotes,
}: GovCommunityPanelProps) {
  const feeRatio =
    params.feeSettlementRatio === undefined
      ? undefined
      : formatPercent(Number(params.feeSettlementRatio) / 1e16);

  const mySharePercent = (() => {
    if (myVotes === undefined || community.totalGovVotes === undefined) return undefined;
    if (community.totalGovVotes === 0n) return 0;
    return Number((myVotes * 10_000n) / community.totalGovVotes) / 100;
  })();

  if (community.status === 'error') {
    return (
      <Card data-testid="gov-community-panel">
        <CardTitle>{copy.gov.community.title}</CardTitle>
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
      <CardTitle>{copy.gov.community.title}</CardTitle>
      <div className="mt-3">
        <StakeStatRow
          label={copy.gov.community.totalVotes}
          value={formatTokenAmount(community.totalGovVotes, VOTE_DECIMALS)}
          testId="gov-community-votes"
        />
        <StakeStatRow
          label={copy.gov.community.totalShares}
          value={formatTokenAmount(community.totalLiquidityShares, VOTE_DECIMALS)}
          testId="gov-community-shares"
        />
        <StakeStatRow
          label={copy.gov.community.myShare}
          value={mySharePercent === undefined ? UNKNOWN : `${formatTinyPercent(mySharePercent)}%`}
          testId="gov-community-share"
        />
        <StakeStatRow
          label={copy.gov.liquidPage.totalLp}
          value={formatTokenAmount(community.totalLp, VOTE_DECIMALS)}
          testId="gov-community-total-lp"
        />
        <StakeStatRow
          label={copy.gov.liquidPage.withdrawableLp}
          value={formatTokenAmount(community.withdrawableLp, VOTE_DECIMALS)}
          testId="gov-community-withdrawable-lp"
        />
        <StakeStatRow
          label={copy.gov.liquidPage.feeLp}
          value={formatTokenAmount(community.feeLp, VOTE_DECIMALS)}
          testId="gov-community-fee-lp"
        />
        <StakeStatRow
          label={copy.gov.liquidPage.liquidityPrincipal}
          value={formatTokenAmount(community.liquidityTokenAmount, token.decimals)}
          testId="gov-community-principal"
        />
        <StakeStatRow
          label={copy.gov.community.totalBoost}
          value={formatTokenAmount(community.totalValidBoostShares, token.decimals)}
          testId="gov-community-boost"
        />
        <StakeStatRow
          label={copy.gov.liquidPage.burned}
          value={formatTokenAmount(community.totalBurnedToken, token.decimals)}
          testId="gov-community-burned"
        />
        {feeRatio !== undefined ? (
          <StakeStatRow
            label={copy.gov.liquidPage.feeNote}
            value={`${feeRatio}%`}
            testId="gov-community-fee-ratio"
          />
        ) : null}
      </div>
      <p className="mt-2 text-[11px] leading-4 text-muted">
        {copy.gov.liquidPage.tokenAmount(token.symbol)} /{' '}
        {copy.gov.liquidPage.parentAmount(parent.symbol)}：
        {formatTokenAmount(community.tokenAmountForLiquidity, token.decimals)} /{' '}
        {formatTokenAmount(community.parentTokenAmountForLiquidity, parent.decimals)}
      </p>
    </Card>
  );
}
