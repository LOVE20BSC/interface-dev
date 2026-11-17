import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { configuredAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { cn } from '@/shared/lib/cn';
import { formatTokenAmount } from '@/shared/lib/format';
import { buttonStyles } from '@/shared/ui/button';
import type { StakeReceipt } from '@/features/governance-stake/lib/stake-receipt';
import { useMemberIdentity } from '@/entities/member-identity/model/use-member-identity';
import { useCommunityToken } from '@/entities/community-token/model/use-community-token';
import { useParentToken } from '@/entities/community-token/model/use-parent-token';
import { usePhaseClock } from '@/entities/phase/model/use-phase-clock';
import { useMemberStake } from '@/entities/stake/model/use-member-stake';
import { useStakeBalances } from '@/entities/stake/model/use-stake-balances';
import { useStakeCommunity } from '@/entities/stake/model/use-stake-community';
import { useStakeParams } from '@/entities/stake/model/use-stake-params';
import { useStakePool } from '@/entities/stake/model/use-stake-pool';
import { useCommunityContext } from '@/features/switch-community/model/use-community-context';
import { useStakeTransaction } from '@/features/governance-stake/model/use-stake-transaction';
import { MyStakePanel } from '@/features/governance-stake/ui/my-stake-panel';
import { StakeBoostPanel } from '@/features/governance-stake/ui/stake-boost-panel';
import {
  StakeReceiptCard,
  StakeStateCard,
  StakeTxFeedback,
} from '@/features/governance-stake/ui/stake-controls';
import { StakeLiquidityPanel } from '@/features/governance-stake/ui/stake-liquidity-panel';
import { StakeRules } from '@/features/governance-stake/ui/stake-rules';

export type GovernanceStakeTab = 'stake' | 'mine';

const TABS: readonly GovernanceStakeTab[] = ['stake', 'mine'];
const VOTE_DECIMALS = 18;
/** 解锁等待期间自动刷新的间隔：阶段长度 120 块（约 2 分钟），15 s 足够及时且便宜。 */
const PHASE_POLL_MS = 15_000;

export interface GovernanceStakePageProps {
  readonly isConnected: boolean;
  readonly isWrongChain: boolean;
  readonly connectAction: ReactNode;
}

/**
 * 治理页（/gov）的页面主体：流动性质押 + 加速质押 + 我的质押。
 *
 * 门禁顺序与其它任务页一致（未配置 → 未连接 → 网络不对 → 身份 NFT 三态），
 * 每一态都给出一个下一步；进入页面后所有写操作共享同一个在途槽位（同一时刻只有
 * 一个写操作在途，UX spec §4.2）。
 */
export function GovernanceStakePage({
  isConnected,
  isWrongChain,
  connectAction,
}: GovernanceStakePageProps) {
  const stakeAddress = configuredAddress('stake');
  const configuredParentAddress = configuredAddress('weth');
  const { address: account } = useAccount();
  const { symbol } = useCommunityContext();
  const communityToken = useCommunityToken(symbol);
  // 父币是合约 PARENT_TOKEN_ADDRESS() 指向的代币（子币社区里不是 WETH），读不到才退回地址簿。
  const parentToken = useParentToken(communityToken.address);
  const identity = useMemberIdentity();
  // 解锁到期后「可以撤出了」必须自己出现：阶段与成员读每 15 s 自动刷新一次。
  // （复核 P2：静态读让用户在等待页永远等不到撤出按钮，靠手动刷新才生效。）
  const clock = usePhaseClock({ refetchIntervalMs: PHASE_POLL_MS });
  const params = useStakeParams();

  const memberId = identity.selected?.tokenId;
  const member = useMemberStake(communityToken.address, memberId, clock.currentPhase, {
    refetchIntervalMs: PHASE_POLL_MS,
  });
  const community = useStakeCommunity(communityToken.address, clock.currentPhase);
  const pool = useStakePool(communityToken.address);
  const parentAddress = parentToken.address ?? configuredParentAddress;
  const balances = useStakeBalances(account, communityToken.address, parentAddress);

  const [tab, setTab] = useState<GovernanceStakeTab>('stake');
  const tabInitialised = useRef(false);

  const refetchAll = () => {
    identity.refetch();
    clock.refetch();
    params.refetch();
    member.refetch();
    community.refetch();
    pool.refetch();
    balances.refetch();
    parentToken.refetch();
  };

  const tx = useStakeTransaction(refetchAll);

  // 已有质押的成员默认落在「我的质押」：这是回访用户的第一诉求。
  /* eslint-disable react-hooks/set-state-in-effect -- tab default depends on an async chain read */
  useEffect(() => {
    if (tabInitialised.current || member.status !== 'ready') return;
    tabInitialised.current = true;
    const hasStake = (member.liquidityShares ?? 0n) > 0n || (member.unlockRequestPhase ?? 0n) > 0n;
    if (hasStake) setTab('mine');
  }, [member.liquidityShares, member.status, member.unlockRequestPhase]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (
    stakeAddress === undefined ||
    parentAddress === undefined ||
    clock.status === 'unconfigured'
  ) {
    return (
      <StakeStateCard
        testId="gov-unconfigured"
        title={copy.gov.gates.unconfiguredTitle}
        description={copy.gov.gates.unconfiguredBody}
      >
        <Link to="/" className={buttonStyles('secondary', 'md')}>
          {copy.common.home}
        </Link>
      </StakeStateCard>
    );
  }

  if (!isConnected) {
    return (
      <StakeStateCard
        testId="gov-connect"
        title={copy.gov.gates.connectTitle}
        description={copy.gov.gates.connectBody}
      >
        {connectAction}
      </StakeStateCard>
    );
  }

  if (isWrongChain) {
    return (
      <StakeStateCard
        testId="gov-wrong-chain"
        title={copy.gov.gates.wrongChainTitle}
        description={copy.gov.gates.wrongChainBody}
      >
        {connectAction}
      </StakeStateCard>
    );
  }

  if (identity.status === 'loading') {
    return (
      <StakeStateCard
        testId="gov-identity-loading"
        title={copy.gov.stats.loading}
        description={copy.gov.gates.connectBody}
      />
    );
  }

  if (identity.status === 'unconfigured') {
    return (
      <StakeStateCard
        testId="gov-identity-unconfigured"
        title={copy.identity.notDeployedTitle}
        description={copy.identity.notDeployedBody}
      />
    );
  }

  if (identity.status === 'error') {
    return (
      <StakeStateCard
        testId="gov-identity-error"
        title={copy.gov.gates.identityErrorTitle}
        description={copy.gov.gates.identityErrorBody}
      >
        <button
          type="button"
          className={buttonStyles('secondary', 'md')}
          onClick={identity.refetch}
        >
          {copy.gov.gates.retry}
        </button>
      </StakeStateCard>
    );
  }

  if (identity.status === 'empty') {
    return (
      <StakeStateCard
        testId="gov-no-identity"
        title={copy.gov.gates.noIdentityTitle}
        description={copy.gov.gates.noIdentityBody}
      >
        <Link to="/mint" className={buttonStyles('primary', 'md')}>
          {copy.gov.gates.noIdentityAction}
        </Link>
      </StakeStateCard>
    );
  }

  if (identity.status === 'needs-selection') {
    return (
      <StakeStateCard
        testId="gov-needs-selection"
        title={copy.gov.gates.needsSelectionTitle}
        description={copy.gov.gates.needsSelectionBody}
      >
        <Link to="/my-nft" className={buttonStyles('primary', 'md')}>
          {copy.gov.gates.needsSelectionAction}
        </Link>
      </StakeStateCard>
    );
  }

  if (identity.status !== 'ready') {
    return (
      <StakeStateCard
        testId="gov-identity-loading"
        title={copy.gov.stats.loading}
        description={copy.gov.gates.connectBody}
      />
    );
  }

  if (communityToken.address === undefined || identity.selected === null) {
    return (
      <StakeStateCard
        testId="gov-community-unknown"
        title={copy.gov.stats.errorTitle}
        description={copy.gov.stats.errorBody}
      >
        <button
          type="button"
          className={buttonStyles('secondary', 'md')}
          onClick={() => {
            communityToken.refetch();
            identity.refetch();
          }}
        >
          {copy.gov.gates.retry}
        </button>
      </StakeStateCard>
    );
  }

  const token = {
    address: communityToken.address,
    symbol: communityToken.symbol,
    decimals: communityToken.decimals,
  };
  const parent = {
    address: parentAddress,
    symbol: parentToken.symbol ?? copy.common.unknown,
    decimals: parentToken.decimals ?? 18,
  };
  const selectedMemberId = identity.selected.tokenId;
  // 回执也是一次写完操作的「未结束」状态：它还在屏幕上时再点提交只会被 hook 静默
  // 吞掉（run() 里 receipt !== null 直接 return），所以按钮必须同步禁用。
  const busy = tx.stage !== 'idle' || tx.approveStage !== 'idle' || tx.receipt !== null;

  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-muted">{copy.gov.intro}</p>

      {tx.receipt !== null ? (
        <StakeReceiptCard
          title={receiptTitle(tx.receipt)}
          lines={receiptLines(
            tx.receipt,
            token.symbol,
            token.decimals,
            parent.symbol,
            parent.decimals,
          )}
          hash={tx.receipt.hash}
          onClose={tx.clearReceipt}
        />
      ) : null}

      <StakeTxFeedback
        error={tx.error}
        watch={tx.watch}
        stage={tx.stage}
        onResubmit={tx.resubmit}
        resubmitDisabled={tx.isResubmitting}
      />

      <div
        role="tablist"
        aria-label={copy.gov.tabs.stake}
        className="grid grid-cols-2 gap-1 rounded-2xl border border-line bg-elevated p-1 text-xs"
      >
        {TABS.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            data-testid={`gov-tab-${value}`}
            onClick={() => setTab(value)}
            className={cn(
              'rounded-xl px-2 py-2 font-medium transition-colors',
              tab === value
                ? 'bg-surface text-brand-strong shadow-soft'
                : 'text-muted hover:text-foreground',
            )}
          >
            {copy.gov.tabs[value]}
          </button>
        ))}
      </div>

      {tab === 'stake' ? (
        <div className="space-y-4">
          <StakeLiquidityPanel
            token={token}
            parent={parent}
            stakeAddress={stakeAddress}
            memberId={selectedMemberId}
            member={member}
            pool={pool}
            community={community}
            params={params}
            balances={balances}
            tx={tx}
            disabled={busy}
          />
          <StakeBoostPanel
            token={token}
            stakeAddress={stakeAddress}
            memberId={selectedMemberId}
            member={member}
            balances={balances}
            tx={tx}
            disabled={busy}
            onGoLiquidity={() => setTab('stake')}
          />
        </div>
      ) : (
        <MyStakePanel
          token={token}
          parent={parent}
          stakeAddress={stakeAddress}
          memberId={selectedMemberId}
          member={member}
          community={community}
          params={params}
          clock={clock}
          tx={tx}
          disabled={busy}
          onGoStake={() => setTab('stake')}
        />
      )}

      <StakeRules />
    </div>
  );
}

