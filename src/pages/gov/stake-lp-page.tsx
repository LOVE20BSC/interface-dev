import { configuredAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { useWalletConnection } from '@/features/connect-wallet/model/use-wallet-connection';
import { useGovContext } from '@/features/governance-stake/model/use-gov-context';
import { GovGate, GovTxFeedback } from '@/features/governance-stake/ui/gov-gate';
import { GovRulesCard } from '@/features/governance-stake/ui/gov-intro';
import { hasStakePosition } from '@/features/governance-stake/ui/my-stake-summary';
import { PromisedPhasesCard } from '@/features/governance-stake/ui/promised-phases-card';
import { StakeLiquidityPanel } from '@/features/governance-stake/ui/stake-liquidity-panel';

/**
 * 流动性质押（复刻 TKM `/stake/stakelp`）：治理权说明 → 我的流动性质押 → 质押表单
 * （智能模式：单币即可，或关掉后两侧按池子比例自动联动）→ 提示。
 */
export function StakeLpPage() {
  const ctx = useGovContext();
  const { isWrongChain } = useWalletConnection();
  const hub = configuredAddress('hub');

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-foreground">{copy.gov.pageTitles.stakeLp}</h1>
      <GovGate ctx={ctx} isWrongChain={isWrongChain}>
        <GovTxFeedback ctx={ctx} />
        {/* owner 2026-11-18：已有流动性质押时，承诺解锁期放在最上面单独调整。 */}
        {hasStakePosition(ctx.member) ? <PromisedPhasesCard ctx={ctx} /> : null}
        <StakeLiquidityForm ctx={ctx} hub={hub} />
        {/* owner 2026-11-19：取消「我的流动性质押」卡；提示与治理权作用合并为一张卡。 */}
        <GovRulesCard />
      </GovGate>
    </div>
  );
}

function StakeLiquidityForm({
  ctx,
  hub,
}: {
  readonly ctx: ReturnType<typeof useGovContext>;
  readonly hub: `0x${string}` | undefined;
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
