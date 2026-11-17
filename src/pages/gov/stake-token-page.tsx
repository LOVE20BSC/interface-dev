import { Link } from 'react-router-dom';
import { copy } from '@/shared/config/copy-pages';
import { formatTokenAmount } from '@/shared/lib/format';
import { buttonStyles } from '@/shared/ui/button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';
import { useWalletConnection } from '@/features/connect-wallet/model/use-wallet-connection';
import {
  useGovContext,
  type GovContextValue,
} from '@/features/governance-stake/model/use-gov-context';
import { GovGate, GovTxFeedback } from '@/features/governance-stake/ui/gov-gate';
import { GovTips } from '@/features/governance-stake/ui/gov-intro';
import { StakeStatRow } from '@/features/governance-stake/ui/stake-controls';
import { StakeBoostPanel } from '@/features/governance-stake/ui/stake-boost-panel';

/**
 * 质押代币（复刻 TKM `/stake/staketoken`）：先要求已有流动性质押，再显示「我的
 * 加速质押」与加速表单；加速质押不产生治理权，只决定加速激励份额。
 */
export function StakeTokenPage() {
  const ctx = useGovContext();
  const { isWrongChain } = useWalletConnection();
  const q = `?symbol=${encodeURIComponent(ctx.symbol)}`;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-foreground">{copy.gov.pageTitles.stakeToken}</h1>
      <GovGate ctx={ctx} isWrongChain={isWrongChain}>
        <GovTxFeedback ctx={ctx} />
        <StakeTokenBody ctx={ctx} q={q} />
        <GovTips />
      </GovGate>
    </div>
  );
}

function StakeTokenBody({ ctx, q }: { readonly ctx: GovContextValue; readonly q: string }) {
  const { token, stakeAddress, memberId } = ctx;
  if (token === undefined || stakeAddress === undefined || memberId === undefined) return null;

  const hasLiquidity = (ctx.member.liquidityShares ?? 0n) > 0n;

  if (ctx.member.status === 'loading' || ctx.member.status === 'idle') {
    return (
      <Card data-testid="gov-stake-token-loading">
        <CardTitle>{copy.gov.accelerated.title}</CardTitle>
        <CardDescription>{copy.gov.stats.loading}</CardDescription>
      </Card>
    );
  }

  if (!hasLiquidity) {
    return (
      <Card data-testid="gov-stake-token-gate">
        <CardTitle>{copy.gov.boost.lockedTitle}</CardTitle>
        <CardDescription>{copy.gov.boost.lockedBody}</CardDescription>
        <div className="mt-4">
          <Link to={`/stake/stakelp${q}`} className={buttonStyles('primary', 'md', 'w-full')}>
            {copy.gov.boost.lockedAction}
          </Link>
        </div>
      </Card>
    );
  }

  const remaining =
    ctx.member.boostCap !== undefined && ctx.member.boostUsed !== undefined
      ? ctx.member.boostCap - ctx.member.boostUsed
      : undefined;

  return (
    <div className="space-y-4">
      <Card data-testid="gov-accelerated-summary">
        <CardTitle>{copy.gov.accelerated.title}</CardTitle>
        <div className="mt-3">
          <StakeStatRow
            label={copy.gov.accelerated.valid}
            value={formatTokenAmount(ctx.member.validBoostShares, token.decimals)}
            testId="gov-accelerated-valid"
          />
          <StakeStatRow
            label={copy.gov.accelerated.used}
            value={formatTokenAmount(ctx.member.boostUsed, token.decimals)}
            testId="gov-accelerated-used"
          />
          <StakeStatRow
            label={copy.gov.accelerated.remaining}
            value={formatTokenAmount(remaining, token.decimals)}
            note={copy.gov.accelerated.capNote}
            testId="gov-accelerated-remaining"
          />
        </div>
      </Card>

      <StakeBoostPanel
        token={token}
        stakeAddress={stakeAddress}
        memberId={memberId}
        member={ctx.member}
        balances={ctx.balances}
        tx={ctx.tx}
        disabled={
          ctx.tx.stage !== 'idle' || ctx.tx.approveStage !== 'idle' || ctx.tx.receipt !== null
        }
        onGoLiquidity={() => undefined}
      />
    </div>
  );
}
