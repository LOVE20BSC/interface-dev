import { useQuery } from '@tanstack/react-query';
import { useConfig, useReadContracts } from 'wagmi';
import { getBlockNumber, readContract, readContracts } from 'wagmi/actions';
import { stakeAbi, submitAbi } from '@/config/abis';
import { NETWORK, configuredAddress, type HexAddress } from '@/config/networks';
import { requiredSubmitGovPower, type ProposalLimits } from '@/domain/gov-core';

const SUBMIT_POLL_MS = 15_000;

/**
 * 提案（推举）页的资格与限制。
 *
 * 合约口径：
 * - 推举权 = `memberGovPower >= ceil(totalGovPower * SUBMIT_MIN_RATIO / PRECISION)`
 *   且 `totalGovPower != 0`（`Submit.sol:76-99`）；`canSubmit` 就是这条规则的封装；
 * - 每个身份每轮**只能推举 1 个**（`MemberAlreadySubmitted`，`Submit.sol:329-341`），
 *   整轮上限 `SUBMIT_ROUND_LIMIT = 1000`（私有常量，读不到，界面不显示数字）。
 */

export type SubmitContextStatus = 'unconfigured' | 'loading' | 'error' | 'ready';

export interface SubmitContext {
  readonly status: SubmitContextStatus;
  readonly round: { readonly number: bigint; readonly blockNumber: bigint } | undefined;
  readonly canSubmit: boolean | undefined;
  readonly submitMinRatio: bigint | undefined;
  readonly totalGovPower: bigint | undefined;
  readonly myGovPower: bigint | undefined;
  /** 按比例算出的门槛；`canSubmit` 是合约的最终答案，这个数只用于向用户解释差多少。 */
  readonly requiredGovPower: bigint | undefined;
  readonly limits: ProposalLimits | undefined;
  /** 本轮我是否已经推举过（`proposalIdBySubmitterId` 非 0 即已推举）。 */
  readonly submittedProposalThisRound: bigint | undefined;
  readonly refetch: () => void;
}

export function useSubmitContext(
  tokenAddress: HexAddress | undefined,
  memberId: bigint | undefined,
): SubmitContext {
  const config = useConfig();
  const submitAddress = configuredAddress('submit');
  const stakeAddress = configuredAddress('stake');
  const configured =
    submitAddress !== undefined && stakeAddress !== undefined && tokenAddress !== undefined;
  const enabled = configured && memberId !== undefined;

  const eligibility = useQuery({
    queryKey: [
      'submit-context',
      NETWORK.chainId,
      submitAddress,
      stakeAddress,
      tokenAddress,
      memberId?.toString(),
    ],
    enabled,
    staleTime: 0,
    refetchInterval: SUBMIT_POLL_MS,
    queryFn: async () => {
      if (!enabled) throw new Error('Submit context requires a token and member');
      const chainId = NETWORK.chainId;
      const blockNumber = await getBlockNumber(config, { chainId, cacheTime: 0 });
      const submit = { address: submitAddress, abi: submitAbi, chainId } as const;
      const stake = { address: stakeAddress, abi: stakeAbi, chainId } as const;
      const round = await readContract(config, {
        ...submit,
        functionName: 'currentRound',
        blockNumber,
      });
      // canSubmit checks the round of its block. Pin the displayed powers and submission to it.
      const [canSubmit, totalGovPower, myGovPower, submittedProposalThisRound] =
        await readContracts(config, {
          blockNumber,
          allowFailure: false,
          contracts: [
            { ...submit, functionName: 'canSubmit', args: [tokenAddress, memberId] },
            { ...stake, functionName: 'totalGovPower', args: [tokenAddress, round] },
            { ...stake, functionName: 'govPower', args: [tokenAddress, round, memberId] },
            {
              ...submit,
              functionName: 'proposalIdBySubmitterId',
              args: [tokenAddress, round, memberId],
            },
          ],
        });
      return {
        round: { number: round, blockNumber },
        canSubmit,
        totalGovPower,
        myGovPower,
        submittedProposalThisRound,
      };
    },
  });

  const constants = useReadContracts({
    allowFailure: false,
    contracts:
      submitAddress !== undefined
        ? [
            { address: submitAddress, abi: submitAbi, functionName: 'SUBMIT_MIN_RATIO' as const },
            { address: submitAddress, abi: submitAbi, functionName: 'MAX_TITLE_LENGTH' as const },
            { address: submitAddress, abi: submitAbi, functionName: 'MAX_DETAILS_LENGTH' as const },
            {
              address: submitAddress,
              abi: submitAbi,
              functionName: 'MAX_CREATION_DATA_BYTES' as const,
            },
          ]
        : [],
    query: { enabled: submitAddress !== undefined },
  });

  const [submitMinRatio, maxTitleLength, maxDetailsLength, maxCreationDataBytes] =
    constants.data ?? [];
  const limits =
    maxTitleLength === undefined ||
    maxDetailsLength === undefined ||
    maxCreationDataBytes === undefined
      ? undefined
      : { maxTitleLength, maxDetailsLength, maxCreationDataBytes };

  const snapshot = eligibility.isError ? undefined : eligibility.data;
  const { totalGovPower, myGovPower } = snapshot ?? {};
  const requiredGovPower =
    totalGovPower !== undefined && submitMinRatio !== undefined
      ? requiredSubmitGovPower(totalGovPower, submitMinRatio)
      : undefined;

  const status: SubmitContextStatus = !configured
    ? 'unconfigured'
    : constants.isError || eligibility.isError
      ? 'error'
      : snapshot === undefined || limits === undefined
        ? 'loading'
        : 'ready';

  return {
    status,
    round: snapshot?.round,
    canSubmit: snapshot?.canSubmit,
    submitMinRatio,
    totalGovPower,
    myGovPower,
    requiredGovPower,
    limits,
    submittedProposalThisRound: snapshot?.submittedProposalThisRound,
    refetch: () => {
      if (submitAddress !== undefined) void constants.refetch();
      if (enabled) void eligibility.refetch();
    },
  };
}
