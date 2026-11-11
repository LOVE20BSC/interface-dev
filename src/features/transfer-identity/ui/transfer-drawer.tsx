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
import type { TransferPhase } from '@/features/transfer-identity/model/use-transfer-identity';

type RecipientMode = 'address' | 'member';

const MODE_OPTIONS: readonly { readonly mode: RecipientMode; readonly label: string }[] = [
  { mode: 'address', label: copy.transferIdentity.modeAddress },
  { mode: 'member', label: copy.transferIdentity.modeMember },
];

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
          'hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
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

function TransferForm({
  target,
  memberNftAddress,
  selfAddress,
  phase,
  errorMessage,
  onSubmit,
  onClose,
}: {
  readonly target: MemberIdentity;
  readonly memberNftAddress: HexAddress | undefined;
  readonly selfAddress: string | undefined;
  readonly phase: TransferPhase;
  readonly errorMessage: string | null;
  readonly onSubmit: (memberId: bigint, recipient: `0x${string}`) => void;
  readonly onClose: () => void;
}) {
  const [mode, setMode] = useState<RecipientMode>('address');
  const [recipient, setRecipient] = useState('');
  const [touched, setTouched] = useState(false);
  const busy = phase === 'confirming' || phase === 'pending';

  const validation = validateRecipient(recipient, selfAddress);
  const addressMessage = touched ? recipientErrorCopy(validation) : null;
  const member = useMemberRecipient(memberNftAddress, recipient, mode === 'member', selfAddress);
  const memberMessage = memberErrorCopy(member.status);
  const memberReading = mode === 'member' && member.status === 'reading';

  const canSubmit = !busy && (mode === 'address' ? validation === 'ok' : member.status === 'ok');
  const selectedModeLabel =
    mode === 'address' ? copy.transferIdentity.modeAddress : copy.transferIdentity.modeMember;
  const invalid = mode === 'address' ? addressMessage !== null : memberMessage !== null;

  const handleModeChange = (next: RecipientMode) => {
    if (next === mode) return;
    setMode(next);
    setRecipient('');
    setTouched(false);
  };

  const resolvedRecipient =
    mode === 'member' && member.status === 'ok' && member.address !== null ? member.address : null;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-line bg-slate-50 p-3">
        <IdentityPill identity={target} />
      </div>

      <p className="flex items-start gap-2 rounded-2xl border border-danger/20 bg-danger-soft/60 p-3 text-xs leading-5 text-danger">
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
                className="inline-flex h-11 shrink-0 items-center gap-1 rounded-l-2xl border border-r-0 border-line bg-slate-50 px-2.5 text-xs font-medium text-foreground hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-brand/40 disabled:opacity-60"
              >
                {selectedModeLabel}
                <ChevronDown className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-44 p-1">
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
            }}
            onBlur={() => setTouched(true)}
            placeholder={
              mode === 'address'
                ? copy.pages.myNft.recipientPlaceholder
                : copy.transferIdentity.memberPlaceholder
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
              'focus:outline-none focus:ring-2 focus:ring-brand/40',
              invalid ? 'border-danger/50' : 'border-line',
            )}
          />
        </div>
      </div>

      {mode === 'address' && addressMessage !== null ? (
        <p className="text-xs text-danger" role="alert">
          {addressMessage}
        </p>
      ) : null}

      {mode === 'member' && memberReading ? (
        <p className="text-xs text-muted" role="status">
          {copy.transferIdentity.memberReading}
        </p>
      ) : null}

      {mode === 'member' && memberMessage !== null ? (
        <p className="text-xs text-danger" role="alert">
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

      {resolvedRecipient !== null ? (
        <p className="text-xs leading-5 text-success" data-testid="transfer-recipient-resolved">
          {copy.transferIdentity.resolvedRecipient(shortenAddress(resolvedRecipient))}
        </p>
      ) : null}

      {phase === 'error' && errorMessage !== null ? (
        <p className="rounded-2xl border border-danger/20 bg-danger-soft/60 px-3 py-2 text-xs leading-5 text-danger">
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
            if (member.status !== 'ok' || member.address === null) return;
            onSubmit(target.tokenId, member.address);
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
