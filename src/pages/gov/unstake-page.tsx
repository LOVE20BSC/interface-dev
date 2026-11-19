import { Link } from 'react-router-dom';
import { copy } from '@/shared/config/copy-pages';
import { buttonStyles } from '@/shared/ui/button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';
import { useWalletConnection } from '@/features/connect-wallet/model/use-wallet-connection';
import {
  useGovContext,
  type GovContextValue,
} from '@/features/governance-stake/model/use-gov-context';
import { GovGate, GovTxFeedback } from '@/features/governance-stake/ui/gov-gate';
import { hasStakePosition, MyStakeSummary } from '@/features/governance-stake/ui/my-stake-summary';
import { StakeActions } from '@/features/governance-stake/ui/stake-actions';

/**
 * 取消质押（复刻 TKM `/stake/unstake`）：我的治理资产 + 取消质押 / 取回。
 *
 * 旧版是「授权 SL → 授权 ST → 取消质押」三段；新协议没有 SL/ST 凭证，取消质押
 * 也不需要授权，所以按同样的状态机只剩：申请解锁 → 等承诺解锁期 → 撤出。
 * 「增加承诺解锁期」在新协议里没有旧对应交互，放在同一张资产卡里（协议适配）。
 */
export function UnstakePage() {
  const ctx = useGovContext();
  const { isWrongChain } = useWalletConnection();
  const q = `?symbol=${encodeURIComponent(ctx.symbol)}`;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-foreground">{copy.gov.pageTitles.unstake}</h1>
      <GovGate ctx={ctx} isWrongChain={isWrongChain}>
        <GovTxFeedback ctx={ctx} />
        <UnstakeBody ctx={ctx} q={q} />
      </GovGate>
    </div>
  );
}

function UnstakeBody({ ctx, q }: { readonly ctx: GovContextValue; readonly q: string }) {
  const { token, parent } = ctx;
  if (token === undefined || parent === undefined) return null;

  if (ctx.member.status === 'loading' || ctx.member.status === 'idle') {
    return (
      <Card data-testid="gov-unstake-loading">
        <CardTitle>{copy.gov.unstakePage.sectionTitle}</CardTitle>
        <CardDescription>{copy.gov.stats.loading}</CardDescription>
      </Card>
    );
  }

  if (!hasStakePosition(ctx.member)) {
    return (
      <Card data-testid="gov-unstake-empty">
        <CardTitle>{copy.gov.unstakePage.sectionTitle}</CardTitle>
        <CardDescription>{copy.gov.unstakePage.noStake}</CardDescription>
        <div className="mt-4">
          <Link to={`/stake/liquidity${q}`} className={buttonStyles('primary', 'md', 'w-full')}>
            {copy.gov.unstakePage.goStake}
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Card data-testid="gov-unstake-assets">
      <CardTitle>{copy.gov.unstakePage.sectionTitle}</CardTitle>
      <div className="mt-3">
        <MyStakeSummary
          member={ctx.member}
          clock={ctx.clock}
          token={token}
          parent={parent}
          testIdPrefix="gov-unstake"
        />
      </div>
      <div className="mt-4">
        <StakeActions ctx={ctx} testIdPrefix="gov-unstake" showIncreasePhases={false} />
      </div>
    </Card>
  );
}
