import type { TransactionReceipt } from 'viem';
import { decodeEventLog } from 'viem';
import { stakeAbi } from '@/config/abis';
import type { HexHash } from '@/shared/lib/tx-watch';

/**
 * 从质押交易的回执里读回「这笔交易实际得到了什么」。
 *
 * 只认 `Stake` 合约自己的事件，数值全部来自链上（不是前端估算）：
 *   - 流动性质押：`LiquidityStaked` → 治理权增量与份额增量；
 *   - 加速质押：`BoostStaked` → 加速数量与加速份额；
 *   - 增加承诺解锁期：`PromisedWaitingPhasesIncreased` → 治理权增量与新解锁期；
 *   - 申请解锁：`Unstaked` → 清掉的治理权；
 *   - 撤出：`StakeWithdrawn` → 取回的两侧数量与加速代币。
 *
 * 无法解码的数值保留为 `undefined`，回执仍显示交易哈希。
 */

export type StakeReceiptAction =
  'stakeLiquidity' | 'stakeBoost' | 'increasePhases' | 'unstake' | 'withdraw';

export interface StakeReceiptDetail {
  readonly govPowerAdded: bigint | undefined;
  readonly govPowerRemoved: bigint | undefined;
  readonly liquiditySharesAdded: bigint | undefined;
  readonly boostAmount: bigint | undefined;
  readonly boostShares: bigint | undefined;
  readonly promisedWaitingPhases: bigint | undefined;
  readonly tokenAmount: bigint | undefined;
  readonly parentTokenAmount: bigint | undefined;
}

const EMPTY_DETAIL: StakeReceiptDetail = {
  govPowerAdded: undefined,
  govPowerRemoved: undefined,
  liquiditySharesAdded: undefined,
  boostAmount: undefined,
  boostShares: undefined,
  promisedWaitingPhases: undefined,
  tokenAmount: undefined,
  parentTokenAmount: undefined,
};

interface DecodedStakeLog {
  readonly eventName: string;
  readonly args: unknown;
}

function decodeStakeLogs(receipt: TransactionReceipt): readonly DecodedStakeLog[] {
  const decoded: DecodedStakeLog[] = [];
  for (const log of receipt.logs) {
    try {
      const entry = decodeEventLog({
        abi: stakeAbi,
        data: log.data,
        topics: log.topics,
        strict: false,
      });
      if (typeof entry.eventName === 'string' && entry.eventName.length > 0) {
        decoded.push({ eventName: entry.eventName, args: entry.args });
      }
    } catch {
      // 不是 Stake 的事件（例如代币 Transfer）：忽略，不视为失败。
    }
  }
  return decoded;
}

function argOf(args: unknown, key: string): bigint | undefined {
  if (typeof args !== 'object' || args === null) return undefined;
  const value = (args as Record<string, unknown>)[key];
  return typeof value === 'bigint' ? value : undefined;
}

export function parseStakeReceipt(
  action: StakeReceiptAction,
  receipt: TransactionReceipt,
): StakeReceiptDetail {
  const logs = decodeStakeLogs(receipt);

  if (action === 'stakeLiquidity') {
    const entry = logs.find((log) => log.eventName === 'LiquidityStaked');
    return {
      ...EMPTY_DETAIL,
      govPowerAdded: argOf(entry?.args, 'govPowerAdded'),
      liquiditySharesAdded: argOf(entry?.args, 'liquiditySharesAdded'),
    };
  }

  if (action === 'stakeBoost') {
    const entry = logs.find((log) => log.eventName === 'BoostStaked');
    return {
      ...EMPTY_DETAIL,
      govPowerAdded: argOf(entry?.args, 'govPowerAdded'),
      boostAmount: argOf(entry?.args, 'boostAmount'),
      boostShares: argOf(entry?.args, 'boostShares'),
    };
  }

  if (action === 'increasePhases') {
    const entry = logs.find((log) => log.eventName === 'PromisedWaitingPhasesIncreased');
    return {
      ...EMPTY_DETAIL,
      govPowerAdded: argOf(entry?.args, 'govPowerAdded'),
      promisedWaitingPhases: argOf(entry?.args, 'promisedWaitingPhases'),
    };
  }

  if (action === 'unstake') {
    const entry = logs.find((log) => log.eventName === 'Unstaked');
    return {
      ...EMPTY_DETAIL,
      govPowerRemoved: argOf(entry?.args, 'govPowerRemoved'),
      promisedWaitingPhases: argOf(entry?.args, 'promisedWaitingPhases'),
    };
  }

  const entry = logs.find((log) => log.eventName === 'StakeWithdrawn');
  return {
    ...EMPTY_DETAIL,
    promisedWaitingPhases: argOf(entry?.args, 'promisedWaitingPhases'),
    tokenAmount: argOf(entry?.args, 'tokenAmountForLiquidity'),
    parentTokenAmount: argOf(entry?.args, 'parentTokenAmountForLiquidity'),
    boostAmount: argOf(entry?.args, 'boostShares'),
  };
}

export interface StakeReceipt {
  readonly action: StakeReceiptAction;
  readonly hash: HexHash;
  readonly detail: StakeReceiptDetail;
  readonly recordedAt: number;
}
