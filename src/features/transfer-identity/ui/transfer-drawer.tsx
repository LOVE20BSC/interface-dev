import { useState } from 'react';
import { AlertTriangle, Check, ChevronDown } from '@/shared/ui/icons';
import { copy } from '@/shared/config/copy-pages';
import { cn } from '@/shared/lib/cn';
import { shortenAddress } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { Sheet } from '@/shared/ui/sheet';
import type { HexAddress } from '@/config/networks';
import type { MemberIdentity } from '@/entities/member-identity/model/use-member-identities';
import { IdentityPill } from '@/features/select-identity/ui/identity-pill';
import { validateRecipient } from '@/features/transfer-identity/lib/validate-recipient';
import {
  useMemberRecipient,
  type MemberRecipientState,
} from '@/features/transfer-identity/model/use-member-recipient';
import {
  useMemberNameRecipient,
  type MemberNameRecipientState,
} from '@/features/transfer-identity/model/use-member-name-recipient';
import type { TransferPhase } from '@/features/transfer-identity/model/use-transfer-identity';
import {
  canSubmitTransfer,
  type TransferRecipientMode,
} from '@/features/transfer-identity/lib/transfer-submit';

type RecipientMode = TransferRecipientMode;

const MODE_OPTIONS: readonly { readonly mode: RecipientMode; readonly label: string }[] = [
  { mode: 'address', label: copy.transferIdentity.modeAddress },
  { mode: 'member', label: copy.transferIdentity.modeMember },
  { mode: 'name', label: copy.transferIdentity.modeName },
];

const MODE_LABELS: Readonly<Record<RecipientMode, string>> = {
  address: copy.transferIdentity.modeAddress,
  member: copy.transferIdentity.modeMember,
  name: copy.transferIdentity.modeName,
};

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

function memberErrorCopy(status: MemberRecipientState['status']): string | null {
  switch (status) {
    case 'invalid':
      return copy.transferIdentity.memberInvalid;
    case 'not-found':
      return copy.transferIdentity.memberNotFound;
    case 'self':
      return copy.transferIdentity.memberSelf;
    case 'error':
      return copy.transferIdentity.memberFailed;
    default:
      return null;
  }
}

function nameErrorCopy(status: MemberNameRecipientState['status']): string | null {
  switch (status) {
    case 'not-found':
      return copy.transferIdentity.nameNotFound;
    case 'self':
      return copy.transferIdentity.nameSelf;
    case 'error':
      return copy.transferIdentity.nameFailed;
    default:
      return null;
  }
}

function ModeOption({
  mode,
  label,
  selected,
  onSelect,
}: {
  readonly mode: RecipientMode;
  readonly label: string;
  readonly selected: boolean;
  readonly onSelect: (mode: RecipientMode) => void;
}) {
  return (
    <PopoverClose asChild>
      <button
        type="button"
        role="menuitemradio"
        aria-checked={selected}
        data-testid={`transfer-mode-${mode}`}
        onClick={() => onSelect(mode)}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2.5 text-left text-sm',
          'hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
          selected && 'bg-brand-soft/60 font-medium',
        )}
      >
        <span>{label}</span>
        {selected ? (
          <Check className="h-4 w-4 shrink-0 text-brand-strong" aria-hidden="true" />
        ) : null}
      </button>
    </PopoverClose>
  );
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
  const memberMessage = memberErrorCopy(member.status);
  const nameMessage = nameErrorCopy(nameRecipient.status);
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
  const selectedModeLabel = MODE_LABELS[mode];
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

      <div>
        <label htmlFor="transfer-recipient" className="text-xs font-medium text-muted">
          {copy.transferIdentity.recipientLabel}
        </label>
        <div className="mt-1.5 flex">
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                data-testid="transfer-mode-trigger"
                aria-label={`${copy.transferIdentity.modeLabel}: ${selectedModeLabel}`}
                disabled={busy}
                className="inline-flex h-11 shrink-0 items-center gap-1 rounded-l-2xl border border-r-0 border-line bg-elevated px-2.5 text-xs font-medium text-foreground hover:bg-elevated focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-60"
              >
                {selectedModeLabel}
                <ChevronDown className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-48 p-1">
              <div role="menu" aria-label={copy.transferIdentity.modeLabel}>
                {MODE_OPTIONS.map((option) => (
                  <ModeOption
                    key={option.mode}
                    mode={option.mode}
                    label={option.label}
                    selected={option.mode === mode}
                    onSelect={handleModeChange}
                  />
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <input
            id="transfer-recipient"
            type="text"
            value={recipient}
            onChange={(event) => {
              setRecipient(event.target.value);
              setTouched(true);
              setNameAcknowledged(false);
            }}
            onBlur={() => setTouched(true)}
            placeholder={
              mode === 'address'
                ? copy.pages.myNft.recipientPlaceholder
                : mode === 'member'
                  ? copy.transferIdentity.memberPlaceholder
                  : copy.transferIdentity.namePlaceholder
            }
            aria-label={copy.transferIdentity.recipientLabel}
            data-testid="transfer-recipient-input"
            inputMode={mode === 'member' ? 'numeric' : 'text'}
            spellCheck={false}
            autoComplete="off"
            disabled={busy}
            aria-invalid={invalid}
            className={cn(
              'h-11 min-w-0 flex-1 rounded-r-2xl border bg-surface px-3 font-mono text-sm text-foreground',
              'focus:outline-none focus:ring-2 focus:ring-brand',
              invalid ? 'border-danger/50' : 'border-line',
            )}
          />
        </div>
      </div>

      {mode === 'address' && addressMessage !== null ? (
        <p className="text-xs text-danger-strong" role="alert">
          {addressMessage}
        </p>
      ) : null}

      {mode === 'member' && memberReading ? (
        <p className="text-xs text-muted" role="status">
          {copy.transferIdentity.memberReading}
        </p>
      ) : null}

      {mode === 'name' && nameReading ? (
        <p className="text-xs text-muted" role="status">
          {copy.transferIdentity.nameReading}
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
        <p className="text-xs leading-5 text-success" data-testid="transfer-recipient-resolved">
          {copy.transferIdentity.resolvedRecipient(shortenAddress(resolvedRecipient))}
        </p>
      ) : null}

      {showNameConfirmation ? (
        <div
          data-testid="transfer-name-confirmation"
          className="space-y-2 rounded-2xl border border-warning/40 bg-warning-soft/60 p-3 text-xs leading-5"
        >
          <p className="text-sm font-semibold text-foreground">
            {copy.transferIdentity.nameConfirmTitle(
              nameRecipient.name ?? '',
              nameRecipient.memberId?.toString() ?? '',
            )}
          </p>
          <p className="font-mono text-[11px] text-muted">
            {copy.transferIdentity.nameConfirmRecipient(
              shortenAddress(nameRecipient.address ?? ''),
            )}
          </p>
          <p className="flex items-start gap-1.5 text-warning">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {copy.transferIdentity.nameConfirmWarning}
          </p>
          <label className="flex items-start gap-2 rounded-xl bg-surface/80 p-2 font-medium text-foreground">
            <input
              type="checkbox"
              data-testid="transfer-name-ack"
              checked={nameAcknowledged}
              onChange={(event) => setNameAcknowledged(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-line accent-brand"
            />
            <span>
              {copy.transferIdentity.nameConfirmCheckbox(nameRecipient.memberId?.toString() ?? '')}
            </span>
          </label>
        </div>
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
