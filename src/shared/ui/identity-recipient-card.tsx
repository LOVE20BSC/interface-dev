import { AlertTriangle } from '@/shared/ui/icons';
import { CopyableAddress } from '@/shared/ui/copyable-address';

export interface IdentityRecipientCardProps {
  /** 身份 NFT #id 名字, or 名称「…」→ 身份 NFT #id. */
  readonly title: string;
  /** Label before the owner address line, e.g. 收款人. */
  readonly recipientLabel: string;
  readonly address: string;
  /** Aria label of the address copy button (usually the recipient label). */
  readonly addressLabel: string;
  /** Optional warning paragraph (the name mode is visually confusable). */
  readonly warning?: string | undefined;
  readonly checkboxLabel: string;
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
  readonly testId: string;
  readonly recipientTestId?: string | undefined;
  readonly checkboxTestId: string;
}

/**
 * Shared identity-recipient confirmation block: id + canonical name + owner
 * address + explicit acknowledgement. 代币转账 and 转让身份 NFT render the same
 * block so the 确认门禁 looks and behaves identically on both pages; the copy
 * text and whether the block is required stay with each page.
 */
export function IdentityRecipientCard({
  title,
  recipientLabel,
  address,
  addressLabel,
  warning,
  checkboxLabel,
  checked,
  onCheckedChange,
  testId,
  recipientTestId,
  checkboxTestId,
}: IdentityRecipientCardProps) {
  return (
    <div
      data-testid={testId}
      className="mt-2 space-y-2 rounded-2xl border border-warning/40 bg-warning-soft/60 p-3 text-xs leading-5"
    >
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p
        className="flex flex-wrap items-center gap-1 font-mono text-[11px] text-muted"
        {...(recipientTestId !== undefined ? { 'data-testid': recipientTestId } : {})}
      >
        <span>{`${recipientLabel} `}</span>
        <CopyableAddress address={address} label={addressLabel} />
      </p>
      {warning !== undefined ? (
        <p className="flex items-start gap-1.5 text-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {warning}
        </p>
      ) : null}
      <label className="flex items-start gap-2 rounded-xl bg-surface/80 p-2 font-medium text-foreground">
        <input
          type="checkbox"
          data-testid={checkboxTestId}
          checked={checked}
          onChange={(event) => onCheckedChange(event.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-line accent-brand"
        />
        <span>{checkboxLabel}</span>
      </label>
    </div>
  );
}
