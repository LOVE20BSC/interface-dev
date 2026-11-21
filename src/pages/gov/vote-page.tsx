import { copy } from '@/shared/config/copy-pages';
import { configuredAddress } from '@/config/networks';
import { usePhaseClock } from '@/entities/phase/model/use-phase-clock';
import { useCommunityToken } from '@/entities/community-token/model/use-community-token';
import { useGovAccess } from '@/entities/gov-core/model/use-gov-access';
import { useRoundProposals } from '@/entities/gov-core/model/use-round-proposals';
import { useVotePower } from '@/entities/gov-core/model/use-vote-power';
import { useWalletConnection } from '@/features/connect-wallet/model/use-wallet-connection';
import { useCommunityContext } from '@/features/switch-community/model/use-community-context';
import { GOV_POLL_MS } from '@/features/governance-stake/model/use-gov-context';
import { useVoteWrite } from '@/features/governance-vote/model/use-vote-write';
import { VotePanel } from '@/features/governance-vote/ui/vote-panel';
import { GovAccessGate } from '@/widgets/gov-access-gate/gov-access-gate';

/**
 * 治理·投票（core `Vote`）。
 *
 * 只覆盖 core：投票对象是**已被推举进本轮**的提案（`Submit.submitInfos(currentRound)`）。
 * 有目标合约回调的提案（`targetMode == 1`）不在这一页投——回调数据由目标合约定义，
 * 属于行动域；页面会把这些提案列出来但禁用输入并写明原因。
 */
export function VotePage() {
  const { symbol } = useCommunityContext();
  const token = useCommunityToken(symbol);
  const { isWrongChain } = useWalletConnection();
  const access = useGovAccess(token.address, ['vote', 'submit', 'phase']);
  const clock = usePhaseClock({ refetchIntervalMs: GOV_POLL_MS });
  const round = clock.currentPhase;

  const proposals = useRoundProposals(token.address, { round });
  const power = useVotePower(
    token.address,
    round,
    access.memberId,
    proposals.items.map((proposal) => proposal.proposalId),
  );
  const voteAddress = configuredAddress('vote');

  const refetchAll = () => {
    proposals.refetch();
    power.refetch();
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
      <h1 className="text-lg font-bold text-foreground" data-testid="gov-vote-title">
        {copy.gov.vote.title}
      </h1>
      <p className="text-sm leading-6 text-muted">{copy.gov.vote.intro}</p>
      <GovAccessGate access={access} isWrongChain={isWrongChain} symbol={symbol}>
        {proposals.status === 'error' ? (
          <div className="space-y-3" data-testid="gov-vote-list-error">
            <p role="alert" className="text-sm text-danger-strong">
              {copy.gov.vote.readFailed}
            </p>
            <button
              type="button"
              className="h-11 rounded-2xl border border-line bg-surface px-4 text-sm text-foreground"
              onClick={refetchAll}
            >
              {copy.gov.vote.retry}
            </button>
          </div>
        ) : proposals.status === 'loading' ? (
          <p className="text-sm text-muted" data-testid="gov-vote-loading">
            {copy.gov.vote.loading}
          </p>
        ) : voteAddress === undefined ||
          token.address === undefined ||
          access.memberId === undefined ? (
          <p className="text-sm text-muted" data-testid="gov-vote-unavailable">
            {copy.gov.gates.unconfiguredBody}
          </p>
        ) : (
          <VotePanel
            voteAddress={voteAddress}
            tokenAddress={token.address}
            memberId={access.memberId}
            symbol={symbol}
            proposals={proposals.items}
            power={power}
            write={write}
            roundLabel={
              round === undefined ? copy.common.unknown : copy.gov.vote.roundHint(round.toString())
            }
            onRefetch={refetchAll}
          />
        )}
      </GovAccessGate>
    </div>
  );
}
