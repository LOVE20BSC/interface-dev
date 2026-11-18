import { Link } from 'react-router-dom';
import { configuredAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { Card, CardTitle } from '@/shared/ui/card';
import { useWalletConnection } from '@/features/connect-wallet/model/use-wallet-connection';
import { useGovContext } from '@/features/governance-stake/model/use-gov-context';
import { GovGate, GovTxFeedback } from '@/features/governance-stake/ui/gov-gate';
import { GovIntro, GovTips } from '@/features/governance-stake/ui/gov-intro';
import { hasStakePosition } from '@/features/governance-stake/ui/my-stake-summary';
import { PromisedPhasesCard } from '@/features/governance-stake/ui/promised-phases-card';
import { MyStakeSummary } from '@/features/governance-stake/ui/my-stake-summary';
import { StakeLiquidityPanel } from '@/features/governance-stake/ui/stake-liquidity-panel';

/**
 * 流动性质押（复刻 TKM `/stake/stakelp`）：治理权说明 → 我的流动性质押 → 质押表单
 * （智能模式：单币即可，或关掉后两侧按池子比例自动联动）→ 提示。
 */
export function StakeLpPage() {
  const ctx = useGovContext();
  const { isWrongChain } = useWalletConnection();
  const hub = configuredAddress('hub');
  const q = `?symbol=${encodeURIComponent(ctx.symbol)}`;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-foreground">{copy.gov.pageTitles.stakeLp}</h1>
      <GovGate ctx={ctx} isWrongChain={isWrongChain}>
        <GovTxFeedback ctx={ctx} />
        {/* owner 2026-11-18：已有流动性质押时，承诺解锁期放在最上面单独调整。 */}
        {hasStakePosition(ctx.member) ? <PromisedPhasesCard ctx={ctx} /> : null}
        <GovIntro />
        <StakeLpBody ctx={ctx} hub={hub} q={q} />
        <GovTips />
      </GovGate>
    </div>
  );
}

function StakeLpBody({
  ctx,
  hub,
  q,
}: {
  readonly ctx: ReturnType<typeof useGovContext>;
  readonly hub: `0x${string}` | undefined;
  readonly q: string;
}) {
  const { token, parent, stakeAddress, memberId } = ctx;
  if (
    token === undefined ||
    parent === undefined ||
    stakeAddress === undefined ||
    memberId === undefined
  ) {
    return null;
  }

  return (
    <div className="space-y-4">
      {hasStakePosition(ctx.member) ? (
        <Card data-testid="gov-page-my-stake">
          <div className="flex items-start justify-between gap-2">
            <CardTitle>{copy.gov.myLiquidityTitle}</CardTitle>
            <Link to={`/stake/unstake${q}`} className="text-xs font-medium text-brand-strong">
              {copy.gov.home.unstakeAction}
            </Link>
          </div>
          <div className="mt-3">
            <MyStakeSummary member={ctx.member} clock={ctx.clock} token={token} parent={parent} />
          </div>
        </Card>
      ) : null}

      <StakeLiquidityPanel
        token={token}
        parent={parent}
        stakeAddress={stakeAddress}
        hubAddress={hub}
        memberId={memberId}
        member={ctx.member}
        pool={ctx.pool}
        community={ctx.community}
        params={ctx.params}
        balances={ctx.balances}
        tx={ctx.tx}
        secondsPerPhase={ctx.clock.secondsPerPhase}
        disabled={
          ctx.tx.stage !== 'idle' || ctx.tx.approveStage !== 'idle' || ctx.tx.receipt !== null
        }
      />
    </div>
  );
}
