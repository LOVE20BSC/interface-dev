import { useWalletConnection } from '@/features/connect-wallet/model/use-wallet-connection';
import { useGovContext } from '@/features/governance-stake/model/use-gov-context';
import { GovGate } from '@/features/governance-stake/ui/gov-gate';
import { MyStakeAssetsCard } from '@/features/governance-stake/ui/my-stake-assets-card';

/**
 * 「我的」页 → 质押资产 tab 的内容（owner 2026-11-18 23:20：把治理首页的
 * 「我的流动性质押」卡挪到这里）。
 *
 * 只在用户切到这个 tab 时才挂载：页面默认停在「钱包余额」，不会为此多打一组
 * 链上读（`useGovContext` 带 15 s 轮询）。门禁阶梯与治理域其它页面完全一致。
 */
export function StakeAssetsPanel() {
  const ctx = useGovContext();
  const { isWrongChain } = useWalletConnection();
  return (
    <GovGate ctx={ctx} isWrongChain={isWrongChain}>
      <MyStakeAssetsCard ctx={ctx} />
    </GovGate>
  );
}
