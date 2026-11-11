import { useEffect } from 'react';
import type { HexAddress } from '@/config/networks';
import type { MemberIdentity } from '@/entities/member-identity/model/use-member-identities';
import { useTransferIdentity } from '@/features/transfer-identity/model/use-transfer-identity';
import { TransferDrawer } from '@/features/transfer-identity/ui/transfer-drawer';

export interface TransferIdentityLayerProps {
  readonly target: MemberIdentity;
  readonly memberNftAddress: HexAddress | undefined;
  readonly selfAddress: string | undefined;
  readonly onBusyChange: (busy: boolean) => void;
  readonly onSuccess: (memberId: bigint, recipient: `0x${string}`) => void;
  readonly onClose: () => void;
}

/**
 * Lazy boundary for the transfer flow: the drawer (Radix Dialog) and the write
 * receipt polling are not part of the first-screen bundle until a transfer starts.
 */
export function TransferIdentityLayer({
  target,
  memberNftAddress,
  selfAddress,
  onBusyChange,
  onSuccess,
  onClose,
}: TransferIdentityLayerProps) {
  const transfer = useTransferIdentity(memberNftAddress, onSuccess);
  const busy = transfer.phase === 'confirming' || transfer.phase === 'pending';

  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);

  return (
    <TransferDrawer
      target={target}
      memberNftAddress={memberNftAddress}
      selfAddress={selfAddress}
      phase={transfer.phase}
      errorMessage={transfer.errorMessage}
      onSubmit={(memberId, recipient) => {
        void transfer.transfer(memberId, recipient);
      }}
      onClose={onClose}
    />
  );
}
