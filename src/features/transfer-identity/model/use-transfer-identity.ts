import { useEffect, useRef, useState } from 'react';
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { memberNftAbi } from '@/config/abis';
import type { HexAddress } from '@/config/networks';
import { toWalletErrorMessage } from '@/features/connect-wallet/lib/wallet-errors';

export type TransferPhase = 'idle' | 'confirming' | 'pending' | 'success' | 'error';

interface PendingTransfer {
  readonly memberId: bigint;
  readonly to: HexAddress;
}

export interface TransferIdentityState {
  readonly phase: TransferPhase;
  readonly errorMessage: string | null;
  readonly hash: `0x${string}` | undefined;
  readonly transfer: (memberId: bigint, to: HexAddress) => Promise<void>;
  readonly reset: () => void;
}

/**
 * safeTransferFrom(currentWallet, recipient, memberId).
 *
 * Phase naming follows §4.2: waiting in the wallet (confirming) is distinct from
 * submitted-but-not-mined (pending). Only one transfer can be in flight.
 */
export function useTransferIdentity(
  memberNftAddress: HexAddress | undefined,
  onConfirmed: (memberId: bigint, to: HexAddress) => void,
): TransferIdentityState {
  const { address: account } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const [phase, setPhase] = useState<TransferPhase>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hash, setHash] = useState<`0x${string}` | undefined>(undefined);
  const pendingRef = useRef<PendingTransfer | null>(null);
  const confirmedRef = useRef(false);
  const onConfirmedRef = useRef(onConfirmed);

  const receipt = useWaitForTransactionReceipt({
    hash,
    query: { enabled: hash !== undefined },
  });

  useEffect(() => {
    onConfirmedRef.current = onConfirmed;
  }, [onConfirmed]);

  const transfer = async (memberId: bigint, to: HexAddress): Promise<void> => {
    if (memberNftAddress === undefined || account === undefined) {
      setErrorMessage(toWalletErrorMessage(new Error('wallet unavailable')));
      setPhase('error');
      return;
    }
    confirmedRef.current = false;
    pendingRef.current = { memberId, to };
    setHash(undefined);
    setErrorMessage(null);
    setPhase('confirming');
    try {
      const nextHash = await writeContractAsync({
        address: memberNftAddress,
        abi: memberNftAbi,
        functionName: 'safeTransferFrom',
        args: [account, to, memberId],
      });
      setHash(nextHash);
      setPhase('pending');
    } catch (error) {
      setErrorMessage(toWalletErrorMessage(error));
      setPhase('error');
    }
  };

  /* eslint-disable react-hooks/set-state-in-effect -- transaction receipt is an external chain fact */
  useEffect(() => {
    if (phase !== 'pending') return;
    if (receipt.isError) {
      setErrorMessage(toWalletErrorMessage(receipt.error));
      setPhase('error');
      return;
    }
    if (!receipt.isSuccess || confirmedRef.current) return;
    const pending = pendingRef.current;
    if (pending === null) return;
    confirmedRef.current = true;
    setPhase('success');
    onConfirmedRef.current(pending.memberId, pending.to);
  }, [phase, receipt.error, receipt.isError, receipt.isSuccess]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const reset = () => {
    setPhase('idle');
    setErrorMessage(null);
    setHash(undefined);
    pendingRef.current = null;
    confirmedRef.current = false;
  };

  return { phase, errorMessage, hash, transfer, reset };
}