function receiptTitle(receipt: StakeReceipt): string {
  switch (receipt.action) {
    case 'stakeLiquidity':
      return copy.gov.receipt.liquidity;
    case 'stakeBoost':
      return copy.gov.receipt.boost;
    case 'increasePhases':
      return copy.gov.receipt.increasePhases;
    case 'unstake':
      return copy.gov.receipt.unstake;
    case 'withdraw':
      return copy.gov.receipt.withdraw;
  }
}

function receiptLines(
  receipt: StakeReceipt,
  tokenSymbol: string,
  tokenDecimals: number | undefined,
  parentSymbol: string,
  parentDecimals: number | undefined,
): readonly string[] {
  const { detail } = receipt;
  switch (receipt.action) {
    case 'stakeLiquidity': {
      const lines: string[] = [];
      if (detail.govVotesAdded !== undefined) {
        lines.push(copy.gov.receipt.votes(formatTokenAmount(detail.govVotesAdded, VOTE_DECIMALS)));
      }
      if (detail.liquiditySharesAdded !== undefined) {
        lines.push(
          copy.gov.receipt.shares(formatTokenAmount(detail.liquiditySharesAdded, VOTE_DECIMALS)),
        );
      }
      return lines;
    }
    case 'stakeBoost':
      return detail.boostAmount !== undefined
        ? [
            copy.gov.receipt.boostAmount(
              formatTokenAmount(detail.boostAmount, tokenDecimals),
              tokenSymbol,
            ),
          ]
        : [];
    case 'increasePhases': {
      const lines: string[] = [];
      if (detail.promisedWaitingPhases !== undefined) {
        lines.push(
          copy.gov.receipt.increasePhasesNote(formatTokenAmount(detail.promisedWaitingPhases, 0)),
        );
      }
      if (detail.govVotesAdded !== undefined) {
        lines.push(copy.gov.receipt.votes(formatTokenAmount(detail.govVotesAdded, VOTE_DECIMALS)));
      }
      return lines;
    }
    case 'unstake':
      return [copy.gov.receipt.unstakeNote];
    case 'withdraw': {
      // 撤出后回到钱包的社区代币 = LP 折算 + 加速质押退还；回执给「实际到账」。
      if (detail.tokenAmount === undefined || detail.parentTokenAmount === undefined) return [];
      const tokenTotal = detail.tokenAmount + (detail.boostAmount ?? 0n);
      return [
        copy.gov.receipt.withdrawNote(
          formatTokenAmount(tokenTotal, tokenDecimals),
          tokenSymbol,
          formatTokenAmount(detail.parentTokenAmount, parentDecimals),
          parentSymbol,
        ),
      ];
    }
  }
}
