import { Link, useLocation } from 'react-router-dom';
import { copy } from '@/shared/config/copy-pages';
import { configuredAddress } from '@/config/networks';
import { usePhaseClock } from '@/entities/phase/model/use-phase-clock';
import { useCommunityToken } from '@/entities/community-token/model/use-community-token';
import { useGovAccess } from '@/entities/gov-core/model/use-gov-access';
import { useProposalDetail } from '@/entities/gov-core/model/use-proposal-detail';
import { useVoteQuota } from '@/entities/gov-core/model/use-vote-quota';
import { useWalletConnection } from '@/features/connect-wallet/model/use-wallet-connection';
import { useCommunityContext } from '@/features/switch-community/model/use-community-context';
import { GOV_POLL_MS } from '@/features/governance-stake/model/use-gov-context';
import { useVoteWrite } from '@/features/governance-vote/model/use-vote-write';
import { VoteDetailPanel } from '@/features/governance-vote/ui/vote-detail-panel';
import { GovAccessGate } from '@/widgets/gov-access-gate/gov-access-gate';

/**
 * 治理·提案投票详情（owner 2026-11-22）：`/vote/:proposalId`。
 *
 * 列表页（`/vote`）只负责「点哪个提案」；这一页负责「投多少」——快捷 25% / 50% / 100%
 * 或自己填。独立成页也为后续接行动类投票留出位置（回调提案的投票载荷由目标合约定义）。
 */
export function VoteDetailPage() {
  const location = useLocation();
  // `/vote/:proposalId` 由 `GovSectionPage` 的 `vote/*` 通配路由接住，
  // 这里从 pathname 取编号（没有命名参数可用，也不为此新增重复路由）。
  const rawId = location.pathname.split('/')[2] ?? '';
  const { symbol } = useCommunityContext();
  const token = useCommunityToken(symbol);
  const { isWrongChain } = useWalletConnection();
  const access = useGovAccess(token.address, ['vote', 'submit', 'phase']);
  const clock = usePhaseClock({ refetchIntervalMs: GOV_POLL_MS });
  const round = clock.currentPhase;

  const proposalId = /^\d+$/.test(rawId) ? BigInt(rawId) : undefined;

  const detail = useProposalDetail(token.address, round, access.memberId, proposalId, GOV_POLL_MS);
  const quota = useVoteQuota(token.address, round, access.memberId);
  const voteAddress = configuredAddress('vote');

  const refetchAll = () => {
    detail.refetch();
    quota.refetch();
    clock.refetch();
    token.refetch();
    access.refetch();
  };

  const write = useVoteWrite(
    {
      waitingWallet: copy.gov.vote.waitingWallet,
      pending: copy.gov.vote.pending,
      revert: copy.gov.vote.revert,
    },
    refetchAll,
  );

  return (
    <div className="space-y-4">
      <Link
        to={`/vote?symbol=${encodeURIComponent(symbol)}`}
        data-testid="gov-vote-detail-back"
        className="inline-flex items-center gap-1 text-sm font-medium text-brand-strong"
      >
        ← {copy.gov.vote.detail.backToList}
      </Link>
      <h1 className="text-lg font-bold text-foreground" data-testid="gov-vote-detail-title">
        {copy.gov.vote.title}
      </h1>
      <GovAccessGate access={access} isWrongChain={isWrongChain} symbol={symbol}>
        {proposalId === undefined ? (
          <p className="text-sm text-muted" data-testid="gov-vote-detail-bad-id">
            {copy.gov.vote.detail.notFoundBody}
          </p>
        ) : voteAddress === undefined || token.address === undefined ? (
          <p className="text-sm text-muted" data-testid="gov-vote-detail-unavailable">
            {copy.gov.gates.unconfiguredBody}
          </p>
        ) : (
          <VoteDetailPanel
            voteAddress={voteAddress}
            tokenAddress={token.address}
            memberId={access.memberId ?? 0n}
            symbol={symbol}
            roundLabel={
              round === undefined ? copy.common.unknown : copy.gov.vote.roundHint(round.toString())
            }
            detail={clock.status === 'error' ? { ...detail, status: 'error' } : detail}
            quota={quota}
            write={write}
            onRefetch={refetchAll}
          />
        )}
      </GovAccessGate>
    </div>
  );
}
