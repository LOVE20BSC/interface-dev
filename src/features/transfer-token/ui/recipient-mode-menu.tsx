import { Check, ChevronDown } from '@/shared/ui/icons';
import { copy } from '@/shared/config/copy-pages';
import { cn } from '@/shared/lib/cn';
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';

/**
 * 收款方输入模式 (owner 2026-11-14): a small dropdown on the LEFT edge of the
 * recipient input switches between 按地址 / 按身份 NFT ID / 按身份 NFT 名字. The
 * mode is explicit, so a registered pure-digit name is never read as an id.
 *
 * Same control, markup and labels as the 转让身份 NFT drawer; kept feature-local
 * here until the shared-ui extraction (任务 20261114-0137-e293) lands, so the two
 * pages cannot drift in wording or behaviour meanwhile.
 */
export type TransferRecipientMode = 'address' | 'member' | 'name';

const MODE_OPTIONS: readonly { readonly mode: TransferRecipientMode; readonly label: string }[] = [
  { mode: 'address', label: copy.transfer.modeAddress },
  { mode: 'member', label: copy.transfer.modeMember },
  { mode: 'name', label: copy.transfer.modeName },
];

const MODE_LABELS: Readonly<Record<TransferRecipientMode, string>> = {
  address: copy.transfer.modeAddress,
  member: copy.transfer.modeMember,
  name: copy.transfer.modeName,
};

function ModeOption({
  mode,
  label,
  selected,
  onSelect,
}: {
  readonly mode: TransferRecipientMode;
  readonly label: string;
  readonly selected: boolean;
  readonly onSelect: (mode: TransferRecipientMode) => void;
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

export function RecipientModeMenu({
  mode,
  disabled = false,
  onChange,
}: {
  readonly mode: TransferRecipientMode;
  readonly disabled?: boolean | undefined;
  readonly onChange: (mode: TransferRecipientMode) => void;
}) {
  const selectedModeLabel = MODE_LABELS[mode];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="transfer-recipient-mode"
          aria-label={`${copy.transfer.modeLabel}：${selectedModeLabel}`}
          disabled={disabled}
          className="inline-flex h-11 shrink-0 items-center gap-1 rounded-l-2xl border border-r-0 border-line bg-elevated px-2.5 text-xs font-medium text-foreground hover:bg-elevated focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-60"
        >
          {selectedModeLabel}
          <ChevronDown className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-48 p-1">
        <div role="menu" aria-label={copy.transfer.modeLabel}>
          {MODE_OPTIONS.map((option) => (
            <ModeOption
              key={option.mode}
              mode={option.mode}
              label={option.label}
              selected={option.mode === mode}
              onSelect={onChange}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
