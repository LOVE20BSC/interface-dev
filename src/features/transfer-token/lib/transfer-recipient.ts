import { ADDRESSES, isConfiguredAddress, type HexAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { isSameAddress } from '@/shared/lib/format';
import { validateRecipient } from '@/features/transfer-identity/lib/validate-recipient';

/**
 * Recipient checks for 代币转账 (pure, no React, no chain).
 *
 * Two independent questions:
 *  1. is the typed value a usable address? (format / zero / self)
 *  2. what does that address mean? — an address-book contract, an arbitrary
 *     contract with bytecode, or a plain wallet. The bytecode half is read in
 *     the UI (it needs an RPC); this module owns the decision so the warning is
 *     unit-testable.
 */
export type TransferRecipientCheck = 'empty' | 'ok' | 'invalid' | 'zero' | 'self';

export function checkTransferRecipient(
  value: string,
  self: string | undefined,
): TransferRecipientCheck {
  if (value.trim().length === 0) return 'empty';
  return validateRecipient(value, self);
}

export type KnownContractLabelKey = keyof (typeof copy)['about']['addresses']['labels'];

/**
 * Address-book contracts worth calling out on a transfer recipient. ERC20 token
 * addresses are deliberately absent: the pair IS listed because sending LP
 * tokens to the pair itself is a classic loss. The labels are the same ones the
 * 关于 page shows, so one contract never gets two names.
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

/**
 * - known: the recipient is a protocol/address-book contract → show its name and
 *   require an explicit confirmation before submitting;
 * - contract: any other address with bytecode → warn once (no confirmation
 *   required, per UX spec: the user may be sending on purpose);
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

export function decideRecipientProtection(
  recipient: string,
  hasBytecode: boolean | undefined,
): RecipientProtection {
  const trimmed = recipient.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) return { kind: 'plain' };
  const labelKey = knownContractLabelKey(trimmed);
  if (labelKey !== undefined) {
    return { kind: 'known', address: trimmed as HexAddress, labelKey };
  }
  if (hasBytecode === true) return { kind: 'contract', address: trimmed as HexAddress };
  return { kind: 'plain' };
}
