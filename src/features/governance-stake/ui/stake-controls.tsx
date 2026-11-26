import { useState, type ReactNode } from 'react';
import { NETWORK } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { copyText } from '@/shared/lib/clipboard';
import { approvalStepState } from '@/shared/lib/approval-step';
import { cn } from '@/shared/lib/cn';
import { formatTokenAmount } from '@/shared/lib/format';
import type { TxWatch } from '@/shared/model/use-tx-watch';
import { Button } from '@/shared/ui/button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';
import { TxStuckHint } from '@/shared/ui/tx-stuck-hint';
import type { StakeStage } from '@/features/governance-stake/model/use-stake-transaction';

/**
 * 治理·质押复用的表单控件：金额输入、授权阶梯、交易反馈、回执卡。
 *
 * 三个面板（流动性质押 / 加速质押 / 我的质押）与页面共用这几块，保证按钮顺序、
 * 授权文案、pending 三态与错误呈现只有一份实现（UX spec §4.1/§4.2/§4.3）。
 */

export interface StakeAmountFieldProps {
  readonly label: string;
  readonly symbol: string;
  readonly decimals: number | undefined;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly balance: bigint | undefined;
  readonly balanceLoading: boolean;
  readonly testId: string;
  readonly disabled?: boolean;
  readonly onMax: () => void;
}

/** 金额行：标题（含代币）+ 输入 + 余额小字 + 「全部」。 */
export function StakeAmountField({
  label,
  symbol,
  decimals,
  value,
  onChange,
  balance,
  balanceLoading,
  testId,
  disabled = false,
  onMax,
}: StakeAmountFieldProps) {
  return (
    <label className="block">
      <span className="flex items-center justify-between gap-2 text-sm font-medium text-foreground">
        <span>{label}</span>
        <span className="text-xs font-normal text-muted">{symbol}</span>
      </span>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="0.0"
        aria-label={label}
        data-testid={testId}
        disabled={disabled}
        className={cn(
          'mt-1.5 w-full rounded-2xl border border-line bg-surface px-3 py-2.5 text-right text-lg font-semibold text-foreground',
          'focus:border-brand-strong focus:outline-none focus:ring-2 focus:ring-brand-strong/30',
          'disabled:bg-elevated disabled:text-muted',
        )}
      />
      <span className="mt-1 flex items-center justify-between gap-2 text-xs leading-5 text-muted">
        <span data-testid={`${testId}-balance`}>
          {balanceLoading
            ? copy.gov.liquidity.balanceLoading
            : copy.gov.liquidity.balance(formatTokenAmount(balance, decimals))}
        </span>
        <button
          type="button"
          onClick={onMax}
          disabled={disabled}
          className="font-medium text-brand-strong underline-offset-4 hover:underline disabled:text-muted disabled:no-underline"
        >
          {copy.gov.liquidity.max}
        </button>
      </span>
    </label>
  );
}

export interface StakeApproveRowProps {
  readonly symbol: string;
  readonly allowance: bigint | undefined;
  /** 这一笔实际需要的额度；未知表示还没算出来（按钮保持禁用）。 */
  readonly required: bigint | undefined;
  readonly stage: StakeStage;
  readonly unlimitedPreferred: boolean;
  readonly onApprove: () => void;
  readonly testId: string;
  readonly disabled?: boolean;
}

/**
 * 授权按钮阶梯（UX spec §4.1）：额度不够就显示授权；额度够就原地变「已授权」；
 * 长期授权写 `已长期授权` 且禁用；额度没读回来显示「读取授权额度中…」。
 * 授权按钮永远在流内、与主按钮同组、永远显示。
 */
export function StakeApproveRow({
  symbol,
  allowance,
  required,
  stage,
  unlimitedPreferred,
  onApprove,
  testId,
  disabled = false,
}: StakeApproveRowProps) {
  // 判定来自 `shared/lib/approval-step`（候选 D）；这里只把状态投影成文案。
  const state = approvalStepState({
    required: true,
    stage,
    allowance,
    need: required,
  });
  const canApprove = state === 'needs-approval';

  let label: string;
  let note: string;
  switch (state) {
    case 'busy':
      label = stage === 'wallet' ? copy.approve.approving : copy.approve.confirming;
      note = copy.approve.note(symbol);
      break;
    case 'checking':
      label = copy.approve.loading;
      note = copy.approve.note(symbol);
      break;
    case 'long-term':
      label = copy.approve.longTermActive;
      note = copy.approve.longTermNote;
      break;
    case 'input-pending':
      // 金额还没填完：按钮保持显示但禁用，不给「不需要授权」的假结论。
      label = copy.approve.notNeeded;
      note = copy.approve.approvedNote;
      break;
    case 'approved':
      label = copy.gov.approve.approved(symbol);
      note = copy.approve.approvedNote;
      break;
    case 'needs-approval':
      label = unlimitedPreferred
        ? copy.approve.longTermAction(symbol)
        : copy.approve.action(symbol);
      note = unlimitedPreferred
        ? copy.approve.longTermApproveNote(symbol)
        : copy.approve.note(symbol);
      break;
    // 质押页的授权行永远在流内，不隐藏。
    case 'hidden':
      label = copy.approve.notNeeded;
      note = copy.approve.approvedNote;
      break;
  }

  return (
    <div>
      <Button
        variant="secondary"
        size="md"
        className="w-full"
        loading={stage === 'wallet' || stage === 'pending'}
        onClick={canApprove ? onApprove : undefined}
        disabled={!canApprove || disabled}
        data-testid={testId}
      >
        {label}
      </Button>
      {/* UX §4.1：授权按钮旁边必须写清「只是允许扣这么多、不会立刻扣钱」；
          长期授权偏好开启时改成长期额度那句（owner 2026-11-16）。 */}
      <p className="mt-1 text-[11px] leading-4 text-muted">{note}</p>
    </div>
  );
}

