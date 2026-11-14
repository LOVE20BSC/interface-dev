import { Check, ChevronDown } from '@/shared/ui/icons';
import { copy } from '@/shared/config/copy-pages';
import { cn } from '@/shared/lib/cn';
import {
  IDENTITY_INPUT_MODES,
  IDENTITY_MODE_LABELS,
  identityInputInputMode,
  identityInputPlaceholder,
  type IdentityInputMode,
} from '@/shared/lib/identity-input';
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';

export type { IdentityInputMode };

const SELECTED_CLASS = 'bg-brand-soft/60 font-medium';

function ModeOption({
  mode,
  selected,
  onSelect,
  testIdPrefix,
}: {
  readonly mode: IdentityInputMode;
  readonly selected: boolean;
  readonly onSelect: (mode: IdentityInputMode) => void;
  readonly testIdPrefix: string;
}) {
  return (
    <PopoverClose asChild>
      <button
        type="button"
        role="menuitemradio"
        aria-checked={selected}
        data-testid={`${testIdPrefix}-${mode}`}
        onClick={() => onSelect(mode)}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2.5 text-left text-sm',
          'hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
          selected && SELECTED_CLASS,
        )}
      >
        <span>{IDENTITY_MODE_LABELS[mode]}</span>
        {selected ? (
          <Check className="h-4 w-4 shrink-0 text-brand-strong" aria-hidden="true" />
        ) : null}
      </button>
    </PopoverClose>
  );
}

export interface IdentityInputModeMenuProps {
  readonly mode: IdentityInputMode;
  readonly onChange: (mode: IdentityInputMode) => void;
  readonly disabled?: boolean | undefined;
  /** Test id of the trigger. Defaults to `identity-input-mode`. */
  readonly triggerTestId?: string | undefined;
  /** Prefix of the option test ids (`${prefix}-${mode}`). Defaults to `identity-mode`. */
  readonly optionTestIdPrefix?: string | undefined;
}

/**
 * 收款方类型小下拉 (owner 2026-11-14): 按地址 / 按身份 NFT ID / 按身份 NFT 名字.
 * The trigger sits on the LEFT edge of the recipient input and only ever
 * reports the explicit user choice — never a guess from the typed text.
 */
export function IdentityInputModeMenu({
  mode,
  onChange,
  disabled = false,
  triggerTestId = 'identity-input-mode',
  optionTestIdPrefix = 'identity-mode',
}: IdentityInputModeMenuProps) {
  const selectedLabel = IDENTITY_MODE_LABELS[mode];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={triggerTestId}
          aria-label={`${copy.transfer.modeLabel}：${selectedLabel}`}
          disabled={disabled}
          className="inline-flex h-11 shrink-0 items-center gap-1 rounded-l-2xl border border-r-0 border-line bg-elevated px-2.5 text-xs font-medium text-foreground hover:bg-elevated focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-60"
        >
          {selectedLabel}
          <ChevronDown className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-48 p-1">
        <div role="menu" aria-label={copy.transfer.modeLabel}>
          {IDENTITY_INPUT_MODES.map((option) => (
            <ModeOption
              key={option}
              mode={option}
              selected={option === mode}
              onSelect={onChange}
              testIdPrefix={optionTestIdPrefix}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export interface IdentityRecipientFieldProps {
  readonly id: string;
  readonly label: string;
  readonly ariaLabel?: string | undefined;
  readonly mode: IdentityInputMode;
  readonly onModeChange: (mode: IdentityInputMode) => void;
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly onBlur?: (() => void) | undefined;
  readonly disabled?: boolean | undefined;
  readonly invalid?: boolean | undefined;
  readonly inputTestId?: string | undefined;
  readonly modeTriggerTestId?: string | undefined;
  readonly modeOptionTestIdPrefix?: string | undefined;
}

/**
 * Shared 收款人输入控件: LEFT mode dropdown + text input, used verbatim by
 * 代币转账 and the 转让身份 NFT drawer. Mode/validation live in
 * `@/shared/lib/identity-input`; the two pages only wire their own resolver.
 */
export function IdentityRecipientField({
  id,
  label,
  ariaLabel,
  mode,
  onModeChange,
  value,
  onValueChange,
  onBlur,
  disabled = false,
  invalid = false,
  inputTestId,
  modeTriggerTestId = 'identity-input-mode',
  modeOptionTestIdPrefix = 'identity-mode',
}: IdentityRecipientFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-medium text-muted">
        {label}
      </label>
      <div className="mt-1.5 flex">
        <IdentityInputModeMenu
          mode={mode}
          disabled={disabled}
          onChange={onModeChange}
          triggerTestId={modeTriggerTestId}
          optionTestIdPrefix={modeOptionTestIdPrefix}
        />
        <input
          id={id}
          data-testid={inputTestId ?? id}
          type="text"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          {...(onBlur !== undefined ? { onBlur } : {})}
          placeholder={identityInputPlaceholder(mode)}
          aria-label={ariaLabel ?? label}
          inputMode={identityInputInputMode(mode)}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          disabled={disabled}
          aria-invalid={invalid}
          className={cn(
            'h-11 min-w-0 flex-1 rounded-r-2xl border bg-surface px-3 font-mono text-sm text-foreground',
            'outline-none focus:ring-2 focus:ring-brand',
            invalid ? 'border-danger/50' : 'border-line',
          )}
        />
      </div>
    </div>
  );
}
