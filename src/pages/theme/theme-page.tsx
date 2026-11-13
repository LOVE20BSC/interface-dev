import type { KeyboardEvent } from 'react';
import { copy } from '@/shared/config/copy-pages';
import { cn } from '@/shared/lib/cn';
import { THEMES, type ThemeDefinition, type ThemePreview } from '@/shared/lib/theme';
import { useTheme } from '@/shared/model/use-theme';
import { Check } from '@/shared/ui/icons';

/**
 * 主题 (ADR-0005): two explicit palettes, applied immediately and remembered on
 * this device. Each card renders a literal miniature of its own palette (a
 * canvas, a card, two text lines and a brand chip) so the choice is visible
 * before it is applied — neither preview may use the live semantic tokens.
 *
 * No 「跟随系统」 option on purpose (owner 2026-11-14): exactly two explicit
 * palettes, same rule as the legacy library screen.
 */

function PalettePreview({
  preview,
  label,
}: {
  readonly preview: ThemePreview;
  readonly label: string;
}) {
  return (
    <span
      aria-label={label}
      role="img"
      data-testid="theme-preview"
      className="block rounded-xl p-2.5"
      style={{ backgroundColor: preview.canvas }}
    >
      <span
        className="block rounded-lg border p-2"
        style={{ backgroundColor: preview.surface, borderColor: preview.line }}
      >
        <span
          aria-hidden="true"
          className="block h-1.5 w-10 rounded-full"
          style={{ backgroundColor: preview.text }}
        />
        <span
          aria-hidden="true"
          className="mt-1.5 block h-1 w-14 rounded-full"
          style={{ backgroundColor: preview.muted }}
        />
        <span
          className="mt-2 inline-flex h-4 items-center rounded px-1.5 text-[8px] font-bold leading-none"
          style={{ backgroundColor: preview.brand, color: preview.onBrand }}
        >
          L20
        </span>
      </span>
    </span>
  );
}

function ThemeCard({
  definition,
  selected,
  onSelect,
}: {
  readonly definition: ThemeDefinition;
  readonly selected: boolean;
  readonly onSelect: (theme: ThemeDefinition) => void;
}) {
  const label = copy.theme.options[definition.id];

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      data-testid={`theme-option-${definition.id}`}
      data-theme-id={definition.id}
      onClick={() => onSelect(definition)}
      className={cn(
        'rounded-2xl border p-3 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        selected
          ? 'border-brand bg-surface shadow-soft'
          : 'border-line bg-surface hover:border-line-strong hover:bg-elevated',
      )}
    >
      <PalettePreview preview={definition.preview} label={copy.theme.previewLabel(label)} />
      <span className="mt-3 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        {selected ? (
          <span className="inline-flex items-center gap-0.5 text-xs font-medium text-brand-strong">
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            {copy.theme.selected}
          </span>
        ) : null}
      </span>
    </button>
  );
}

export function ThemePage() {
  const { theme, selectTheme } = useTheme();

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const current = THEMES.findIndex((item) => item.id === theme);
    const offset = event.key === 'ArrowRight' ? 1 : -1;
    const next = THEMES[(current + offset + THEMES.length) % THEMES.length];
    if (next !== undefined) selectTheme(next.id);
  };

  return (
    <div className="space-y-4" data-testid="theme-page">
      <section className="rounded-2xl border border-line bg-surface p-4">
        <p className="text-sm leading-6 text-foreground">{copy.theme.intro}</p>
      </section>

      <div
        role="radiogroup"
        aria-label={copy.theme.groupLabel}
        onKeyDown={onKeyDown}
        className="grid grid-cols-2 gap-3"
      >
        {THEMES.map((definition) => (
          <ThemeCard
            key={definition.id}
            definition={definition}
            selected={theme === definition.id}
            onSelect={(next) => selectTheme(next.id)}
          />
        ))}
      </div>

      <p className="px-1 text-xs leading-5 text-muted">{copy.theme.note}</p>
    </div>
  );
}
