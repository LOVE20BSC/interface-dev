import { useState } from 'react';
import { useAccount } from 'wagmi';
import { configuredAddress } from '@/config/networks';
import type { MemberIdentity } from '@/entities/member-identity/model/use-member-identities';
import { useMemberIdentity } from '@/entities/member-identity/model/use-member-identity';
import { govGateState } from '@/shared/lib/gov-gate';
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

/** 解锁等待期间自动刷新：阶段约 2 分钟，15 s 足够及时且便宜。 */
export const GOV_POLL_MS = 15_000;

export type GovGate =
  | 'loading'
  | 'connect'
  | 'wrong-chain'
  | 'unconfigured'
  | 'identity-loading'
  | 'identity-unconfigured'
  | 'identity-error'
  | 'no-identity'
  | 'needs-selection'
  | 'community-unknown'
  | 'ready';

export interface GovTokenView {
  readonly address: `0x${string}`;
  readonly symbol: string;
  readonly decimals: number | undefined;
}

export interface GovContextValue {
  readonly gate: GovGate;
  /** 门禁里的「重试」需要重新读的东西。 */
  readonly retry: () => void;
  readonly account: `0x${string}` | undefined;
  readonly stakeAddress: `0x${string}` | undefined;
  readonly parentAddress: `0x${string}` | undefined;
  readonly token: GovTokenView | undefined;
  readonly parent: GovTokenView | undefined;
  readonly memberId: bigint | undefined;
  readonly identity: ReturnType<typeof useMemberIdentity>;
  readonly selected: MemberIdentity | null;
  readonly clock: ReturnType<typeof usePhaseClock>;
  readonly params: ReturnType<typeof useStakeParams>;
  readonly member: ReturnType<typeof useMemberStake>;
  readonly community: ReturnType<typeof useStakeCommunity>;
  readonly pool: ReturnType<typeof useStakePool>;
  readonly balances: ReturnType<typeof useStakeBalances>;
  readonly tx: ReturnType<typeof useStakeTransaction>;
  readonly refetchAll: () => void;
  /** 用户切换社区、加载身份时可复用的 symbol。 */
  readonly symbol: string;
}

/**
 * 治理域所有页面共享的读模型 + 门禁判定。
 *
 * TKM 旧版把「治理首页 / 质押 LP / 质押代币 / 取消质押 / 流动性质押数据」拆成 5 个
 * 页面，本仓按同样的信息架构拆回 5 条路由；每个页面都要同一套门禁（未配置 / 未连接 /
 * 网络不对 / 身份 NFT 三态）与同一套数据，所以集中在这里，页面只负责编排版面。
 */
export function useGovContext(): GovContextValue {
  const { address: account } = useAccount();
  const { symbol } = useCommunityContext();
  const stakeAddress = configuredAddress('stake');
  const configuredParentAddress = configuredAddress('weth');

  const identity = useMemberIdentity();
  const clock = usePhaseClock({ refetchIntervalMs: GOV_POLL_MS });
  const params = useStakeParams();
  const communityToken = useCommunityToken(symbol);
  const parentToken = useParentToken(communityToken.address);
  const parentAddress = parentToken.address ?? configuredParentAddress;

  const memberId = identity.selected?.tokenId;
  const member = useMemberStake(communityToken.address, memberId, clock.currentPhase, {
    refetchIntervalMs: GOV_POLL_MS,
  });
  const community = useStakeCommunity(communityToken.address, clock.currentPhase);
  const pool = useStakePool(communityToken.address);
  const balances = useStakeBalances(account, communityToken.address, parentAddress);

  const [txRevision, setTxRevision] = useState(0);
  const refetchAll = () => {
    setTxRevision((value) => value + 1);
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
  // txRevision 只是让上面的 refetchAll 每次都是新的闭包；读取它保证变量被使用。
  void txRevision;

  const token: GovTokenView | undefined =
    communityToken.address !== undefined
      ? {
          address: communityToken.address,
          symbol: communityToken.symbol,
          decimals: communityToken.decimals,
        }
      : undefined;
  const parent: GovTokenView | undefined =
    parentAddress !== undefined
      ? {
          address: parentAddress,
          symbol: parentToken.symbol ?? '—',
          decimals: parentToken.decimals ?? 18,
        }
      : undefined;

  // 阶梯判定来自 `shared/lib/gov-gate`（候选 B）；本域只提供输入。
  const gate: GovGate = govGateState({
    unconfigured:
      stakeAddress === undefined || parentAddress === undefined || clock.status === 'unconfigured',
    connected: account !== undefined,
    identityStatus: identity.status,
    communityKnown: token !== undefined,
  });

  /** 「读不到 → 重试」要重读页面上所有读模型，不能只刷门禁那几项（member 另有 15 s 轮询兜底）。 */
  const retry = () => {
    identity.refetch();
    communityToken.refetch();
    parentToken.refetch();
    clock.refetch();
    params.refetch();
    member.refetch();
    community.refetch();
    pool.refetch();
    balances.refetch();
  };

  return {
    gate,
    // 页面用它区分「网络不对」（由页面自己的 useWalletConnection 决定，见 GovGate）。
    retry,
    account,
    stakeAddress,
    parentAddress,
    token,
    parent,
    memberId,
    identity,
    selected: identity.selected,
    clock,
    params,
    member,
    community,
    pool,
    balances,
    tx,
    refetchAll,
    symbol,
  };
}
