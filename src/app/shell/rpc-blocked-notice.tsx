import { useEffect, useState } from 'react';
import { RPC_URLS } from '@/config/networks';
import { copy } from '@/shared/config/copy';
import { hasSessionFlag, markSessionFlag } from '@/shared/lib/cache';
import { isLoopbackRpcBlocked } from '@/shared/lib/rpc-access';

/**
 * Pages builds can be opened over HTTPS while the dev address book still points
 * at a loopback anvil. Browsers refuse that request before it reaches the chain
 * (`Permission was denied ... 'loopback' address space`), so "网络可能不稳" is
 * the wrong explanation. Show one page-level notice per browser session and let
 * the user dismiss it; navigating between routes never shows it again.
 */
const NOTICE_SEEN_FLAG = 'rpcBlockedNoticeSeen';

export interface RpcBlockedNoticeProps {
  /** Test seam; the shell uses the real page origin. */
  readonly origin?: string;
  /** Test seam; the shell uses the configured RPC list. */
  readonly rpcUrls?: readonly string[];
}

export function RpcBlockedNotice({
  origin = window.location.origin,
  rpcUrls = RPC_URLS,
}: RpcBlockedNoticeProps = {}) {
  const [visible, setVisible] = useState(
    () => isLoopbackRpcBlocked(origin, rpcUrls) && !hasSessionFlag(NOTICE_SEEN_FLAG),
  );

  useEffect(() => {
    // "Once per session" means once shown, not once dismissed: a reload in the
    // same tab must not repeat the same explanation.
    if (visible) markSessionFlag(NOTICE_SEEN_FLAG);
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      role="status"
      data-testid="rpc-blocked-notice"
      className="border-b border-warning/20 bg-warning-soft/70 px-4 py-2.5"
    >
      <div className="mx-auto flex w-full max-w-2xl items-start gap-3 text-warning">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold">{copy.banners.rpcBlockedTitle}</p>
          <p className="mt-0.5 text-[11px] leading-5">{copy.banners.rpcBlockedBody}</p>
        </div>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-medium underline-offset-4 hover:bg-warning/10 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning/40"
        >
          {copy.banners.rpcBlockedDismiss}
        </button>
      </div>
    </div>
  );
}
