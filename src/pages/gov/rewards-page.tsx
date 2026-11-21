import { configuredAddress } from '@/config/networks';
import { useCommunityToken } from '@/entities/community-token/model/use-community-token';
import { useGovAccess } from '@/entities/gov-core/model/use-gov-access';
import { useGovRewards } from '@/entities/gov-core/model/use-gov-rewards';
import { usePhaseClock } from '@/entities/phase/model/use-phase-clock';
import { useWalletConnection } from '@/features/connect-wallet/model/use-wallet-connection';
import { useGovRewardWrite } from '@/features/governance-reward/model/use-gov-reward-write';
import { RewardPanel } from '@/features/governance-reward/ui/reward-panel';
import { GOV_POLL_MS } from '@/features/governance-stake/model/use-gov-context';
import { useCommunityContext } from '@/features/switch-community/model/use-community-context';
import { copy } from '@/shared/config/copy-pages';
import { GovAccessGate } from '@/widgets/gov-access-gate/gov-access-gate';

/**
 * 治理·激励铸造（core `Mint.mintGovReward` / `mintGovRewards`）。
 *
 * 数据源只有 `entities/gov-core/model/use-gov-rewards`：它从 `currentPhase - 1` 往回
 * 倒序扫描**已结束**的轮次（合约 `_checkSettlementRound` 只允许已结束的轮次），一页
 * 20 轮、滚到底再往前——链上没有「我参加过哪些轮」的反向索引
 * （[CI-001](../../../../docs/contract-issues/001-no-member-round-index.md)）。
 *
 * 因此页面不承诺「一次铸完所有轮」：批量铸造只传**已加载**的轮次里确认可铸的那些。
 */
export function RewardsPage() {
  const { symbol } = useCommunityContext();
  const token = useCommunityToken(symbol);
  const { isWrongChain } = useWalletConnection();
  const access = useGovAccess(token.address, ['mint', 'vote', 'phase']);
  const clock = usePhaseClock({ refetchIntervalMs: GOV_POLL_MS });
  const rewards = useGovRewards(token.address, {
    memberId: access.memberId,
    currentPhase: clock.currentPhase,
  });
  const mintAddress = configuredAddress('mint');

  const refetchAll = () => {
    rewards.refetch();
    clock.refetch();
    token.refetch();
    access.refetch();
  };

  const write = useGovRewardWrite(refetchAll);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-foreground" data-testid="gov-rewards-title">
        {copy.gov.rewards.title}
      </h1>
      <p className="text-sm leading-6 text-muted">{copy.gov.rewards.intro}</p>
      <GovAccessGate access={access} isWrongChain={isWrongChain} symbol={symbol}>
        {mintAddress === undefined ||
        token.address === undefined ||
        access.memberId === undefined ? (
          <p className="text-sm text-muted" data-testid="gov-rewards-unavailable">
            {copy.gov.gates.unconfiguredBody}
          </p>
        ) : (
          <RewardPanel
            mintAddress={mintAddress}
            tokenAddress={token.address}
            memberId={access.memberId}
            symbol={token.symbol}
            decimals={token.decimals}
            rewards={rewards}
            write={write}
            onRetry={refetchAll}
          />
        )}
      </GovAccessGate>
    </div>
  );
}
