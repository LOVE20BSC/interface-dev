import { Link } from 'react-router-dom';
import { useReadContract } from 'wagmi';
import { submitAbi } from '@/config/abis';
import { configuredAddress, type HexAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { useCommunityToken } from '@/entities/community-token/model/use-community-token';
import { useGovAccess } from '@/entities/gov-core/model/use-gov-access';
import { useSubmitContext } from '@/entities/gov-core/model/use-submit-context';
import { useWalletConnection } from '@/features/connect-wallet/model/use-wallet-connection';
import { useCommunityContext } from '@/features/switch-community/model/use-community-context';
import { useSubmitWrite } from '@/features/governance-submit/model/use-submit-write';
import { SubmitPanel } from '@/features/governance-submit/ui/submit-panel';
import { GovAccessGate } from '@/widgets/gov-access-gate/gov-access-gate';

/**
 * 治理·提案 → 推举新提案（owner 2026-11-22：`/submit` 默认是历史列表，创建表单独立成页）。
 *
 * 语义按合约走（`Submit.sol:76-99,263-341`）：
 * - 推举权 = 本轮治理权 ≥ `ceil(totalGovPower * SUBMIT_MIN_RATIO / PRECISION)`，
 *   且社区本轮有人质押；`useSubmitContext` 已经把这些算好；
 * - 一个身份每轮**只能推举 1 个**（`MemberAlreadySubmitted`），已推举时页面只显示
 *   链上记下的提案编号与标题，不再渲染表单。
 */
export function SubmitNewPage() {
  const { symbol } = useCommunityContext();
  const token = useCommunityToken(symbol);
  const { isWrongChain } = useWalletConnection();
  const access = useGovAccess(token.address, ['submit', 'stake', 'phase']);
  const submitAddress = configuredAddress('submit');
  const context = useSubmitContext(token.address, access.memberId);

  /**
   * 本轮已推举提案的标题：链上没有「按 id 单读标题」的专用 view，只能拿
   * `proposalInfosByProposalIds` 读这一条。读不到就把 undefined 交给面板，
   * 面板用「—」兜底（绝不编一个标题）。
   */
  const submittedId = context.submittedProposalThisRound;
  const submittedReadArgs: readonly [HexAddress, readonly bigint[]] | undefined =
    token.address !== undefined && submittedId !== undefined && submittedId !== 0n
      ? [token.address, [submittedId]]
      : undefined;
  const submittedInfo = useReadContract({
    address: submitAddress,
    abi: submitAbi,
    functionName: 'proposalInfosByProposalIds',
    args: submittedReadArgs,
    query: { enabled: submittedReadArgs !== undefined },
  });
  const submittedTitle = submittedInfo.data?.[0]?.body.title;

  // 成功后重读资格 / 限制 / 轮次，表单随即换成「本轮已经推举」。
  const refetchAll = (): void => {
    context.refetch();
    token.refetch();
    access.refetch();
  };

  const write = useSubmitWrite(
    {
      waitingWallet: copy.gov.submit.waitingWallet,
      revert: copy.gov.submit.revert,
    },
    refetchAll,
  );

  const backToList = `/submit?symbol=${encodeURIComponent(symbol)}`;

  return (
    <div className="space-y-4">
      <Link
        to={backToList}
        data-testid="gov-submit-new-back"
        className="inline-flex items-center gap-1 text-sm font-medium text-brand-strong"
      >
        ← {copy.gov.submit.backToList}
      </Link>
      <h1 className="text-lg font-bold text-foreground" data-testid="gov-submit-page-title">
        {copy.gov.submit.newTitle}
      </h1>
      <GovAccessGate access={access} isWrongChain={isWrongChain} symbol={symbol}>
        {submitAddress === undefined ||
        token.address === undefined ||
        access.memberId === undefined ? (
          <p className="text-sm text-muted" data-testid="gov-submit-unavailable">
            {copy.gov.gates.unconfiguredBody}
          </p>
        ) : (
          <SubmitPanel
            submitAddress={submitAddress}
            symbol={symbol}
            tokenAddress={token.address}
            memberId={access.memberId}
            context={context}
            submittedTitle={submittedTitle}
            write={write}
            onRefetch={refetchAll}
          />
        )}
      </GovAccessGate>
    </div>
  );
}