export interface StakeTxFeedbackProps {
  readonly error: string | null;
  readonly watch: TxWatch;
  readonly stage: StakeStage;
}

/** 错误 / 钱包等待 / 在途 / 恢复卡：所有写操作共用的反馈区。 */
export function StakeTxFeedback({ error, watch, stage }: StakeTxFeedbackProps) {
  return (
    <div className="space-y-3">
      {error !== null ? (
        <p
          role="alert"
          data-testid="gov-tx-error"
          className="rounded-2xl border border-danger/20 bg-danger-soft/40 px-3 py-2 text-sm leading-6 text-danger-strong"
        >
          {error}
        </p>
      ) : null}
      {stage === 'wallet' ? (
        <p data-testid="gov-tx-wallet" className="text-xs leading-5 text-muted">
          {copy.gov.tx.wallet}
        </p>
      ) : null}
      <TxStuckHint watch={watch} />
    </div>
  );
}

export interface StakeReceiptCardProps {
  readonly title: string;
  /** Sheet 已经用 title 作为可访问标题时，卡片内不再重复渲染一次（owner 2026-11-19）。 */
  readonly showTitle?: boolean;
  readonly lines: readonly string[];
  readonly hash: `0x${string}`;
  readonly onClose: () => void;
}

/** 页面内回执（UX spec §4.3）：标题 + 你得到什么 + 哈希（复制/浏览器）+ 唯一按钮「好的」。 */
export function StakeReceiptCard({
  title,
  lines,
  hash,
  onClose,
  showTitle = true,
}: StakeReceiptCardProps) {
  const [copied, setCopied] = useState(false);
  const explorerUrl =
    NETWORK.blockExplorerUrl !== null ? `${NETWORK.blockExplorerUrl}/tx/${hash}` : null;
  return (
    <Card data-testid="gov-receipt" className="border-brand-strong/30 bg-brand-soft/30">
      {showTitle ? <CardTitle>{title}</CardTitle> : null}
      <CardDescription>{copy.gov.receipt.refreshHint}</CardDescription>
      {lines.length > 0 ? (
        <ul className="mt-3 space-y-1 text-sm leading-6 text-foreground">
          {lines.map((line) => (
            <li key={line} data-testid="gov-receipt-line">
              {line}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] leading-4 text-muted">
        <span className="break-all font-mono">{hash}</span>
        <button
          type="button"
          data-testid="gov-receipt-copy"
          aria-label={copy.common.txHashCopy}
          onClick={() => {
            void copyText(hash).then((ok) => setCopied(ok));
          }}
          className="font-medium text-brand-strong underline-offset-4 hover:underline"
        >
          {copied ? copy.common.copied : copy.common.txHashCopy}
        </button>
        {explorerUrl !== null ? (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-brand-strong underline-offset-4 hover:underline"
          >
            {copy.common.txHashExplorer}
          </a>
        ) : null}
      </div>
      <div className="mt-4">
        <Button
          variant="primary"
          size="md"
          className="w-full"
          onClick={onClose}
          data-testid="gov-receipt-close"
        >
          {copy.gov.receipt.close}
        </Button>
      </div>
    </Card>
  );
}

export interface StakeStatRowProps {
  readonly label: string;
  readonly value: ReactNode;
  readonly note?: string | undefined;
  readonly testId?: string;
}

/** 只读行：左侧标签 + 右侧数值（数字一律走 format，未知显示「—」）。 */
export function StakeStatRow({ label, value, note, testId }: StakeStatRowProps) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line/60 py-2 last:border-b-0">
      <span className="min-w-0 text-sm leading-6 text-muted">
        {label}
        {note !== undefined ? (
          <span className="block text-[11px] leading-4 text-muted/80">{note}</span>
        ) : null}
      </span>
      <span className="shrink-0 text-sm font-medium text-foreground" data-testid={testId}>
        {value}
      </span>
    </div>
  );
}

export interface StakeStateCardProps {
  readonly title: string;
  readonly description: string;
  readonly children?: ReactNode;
  readonly testId?: string;
}

/** 门禁/空态卡：标题 + 一句话 + 一个下一步（不制造死路）。 */
export function StakeStateCard({ title, description, children, testId }: StakeStateCardProps) {
  return (
    <Card {...(testId !== undefined ? { 'data-testid': testId } : {})}>
      <CardTitle>{title}</CardTitle>
      <CardDescription>{description}</CardDescription>
      {children !== undefined ? <div className="mt-4 flex flex-col gap-2">{children}</div> : null}
    </Card>
  );
}
