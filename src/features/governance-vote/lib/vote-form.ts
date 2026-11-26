import { parseAmountInput } from '@/shared/lib/amount-input';
import type { VoteAllocation } from '@/domain/gov-core';

/**
 * 投票票数输入解析。
 *
 * 治理权是 18 位小数的数量（`Stake.govVotes`），用户在页面上按「票」输入，
 * 这里负责把输入变成 wei 级 `bigint` 并挡掉明显的坏输入；「合计是否超额度」由
 * `domain/gov-core#validateVoteAllocation` 判断，两件事不混在一个函数里。
 */
export type ParsedVoteAmount =
  | { readonly kind: 'ok'; readonly value: bigint }
  | { readonly kind: 'empty' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'zero' };

export function parseVoteAmount(raw: string, decimals = 18): ParsedVoteAmount {
  // viem 的 parseUnits 会把多余小数位**截断**（不报错）；票数上这是静默丢数，所以
  // 用 `reject-as-invalid` 策略，超精度直接算非法输入。
  const parsed = parseAmountInput(raw, { decimals, strategy: 'reject-as-invalid' });
  switch (parsed.kind) {
    case 'empty':
      return { kind: 'empty' };
    case 'too-precise':
    case 'invalid':
      return { kind: 'invalid' };
    case 'zero':
      return { kind: 'zero' };
    case 'ok':
      return { kind: 'ok', value: parsed.value };
  }
}

/**
 * 把「每个提案一栏输入」整理成合约要的 `proposalIds[] + voteAmounts[]`。
 * 空栏视为不投这个提案（合约 `ZeroVoteAmount` 不允许 0，所以必须过滤掉而不是填 0）。
 */
export interface VoteDraftEntry {
  readonly proposalId: bigint;
  readonly raw: string;
}

export type VoteDraftResult =
  | { readonly kind: 'ok'; readonly allocations: readonly VoteAllocation[] }
  | { readonly kind: 'invalid'; readonly proposalId: bigint }
  | { readonly kind: 'empty' };

export function buildVoteDraft(entries: readonly VoteDraftEntry[], decimals = 18): VoteDraftResult {
  const allocations: VoteAllocation[] = [];
  for (const entry of entries) {
    const parsed = parseVoteAmount(entry.raw, decimals);
    if (parsed.kind === 'empty') continue;
    if (parsed.kind !== 'ok') return { kind: 'invalid', proposalId: entry.proposalId };
    allocations.push({ proposalId: entry.proposalId, amount: parsed.value });
  }
  if (allocations.length === 0) return { kind: 'empty' };
  return { kind: 'ok', allocations };
}
