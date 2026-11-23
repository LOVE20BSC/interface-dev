import { parseEventLogs, type TransactionReceipt } from 'viem';
import { submitAbi } from '@/config/abis';
import type { HexAddress } from '@/config/networks';
import { toUserMessage } from '@/shared/lib/errors';
import { useContractWrite, type ContractCall } from '@/shared/model/use-contract-write';
import type { ProposalBodyInput } from '../lib/submit-form';

/**
 * 治理域没有代币授权，所以只有「签名 → 上链 → 回执」一段（与投票一致）；页面要显示的
 * 提案编号与标题来自回执里的 `ProposalCreated` 事件（`submitAbi`），不拿表单输入冒充
 * 链上结果——标题以链上记下的那一份为准。
 *
 * 回执解析放在这里而不是页面：它只依赖 viem 与共享写链状态机，页面只负责打开回执面板。
 */

export interface SubmitInput {
  readonly submitAddress: HexAddress;
  readonly tokenAddress: HexAddress;
  readonly memberId: bigint;
  readonly body: ProposalBodyInput;
}

/**
 * 回执里的链上事实：`ProposalCreated` 的提案编号与标题。
 * 事件解析不到时两项都是 null，页面只显示回执提示，不编造编号。
 */
export interface SubmitReceipt {
  readonly proposalId: bigint | null;
  readonly title: string | null;
}

export function parseSubmitReceipt(receipt: TransactionReceipt): SubmitReceipt {
  const created = parseEventLogs({
    abi: submitAbi,
    eventName: 'ProposalCreated',
    logs: receipt.logs,
  })[0];
  if (created === undefined) return { proposalId: null, title: null };
  return { proposalId: created.args.proposalId, title: created.args.title };
}

export type SubmitWriteStage = 'idle' | 'wallet' | 'pending';

export interface SubmitWrite {
  readonly stage: SubmitWriteStage;
  readonly error: string | null;
  readonly watch: ReturnType<typeof useContractWrite>['watch'];
  readonly receipt: SubmitReceipt | null;
  readonly submit: (input: SubmitInput) => void;
  /** 关掉回执面板：清哈希与错误，允许下一笔。 */
  readonly closeReceipt: () => void;
}

export interface SubmitWriteMessages {
  readonly waitingWallet: string;
  readonly revert: string;
}

export function useSubmitWrite(
  messages: SubmitWriteMessages,
  onConfirmed: () => void,
): SubmitWrite {
  const write = useContractWrite(
    {
      wallet: messages.waitingWallet,
      reverted: messages.revert,
    },
    toUserMessage,
    onConfirmed,
  );

  /**
   * 回执由 `useTxWatch` 持有，这里只做解析而不另存一份 state：`reset()` 会把哈希清空，
   * 回执随之变 null，面板自然关闭（也不需要在 effect 里同步 state）。
   */
  const settled = write.watch.receipt;
  const receipt: SubmitReceipt | null =
    settled !== null && settled.status === 'success' ? parseSubmitReceipt(settled) : null;

  const submit = (input: SubmitInput): void => {
    const call: ContractCall = {
      address: input.submitAddress,
      abi: submitAbi,
      functionName: 'submitNewProposal',
      args: [input.tokenAddress, input.memberId, input.body, '0x'],
    };
    void write.run(call);
  };

  return {
    stage: write.stage,
    error: write.error,
    watch: write.watch,
    receipt,
    submit,
    closeReceipt: () => write.reset(),
  };
}
