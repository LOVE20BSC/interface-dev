import { ArrowUpLeft, List } from '@/shared/ui/icons';
import { copy } from '@/shared/config/copy';
import { Separator } from '@/shared/ui/separator';
import { cn } from '@/shared/lib/cn';
import { useRecentCommunities } from '@/features/switch-community/model/use-recent-communities';

export interface CommunityMenuContentProps {
  readonly currentSymbol: string;
  readonly onSwitch: (symbol: string) => void;
  readonly onNavigate: () => void;
}

function StubRow({
  icon,
  label,
  value,
}: {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div
      aria-disabled="true"
      className="flex w-full cursor-not-allowed items-center gap-2 rounded-xl px-2.5 py-2.5 text-sm text-muted opacity-70"
    >
      <span className="text-muted" aria-hidden="true">
        {icon}
      </span>
      <span className="flex-1">{label}</span>
      <span className="font-mono text-xs">{value}</span>
    </div>
  );
}

/**
 * Community menu: 最近访问 / 父币 / 子币.
 * Parent/child resolution arrives with the address-book data layer; until then
 * they are visibly stubbed rather than hidden or clickable dead ends.
 */
export function CommunityMenuContent({
  currentSymbol,
  onSwitch,
  onNavigate,
}: CommunityMenuContentProps) {
  const { recent } = useRecentCommunities();
  const others = recent.filter((entry) => entry.symbol !== currentSymbol);

  return (
    <div>
      <p className="px-2.5 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted">
        {copy.community.recent}
      </p>
      {others.length === 0 ? (
        <p className="px-2.5 py-2 text-xs leading-5 text-muted">{copy.community.emptyRecent}</p>
      ) : (
        <ul>
          {others.map((entry) => (
            <li key={entry.symbol}>
              <button
                type="button"
                onClick={() => {
                  onSwitch(entry.symbol);
                  onNavigate();
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-xl px-2.5 py-2.5 text-left text-sm',
                  'hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
                )}
              >
                <span className="font-mono text-[13px] font-semibold text-foreground">
                  {entry.symbol}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Separator className="my-2" />
      <StubRow
        icon={<ArrowUpLeft className="h-4 w-4" />}
        label={copy.community.parent}
        value={copy.community.notWired}
      />
      <StubRow
        icon={<List className="h-4 w-4" />}
        label={copy.community.child}
        value={copy.community.notWired}
      />

      <p className="mt-2 border-t border-line px-2.5 pt-2.5 text-[11px] leading-5 text-muted">
        {copy.community.switchHint}
      </p>
    </div>
  );
}
