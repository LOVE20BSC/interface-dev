import { describe, expect, it, vi } from 'vitest';
import type { PublicClient } from 'viem';
import { readClaimedAmount } from './read-claimed-amount';

const AIRDROP = `0x${'11'.repeat(20)}` as const;
const TOKEN = `0x${'22'.repeat(20)}` as const;
const WALLET = `0x${'33'.repeat(20)}` as const;

const ADDRESSES = {
  airdropAddress: AIRDROP,
  tokenAddress: TOKEN,
  wallet: WALLET,
} as const;

function clientWith(view: () => Promise<unknown>): {
  readonly client: PublicClient;
  readonly readContract: ReturnType<typeof vi.fn>;
  readonly getContractEvents: ReturnType<typeof vi.fn>;
} {
  const readContract = vi.fn(view);
  const getContractEvents = vi.fn();
  return {
    client: { readContract, getContractEvents } as unknown as PublicClient,
    readContract,
    getContractEvents,
  };
}

describe('readClaimedAmount', () => {
  it('reads the distributor view in one call and never scans events', async () => {
    const { client, readContract, getContractEvents } = clientWith(() => Promise.resolve(777n));
    const amount = await readClaimedAmount({ ...ADDRESSES, client });

    expect(amount).toBe(777n);
    expect(readContract).toHaveBeenCalledWith({
      address: AIRDROP,
      abi: expect.anything(),
      functionName: 'claimedAmountByTokenAddressByClaimer',
      args: [TOKEN, WALLET],
    });
    expect(getContractEvents).not.toHaveBeenCalled();
  });

  it('treats a 0 view result as a real value, not "unknown"', async () => {
    const { client } = clientWith(() => Promise.resolve(0n));
    await expect(readClaimedAmount({ ...ADDRESSES, client })).resolves.toBe(0n);
  });

  it('returns undefined when the read fails (a failure is "amount unknown")', async () => {
    const { client } = clientWith(() => Promise.reject(new Error('rpc down')));
    await expect(readClaimedAmount({ ...ADDRESSES, client })).resolves.toBeUndefined();
  });

  it('returns undefined for a non-bigint result or missing inputs', async () => {
    const { client } = clientWith(() => Promise.resolve('777'));
    await expect(readClaimedAmount({ ...ADDRESSES, client })).resolves.toBeUndefined();
    await expect(readClaimedAmount({ ...ADDRESSES, client: undefined })).resolves.toBeUndefined();
    await expect(
      readClaimedAmount({
        client: clientWith(() => Promise.resolve(1n)).client,
        airdropAddress: undefined,
        tokenAddress: TOKEN,
        wallet: WALLET,
      }),
    ).resolves.toBeUndefined();
  });
});
