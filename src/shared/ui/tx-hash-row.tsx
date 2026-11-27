import { useEffect, useRef, useState } from 'react';
import { NETWORK } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { COPY_FEEDBACK_MS, copyText } from '@/shared/lib/clipboard';
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
 *
 * 子元素的 testid 由 `testId` 派生（`-label` / `-copy` / `-explorer`）：同一族锚点
 * 不必让 6 个回执各传 3 个 prop，测试也不按中文文本找元素（规范 §6.1）。
 */

export interface TxHashRowProps {
  readonly hash: string;
  /** 哈希文本的 testid，例如 `transfer-receipt-hash`；子元素按它派生后缀。 */
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

function childTestId(testId: string | undefined, suffix: string): string | undefined {
  return testId === undefined ? undefined : `${testId}-${suffix}`;
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
  const timer = useRef<number | undefined>(undefined);
  const explorerUrl = explorerUrlFor(hash);

  // 卸载时清掉「已复制」的复原定时器；连点时先清上一个，避免多个定时器互相打架。
  useEffect(() => {
    return () => {
      if (timer.current !== undefined) window.clearTimeout(timer.current);
    };
  }, []);

  const handleCopy = async () => {
    const ok = await copyText(hash);
    setCopied(ok);
    if (!ok) return;
    if (timer.current !== undefined) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
  };

  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-muted" data-testid={childTestId(testId, 'label')}>
        {label}
      </dt>
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
          data-testid={childTestId(testId, 'copy')}
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
            data-testid={childTestId(testId, 'explorer')}
            className="mt-1 block text-xs text-brand-strong underline-offset-4 hover:underline"
          >
            {explorerLabel}
          </a>
        ) : null}
      </dd>
    </div>
  );
}
