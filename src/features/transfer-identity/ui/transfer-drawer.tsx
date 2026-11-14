import { useState } from 'react';
import { AlertTriangle } from '@/shared/ui/icons';
import { copy } from '@/shared/config/copy-pages';
import {
  identityInputErrorMessage,
  identityInputReadingText,
  type IdentityInputMode,
} from '@/shared/lib/identity-input';
import { Button } from '@/shared/ui/button';
import { CopyableAddress } from '@/shared/ui/copyable-address';
import { IdentityRecipientField } from '@/shared/ui/identity-input-mode';
import { IdentityRecipientCard } from '@/shared/ui/identity-recipient-card';
import { Sheet } from '@/shared/ui/sheet';
import type { HexAddress } from '@/config/networks';
import type { MemberIdentity } from '@/entities/member-identity/model/use-member-identities';
import { IdentityPill } from '@/features/select-identity/ui/identity-pill';
import { validateRecipient } from '@/features/transfer-identity/lib/validate-recipient';
import { useMemberRecipient } from '@/features/transfer-identity/model/use-member-recipient';
import { useMemberNameRecipient } from '@/features/transfer-identity/model/use-member-name-recipient';
import type { TransferPhase } from '@/features/transfer-identity/model/use-transfer-identity';
import { canSubmitTransfer } from '@/features/transfer-identity/lib/transfer-submit';

type RecipientMode = IdentityInputMode;

export interface TransferDrawerProps {
  readonly target: MemberIdentity | null;
  readonly memberNftAddress: HexAddress | undefined;
  readonly selfAddress: string | undefined;
  readonly phase: TransferPhase;
  readonly errorMessage: string | null;
  readonly onSubmit: (memberId: bigint, recipient: `0x${string}`) => void;
  readonly onClose: () => void;
}

function recipientErrorCopy(validation: ReturnType<typeof validateRecipient>): string | null {
  switch (validation) {
    case 'invalid':
      return copy.pages.myNft.invalidRecipient;
    case 'zero':
      return copy.pages.myNft.zeroRecipient;
    case 'self':
      return copy.pages.myNft.selfRecipient;
    default:
      return null;
  }
}

export function TransferDrawer({
  target,
  memberNftAddress,
  selfAddress,
  phase,
  errorMessage,
  onSubmit,
  onClose,
}: TransferDrawerProps) {
  return (
    <Sheet
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={copy.pages.myNft.transferTitle}
      dismissible={phase !== 'confirming' && phase !== 'pending'}
    >
      {target !== null ? (
        <TransferForm
          key={target.tokenId.toString()}
          target={target}
          memberNftAddress={memberNftAddress}
          selfAddress={selfAddress}
          phase={phase}
          errorMessage={errorMessage}
          onSubmit={onSubmit}
          onClose={onClose}
        />
      ) : null}
    </Sheet>
  );
}

