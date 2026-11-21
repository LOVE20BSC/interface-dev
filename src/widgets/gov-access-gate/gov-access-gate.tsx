import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { copy } from '@/shared/config/copy-pages';
import { buttonStyles } from '@/shared/ui/button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';
import { ConnectWalletButton } from '@/features/connect-wallet/ui/connect-wallet-button';
import type { GovAccess } from '@/entities/gov-core/model/use-gov-access';

/**
 * 治理域（core）三组页面共用的准入卡：未部署 → 未连接 → 网络不对 → 身份 NFT 三态 →
 * 社区读不到 → 就绪。每个分支只有一块卡 + 一个下一步（UX spec §0 原则 7）。
 *
 * 文案复用 `copy.gov.gates`：门禁阶梯是治理域的共同语言，不按页面各写一套。
 */
export interface GovAccessGateProps {
  readonly access: GovAccess;
  readonly isWrongChain: boolean;
  readonly symbol: string;
  readonly children: ReactNode;
}

export function GovAccessGate({ access, isWrongChain, symbol, children }: GovAccessGateProps) {
  if (isWrongChain) {
    return (
      <GateCard
        testId="gov-access-wrong-chain"
        title={copy.gov.gates.wrongChainTitle}
        body={copy.gov.gates.wrongChainBody}
      >
        <ConnectWalletButton />
      </GateCard>
    );
  }

  switch (access.gate) {
    case 'unconfigured':
      return (
        <GateCard
          testId="gov-access-unconfigured"
          title={copy.gov.gates.unconfiguredTitle}
          body={copy.gov.gates.unconfiguredBody}
        />
      );
    case 'connect':
      return (
        <GateCard
          testId="gov-access-connect"
          title={copy.gov.gates.connectTitle}
          body={copy.gov.gates.connectBody}
        >
          <ConnectWalletButton />
        </GateCard>
      );
    case 'identity-loading':
      return (
        <GateCard
          testId="gov-access-identity-loading"
          title={copy.wallet.identityReading}
          body={copy.gov.gates.connectBody}
        />
      );
    case 'identity-unconfigured':
      return (
        <GateCard
          testId="gov-access-identity-unconfigured"
          title={copy.gov.gates.unconfiguredTitle}
          body={copy.gov.gates.unconfiguredBody}
        />
      );
    case 'identity-error':
      return (
        <GateCard
          testId="gov-access-identity-error"
          title={copy.gov.gates.identityErrorTitle}
          body={copy.gov.gates.identityErrorBody}
        >
          <button
            type="button"
            className={buttonStyles('secondary', 'md')}
            onClick={access.refetch}
          >
            {copy.gov.gates.retry}
          </button>
        </GateCard>
      );
    case 'no-identity':
      return (
        <GateCard
          testId="gov-access-no-identity"
          title={copy.gov.gates.noIdentityTitle}
          body={copy.gov.gates.noIdentityBody}
        >
          <Link to="/mint" className={buttonStyles('primary', 'md')}>
            {copy.gov.gates.noIdentityAction}
          </Link>
        </GateCard>
      );
    case 'needs-selection':
      return (
        <GateCard
          testId="gov-access-needs-selection"
          title={copy.gov.gates.needsSelectionTitle}
          body={copy.gov.gates.needsSelectionBody}
        >
          <Link to="/my-nft" className={buttonStyles('primary', 'md')}>
            {copy.gov.gates.needsSelectionAction}
          </Link>
        </GateCard>
      );
    case 'community-unknown':
      return (
        <GateCard
          testId="gov-access-community-unknown"
          title={copy.gov.stats.errorTitle}
          body={copy.gov.stats.errorBody}
        >
          <button
            type="button"
            className={buttonStyles('secondary', 'md')}
            onClick={access.refetch}
          >
            {copy.gov.gates.retry}
          </button>
        </GateCard>
      );
    case 'ready':
      return (
        <div data-testid="gov-access-ready" data-symbol={symbol}>
          {children}
        </div>
      );
  }
}

interface GateCardProps {
  readonly testId: string;
  readonly title: string;
  readonly body: string;
  readonly children?: ReactNode;
}

function GateCard({ testId, title, body, children }: GateCardProps) {
  return (
    <Card data-testid={testId}>
      <CardTitle>{title}</CardTitle>
      <CardDescription>{body}</CardDescription>
      {children === undefined ? null : (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">{children}</div>
      )}
    </Card>
  );
}
