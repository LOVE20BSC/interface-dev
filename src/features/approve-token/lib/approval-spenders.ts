import type { AddressBook, HexAddress } from '@/config/networks';
import { isConfiguredAddress } from '@/config/networks';

/**
 * 常用合约授权列表 (owner 2026-11-14).
 *
 * Spenders are address-book slots, never hardcoded addresses: a deployment that
 * lacks a target simply drops the row instead of showing a dead entry. The
 * order is the page's review order and is part of the UI contract (the theory
 * line and the e2e screenshots rely on it).
 *
 * Pure module: the builder takes the address book as an argument, so the rows
 * are unit-tested without a chain or a deployment.
 */

export type ApprovalSpenderId =
  | 'router'
  | 'stake'
  | 'vote'
  | 'submit'
  | 'mint'
  | 'launch'
  | 'hub'
  | 'lpExecutor'
  | 'batchTransfer'
  | 'groupChat';

export interface ApprovalSpenderSlot {
  readonly id: ApprovalSpenderId;
  readonly slot: keyof AddressBook;
}

/** Wallet-action order: trade → stake → governance/launch → liquidity → group chat. */
export const APPROVAL_SPENDER_SLOTS: readonly ApprovalSpenderSlot[] = Object.freeze([
  { id: 'router', slot: 'router' },
  { id: 'stake', slot: 'stake' },
  { id: 'vote', slot: 'vote' },
  { id: 'submit', slot: 'submit' },
  { id: 'mint', slot: 'mint' },
  { id: 'launch', slot: 'launch' },
  { id: 'hub', slot: 'hub' },
  { id: 'lpExecutor', slot: 'lpExecutor' },
  { id: 'batchTransfer', slot: 'batchTransfer' },
  { id: 'groupChat', slot: 'groupChat' },
]);

export interface ApprovalSpender {
  readonly id: ApprovalSpenderId;
  readonly address: HexAddress;
}

/**
 * Resolve the visible rows from an address book snapshot. Missing/zero slots are
 * skipped; if two slots happen to hold the same address the first one wins (one
 * allowance row per spender, never two rows showing the same number).
 */
export function buildApprovalSpenders(
  addresses: Pick<AddressBook, keyof AddressBook>,
): readonly ApprovalSpender[] {
  const seen = new Set<string>();
  const spenders: ApprovalSpender[] = [];
  for (const definition of APPROVAL_SPENDER_SLOTS) {
    const address = addresses[definition.slot];
    if (!isConfiguredAddress(address)) continue;
    const key = address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    spenders.push({ id: definition.id, address });
  }
  return spenders;
}

export type SpenderInputCheck = 'empty' | 'invalid' | 'zero' | 'self' | 'ok';

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * Immediate validation of the custom spender field. Deliberately no chain read:
 * a spender is any address (EOA or contract), so only the shape and the two
 * meaningless targets are rejected here.
 */
export function checkSpenderInput(raw: string, wallet: string | undefined): SpenderInputCheck {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return 'empty';
  if (!ADDRESS_RE.test(trimmed)) return 'invalid';
  const normalized = trimmed.toLowerCase();
  if (normalized === '0x0000000000000000000000000000000000000000') return 'zero';
  if (wallet !== undefined && normalized === wallet.toLowerCase()) return 'self';
  return 'ok';
}
