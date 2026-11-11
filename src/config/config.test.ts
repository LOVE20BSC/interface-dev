import { describe, expect, it } from 'vitest';
import devJson from './deployments/anvil31337_dev.json';
import testJson from './deployments/bscTestnet_test.json';
import prodJson from './deployments/bscMainnet_prod.json';
import { parseDeployment, isHexAddress } from './deployments/types';
import { DEPLOYMENT_FILES, resolveVariant } from './variant';
import {
  ADDRESSES,
  DEFAULT_SYMBOL,
  DEPLOYMENT,
  ZERO_ADDRESS,
  addressBookStatus,
  isConfiguredAddress,
  seedCoreAddress,
} from './networks';

describe('variant resolution', () => {
  it('uses VITE_ENV when provided, otherwise maps the Vite mode', () => {
    expect(resolveVariant('test', 'production')).toBe('test');
    expect(resolveVariant(undefined, 'development')).toBe('dev');
    expect(resolveVariant(undefined, 'production')).toBe('prod');
    expect(resolveVariant(undefined, 'test')).toBe('test');
    expect(resolveVariant('prod', 'development')).toBe('prod');
  });

  it('fails loudly on an unknown variant or mode', () => {
    expect(() => resolveVariant('staging', 'production')).toThrow(/VITE_ENV/);
    expect(() => resolveVariant(undefined, 'staging')).toThrow(/mode/);
  });

  it('maps every variant to exactly one address book file', () => {
    expect(DEPLOYMENT_FILES.dev).toBe('anvil31337_dev.json');
    expect(DEPLOYMENT_FILES.test).toBe('bscTestnet_test.json');
    expect(DEPLOYMENT_FILES.prod).toBe('bscMainnet_prod.json');
  });
});

describe('deployment documents', () => {
  it.each([
    ['dev', devJson, 31337],
    ['test', testJson, 97],
    ['prod', prodJson, 56],
  ] as const)('%s parses with chain %i and a complete address book', (variant, json, chainId) => {
    const parsed = parseDeployment(json, variant);
    expect(parsed.chainId).toBe(chainId);
    expect(parsed.rpcUrls.length).toBeGreaterThan(0);
    // anvil's native coin is ETH; only the BSC deployments use BNB.
    expect(parsed.nativeCurrency.symbol).toBe(variant === 'dev' ? 'ETH' : 'BNB');
    expect(parsed.defaultSymbol.length).toBeGreaterThan(0);
    expect(parsed.brand.docsUrl).toMatch(/^https?:\/\//);
    const addresses = Object.values(parsed.addresses);
    expect(addresses.length).toBeGreaterThanOrEqual(20);
    if (variant === 'dev') {
      // The dev file is the real anvil export: every key must be filled.
      expect(addresses.some((address) => address === ZERO_ADDRESS)).toBe(false);
    } else {
      // test/prod stay deliberately empty until a real deployment publishes.
      expect(addresses.every((address) => address === ZERO_ADDRESS)).toBe(true);
    }
  });

  it('rejects a variant mismatch so a wrong address book cannot ship', () => {
    expect(() => parseDeployment(devJson, 'prod')).toThrow(/variant mismatch/);
  });

  it('rejects malformed addresses and empty RPC lists', () => {
    expect(() =>
      parseDeployment({
        ...devJson,
        addresses: { ...devJson.addresses, tokenAddress: '0x1234' },
      }),
    ).toThrow(/tokenAddress/);
    expect(() => parseDeployment({ ...devJson, rpcUrls: [] })).toThrow(/rpcUrls/);
  });

  it('exposes the address format guard', () => {
    expect(isHexAddress(ZERO_ADDRESS)).toBe(true);
    expect(isHexAddress('0x1234')).toBe(false);
    expect(isHexAddress(undefined)).toBe(false);
  });
});

describe('active environment package (vitest pins VITE_ENV=dev)', () => {
  it('loads the real anvil address book through the build alias', () => {
    expect(DEPLOYMENT.variant).toBe('dev');
    expect(DEFAULT_SYMBOL).toBe('TestLOVE20');
    expect(DEPLOYMENT.nativeCurrency.symbol).toBe('ETH');
    expect(isConfiguredAddress(ADDRESSES.tokenAddress)).toBe(true);
    expect(seedCoreAddress()).toBe(ADDRESSES.launch);
  });

  it('reports the complete dev address book without inventing data', () => {
    const status = addressBookStatus();
    expect(status.total).toBeGreaterThanOrEqual(20);
    expect(status.configured).toBe(status.total);
    expect(status.isConfigured).toBe(true);
  });
});
