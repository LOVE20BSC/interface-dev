import { useEffect, useState } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import type { HexAddress } from '@/config/networks';
import { readClaimedAmount } from '@/features/claim-airdrop/lib/read-claimed-amount';

export interface ClaimedAmountState {
  /** undefined = not readable on this device/environment; never substitute a cached value. */
  readonly amount: bigint | undefined;
  readonly isLoading: boolean;
}

export interface UseClaimedAmountOptions {
  /** Only the S6 (已铸造) state needs this read. */
  readonly enabled: boolean;
  readonly airdropAddress: HexAddress | undefined;
  readonly tokenAddress: HexAddress | undefined;
}

/**
 * Thin React wrapper around the single `readClaimedAmount` adapter.
 *
 * The UI never talks to contract views itself: the adapter owns the single
 * `claimedAmount` read. A failed/unavailable read
 * surfaces as `undefined`, which the S6 view turns into the honest 「已铸造」
 * fallback (spec §3.4).
 */
export function useClaimedAmount(options: UseClaimedAmountOptions): ClaimedAmountState {
  const { enabled, airdropAddress, tokenAddress } = options;
  const { address: wallet } = useAccount();
  const client = usePublicClient();
  const [amount, setAmount] = useState<bigint | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- a chain read result is an external fact */
  useEffect(() => {
    if (!enabled) {
      setAmount(undefined);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    void readClaimedAmount({ client, airdropAddress, tokenAddress, wallet }).then((value) => {
      if (cancelled) return;
      setAmount(value);
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [airdropAddress, client, enabled, tokenAddress, wallet]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return { amount, isLoading };
}
