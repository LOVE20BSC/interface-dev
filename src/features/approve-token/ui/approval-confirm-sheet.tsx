import type { HexAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import type { ApprovalMode } from '@/features/approve-token/lib/approval-types';
import { Button } from '@/shared/ui/button';
import { Sheet } from '@/shared/ui/sheet';

export interface PendingApprovalAction {
  readonly spender: HexAddress;
  readonly label: string;
  readonly mode: ApprovalMode;
  /** Display text of the current allowance, so the change is explicit. */
  readonly currentText: string;
}

export interface ApprovalConfirmSheetProps {
  readonly action: PendingApprovalAction | null;
  readonly tokenSymbol: string;
  readonly busy: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

/**
 * The one confirmation step before a write. Revoking is reversible but still a
 * chain action the user must understand; approving for the long term is the
 * risky direction, so both modes state the consequence in plain language.
 */
export function ApprovalConfirmSheet({
  action,
  tokenSymbol,
  busy,
  onCancel,
  onConfirm,
}: ApprovalConfirmSheetProps) {
  const open = action !== null;
  const unlimited = action?.mode === 'unlimited';
  const title =
    action === null
      ? copy.approvals.knownTitle
      : unlimited
        ? copy.approvals.confirmUnlimitedTitle(action.label)
        : copy.approvals.confirmRevokeTitle(action.label);
  const body =
    action === null
      ? ''
      : unlimited
        ? copy.approvals.confirmUnlimitedBody(action.label, tokenSymbol)
        : copy.approvals.confirmRevokeBody(action.label, tokenSymbol);
  const nextText = unlimited ? copy.approvals.states.unlimited : copy.approvals.states.unapproved;

  return (
    <Sheet open={open} onOpenChange={(next) => (!next ? onCancel() : undefined)} title={title}>
      <div data-testid="approvals-confirm" className="space-y-4">
        <p className="text-sm leading-6 text-muted">{body}</p>
        {action !== null ? (
          <dl className="space-y-2.5 rounded-2xl border border-line bg-elevated/50 p-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <dt className="shrink-0 text-muted">{copy.approvals.confirmSpender}</dt>
              <dd className="text-right">
                <span className="block font-semibold text-foreground">{action.label}</span>
                <span className="mt-0.5 block break-all font-mono text-[11px] text-muted">
                  {action.spender}
                </span>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">{copy.approvals.confirmCurrent}</dt>
              <dd className="break-words text-right font-medium text-foreground">
                {action.currentText}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">{copy.approvals.confirmNext}</dt>
              <dd
                className="text-right font-semibold text-foreground"
                data-testid="approvals-confirm-next"
              >
                {nextText}
              </dd>
            </div>
          </dl>
        ) : null}
        <div className="flex flex-col gap-2">
          <Button
            variant={unlimited ? 'primary' : 'danger-outline'}
            size="lg"
            className="w-full"
            data-testid="approvals-confirm-submit"
            onClick={onConfirm}
            disabled={busy}
            loading={busy}
          >
            {busy
              ? copy.approvals.confirmSubmitting
              : unlimited
                ? copy.approvals.confirmUnlimitedSubmit
                : copy.approvals.confirmRevokeSubmit}
          </Button>
          <Button
            variant="secondary"
            size="md"
            className="w-full"
            data-testid="approvals-confirm-cancel"
            onClick={onCancel}
            disabled={busy}
          >
            {copy.approvals.confirmCancel}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
