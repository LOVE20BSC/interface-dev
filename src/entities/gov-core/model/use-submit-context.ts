import { useReadContract, useReadContracts } from 'wagmi';
import { stakeAbi, submitAbi } from '@/config/abis';
import { configuredAddress, type HexAddress } from '@/config/networks';
import { requiredSubmitVotes } from '@/domain/gov-core';

/**
 * 提案（推举）页的资格与限制。
 *
 * 合约口径：
 * - 推举权 = `validVotes >= ceil(totalGovVotes * SUBMIT_MIN_RATIO / PRECISION)`
 *   且 `totalGovVotes != 0`（`Submit.sol:76-99`）；`canSubmit` 就是这条规则的封装；
 * - 每个身份每轮**只能推举 1 个**（`MemberAlreadySubmitted`，`Submit.sol:329-341`），
 *   整轮上限 `SUBMIT_ROUND_LIMIT = 1000`（私有常量，读不到，界面不显示数字）；
 * - 正文上限由 `MAX_TITLE_LENGTH` / `MAX_DETAILS_LENGTH` / `MAX_TARGET_DATA_*` 给出，
 *   一律按 **UTF-8 字节**算（`Submit.sol:264-281`），所以中文字符不等于 1 个字节。
 */

export type SubmitContextStatus = 'unconfigured' | 'loading' | 'error' | 'ready';

export interface SubmitLimits {
  readonly maxTitleLength: bigint;
  readonly maxDetailsLength: bigint;
  readonly maxTargetDataCount: bigint;
  readonly maxTargetDataBytes: bigint;
}

export interface SubmitContext {
  readonly status: SubmitContextStatus;
  readonly canSubmit: boolean | undefined;
  readonly submitMinRatio: bigint | undefined;
  readonly totalGovVotes: bigint | undefined;
  readonly myGovVotes: bigint | undefined;
  /** 按比例算出的门槛；`canSubmit` 是合约的最终答案，这个数只用于向用户解释差多少。 */
  readonly requiredVotes: bigint | undefined;
  readonly limits: SubmitLimits | undefined;
  /** 本轮我是否已经推举过（`proposalIdBySubmitterId` 非 0 即已推举）。 */
  readonly submittedProposalThisRound: bigint | undefined;
  readonly refetch: () => void;
}

export function useSubmitContext(
  tokenAddress: HexAddress | undefined,
  round: bigint | undefined,
  memberId: bigint | undefined,
): SubmitContext {
  const submitAddress = configuredAddress('submit');
  const stakeAddress = configuredAddress('stake');
  const memberEnabled =
    submitAddress !== undefined && tokenAddress !== undefined && memberId !== undefined;

  const canSubmit = useReadContract({
    address: submitAddress,
    abi: submitAbi,
    functionName: 'canSubmit',
    args: memberEnabled ? [tokenAddress, memberId] : undefined,
    query: { enabled: memberEnabled },
  });

  const constants = useReadContracts({
    contracts:
      submitAddress !== undefined
        ? [
            { address: submitAddress, abi: submitAbi, functionName: 'SUBMIT_MIN_RATIO' as const },
            { address: submitAddress, abi: submitAbi, functionName: 'MAX_TITLE_LENGTH' as const },
            { address: submitAddress, abi: submitAbi, functionName: 'MAX_DETAILS_LENGTH' as const },
            {
              address: submitAddress,
              abi: submitAbi,
              functionName: 'MAX_TARGET_DATA_COUNT' as const,
            },
            {
              address: submitAddress,
              abi: submitAbi,
              functionName: 'MAX_TARGET_DATA_BYTES' as const,
            },
          ]
        : [],
    query: { enabled: submitAddress !== undefined },
  });

  const roundEnabled =
    stakeAddress !== undefined && tokenAddress !== undefined && round !== undefined;
  const totalGovVotesRead = useReadContract({
    address: stakeAddress,
    abi: stakeAbi,
    functionName: 'totalGovVotes',
    args: roundEnabled ? [tokenAddress, round] : undefined,
    query: { enabled: roundEnabled },
  });
  const myGovVotesRead = useReadContract({
    address: stakeAddress,
    abi: stakeAbi,
    functionName: 'govVotes',
    args: roundEnabled && memberId !== undefined ? [tokenAddress, round, memberId] : undefined,
    query: { enabled: roundEnabled && memberId !== undefined },
  });

  const submittedEnabled = memberEnabled && round !== undefined;
  const submitted = useReadContract({
    address: submitAddress,
    abi: submitAbi,
    functionName: 'proposalIdBySubmitterId',
    args: submittedEnabled ? [tokenAddress, round, memberId] : undefined,
    query: { enabled: submittedEnabled },
  });

  const values = constants.data;
  const maxTitleLength = values?.[1]?.result;
  const maxDetailsLength = values?.[2]?.result;
  const maxTargetDataCount = values?.[3]?.result;
  const maxTargetDataBytes = values?.[4]?.result;
  const limits: SubmitLimits | undefined =
    typeof maxTitleLength === 'bigint' &&
    typeof maxDetailsLength === 'bigint' &&
    typeof maxTargetDataCount === 'bigint' &&
    typeof maxTargetDataBytes === 'bigint'
      ? { maxTitleLength, maxDetailsLength, maxTargetDataCount, maxTargetDataBytes }
      : undefined;

  const submitMinRatio = toBigInt(values?.[0]?.result);
  const totalGovVotes = toBigInt(totalGovVotesRead.data);
  const myGovVotes = toBigInt(myGovVotesRead.data);
  const requiredVotes =
    totalGovVotes !== undefined && submitMinRatio !== undefined
      ? requiredSubmitVotes(totalGovVotes, submitMinRatio)
      : undefined;

  const isError =
    canSubmit.isError ||
    constants.isError ||
    totalGovVotesRead.isError ||
    myGovVotesRead.isError ||
    submitted.isError;
  const isLoading =
    canSubmit.isLoading ||
    constants.isLoading ||
    totalGovVotesRead.isLoading ||
    myGovVotesRead.isLoading ||
    submitted.isLoading;
  const status: SubmitContextStatus =
    submitAddress === undefined || tokenAddress === undefined
      ? 'unconfigured'
      : isError
        ? 'error'
        : isLoading
          ? 'loading'
          : 'ready';

  return {
    status,
    canSubmit: typeof canSubmit.data === 'boolean' ? canSubmit.data : undefined,
    submitMinRatio,
    totalGovVotes,
    myGovVotes,
    requiredVotes,
    limits,
    submittedProposalThisRound: toBigInt(submitted.data),
    refetch: () => {
      canSubmit.refetch();
      constants.refetch();
      totalGovVotesRead.refetch();
      myGovVotesRead.refetch();
      submitted.refetch();
    },
  };
}

function toBigInt(value: unknown): bigint | undefined {
  return typeof value === 'bigint' ? value : undefined;
}