export function TransferForm({
  target,
  memberNftAddress,
  selfAddress,
  phase,
  errorMessage,
  onSubmit,
  onClose,
  initialMode = 'address',
}: {
  readonly target: MemberIdentity;
  readonly memberNftAddress: HexAddress | undefined;
  readonly selfAddress: string | undefined;
  readonly phase: TransferPhase;
  readonly errorMessage: string | null;
  readonly onSubmit: (memberId: bigint, recipient: `0x${string}`) => void;
  readonly onClose: () => void;
  /** Test seam only; production always opens on 按地址. */
  readonly initialMode?: RecipientMode;
}) {
  const [mode, setMode] = useState<RecipientMode>(initialMode);
  const [recipient, setRecipient] = useState('');
  const [touched, setTouched] = useState(false);
  const [nameAcknowledged, setNameAcknowledged] = useState(false);
  const busy = phase === 'confirming' || phase === 'pending';

  const validation = validateRecipient(recipient, selfAddress);
  const addressMessage = touched ? recipientErrorCopy(validation) : null;
  const member = useMemberRecipient(memberNftAddress, recipient, mode === 'member', selfAddress);
  const nameRecipient = useMemberNameRecipient(
    memberNftAddress,
    recipient,
    mode === 'name',
    selfAddress,
  );
  const memberMessage = identityInputErrorMessage('member', member.status);
  const nameMessage = identityInputErrorMessage('name', nameRecipient.status);
  const memberReading = mode === 'member' && member.status === 'reading';
  const nameReading = mode === 'name' && nameRecipient.status === 'reading';

  const nameResolved =
    mode === 'name' &&
    nameRecipient.status === 'ok' &&
    nameRecipient.memberId !== null &&
    nameRecipient.name !== null &&
    nameRecipient.address !== null;

  const canSubmit = canSubmitTransfer({
    mode,
    busy,
    addressValid: validation === 'ok',
    memberResolved: member.status === 'ok',
    nameResolved,
    nameAcknowledged,
  });
  const invalid =
    mode === 'address'
      ? addressMessage !== null
      : mode === 'member'
        ? memberMessage !== null
        : nameMessage !== null;

  // Every mode/input change invalidates a previous name acknowledgement: the
  // confirmation must apply to the id currently on screen, never to an older one.
  const resetNameAcknowledgement = () => {
    setNameAcknowledged(false);
    setTouched(false);
  };

  const handleModeChange = (next: RecipientMode) => {
    if (next === mode) return;
    setMode(next);
    setRecipient('');
    resetNameAcknowledgement();
  };

  const resolvedRecipient =
    mode === 'member' && member.status === 'ok' && member.address !== null ? member.address : null;

  const showNameConfirmation =
    nameResolved &&
    nameRecipient.memberId !== null &&
    nameRecipient.name !== null &&
    nameRecipient.address !== null;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-line bg-elevated p-3">
        <IdentityPill identity={target} />
      </div>

      <p className="flex items-start gap-2 rounded-2xl border border-danger/20 bg-danger-soft/60 p-3 text-xs leading-5 text-danger-strong">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        {copy.pages.myNft.transferWarning}
      </p>

      <IdentityRecipientField
        id="transfer-recipient"
        label={copy.transferIdentity.recipientLabel}
        mode={mode}
        onModeChange={handleModeChange}
        value={recipient}
        onValueChange={(next) => {
          setRecipient(next);
          setTouched(true);
          setNameAcknowledged(false);
        }}
        onBlur={() => setTouched(true)}
        disabled={busy}
        invalid={invalid}
        inputTestId="transfer-recipient-input"
        modeTriggerTestId="transfer-mode-trigger"
        modeOptionTestIdPrefix="transfer-mode"
      />

      {mode === 'address' && addressMessage !== null ? (
        <p className="text-xs text-danger-strong" role="alert">
          {addressMessage}
        </p>
      ) : null}

      {memberReading || nameReading ? (
        <p className="text-xs text-muted" role="status">
          {identityInputReadingText(mode)}
        </p>
      ) : null}

      {mode === 'member' && memberMessage !== null ? (
        <p className="text-xs text-danger-strong" role="alert">
          {memberMessage}
          {member.status === 'error' ? (
            <button
              type="button"
              onClick={member.retry}
              className="ml-2 font-medium underline underline-offset-4"
            >
              {copy.transferIdentity.memberRetry}
            </button>
          ) : null}
        </p>
      ) : null}

      {mode === 'name' && nameMessage !== null ? (
        <p className="text-xs text-danger-strong" role="alert">
          {nameMessage}
          {nameRecipient.status === 'error' ? (
            <button
              type="button"
              onClick={nameRecipient.retry}
              className="ml-2 font-medium underline underline-offset-4"
            >
              {copy.transferIdentity.nameRetry}
            </button>
          ) : null}
        </p>
      ) : null}

      {resolvedRecipient !== null ? (
        <p
          className="flex flex-wrap items-center gap-1 text-xs leading-5 text-success"
          data-testid="transfer-recipient-resolved"
        >
          <span>{copy.transferIdentity.resolvedRecipient('')}</span>
          <CopyableAddress
            address={resolvedRecipient}
            label={copy.transferIdentity.recipientLabel}
            className="text-success hover:text-success"
          />
        </p>
      ) : null}

      {showNameConfirmation && nameRecipient.address !== null ? (
        <IdentityRecipientCard
          title={copy.transferIdentity.nameConfirmTitle(
            nameRecipient.name ?? '',
            nameRecipient.memberId?.toString() ?? '',
          )}
          recipientLabel={copy.transferIdentity.recipientLabel}
          address={nameRecipient.address}
          addressLabel={copy.transferIdentity.recipientLabel}
          warning={copy.transferIdentity.nameConfirmWarning}
          checkboxLabel={copy.transferIdentity.nameConfirmCheckbox(
            nameRecipient.memberId?.toString() ?? '',
          )}
          checked={nameAcknowledged}
          onCheckedChange={setNameAcknowledged}
          testId="transfer-name-confirmation"
          checkboxTestId="transfer-name-ack"
        />
      ) : null}

      {phase === 'error' && errorMessage !== null ? (
        <p className="rounded-2xl border border-danger/20 bg-danger-soft/60 px-3 py-2 text-xs leading-5 text-danger-strong">
          {errorMessage}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <Button
          variant="danger"
          className="w-full sm:w-auto"
          disabled={!canSubmit}
          loading={busy}
          onClick={() => {
            setTouched(true);
            if (mode === 'address') {
              if (validation !== 'ok') return;
              onSubmit(target.tokenId, recipient.trim() as `0x${string}`);
              return;
            }
            if (mode === 'member') {
              if (member.status !== 'ok' || member.address === null) return;
              onSubmit(target.tokenId, member.address);
              return;
            }
            if (!nameResolved || !nameAcknowledged || nameRecipient.address === null) return;
            onSubmit(target.tokenId, nameRecipient.address);
          }}
        >
          {busy ? copy.pages.myNft.transferring : copy.pages.myNft.confirmTransfer}
        </Button>
        <Button variant="secondary" className="w-full sm:w-auto" onClick={onClose} disabled={busy}>
          {copy.common.cancel}
        </Button>
      </div>
    </div>
  );
}
