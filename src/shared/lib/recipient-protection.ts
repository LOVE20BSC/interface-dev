import { ADDRESSES, isConfiguredAddress, type HexAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { isSameAddress } from '@/shared/lib/format';

/**
 * Recipient protection for every asset-transfer surface (pure, no React, no chain).
 *
 * One question: what does this recipient address mean?
 *  - a known address-book protocol contract → asset protection intercepts it
 *    while the 智能资产保护 switch is on. Turning the switch off skips the
 *    address-book half entirely (the same address then falls through to the
 *    bytecode check below), so nothing is blocked or named as 「X 合约」;
 *  - any address with bytecode → a visible warning, never a block (the user may
 *    be sending on purpose);
 *  - a plain wallet (or an unsettled bytecode read) → nothing to say.
 *
 * The bytecode half is read by the UI (it needs an RPC); this module owns the
 * decision so the transfer drawer, 代币转账 and 批量转账 share one rule set and
 * one set of labels (the same labels `/about` shows, so one contract never gets
 * two names).
 */
export type KnownContractLabelKey = keyof (typeof copy)['about']['addresses']['labels'];

/**
 * Address-book contracts worth calling out on a recipient. ERC20 token addresses
 * are deliberately absent: the pair IS listed because sending LP tokens to the
 * pair itself is a classic loss.
 */
const KNOWN_CONTRACT_SLOTS: readonly {
  readonly slot: keyof typeof ADDRESSES;
  readonly labelKey: KnownContractLabelKey;
}[] = [
  { slot: 'memberNFT', labelKey: 'memberNFT' },
  { slot: 'stake', labelKey: 'stake' },
  { slot: 'submit', labelKey: 'submit' },
  { slot: 'vote', labelKey: 'vote' },
  { slot: 'mint', labelKey: 'mint' },
  { slot: 'phase', labelKey: 'phase' },
  { slot: 'launch', labelKey: 'launch' },
  { slot: 'actionTarget', labelKey: 'actionTarget' },
  { slot: 'groupActionExecutor', labelKey: 'groupActionExecutor' },
  { slot: 'groupServiceExecutor', labelKey: 'groupServiceExecutor' },
  { slot: 'lpExecutor', labelKey: 'lpExecutor' },
  { slot: 'groupChat', labelKey: 'groupChat' },
  { slot: 'groupChatMember', labelKey: 'groupChatMember' },
  { slot: 'groupChatAdmin', labelKey: 'groupChatAdmin' },
  { slot: 'weth', labelKey: 'weth' },
  { slot: 'factory', labelKey: 'factory' },
  { slot: 'router', labelKey: 'router' },
  { slot: 'multicall3', labelKey: 'multicall3' },
  { slot: 'airdropDistributor', labelKey: 'airdropDistributor' },
  { slot: 'pair', labelKey: 'pair' },
];

/**
 * The address-book label for a recipient, or undefined for a plain/unknown
 * address. Compares case-insensitively; ignores unconfigured (zero) slots.
 */
export function knownContractLabelKey(recipient: string): KnownContractLabelKey | undefined {
  for (const { slot, labelKey } of KNOWN_CONTRACT_SLOTS) {
    const address = ADDRESSES[slot];
    if (isConfiguredAddress(address) && isSameAddress(address, recipient)) return labelKey;
  }
  return undefined;
}

export function knownContractLabel(key: KnownContractLabelKey): string {
  return copy.about.addresses.labels[key];
}

/** The label for a known contract recipient, or undefined for anything else. */
export function knownContractLabelOf(recipient: string): string | undefined {
  const key = knownContractLabelKey(recipient);
  return key === undefined ? undefined : knownContractLabel(key);
}

/**
 * - known: the recipient is a protocol/address-book contract → 智能资产保护
 *   intercepts it while the switch is on;
 * - contract: any address with bytecode → warn once (no block);
 * - plain: an EOA (or the bytecode read has not settled yet) → no warning.
 */
export type RecipientProtection =
  | { readonly kind: 'plain' }
  | {
      readonly kind: 'known';
      readonly address: HexAddress;
      readonly labelKey: KnownContractLabelKey;
    }
  | { readonly kind: 'contract'; readonly address: HexAddress };

export interface RecipientProtectionOptions {
  /**
   * Whether the address book is consulted at all / 智能资产保护 switch state.
   * - true (default): a known address-book contract is reported as `known`, so
   *   the pages intercept it (and the batch page names it row by row);
   * - false (owner 2026-11-16 「关闭只跳过已知合约检测」): the address book is
   *   never read. A known address is treated exactly like any other address:
   *   bytecode still warns, but there is no 「这是 X 合约」 naming, no block and
   *   no acknowledgement checkbox.
   */
  readonly detectKnown?: boolean;
}

export function decideRecipientProtection(
  recipient: string,
  hasBytecode: boolean | undefined,
  options: RecipientProtectionOptions = {},
): RecipientProtection {
  const trimmed = recipient.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) return { kind: 'plain' };
  if (options.detectKnown ?? true) {
    const labelKey = knownContractLabelKey(trimmed);
    if (labelKey !== undefined) {
      return { kind: 'known', address: trimmed as HexAddress, labelKey };
    }
  }
  if (hasBytecode === true) return { kind: 'contract', address: trimmed as HexAddress };
  return { kind: 'plain' };
}
