import { copy } from '@/shared/config/copy-pages';
import { isSameAddress } from '@/shared/lib/format';

/**
 * 收款方输入三模式 (owner 2026-11-14 09:30): the mode is always explicit — a
 * pure-digit identity NFT *name* must never be read as an *id* — and the same
 * parsing/validation serves 代币转账 and the 转让身份 NFT drawer, so the two
 * pages cannot drift.
 */
export type IdentityInputMode = 'address' | 'member' | 'name';

export const IDENTITY_INPUT_MODES: readonly IdentityInputMode[] = [
  'address',
  'member',
  'name',
];

export const IDENTITY_MODE_LABELS: Readonly<Record<IdentityInputMode, string>> = {
  address: copy.transfer.modeAddress,
  member: copy.transfer.modeMember,
  name: copy.transfer.modeName,
};

export const IDENTITY_MODE_PLACEHOLDERS: Readonly<Record<IdentityInputMode, string>> = {
  address: copy.transfer.addressPlaceholder,
  member: copy.transfer.memberPlaceholder,
  name: copy.transfer.namePlaceholder,
};

/** Identity modes resolve to a MemberNFT; address mode is the plain 0x input. */
export function isIdentityInputMode(mode: IdentityInputMode): boolean {
  return mode !== 'address';
}

export function identityInputModeLabel(mode: IdentityInputMode): string {
  return IDENTITY_MODE_LABELS[mode];
}

export function identityInputPlaceholder(mode: IdentityInputMode): string {
  return IDENTITY_MODE_PLACEHOLDERS[mode];
}

export function identityInputInputMode(mode: IdentityInputMode): 'numeric' | 'text' {
  return mode === 'member' ? 'numeric' : 'text';
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const MEMBER_ID_RE = /^#?(\d+)$/;
const MAX_UINT256 = (1n << 256n) - 1n;

/** Shared address-input check: empty / 0x+40 hex / non-zero / not self. */
export type AddressInputCheck = 'empty' | 'ok' | 'invalid' | 'zero' | 'self';

export function checkAddressInput(value: string, self: string | undefined): AddressInputCheck {
  const trimmed = value.trim();
  if (trimmed.length === 0) return 'empty';
  if (!ADDRESS_RE.test(trimmed)) return 'invalid';
  if (trimmed.toLowerCase() === ZERO_ADDRESS) return 'zero';
  if (self !== undefined && isSameAddress(trimmed, self)) return 'self';
  return 'ok';
}

/**
 * 按身份 NFT ID: `#12` or `12`, nothing else. Never truncated or prefixed; a
 * name that happens to look numeric is still only ever parsed here when the
 * user explicitly picked the ID mode.
 */
export function parseMemberIdInput(value: string): bigint | null {
  const match = MEMBER_ID_RE.exec(value.trim());
  if (match === null) return null;
  try {
    const memberId = BigInt(match[1] ?? '');
    return memberId <= MAX_UINT256 ? memberId : null;
  } catch {
    return null;
  }
}

/** Status vocabulary shared by the id/name resolvers (both map onto this). */
export type IdentityResolveStatus =
  'idle' | 'reading' | 'invalid' | 'ok' | 'self' | 'not-found' | 'error';

/**
 * One error sentence per unresolved state, identical on both pages. `not-found`
 * is mode-aware: 按 ID searches the NFT id, 按名字 searches the name.
 */
export function identityInputErrorMessage(
  mode: IdentityInputMode,
  status: IdentityResolveStatus,
): string | null {
  switch (status) {
    case 'invalid':
      return copy.transfer.memberInvalid;
    case 'not-found':
      return mode === 'name' ? copy.transfer.nameNotFound : copy.transfer.memberNotFound;
    case 'self':
      return copy.transfer.identitySelf;
    case 'error':
      return copy.transfer.identityFailed;
    default:
      return null;
  }
}

/** The 正在查找 line per mode (never shown for address mode). */
export function identityInputReadingText(mode: IdentityInputMode): string {
  return mode === 'name' ? copy.transfer.nameReading : copy.transfer.memberReading;
}
