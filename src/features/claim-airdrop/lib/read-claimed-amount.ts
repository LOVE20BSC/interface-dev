import type { PublicClient } from 'viem';
import { airdropAbi } from '@/config/abis';
import { APP_ENV } from '@/config/env';
import { DEPLOYMENT, type HexAddress } from '@/config/networks';

/**
 * ONE adapter for "how much did this wallet already mint from the airdrop?".
 *
 * CI-014 contract side has landed (`Airdrop.claimedAmount(address,address)`) and
 * the generated ABI was refreshed by `pnpm sync:anvil`. The adapter is
 * order-independent so one build works on every chain:
 *
 *   1. Read the `claimedAmount(token, wallet)` view first (generated ABI). On a
 *      redeployed chain this is the only read, in every environment.
 *   2. If the view reverts / is unknown (an old chain still running the previous
 *      Airdrop bytecode: "function selector not found"), fall back to the
 *      dev-only `AirdropClaimed` log scan. Defensive path only — no environment
 *      ships the old contract after the 2026-11-11 rebuild.
 *   3. Otherwise return `undefined`; S6 then says 「已铸造」 without inventing a
 *      cached or fabricated number (spec §3.4).
 *
 * Why the log scan is dev-only: `eth_getLogs` over the whole history is not a
 * product read path (no backend/indexer; BSC public RPCs cannot scan history).
 * The local anvil chain has a known deployment block and a tiny history, so the
 * dev variant can read the event exactly.
 *
 * TODO(CI-014 follow-up): the contract-side view is live and the ABI is synced;
 * the dev log scan + `claimedAmountReadPolicy` can be deleted once no supported
 * chain runs the pre-CI-014 Airdrop bytecode. Until then they stay as the
 * defensive fallback.
 */

export interface ClaimedAmountReadPolicy {
  readonly enabled: boolean;
  readonly fromBlock: bigint | null;
}

/** Pure gate: only the local dev chain with a real deployment block may scan logs. */
export function claimedAmountReadPolicy(input: {
  readonly isDev: boolean;
  readonly deploymentBlockNumber: number | null;
}): ClaimedAmountReadPolicy {
  const blockNumber = input.deploymentBlockNumber;
  if (
    !input.isDev ||
    blockNumber === null ||
    !Number.isSafeInteger(blockNumber) ||
    blockNumber < 0
  ) {
    return { enabled: false, fromBlock: null };
  }
  return { enabled: true, fromBlock: BigInt(blockNumber) };
}

/** A decoded `AirdropClaimed` log is enough for the amount sum; keeps tests chain-free. */
export interface ClaimedAmountLogLike {
  readonly args?: { readonly amount?: bigint | undefined } | undefined;
}

/** Sums decoded claims; `undefined` when nothing was decoded (never 0-as-unknown). */
export function sumClaimedAmounts(logs: readonly ClaimedAmountLogLike[]): bigint | undefined {
  let total = 0n;
  let decoded = false;
  for (const log of logs) {
    const amount = log.args?.amount;
    if (typeof amount === 'bigint') {
      total += amount;
      decoded = true;
    }
  }
  return decoded ? total : undefined;
}

export interface ReadClaimedAmountInput {
  readonly client: PublicClient | undefined;
  readonly airdropAddress: HexAddress | undefined;
  readonly tokenAddress: HexAddress | undefined;
  readonly wallet: HexAddress | undefined;
  /** Test seam; production callers let the env/deployment decide the policy. */
  readonly policy?: ClaimedAmountReadPolicy;
}

/**
 * Chain view (CI-014). Returns `undefined` on an old chain where the function
 * does not exist yet (revert / selector not found / decode error), so the
 * caller can fall back instead of failing the page.
 */
async function readClaimedAmountView(
  client: PublicClient,
  airdropAddress: HexAddress,
  tokenAddress: HexAddress,
  wallet: HexAddress,
): Promise<bigint | undefined> {
  try {
    const value = await client.readContract({
      address: airdropAddress,
      abi: airdropAbi,
      functionName: 'claimedAmount',
      args: [tokenAddress, wallet],
    });
    return typeof value === 'bigint' ? value : undefined;
  } catch {
    return undefined;
  }
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

  // 1) Contract view first: works on the redeployed chain in every environment.
  const fromView = await readClaimedAmountView(client, airdropAddress, tokenAddress, wallet);
  if (fromView !== undefined) return fromView;

  // 2) Old chain fallback: dev-only AirdropClaimed log scan.
  const policy =
    input.policy ??
    claimedAmountReadPolicy({
      isDev: APP_ENV.isDev,
      deploymentBlockNumber: DEPLOYMENT.deployment.blockNumber,
    });
  if (!policy.enabled || policy.fromBlock === null) return undefined;

  try {
    const logs = await client.getContractEvents({
      address: airdropAddress,
      abi: airdropAbi,
      eventName: 'AirdropClaimed',
      args: { token: tokenAddress, account: wallet },
      fromBlock: policy.fromBlock,
      toBlock: 'latest',
    });
    return sumClaimedAmounts(logs);
  } catch {
    // A read failure is "amount unknown", never an exception on the page.
    return undefined;
  }
}
