import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { copy } from '@/shared/config/copy-pages';
import { buttonStyles } from '@/shared/ui/button';
import { ConnectWalletButton } from '@/features/connect-wallet/ui/connect-wallet-button';
import type { GovContextValue } from '@/features/governance-stake/model/use-gov-context';
import {
  stakeReceiptLines,
  stakeReceiptTitle,
} from '@/features/governance-stake/lib/stake-receipt-view';
import {
  StakeReceiptCard,
  StakeStateCard,
  StakeTxFeedback,
} from '@/features/governance-stake/ui/stake-controls';

export interface GovGateProps {
  readonly ctx: GovContextValue;
  readonly isWrongChain: boolean;
  readonly children: ReactNode;
}

/**
 * 治理域的统一门禁：未配置 → 未连接 → 网络不对 → 身份 NFT 三态 → 社区读不到 →
 * 就绪。每个分支只有一块卡 + 一个下一步（UX spec §0 原则 7）。
 */
export function GovGate({ ctx, isWrongChain, children }: GovGateProps) {
  if (isWrongChain) {
    return (
      <StakeStateCard
        testId="gov-wrong-chain"
        title={copy.gov.gates.wrongChainTitle}
        description={copy.gov.gates.wrongChainBody}
      >
        <ConnectWalletButton />
      </StakeStateCard>
    );
  }

  switch (ctx.gate) {
    case 'ready':
      return <>{children}</>;
    case 'connect':
      return (
        <StakeStateCard
          testId="gov-connect"
          title={copy.gov.gates.connectTitle}
          description={copy.gov.gates.connectBody}
        >
          <ConnectWalletButton />
        </StakeStateCard>
      );
    case 'unconfigured':
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
    case 'identity-loading':
      return (
        <StakeStateCard
          testId="gov-identity-loading"
          title={copy.gov.stats.loading}
          description={copy.gov.gates.connectBody}
        />
      );
    case 'identity-unconfigured':
      return (
        <StakeStateCard
          testId="gov-identity-unconfigured"
          title={copy.identity.notDeployedTitle}
          description={copy.identity.notDeployedBody}
        />
      );
    case 'identity-error':
      return (
        <StakeStateCard
          testId="gov-identity-error"
          title={copy.gov.gates.identityErrorTitle}
          description={copy.gov.gates.identityErrorBody}
        >
          <button type="button" className={buttonStyles('secondary', 'md')} onClick={ctx.retry}>
            {copy.gov.gates.retry}
          </button>
        </StakeStateCard>
      );
    case 'no-identity':
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
    case 'needs-selection':
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
    case 'community-unknown':
      return (
        <StakeStateCard
          testId="gov-community-unknown"
          title={copy.gov.stats.errorTitle}
          description={copy.gov.stats.errorBody}
        >
          <button type="button" className={buttonStyles('secondary', 'md')} onClick={ctx.retry}>
            {copy.gov.gates.retry}
          </button>
        </StakeStateCard>
      );
    default:
      return null;
  }
}

/**
 * 一个页面内的交易反馈区：错误 + 钱包等待 + 在途任务条 + 恢复卡 + 回执。
 * 回执数值来自交易事件；单位（代币 symbol / 精度）取自当前社区。
 */
export function GovTxFeedback({ ctx }: { readonly ctx: GovContextValue }) {
  const { tx, token, parent } = ctx;
  if (token === undefined || parent === undefined) return null;
  const receipt = tx.receipt;
  return (
    <div className="space-y-3">
      {receipt !== null ? (
        <StakeReceiptCard
          title={stakeReceiptTitle(receipt)}
          lines={stakeReceiptLines(receipt, {
            tokenSymbol: token.symbol,
            tokenDecimals: token.decimals,
            parentSymbol: parent.symbol,
            parentDecimals: parent.decimals,
          })}
          hash={receipt.hash}
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
    </div>
  );
}
