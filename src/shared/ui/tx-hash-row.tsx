import { useState } from 'react';
import { NETWORK } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { copyText } from '@/shared/lib/clipboard';
import { Button } from '@/shared/ui/button';
import { Copy } from '@/shared/ui/icons';

/**
 * 交易回执里的「哈希行」唯一实现（C4 收口，2026-11-26）。
 *
 * 六个回执 module 加治理域的回执面板，原先各自手写同一段：算区块浏览器链接、
 * `copied` 状态、复制按钮、复制成功 2 秒后复原、浏览器链接。写法已经分叉
 * （5 处用 `copy.common.copied`、2 处用各域自己的 key）。这里收成一份，
 * 每个回执只传 hash、testid 与它自己的文案覆盖。
 *
 * 文案默认值就是原来各处逐字相同的四句，**不改变任何用户可见措辞**。
 */

/** 复制成功的提示停留时间（与 `CopyableAddress` 保持一致）。 */
const HASH_COPY_FEEDBACK_MS = 2000;

export interface TxHashRowProps {
  readonly hash: string;
  /** 哈希文本的 testid，例如 `transfer-receipt-hash`。 */
  readonly testId?: string;
  /** 复制按钮的 aria-label；默认「复制交易哈希」。 */
  readonly copyLabel?: string;
  /** 行标签；默认「交易哈希」。 */
  readonly label?: string;
  /** 复制成功后的按钮文案；默认「已复制」。 */
  readonly copiedLabel?: string;
  /** 浏览器链接文案；默认「在区块浏览器里查看」。 */
  readonly explorerLabel?: string;
}

function explorerUrlFor(hash: string): string | null {
  return NETWORK.blockExplorerUrl !== null ? `${NETWORK.blockExplorerUrl}/tx/${hash}` : null;
}

export function TxHashRow({
  hash,
  testId,
  copyLabel = copy.common.txHashCopy,
  label = copy.common.txHashLabel,
  copiedLabel = copy.common.copied,
  explorerLabel = copy.common.txHashExplorer,
}: TxHashRowProps) {
  const [copied, setCopied] = useState(false);
  const explorerUrl = explorerUrlFor(hash);

  const handleCopy = async () => {
    const ok = await copyText(hash);
    setCopied(ok);
    if (ok) window.setTimeout(() => setCopied(false), HASH_COPY_FEEDBACK_MS);
  };

  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 text-right">
        <span
          className="break-all font-mono text-[11px] leading-5 text-foreground"
          data-testid={testId}
        >
          {hash}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="ml-1 h-7 px-1.5 text-xs"
          leadingIcon={<Copy className="h-3 w-3" aria-hidden="true" />}
          aria-label={copyLabel}
          onClick={() => {
            void handleCopy();
          }}
        >
          {copied ? copiedLabel : copy.common.copy}
        </Button>
        {explorerUrl !== null ? (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1 block text-xs text-brand-strong underline-offset-4 hover:underline"
          >
            {explorerLabel}
          </a>
        ) : null}
      </dd>
    </div>
  );
}
