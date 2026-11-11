export type TransferRecipientMode = 'address' | 'member' | 'name';

export interface TransferReadiness {
  readonly mode: TransferRecipientMode;
  readonly busy: boolean;
  /** 按地址: validateRecipient returned 'ok'. */
  readonly addressValid: boolean;
  /** 按身份 NFT ID: ownerOf resolved to another wallet. */
  readonly memberResolved: boolean;
  /** 按身份 NFT 名字: the scan resolved a name to an id owned by another wallet. */
  readonly nameResolved: boolean;
  /**
   * Owner rule (2026-11-12): a resolved name is not enough. The user must tick
   * 「我确认 #id 就是正确的身份 NFT」 because similar names can point elsewhere.
   */
  readonly nameAcknowledged: boolean;
}

/**
 * Single decision for the 转让 CTA across all three recipient modes. Keeping
 * the acknowledgement here means the name mode can never enable the button
 * through a resolver state alone.
 */
export function canSubmitTransfer(readiness: TransferReadiness): boolean {
  if (readiness.busy) return false;
  switch (readiness.mode) {
    case 'address':
      return readiness.addressValid;
    case 'member':
      return readiness.memberResolved;
    case 'name':
      return readiness.nameResolved && readiness.nameAcknowledged;
  }
}
