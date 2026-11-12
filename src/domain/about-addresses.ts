/**
 * Contract-address groups for the 关于 page's 合约地址 tab.
 *
 * Pure data + pure functions so the grouping, the zero-address rule and the
 * optional explorer link are all unit-testable without React or chain SDKs.
 * The page owns the Chinese labels (copy-pages `about.addresses`); this module
 * only carries stable address-book keys.
 */

/** Every slot in the environment address book, in the order they are grouped. */
export type AboutAddressKey =
  | 'launch'
  | 'mint'
  | 'stake'
  | 'submit'
  | 'vote'
  | 'phase'
  | 'tokenAddress'
  | 'firstTokenAddress'
  | 'memberNFT'
  | 'weth'
  | 'router'
  | 'factory'
  | 'pair'
  | 'multicall3'
  | 'groupChat'
  | 'groupChatMember'
  | 'groupChatAdmin'
  | 'actionTarget'
  | 'groupActionExecutor'
  | 'groupServiceExecutor'
  | 'lpExecutor'
  | 'airdropDistributor';

export type AboutAddressGroupKey = 'core' | 'tokenIdentity' | 'trade' | 'groupChat' | 'other';

export interface AboutAddressGroupDefinition {
  readonly key: AboutAddressGroupKey;
  readonly entries: readonly AboutAddressKey[];
}

/**
 * Owner-facing grouping: 核心 / 代币与身份 / 交易 / 群聊 / 其他.
 * Every address-book slot appears exactly once (the unit test enforces it), so a
 * newly added contract cannot silently disappear from this debugging page.
 */
export const ABOUT_ADDRESS_GROUPS: readonly AboutAddressGroupDefinition[] = Object.freeze([
  {
    key: 'core',
    entries: ['launch', 'mint', 'stake', 'submit', 'vote', 'phase'],
  },
  {
    key: 'tokenIdentity',
    entries: ['tokenAddress', 'firstTokenAddress', 'memberNFT', 'weth'],
  },
  {
    key: 'trade',
    entries: ['router', 'factory', 'pair', 'multicall3'],
  },
  {
    key: 'groupChat',
    entries: ['groupChat', 'groupChatMember', 'groupChatAdmin'],
  },
  {
    key: 'other',
    entries: [
      'actionTarget',
      'groupActionExecutor',
      'groupServiceExecutor',
      'lpExecutor',
      'airdropDistributor',
    ],
  },
]);

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** A hex address that is set, i.e. not the deployment's explicit zero placeholder. */
export function isConfiguredAddressValue(value: string | null | undefined): value is string {
  return typeof value === 'string' && HEX_ADDRESS.test(value) && value.toLowerCase() !== ZERO_ADDRESS;
}

export interface AboutAddressRow {
  readonly key: AboutAddressKey;
  /** undefined means "not configured" (zero address / malformed), never hidden. */
  readonly address: string | undefined;
  /** null when this deployment provides no block explorer (anvil). */
  readonly explorerUrl: string | null;
}

export interface AboutAddressGroup {
  readonly key: AboutAddressGroupKey;
  readonly rows: readonly AboutAddressRow[];
}

/** `https://bscscan.com/` + address → `https://bscscan.com/address/0x…`; null stays null. */
export function aboutExplorerAddressUrl(
  explorerBaseUrl: string | null | undefined,
  address: string,
): string | null {
  if (explorerBaseUrl === null || explorerBaseUrl === undefined) return null;
  const base = explorerBaseUrl.replace(/\/+$/, '');
  if (base.length === 0) return null;
  return `${base}/address/${address}`;
}

/**
 * Resolve the address book into readable groups. A zero/malformed entry stays in
 * its group with `address: undefined` so the page can render 未配置 instead of
 * hiding it; the explorer URL is derived per row and is null without an explorer.
 */
export function resolveAboutAddressGroups(
  addressBook: Readonly<Record<AboutAddressKey, string>>,
  explorerBaseUrl: string | null | undefined,
): readonly AboutAddressGroup[] {
  return ABOUT_ADDRESS_GROUPS.map((group) => ({
    key: group.key,
    rows: group.entries.map((key) => {
      const raw = addressBook[key];
      const address = isConfiguredAddressValue(raw) ? raw : undefined;
      return {
        key,
        address,
        explorerUrl:
          address !== undefined ? aboutExplorerAddressUrl(explorerBaseUrl, address) : null,
      };
    }),
  }));
}
