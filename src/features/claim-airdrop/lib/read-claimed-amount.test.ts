import { describe, expect, it, vi } from 'vitest';
import type { PublicClient } from 'viem';
import {
  claimedAmountReadPolicy,
  readClaimedAmount,
  sumClaimedAmounts,
} from './read-claimed-amount';

const AIRDROP = `0x${'11'.repeat(20)}` as const;
const TOKEN = `0x${'22'.repeat(20)}` as const;
const WALLET = `0x${'33'.repeat(20)}` as const;
const ENABLED: ReturnType<typeof claimedAmountReadPolicy> = { enabled: true, fromBlock: 32n };

const ADDRESSES = {
  airdropAddress: AIRDROP,
  tokenAddress: TOKEN,
  wallet: WALLET,
} as const;

interface ClientOptions {
  /** CI-014 view behaviour; default = old chain (revert / selector not found). */
  readonly view?: () => Promise<unknown>;
  readonly logs?: unknown;
  readonly logsThrow?: boolean;
}

function clientWith(options: ClientOptions = {}): {
  readonly client: PublicClient;
  readonly readContract: ReturnType<typeof vi.fn>;
  readonly getContractEvents: ReturnType<typeof vi.fn>;
} {
  const readContract = vi.fn(
    options.view ?? (() => Promise.reject(new Error('function selector not found'))),
  );
  const getContractEvents = options.logsThrow
    ? vi.fn().mockRejectedValue(new Error('rpc down'))
    : vi.fn().mockResolvedValue(options.logs ?? []);
  return {
    client: { readContract, getContractEvents } as unknown as PublicClient,
    readContract,
    getContractEvents,
  };
}

describe('claimedAmountReadPolicy', () => {
  it('enables the log scan only on dev with a real deployment block', () => {
    expect(claimedAmountReadPolicy({ isDev: true, deploymentBlockNumber: 32 })).toEqual({
      enabled: true,
      fromBlock: 32n,
    });
    expect(claimedAmountReadPolicy({ isDev: true, deploymentBlockNumber: 0 })).toEqual({
      enabled: true,
      fromBlock: 0n,
    });
  });

  it('never scans on test/prod or without a deployment block', () => {
    expect(claimedAmountReadPolicy({ isDev: false, deploymentBlockNumber: 32 })).toEqual({
      enabled: false,
      fromBlock: null,
    });
    expect(claimedAmountReadPolicy({ isDev: true, deploymentBlockNumber: null })).toEqual({
      enabled: false,
      fromBlock: null,
    });
    expect(claimedAmountReadPolicy({ isDev: true, deploymentBlockNumber: -1 })).toEqual({
      enabled: false,
      fromBlock: null,
    });
  });
});

describe('sumClaimedAmounts', () => {
  it('returns undefined when nothing decoded, so unknown never becomes 0', () => {
    expect(sumClaimedAmounts([])).toBeUndefined();
    expect(sumClaimedAmounts([{ args: {} }])).toBeUndefined();
    expect(sumClaimedAmounts([{ args: undefined }])).toBeUndefined();
  });

  it('sums the decoded AirdropClaimed amounts', () => {
    expect(sumClaimedAmounts([{ args: { amount: 5n } }])).toBe(5n);
    expect(sumClaimedAmounts([{ args: { amount: 5n } }, { args: { amount: 7n } }])).toBe(12n);
  });
});

describe('readClaimedAmount', () => {
  it('prefers the contract view (CI-014) and never scans logs when it works', async () => {
    const { client, readContract, getContractEvents } = clientWith({
      view: () => Promise.resolve(777n),
    });
    const amount = await readClaimedAmount({ ...ADDRESSES, client, policy: ENABLED });

    expect(amount).toBe(777n);
    expect(readContract).toHaveBeenCalledWith({
      address: AIRDROP,
      abi: expect.anything(),
      functionName: 'claimedAmount',
      args: [TOKEN, WALLET],
    });
    expect(getContractEvents).not.toHaveBeenCalled();
  });

  it('treats a 0 view result as a real value, not "unknown"', async () => {
    const { client, getContractEvents } = clientWith({ view: () => Promise.resolve(0n) });
    await expect(readClaimedAmount({ ...ADDRESSES, client, policy: ENABLED })).resolves.toBe(0n);
    expect(getContractEvents).not.toHaveBeenCalled();
  });

  it('falls back to the dev AirdropClaimed logs when the view is unavailable (old chain)', async () => {
    const { client, getContractEvents } = clientWith({ logs: [{ args: { amount: 123n } }] });
    const amount = await readClaimedAmount({ ...ADDRESSES, client, policy: ENABLED });

    expect(amount).toBe(123n);
    expect(getContractEvents).toHaveBeenCalledTimes(1);
    expect(getContractEvents).toHaveBeenCalledWith({
      address: AIRDROP,
      abi: expect.anything(),
      eventName: 'AirdropClaimed',
      args: { token: TOKEN, account: WALLET },
      fromBlock: 32n,
      toBlock: 'latest',
    });
  });

  it('returns undefined when the view is unavailable and no claim event matches', async () => {
    const { client } = clientWith({ logs: [] });
    await expect(
      readClaimedAmount({ ...ADDRESSES, client, policy: ENABLED }),
    ).resolves.toBeUndefined();
  });

  it('returns undefined when the fallback read throws (a failure is "amount unknown")', async () => {
    const { client } = clientWith({ logsThrow: true });
    await expect(
      readClaimedAmount({ ...ADDRESSES, client, policy: ENABLED }),
    ).resolves.toBeUndefined();
  });

  it('does not scan logs when the view is unavailable and the policy is disabled', async () => {
    const { client, getContractEvents } = clientWith({ logs: [{ args: { amount: 1n } }] });
    await expect(
      readClaimedAmount({
        ...ADDRESSES,
        client,
        policy: { enabled: false, fromBlock: null },
      }),
    ).resolves.toBeUndefined();
    expect(getContractEvents).not.toHaveBeenCalled();
  });

  it('returns undefined for missing inputs', async () => {
    await expect(readClaimedAmount({ ...ADDRESSES, client: undefined })).resolves.toBeUndefined();
    await expect(
      readClaimedAmount({
        client: clientWith().client,
        airdropAddress: undefined,
        tokenAddress: TOKEN,
        wallet: WALLET,
      }),
    ).resolves.toBeUndefined();
  });
});
