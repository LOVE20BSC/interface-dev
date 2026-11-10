import { isEnvVariant, type EnvVariant } from '../variant';

export type HexAddress = `0x${string}`;

/**
 * The address book is the only place contract addresses may live.
 * Every key is required so a missing deployment entry is an explicit zero
 * address ("未配置") rather than an accidental stale address from another chain.
 */
export interface AddressBook {
  readonly tokenAddress: HexAddress;
  readonly memberNFT: HexAddress;
  readonly stake: HexAddress;
  readonly submit: HexAddress;
  readonly vote: HexAddress;
  readonly mint: HexAddress;
  readonly phase: HexAddress;
  readonly launch: HexAddress;
  readonly actionTarget: HexAddress;
  readonly groupActionExecutor: HexAddress;
  readonly groupServiceExecutor: HexAddress;
  readonly lpExecutor: HexAddress;
  readonly groupChat: HexAddress;
  readonly groupChatMember: HexAddress;
  readonly groupChatAdmin: HexAddress;
  readonly weth: HexAddress;
  readonly factory: HexAddress;
  readonly router: HexAddress;
  readonly multicall3: HexAddress;
  readonly airdrop: HexAddress;
  readonly firstTokenAddress: HexAddress;
}

export interface NativeCurrency {
  readonly name: string;
  readonly symbol: string;
  readonly decimals: number;
}

export interface DeploymentConfig {
  readonly variant: EnvVariant;
  readonly chainId: number;
  readonly chainName: string;
  readonly rpcUrls: readonly string[];
  readonly nativeCurrency: NativeCurrency;
  readonly blockExplorerUrl: string | null;
  /** URL seed only; the on-chain symbol always wins once a token is readable. */
  readonly defaultSymbol: string;
  readonly brand: {
    readonly name: string;
    readonly tagline: string;
  };
  readonly testnet: boolean;
  readonly notes: string;
  readonly deployment: {
    readonly blockNumber: number | null;
  };
  readonly addresses: AddressBook;
}

const ADDRESS_KEYS = [
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

const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function isHexAddress(value: unknown): value is HexAddress {
  return typeof value === 'string' && HEX_ADDRESS.test(value);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`deployment: "${label}" must be an object`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`deployment: "${label}" must be a non-empty string`);
  }
  return value;
}

/**
 * Validates a src/config/deployments/<variant>.json import.
 * Throws at module load (build or first paint) on malformed data: a wrong address
 * book is worse than a failed build.
 */
export function parseDeployment(input: unknown, expectedVariant?: EnvVariant): DeploymentConfig {
  const root = record(input, 'root');
  const variant = string(root.variant, 'variant');
  if (!isEnvVariant(variant)) {
    throw new Error(`deployment: unknown variant "${variant}"`);
  }
  if (expectedVariant !== undefined && variant !== expectedVariant) {
    throw new Error(
      `deployment: variant mismatch (file says "${variant}", build selected "${expectedVariant}")`,
    );
  }

  const chainId = root.chainId;
  if (typeof chainId !== 'number' || !Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error('deployment: "chainId" must be a positive integer');
  }

  const rpcUrls = root.rpcUrls;
  if (!Array.isArray(rpcUrls) || rpcUrls.length === 0) {
    throw new Error('deployment: "rpcUrls" must contain at least one endpoint');
  }
  const urls = rpcUrls.map((url, index) => {
    const parsed = string(url, `rpcUrls[${index}]`);
    if (!/^https?:\/\//.test(parsed)) {
      throw new Error(`deployment: rpcUrls[${index}] must be http(s)`);
    }
    return parsed;
  });

  const nativeCurrency = record(root.nativeCurrency, 'nativeCurrency');
  const decimals = nativeCurrency.decimals;
  if (typeof decimals !== 'number' || !Number.isInteger(decimals) || decimals < 0) {
    throw new Error('deployment: "nativeCurrency.decimals" must be a non-negative integer');
  }
  const blockExplorerUrl = root.blockExplorerUrl;
  if (blockExplorerUrl !== null && blockExplorerUrl !== undefined) {
    string(blockExplorerUrl, 'blockExplorerUrl');
  }

  const brand = record(root.brand, 'brand');
  const addresses = record(root.addresses, 'addresses');
  const parsedAddresses = {} as Record<keyof AddressBook, HexAddress>;
  for (const key of ADDRESS_KEYS) {
    const value = addresses[key];
    if (!isHexAddress(value)) {
      throw new Error(`deployment: "addresses.${key}" must be a 0x-prefixed 20-byte address`);
    }
    parsedAddresses[key] = value;
  }

  const deployment = record(root.deployment ?? {}, 'deployment');
  const blockNumber = deployment.blockNumber;
  if (blockNumber !== null && blockNumber !== undefined) {
    if (typeof blockNumber !== 'number' || !Number.isSafeInteger(blockNumber) || blockNumber < 0) {
      throw new Error(
        'deployment: "deployment.blockNumber" must be a non-negative integer or null',
      );
    }
  }

  return {
    variant,
    chainId,
    chainName: string(root.chainName, 'chainName'),
    rpcUrls: urls,
    nativeCurrency: {
      name: string(nativeCurrency.name, 'nativeCurrency.name'),
      symbol: string(nativeCurrency.symbol, 'nativeCurrency.symbol'),
      decimals,
    },
    blockExplorerUrl:
      typeof blockExplorerUrl === 'string' ? blockExplorerUrl.replace(/\/$/, '') : null,
    defaultSymbol: string(root.defaultSymbol, 'defaultSymbol'),
    brand: {
      name: string(brand.name, 'brand.name'),
      tagline: string(brand.tagline, 'brand.tagline'),
    },
    testnet: root.testnet === true,
    notes: typeof root.notes === 'string' ? root.notes : '',
    deployment: {
      blockNumber: typeof blockNumber === 'number' ? blockNumber : null,
    },
    addresses: parsedAddresses,
  };
}
