import deploymentJson from '@deployments';
import { APP_ENV } from './env';
import {
  isHexAddress,
  parseDeployment,
  type AddressBook,
  type DeploymentConfig,
  type HexAddress,
} from './deployments/types';

export type { AddressBook, DeploymentConfig, HexAddress } from './deployments/types';

export const ZERO_ADDRESS: HexAddress = '0x0000000000000000000000000000000000000000';

/**
 * Built-in fallbacks. They are *data* fallbacks, never chain facts:
 * every address-dependent surface checks isConfiguredAddress() and renders
 * 「未配置」 instead of guessing.
 */
const FALLBACK_SYMBOL = 'LOVE20';

export const DEPLOYMENT: DeploymentConfig = parseDeployment(deploymentJson, APP_ENV.variant);

export const ADDRESSES: AddressBook = DEPLOYMENT.addresses;

export const NETWORK = Object.freeze({
  chainId: DEPLOYMENT.chainId,
  name: DEPLOYMENT.chainName,
  rpcUrls: DEPLOYMENT.rpcUrls,
  nativeCurrency: DEPLOYMENT.nativeCurrency,
  blockExplorerUrl: DEPLOYMENT.blockExplorerUrl,
  testnet: DEPLOYMENT.testnet,
  variant: DEPLOYMENT.variant,
});

export const DEFAULT_SYMBOL: string = DEPLOYMENT.defaultSymbol || FALLBACK_SYMBOL;

export const BRAND_FALLBACK = Object.freeze({
  name: DEPLOYMENT.brand.name || 'LOVE20',
  symbol: FALLBACK_SYMBOL,
  tagline: DEPLOYMENT.brand.tagline,
});

export const RPC_URLS: readonly string[] = DEPLOYMENT.rpcUrls;

/** Zero address means "this deployment has not provided the contract yet". */
export function isConfiguredAddress(value: string | null | undefined): value is HexAddress {
  return isHexAddress(value) && value.toLowerCase() !== ZERO_ADDRESS;
}

export function configuredAddress(key: keyof AddressBook): HexAddress | undefined {
  const value = ADDRESSES[key];
  return isConfiguredAddress(value) ? value : undefined;
}

/**
 * Any core contract exposes MEMBER_NFT_ADDRESS(); one configured seed is enough
 * to discover the single global MemberNFT of a deployment (ADR-0003).
 */
const SEED_CORE_KEYS = ['launch', 'mint', 'stake', 'submit', 'vote'] as const;

export function seedCoreAddress(): HexAddress | undefined {
  for (const key of SEED_CORE_KEYS) {
    const address = configuredAddress(key);
    if (address !== undefined) return address;
  }
  return undefined;
}

export const ADDRESS_BOOK_KEYS = [
  'tokenAddress',
  'memberNFT',
  'stake',
  'submit',
  'vote',
  'mint',
  'phase',
  'launch',
  'actionTarget',
  'groupActionExecutor',
  'groupServiceExecutor',
  'lpExecutor',
  'groupChat',
  'groupChatMember',
  'groupChatAdmin',
  'weth',
  'factory',
  'router',
  'multicall3',
  'airdrop',
  'firstTokenAddress',
] as const satisfies readonly (keyof AddressBook)[];

export function addressBookStatus(): {
  readonly total: number;
  readonly configured: number;
  readonly isConfigured: boolean;
} {
  const configured = ADDRESS_BOOK_KEYS.filter((key) => isConfiguredAddress(ADDRESSES[key])).length;
  return { total: ADDRESS_BOOK_KEYS.length, configured, isConfigured: configured > 0 };
}

export function isDeploymentConfigured(): boolean {
  return addressBookStatus().isConfigured;
}

export function explorerAddressUrl(address: HexAddress): string | null {
  if (DEPLOYMENT.blockExplorerUrl === null) return null;
  return `${DEPLOYMENT.blockExplorerUrl}/address/${address}`;
}
