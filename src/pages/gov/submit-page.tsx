import { useState } from 'react';
import { configuredAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { usePhaseClock } from '@/entities/phase/model/use-phase-clock';
import { useCommunityToken } from '@/entities/community-token/model/use-community-token';
import { useGovAccess } from '@/entities/gov-core/model/use-gov-access';
import { useProposalHistory } from '@/entities/gov-core/model/use-proposal-history';
import { useSubmitContext } from '@/entities/gov-core/model/use-submit-context';
import { useWalletConnection } from '@/features/connect-wallet/model/use-wallet-connection';
import { useCommunityContext } from '@/features/switch-community/model/use-community-context';
import { GOV_POLL_MS } from '@/features/governance-stake/model/use-gov-context';
import { useSubmitExisting } from '@/features/governance-submit/model/use-submit-existing';
import { SubmitHistoryPanel } from '@/features/governance-submit/ui/submit-history-panel';
import { GovAccessGate } from '@/widgets/gov-access-gate/gov-access-gate';

/** 历史提案每页条数（owner 2026-11-22：每页 10 条）。 */
const PAGE_SIZE = 10;

/**
 * 治理·提案（`/submit`）——**历史提案列表**（owner 2026-11-22）。
 *
 * 这一页默认就是列表：按提案编号倒序、每页 10 条，右上「推举新提案」进创建页
 * （`/submit/new`）。行内「推举」走 `Submit.submit(proposalId)`；本轮已经推举过
 * （同一身份每轮只能推举一个）时整段只读并给说明。
 */
export function SubmitPage() {
  const { symbol } = useCommunityContext();
  const token = useCommunityToken(symbol);
  const { isWrongChain } = useWalletConnection();
  const access = useGovAccess(token.address, ['submit', 'stake', 'phase']);
  const clock = usePhaseClock({ refetchIntervalMs: GOV_POLL_MS });
  const round = clock.currentPhase;
  const submitAddress = configuredAddress('submit');
  const context = useSubmitContext(token.address, round, access.memberId);

  const [page, setPage] = useState(1);
  const history = useProposalHistory(token.address, {
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    round,
  });

  const totalPages =
    history.total === undefined
      ? undefined
      : Math.max(1, Math.ceil(Number(history.total) / PAGE_SIZE));

  const refetchAll = (): void => {
    history.refetch();
    context.refetch();
    clock.refetch();
    token.refetch();
    access.refetch();
  };

  const write = useSubmitExisting(
    {
      waitingWallet: copy.gov.submit.waitingWallet,
      revert: copy.gov.submit.revert,
    },
    refetchAll,
  );

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-foreground" data-testid="gov-submit-page-title">
        {copy.gov.submit.title}
      </h1>
      <p className="text-sm leading-6 text-muted">{copy.gov.submit.intro}</p>
      <GovAccessGate access={access} isWrongChain={isWrongChain} symbol={symbol}>
        {submitAddress === undefined ||
        token.address === undefined ||
        access.memberId === undefined ? (
          <p className="text-sm text-muted" data-testid="gov-submit-unavailable">
            {copy.gov.gates.unconfiguredBody}
          </p>
        ) : (
          <SubmitHistoryPanel
            submitAddress={submitAddress}
            symbol={symbol}
            tokenAddress={token.address}
            memberId={access.memberId}
            canSubmit={context.canSubmit === true}
            submittedThisRoundId={context.submittedProposalThisRound}
            page={page}
            totalPages={totalPages}
            history={history}
            write={write}
            onRefetch={refetchAll}
            onPageChange={setPage}
          />
        )}
      </GovAccessGate>
    </div>
  );
}
