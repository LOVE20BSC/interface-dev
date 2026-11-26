import { useAccount } from 'wagmi';
import { configuredAddress, type AddressBook, type HexAddress } from '@/config/networks';
import { useMemberIdentity } from '@/entities/member-identity/model/use-member-identity';
import { govGateState } from '@/shared/lib/gov-gate';

/**
 * 治理域（core）页面共用的**准入判定**：未部署 → 未连接 → 身份 NFT 三态 → 社区读不到 → 就绪。
 *
 * 与 `features/governance-stake/model/use-gov-context` 的关系：质押域的门禁还带着「父币、
 * 质押参数、我的仓位」等质押专属读模型；投票 / 提案 / 激励这三组页面只要身份 + 合约地址，
 * 套质押上下文会把质押的读带来。所以这里只做**最小**准入，区块样式由
 * `widgets/gov-access-gate` 统一渲染，两个域的门禁阶梯文案与顺序保持一致。
 */

export type GovAccessGate =
  | 'unconfigured'
  | 'connect'
  | 'identity-loading'
  | 'identity-unconfigured'
  | 'identity-error'
  | 'no-identity'
  | 'needs-selection'
  | 'community-unknown'
  | 'ready';

export interface GovAccess {
  readonly gate: GovAccessGate;
  readonly account: HexAddress | undefined;
  readonly memberId: bigint | undefined;
  /** 页面上「重试」要重读的东西。 */
  readonly refetch: () => void;
}

export function useGovAccess(
  tokenAddress: HexAddress | undefined,
  requiredAddresses: readonly (keyof AddressBook)[],
): GovAccess {
  const { address: account } = useAccount();
  const identity = useMemberIdentity();

  const missingAddress = requiredAddresses.some((key) => configuredAddress(key) === undefined);

  // 阶梯判定来自 `shared/lib/gov-gate`（候选 B）；本域只提供输入。
  const gate: GovAccessGate = govGateState({
    unconfigured: missingAddress,
    connected: account !== undefined,
    identityStatus: identity.status,
    communityKnown: tokenAddress !== undefined,
  });

  return {
    gate,
    account,
    memberId: identity.selected?.tokenId,
    refetch: () => identity.refetch(),
  };
}
