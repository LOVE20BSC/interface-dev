import { parseEventLogs, type TransactionReceipt } from 'viem';
import { submitAbi } from '@/config/abis';
import type { HexAddress } from '@/config/networks';
import type { TxWatch } from '@/shared/model/use-tx-watch';
import { useWriteAttempt } from '@/shared/model/use-write-attempt';
import type { ProposalBodyInput } from '../lib/submit-form';
import { useSubmitWriteAdapter } from './submit-write-adapter';

/**
 * 治理域没有代币授权，所以只有「签名 → 上链 → 回执」一段（与投票一致）；页面要显示的
 * 提案编号与标题来自回执里的 `ProposalCreated` 事件（`submitAbi`），不拿表单输入冒充
 * 链上结果——标题以链上记下的那一份为准。
 *
 * 回执解析放在这里而不是页面：它只依赖 viem 与写链适配层（`shared` 的纯核
 * `useWriteAttempt` + 本目录 adapter），页面只负责打开回执面板。
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
  readonly watch: TxWatch;
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
  // 写链生命周期（stage / 回执 / 错误 / 卡住提示）全部由纯核持有；这里只是投影：
  // `submit` 保持 void，`closeReceipt` 映射 `clearReceipt`，`error` 取纯核的 message。
  const adapter = useSubmitWriteAdapter({
    reverted: messages.revert,
    onConfirmed,
    parse: parseSubmitReceipt,
  });
  const write = useWriteAttempt(adapter);

  const submit = (input: SubmitInput): void => {
    void write.run(input);
  };

  return {
    stage: write.stage,
    error: write.error?.message ?? null,
    watch: write.watch,
    receipt: write.receipt,
    submit,
    closeReceipt: write.clearReceipt,
  };
}
