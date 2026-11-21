import { useState } from 'react';
import { configuredAddress } from '@/config/networks';
import { useCommunityToken } from '@/entities/community-token/model/use-community-token';
import { useGovAccess } from '@/entities/gov-core/model/use-gov-access';
import { useProposalRewards } from '@/entities/gov-core/model/use-proposal-rewards';
import { useRoundProposals } from '@/entities/gov-core/model/use-round-proposals';
import { usePhaseClock } from '@/entities/phase/model/use-phase-clock';
import { useWalletConnection } from '@/features/connect-wallet/model/use-wallet-connection';
import { useProposalRewardWrite } from '@/features/governance-proposal-reward/model/use-proposal-reward-write';
import { ProposalRewardPanel } from '@/features/governance-proposal-reward/ui/proposal-reward-panel';
import { GOV_POLL_MS } from '@/features/governance-stake/model/use-gov-context';
import { useCommunityContext } from '@/features/switch-community/model/use-community-context';
import { copy } from '@/shared/config/copy-pages';
import { GovAccessGate } from '@/widgets/gov-access-gate/gov-access-gate';

const FIRST_ROUND = 1n;

/**
 * 治理·提案激励结算（core `Mint` 的提案侧）。
 *
 * 这一页只覆盖 core 范围内**能做的事**：看一轮已结束轮次的提案激励怎么分、以及把
 * 不达标提案那部分销毁掉。达标提案的激励只能由提案目标合约铸造
 * （`Mint.mintProposalReward` 的 `onlyProposalTarget`），所以在 core 覆盖范围内没有
 * 铸造按钮，只写说明（`copy.gov.proposalRewards.eligibleHint`）。
 *
 * 轮次口径（`Mint._checkSettlementRound`）：只有**已结束**的轮次能结算，也就是
 * `1 ≤ round < currentPhase`。默认看最近一个已结束轮次（`currentPhase - 1`），
 * 上一轮 / 下一轮只能在 `[1, currentPhase - 1]` 里移动。
 */
export function ProposalRewardsPage() {
  const { symbol } = useCommunityContext();
  const token = useCommunityToken(symbol);
  const { isWrongChain } = useWalletConnection();
  const access = useGovAccess(token.address, ['mint', 'vote', 'submit', 'phase']);
  const clock = usePhaseClock({ refetchIntervalMs: GOV_POLL_MS });
  const mintAddress = configuredAddress('mint');

  const newestRound =
    clock.currentPhase !== undefined && clock.currentPhase > FIRST_ROUND
      ? clock.currentPhase - FIRST_ROUND
      : undefined;
  const [selectedRound, setSelectedRound] = useState<bigint | null>(null);
  const round = clampRound(selectedRound, newestRound);

  const proposals = useRoundProposals(token.address, { round });
  const rewards = useProposalRewards(
    token.address,
    round,
    proposals.items.map((item) => item.proposalId),
  );

  const refetchAll = () => {
    proposals.refetch();
    // `useProposalRewards` 的重读没有自带 enabled 复检：轮次未就绪时 refetch 会用 undefined
    // 参数编码（规范 §5.2 的坑），所以这里只在轮次有效时重读。
    if (round !== undefined) rewards.refetch();
    clock.refetch();
    token.refetch();
    access.refetch();
  };

  const write = useProposalRewardWrite(refetchAll);

  const goPrev = () => {
    if (round === undefined || round <= FIRST_ROUND) return;
    setSelectedRound(round - FIRST_ROUND);
  };
  const goNext = () => {
    if (round === undefined || newestRound === undefined || round >= newestRound) return;
    setSelectedRound(round + FIRST_ROUND);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-foreground" data-testid="gov-proposal-rewards-title">
        {copy.gov.proposalRewards.title}
      </h1>
      <p className="text-sm leading-6 text-muted">{copy.gov.proposalRewards.intro}</p>
      <GovAccessGate access={access} isWrongChain={isWrongChain} symbol={symbol}>
        {token.address === undefined || mintAddress === undefined ? (
          <p className="text-sm text-muted" data-testid="gov-proposal-rewards-unavailable">
            {copy.gov.gates.unconfiguredBody}
          </p>
        ) : (
          <ProposalRewardPanel
            tokenAddress={token.address}
            mintAddress={mintAddress}
            symbol={token.symbol}
            decimals={token.decimals}
            round={round}
            newestRound={newestRound}
            proposals={proposals}
            rewards={rewards}
            write={write}
            onPrev={goPrev}
            onNext={goNext}
            onRefetch={refetchAll}
          />
        )}
      </GovAccessGate>
    </div>
  );
}

/**
 * 轮次选区：`1 ≤ round ≤ newestRound`（`newestRound = currentPhase - 1`）。
 * 用户没选过就跟随最近一个已结束轮次；链回滚 / 阶段推进让上界变化时也夹在同一区间，
 * 避免把「还没结束的轮次」发给合约（`RoundNotEnded`）。
 */
function clampRound(candidate: bigint | null, newestRound: bigint | undefined): bigint | undefined {
  if (newestRound === undefined) return undefined;
  if (candidate === null) return newestRound;
  if (candidate < FIRST_ROUND) return FIRST_ROUND;
  if (candidate > newestRound) return newestRound;
  return candidate;
}
