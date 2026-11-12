import type { PublicClient } from 'viem';
import { airdropDistributorAbi } from '@/config/abis';
import type { HexAddress } from '@/config/networks';

/**
 * ONE adapter for "how much did this wallet already mint from the airdrop?".
 *
 * `AirdropDistributor.claimedAmountByTokenAddressByClaimer(token, account)` is a
 * single `eth_call`, available on every chain this app ships to (CI-014). The
 * old dev-only `AirdropClaimed` log scan described in CI-014 is gone: it was a
 * fallback for a pre-CI-014 chain that no longer exists, and a whole-history
 * `eth_getLogs` is never a product read path (no backend/indexer on BSC).
 *
 * A failed read still returns `undefined`; S6 then says 「已铸造」 without
 * inventing a number (spec §3.4).
 */

export interface ReadClaimedAmountInput {
  readonly client: PublicClient | undefined;
  readonly airdropAddress: HexAddress | undefined;
  readonly tokenAddress: HexAddress | undefined;
  readonly wallet: HexAddress | undefined;
}

/**
 * Reads the already-minted amount for one wallet+token. Returns `undefined` in
 * every situation where the number cannot be known from this device; callers
 * must render the honest 「已铸造」 fallback, never a fabricated or cached value.
 */
export async function readClaimedAmount(
  input: ReadClaimedAmountInput,
): Promise<bigint | undefined> {
  const { client, airdropAddress, tokenAddress, wallet } = input;
  if (
    client === undefined ||
    airdropAddress === undefined ||
    tokenAddress === undefined ||
    wallet === undefined
  ) {
    return undefined;
  }

  try {
    const value = await client.readContract({
      address: airdropAddress,
      abi: airdropDistributorAbi,
      functionName: 'claimedAmountByTokenAddressByClaimer',
      args: [tokenAddress, wallet],
    });
    return typeof value === 'bigint' ? value : undefined;
  } catch {
    // A read failure is "amount unknown", never an exception on the page.
    return undefined;
  }
}
