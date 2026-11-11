import { useState } from 'react';
import { AlertTriangle } from '@/shared/ui/icons';
import { copy } from '@/shared/config/copy-pages';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/button';
import { Sheet } from '@/shared/ui/sheet';
import type { MemberIdentity } from '@/entities/member-identity/model/use-member-identities';
import { IdentityPill } from '@/features/select-identity/ui/identity-pill';
import { validateRecipient } from '@/features/transfer-identity/lib/validate-recipient';
import type { TransferPhase } from '@/features/transfer-identity/model/use-transfer-identity';

export interface TransferDrawerProps {
  readonly target: MemberIdentity | null;
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
  selfAddress,
  phase,
  errorMessage,
  onSubmit,
  onClose,
}: {
  readonly target: MemberIdentity;
  readonly selfAddress: string | undefined;
  readonly phase: TransferPhase;
  readonly errorMessage: string | null;
  readonly onSubmit: (memberId: bigint, recipient: `0x${string}`) => void;
  readonly onClose: () => void;
}) {
  const [recipient, setRecipient] = useState('');
  const [touched, setTouched] = useState(false);
  const busy = phase === 'confirming' || phase === 'pending';
  const validation = validateRecipient(recipient, selfAddress);
  const validationMessage = touched ? recipientErrorCopy(validation) : null;
  const canSubmit = validation === 'ok' && !busy;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-line bg-slate-50 p-3">
        <IdentityPill identity={target} />
      </div>

      <p className="flex items-start gap-2 rounded-2xl border border-danger/20 bg-danger-soft/60 p-3 text-xs leading-5 text-danger">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        {copy.pages.myNft.transferWarning}
      </p>

      <label className="block">
        <span className="text-xs font-medium text-muted">{copy.pages.myNft.recipientLabel}</span>
        <input
          type="text"
          value={recipient}
          onChange={(event) => {
            setRecipient(event.target.value);
            setTouched(true);
          }}
          onBlur={() => setTouched(true)}
          placeholder={copy.pages.myNft.recipientPlaceholder}
          spellCheck={false}
          autoComplete="off"
          disabled={busy}
          aria-invalid={validationMessage !== null}
          className={cn(
            'mt-1.5 h-11 w-full rounded-2xl border bg-surface px-3 font-mono text-sm text-foreground',
            'focus:outline-none focus:ring-2 focus:ring-brand/40',
            validationMessage !== null ? 'border-danger/50' : 'border-line',
          )}
        />
      </label>
      {validationMessage !== null ? (
        <p className="text-xs text-danger" role="alert">
          {validationMessage}
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
            if (validation !== 'ok') return;
            onSubmit(target.tokenId, recipient.trim() as `0x${string}`);
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
