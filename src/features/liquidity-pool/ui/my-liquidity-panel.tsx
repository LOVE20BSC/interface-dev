import { useEffect, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { uniswapV2Router02Abi } from '@/config/abis';
import { configuredAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { cn } from '@/shared/lib/cn';
import { formatPercent, formatTokenAmount, formatUnits } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { ActionStack } from '@/shared/ui/action-stack';
import { approvalKind } from '@/shared/lib/approval-kind';
import { TxWatchCard } from '@/shared/ui/tx-watch-card';
import {
  applySlippageDown,
  lpForPercent,
  planWithdraw,
  sharePercent,
} from '@/features/liquidity-pool/lib/liquidity-math';
import {
  deadlineFromNow,
  parseAmount,
  percentToBps,
  WITHDRAW_PERCENTS,
} from '@/features/liquidity-pool/lib/liquidity-form';
import { useLpAllowance } from '@/features/liquidity-pool/model/use-liquidity-reads';
import { useLiquidityTransaction } from '@/features/liquidity-pool/model/use-liquidity-transaction';
import type { PoolStateResult } from '@/features/liquidity-pool/model/use-pool-state';
import type { LiquidityToken } from '@/features/liquidity-pool/lib/liquidity-types';
import { LiquidityReceiptSheet } from '@/features/liquidity-pool/ui/liquidity-receipt';

export interface MyLiquidityPanelProps {
  readonly token: LiquidityToken;
  readonly native: LiquidityToken;
  readonly pool: PoolStateResult;
  readonly slippagePercent: number;
  readonly customSlippage: string;
  readonly customSlippageError: string | undefined;
  readonly onSelectSlippagePreset: (percent: number) => void;
  readonly onCustomSlippageChange: (value: string) => void;
  readonly onGoAdd: () => void;
  readonly isConnected: boolean;
}

const CARD = 'rounded-3xl border border-line bg-surface p-5 shadow-soft';
const INPUT =
  'mt-1.5 h-12 w-full rounded-2xl border border-line bg-elevated px-3 text-xl font-semibold text-foreground outline-none placeholder:text-muted focus:border-brand/40 focus:ring-2 focus:ring-brand/20';

/**
 * 我的流动性：读 pair 的 `balanceOf` / `totalSupply`，**按 LP 数量**撤出（owner
 * 2026-11-14）。
 *
 * 25 / 50 / 75 / 100% 只是快捷按钮：点一下把对应比例的 LP 数量填进输入框，用户仍
 * 可以改这个数量。页面只显示「预计收到约 X + Y」；最少收到只用于交易参数，不展示，
 * 「最多可撤出」整行删除。
 */
export function MyLiquidityPanel(props: MyLiquidityPanelProps) {
  const { token, native, pool, slippagePercent, onGoAdd, isConnected } = props;
  const { address: account } = useAccount();
  const router = configuredAddress('router');

  const snapshot = pool.snapshot;
  const reserves = pool.reserves;
  const totalSupply = snapshot?.totalSupply ?? 0n;
  const lpBalance = snapshot?.lpBalance ?? 0n;
  const reserveToken = reserves?.reserveToken ?? 0n;
  const reserveNative = reserves?.reserveNative ?? 0n;

  const [lpInput, setLpInput] = useState('');
  /** 预设按钮算出的**完整** LP 数量（18 位）；输入框只回填截断到 6 位的文本。 */
  const [lpPresetAmount, setLpPresetAmount] = useState<bigint | null>(null);
  const [activePreset, setActivePreset] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const lpAllowance = useLpAllowance(snapshot?.pairAddress, account, router);

  const refetchAll = () => {
    pool.refetch();
    lpAllowance.refetch();
  };
  const tx = useLiquidityTransaction(refetchAll);
  const refetchRef = useRef(refetchAll);
  useEffect(() => {
    refetchRef.current = refetchAll;
  });

  const parsedLp = parseAmount(lpInput, 18);
  // 预设按钮走完整精度（否则 100% 会剩下 1 wei 级别的灰尘）；手输走用户输入本身。
  const lpToWithdraw = lpPresetAmount ?? (parsedLp.kind === 'ok' ? parsedLp.value : 0n);
  const plan = planWithdraw(lpToWithdraw, totalSupply, reserveToken, reserveNative);
  const bps = percentToBps(slippagePercent);
  const minToken = applySlippageDown(plan.amountA, bps);
  const minNative = applySlippageDown(plan.amountB, bps);
  const share = sharePercent(lpBalance, totalSupply);

  const lpError = (() => {
    if (parsedLp.kind === 'invalid') return copy.liquidity.mine.lpInvalid;
    if (parsedLp.kind === 'too-precise') {
      return copy.liquidity.add.amountTooPrecise(parsedLp.digits);
    }
    if (lpToWithdraw > lpBalance) {
      return copy.liquidity.mine.lpTooMuch(formatTokenAmount(lpBalance, 18));
    }
    return null;
  })();

  const approvedRef = useRef<string | null>(null);
  useEffect(() => {
    if (tx.approvedKey === null || tx.approvedKey === approvedRef.current) return;
    approvedRef.current = tx.approvedKey;
    refetchRef.current();
  }, [tx.approvedKey]);

  const needsApproval =
    snapshot !== undefined &&
    router !== undefined &&
    lpToWithdraw > 0n &&
    (lpAllowance.value === undefined || lpAllowance.value < lpToWithdraw);

  const canSubmit =
    isConnected &&
    snapshot !== undefined &&
    router !== undefined &&
    token.address !== undefined &&
    lpToWithdraw > 0n &&
    plan.amountA > 0n &&
    plan.amountB > 0n &&
    lpError === null &&
    !pool.isLoading &&
    !tx.receipt &&
    tx.stage === 'idle' &&
    tx.approveStage === 'idle';

  const fillPreset = (percent: number) => {
    const amount = lpForPercent(lpBalance, percent);
    setLpPresetAmount(amount);
    setLpInput(lpInputText(amount));
    setActivePreset(percent);
    setSubmitError(null);
    tx.clearError();
  };

  const handleApprove = async () => {
    if (snapshot === undefined || router === undefined) return;
    setSubmitError(null);
    await tx.approve({
      tokenAddress: snapshot.pairAddress,
      kind: 'lp',
      spender: router,
      amount: lpToWithdraw,
    });
  };

  const handleSubmit = async () => {
    if (account === undefined || router === undefined || token.address === undefined) return;
    setSubmitError(null);
    await tx.run(
      {
        address: router,
        abi: uniswapV2Router02Abi,
        functionName: 'removeLiquidityETH',
        args: [token.address, lpToWithdraw, minToken, minNative, account, deadlineFromNow()],
      },
      {
        title: copy.liquidity.mine.receiptTitle,
        detail: copy.liquidity.mine.receiptAmount(
          formatTokenAmount(plan.amountA, token.decimals),
          token.symbol,
          formatTokenAmount(plan.amountB, native.decimals),
          native.symbol,
        ),
      },
    );
  };

  if (pool.isLoading && snapshot === undefined) {
    return (
      <div className={CARD}>
        <div className="space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-full rounded-2xl" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
    );
  }

  if (!pool.isError && (snapshot === undefined || lpBalance === 0n)) {
    return (
      <>
        <Card>
          <CardTitle>{copy.liquidity.mine.emptyTitle}</CardTitle>
          <CardDescription>{copy.liquidity.mine.emptyBody}</CardDescription>
          <Button variant="primary" size="md" className="mt-4 w-full sm:w-auto" onClick={onGoAdd}>
            {copy.liquidity.mine.emptyAdd}
          </Button>
        </Card>
        {pool.isError ? (
          <p className="mt-3 text-sm text-muted" data-testid="liquidity-my-error">
            {copy.liquidity.states.readFailed}
          </p>
        ) : null}
        {/* 撤出成功后余额归零会先进入空态，回执必须继续可见（可关闭、留在原页）。 */}
        <LiquidityReceiptSheet record={tx.receipt} onDismiss={tx.clearReceipt} />
      </>
    );
  }

  const errorMessage = submitError ?? tx.error?.message ?? null;

  return (
    <div className="space-y-4">
      <div className={CARD}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">{copy.liquidity.mine.title}</p>
          <span className="text-[11px] leading-4 text-muted">
            {token.symbol} / {native.symbol}
          </span>
        </div>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">{copy.liquidity.mine.lpLabel}</dt>
            <dd className="font-medium text-foreground" data-testid="liquidity-my-lp">
              {formatTokenAmount(lpBalance, 18)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">{copy.liquidity.mine.shareLabel}</dt>
            <dd className="font-medium text-foreground" data-testid="liquidity-my-share">
              {share === undefined ? copy.liquidity.query.none : `${formatPercent(share)}%`}
            </dd>
          </div>
        </dl>
      </div>

      <div className={CARD}>
        <span className="text-xs font-medium text-muted">{copy.liquidity.mine.withdrawLabel}</span>

        <div className="mt-2">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="liquidity-withdraw-lp" className="text-xs font-medium text-muted">
              {copy.liquidity.mine.withdrawLpLabel}
            </label>
            <span
              className="text-[11px] leading-4 text-muted"
              data-testid="liquidity-withdraw-available"
            >
              {copy.liquidity.mine.lpAvailable(formatTokenAmount(lpBalance, 18))}
            </span>
          </div>
          <input
            id="liquidity-withdraw-lp"
            data-testid="liquidity-withdraw-lp"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            value={lpInput}
            onChange={(event) => {
              setLpInput(event.target.value);
              setLpPresetAmount(null);
              setActivePreset(null);
              setSubmitError(null);
              tx.clearError();
            }}
            placeholder={copy.liquidity.mine.withdrawLpPlaceholder}
            className={INPUT}
            aria-describedby="liquidity-withdraw-preset-hint"
          />
        </div>

        <p id="liquidity-withdraw-preset-hint" className="mt-2 text-[11px] leading-4 text-muted">
          {copy.liquidity.mine.presetHint}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {WITHDRAW_PERCENTS.map((preset) => (
            <button
              key={preset}
              type="button"
              data-testid={`liquidity-withdraw-percent-${preset}`}
              aria-pressed={activePreset === preset}
              onClick={() => fillPreset(preset)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium',
                activePreset === preset
                  ? 'border-brand bg-brand-soft text-brand-strong'
                  : 'border-line text-foreground hover:bg-elevated',
              )}
            >
              {preset}%
            </button>
          ))}
        </div>

        {lpError !== null ? (
          <p
            className="mt-1.5 text-xs leading-5 text-danger-strong"
            data-testid="liquidity-withdraw-error-input"
          >
            {lpError}
          </p>
        ) : null}

        {lpToWithdraw > 0n && plan.amountA > 0n && plan.amountB > 0n ? (
          <p
            className="mt-3 rounded-2xl border border-line bg-elevated p-3 text-sm font-medium text-foreground"
            data-testid="liquidity-withdraw-receive"
          >
            {copy.liquidity.mine.receiveLabel}{' '}
            {copy.liquidity.mine.receiveValue(
              formatTokenAmount(plan.amountA, token.decimals),
              token.symbol,
              formatTokenAmount(plan.amountB, native.decimals),
              native.symbol,
            )}
          </p>
        ) : null}

        <div className="mt-3 border-t border-line pt-3">
          <LiquiditySettingsInline {...props} />
        </div>
      </div>

      {errorMessage !== null ? (
        <div
          role="alert"
          data-testid="liquidity-withdraw-error"
          className="rounded-2xl border border-danger/20 bg-danger-soft/50 p-3 text-sm leading-6 text-danger-strong"
        >
          <p>{errorMessage}</p>
          {tx.error?.kind === 'nonce' ? (
            <Button variant="secondary" size="sm" className="mt-2" onClick={tx.resubmit}>
              {copy.txWatch.actions.resubmit}
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* Owner 2026-11-14: prerequisite 授权 first, primary action right after;
          a long-term LP approval stays visible as 「已长期授权」. */}
      <ActionStack>
        <Button
          variant={needsApproval ? 'primary' : 'secondary'}
          size="lg"
          className="w-full"
          data-testid="liquidity-withdraw-approve"
          onClick={() => {
            void handleApprove();
          }}
          disabled={!needsApproval || tx.approveStage !== 'idle' || lpError !== null}
          loading={tx.approveStage === 'wallet'}
        >
          {needsApproval
            ? copy.liquidity.mine.approveLp
            : lpAllowance.value === undefined
              ? copy.approve.loading
              : approvalKind(lpAllowance.value) === 'unlimited'
                ? copy.approve.longTermActive
                : copy.approve.approved}
        </Button>
        {needsApproval || lpAllowance.value !== undefined ? (
          <p className="text-xs leading-5 text-muted">
            {needsApproval
              ? copy.liquidity.mine.approveLpNote
              : approvalKind(lpAllowance.value ?? 0n) === 'unlimited'
                ? copy.approve.longTermNote
                : copy.approve.approvedNote}
          </p>
        ) : null}
        {tx.approveWatch.hash !== null ? <TxWatchCard watch={tx.approveWatch} /> : null}
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          data-testid="liquidity-withdraw-submit"
          onClick={() => {
            void handleSubmit();
          }}
          disabled={needsApproval || !canSubmit}
          loading={tx.stage === 'wallet'}
        >
          {tx.stage === 'pending' ? copy.liquidity.mine.withdrawing : copy.liquidity.mine.withdraw}
        </Button>
        {tx.watch.hash !== null ? <TxWatchCard watch={tx.watch} onResubmit={tx.resubmit} /> : null}
      </ActionStack>

      <LiquidityReceiptSheet record={tx.receipt} onDismiss={tx.clearReceipt} />
    </div>
  );
}

/**
 * LP 数量输入框的回填文本：最多 6 位小数、去掉尾零、**不加千分位**（否则用户没法再
 * 编辑这个值）。交易本身用完整 18 位数量（见 `lpPresetAmount`），这里只截断展示。
 */
function lpInputText(value: bigint, maxFractionDigits = 6): string {
  const full = formatUnits(value, 18);
  const [whole = '0', fraction = ''] = full.split('.');
  const trimmed = fraction.slice(0, maxFractionDigits).replace(/0+$/, '');
  return trimmed.length > 0 ? `${whole}.${trimmed}` : whole;
}

/** 撤出面板只复用「最多可接受的价格变化」控件，不重复渲染有效期说明。 */
function LiquiditySettingsInline(props: MyLiquidityPanelProps) {
  const {
    slippagePercent,
    customSlippage,
    customSlippageError,
    onSelectSlippagePreset,
    onCustomSlippageChange,
  } = props;
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs leading-5 text-muted">
          {copy.liquidity.settings.slippageLabel} {formatPercent(slippagePercent)}%
        </span>
        <div className="flex items-center gap-1.5">
          {[0.1, 0.5, 1.0].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => onSelectSlippagePreset(preset)}
              className={cn(
                'rounded-full border px-2 py-1 text-[11px] font-medium',
                slippagePercent === preset
                  ? 'border-brand bg-brand-soft text-brand-strong'
                  : 'border-line text-muted hover:bg-elevated',
              )}
            >
              {formatPercent(preset, { minimumFractionDigits: 1 })}%
            </button>
          ))}
        </div>
      </div>
      {/* owner/Lead 复核：自定义输入要能和三个预设区分开，否则会被读成「又一个 0.5%」。 */}
      <div className="flex flex-wrap items-center gap-1.5 border-t border-line pt-1.5">
        <label
          htmlFor="liquidity-withdraw-slippage-custom"
          className="text-[11px] leading-4 text-muted"
        >
          {copy.liquidity.settings.slippageCustom}
        </label>
        <input
          id="liquidity-withdraw-slippage-custom"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={customSlippage}
          placeholder={copy.liquidity.settings.customPlaceholder}
          onChange={(event) => onCustomSlippageChange(event.target.value)}
          aria-label={copy.liquidity.settings.slippageCustom}
          className="h-7 w-14 rounded-full border border-line bg-surface px-2 text-right text-[11px] text-foreground outline-none placeholder:text-muted"
        />
        <span className="text-[11px] leading-4 text-muted">
          {copy.liquidity.settings.customUnit}
        </span>
        {customSlippageError !== undefined ? (
          <span className="text-[11px] text-danger-strong">{customSlippageError}</span>
        ) : null}
      </div>
    </div>
  );
}
