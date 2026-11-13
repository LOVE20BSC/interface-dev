import { useEffect, useMemo, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { uniswapV2Router02Abi } from '@/config/abis';
import { configuredAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { cn } from '@/shared/lib/cn';
import { formatPercent, formatTokenAmount } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { StickyAction } from '@/shared/ui/sticky-action';
import { TxWatchCard } from '@/shared/ui/tx-watch-card';
import {
  applySlippageDown,
  lpForPercent,
  planWithdraw,
  sharePercent,
} from '@/features/liquidity-pool/lib/liquidity-math';
import {
  deadlineFromNow,
  parseWithdrawPercent,
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

export function MyLiquidityPanel(props: MyLiquidityPanelProps) {
  const {
    token,
    native,
    pool,
    slippagePercent,
    onGoAdd,
    isConnected,
  } = props;
  const { address: account } = useAccount();
  const router = configuredAddress('router');

  const snapshot = pool.snapshot;
  const reserves = pool.reserves;
  const totalSupply = snapshot?.totalSupply ?? 0n;
  const lpBalance = snapshot?.lpBalance ?? 0n;
  const reserveToken = reserves?.reserveToken ?? 0n;
  const reserveNative = reserves?.reserveNative ?? 0n;

  const [percent, setPercent] = useState(100);
  const [percentInput, setPercentInput] = useState('100');
  const [customMode, setCustomMode] = useState(false);
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

  const lpToWithdraw = lpForPercent(lpBalance, percent);
  const plan = useMemo(
    () => planWithdraw(lpToWithdraw, totalSupply, reserveToken, reserveNative),
    [lpToWithdraw, reserveNative, reserveToken, totalSupply],
  );
  const bps = percentToBps(slippagePercent);
  const minToken = applySlippageDown(plan.amountA, bps);
  const minNative = applySlippageDown(plan.amountB, bps);
  const share = sharePercent(lpBalance, totalSupply);
  const maxPlan = useMemo(
    () => planWithdraw(lpBalance, totalSupply, reserveToken, reserveNative),
    [lpBalance, reserveNative, reserveToken, totalSupply],
  );

  const customPercent = parseWithdrawPercent(percentInput);
  const percentError =
    customMode && percentInput.trim().length > 0 && customPercent === undefined
      ? copy.liquidity.mine.invalidPercent
      : null;

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
    percentError === null &&
    !pool.isLoading &&
    !tx.receipt &&
    tx.stage === 'idle' &&
    tx.approveStage === 'idle';

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
        <LiquidityReceiptSheet
          record={tx.receipt}
          onDismiss={tx.clearReceipt}
          onAgain={tx.clearReceipt}
        />
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
          <div className="flex items-start justify-between gap-3">
            <dt className="shrink-0 text-muted">{copy.liquidity.mine.withdrawableLabel}</dt>
            <dd
              className="text-right font-medium text-foreground"
              data-testid="liquidity-my-withdrawable"
            >
              {copy.liquidity.mine.withdrawableValue(
                formatTokenAmount(maxPlan.amountA, token.decimals),
                token.symbol,
                formatTokenAmount(maxPlan.amountB, native.decimals),
                native.symbol,
              )}
            </dd>
          </div>
        </dl>
      </div>

      <div className={CARD}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted">{copy.liquidity.mine.withdrawLabel}</span>
          <span className="text-[11px] leading-4 text-muted">
            {copy.liquidity.settings.slippageLabel} {formatPercent(slippagePercent)}%
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {WITHDRAW_PERCENTS.map((preset) => (
            <button
              key={preset}
              type="button"
              data-testid={`liquidity-withdraw-percent-${preset}`}
              aria-pressed={!customMode && percent === preset}
              onClick={() => {
                setCustomMode(false);
                setPercent(preset);
                setPercentInput(String(preset));
                setSubmitError(null);
              }}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium',
                !customMode && percent === preset
                  ? 'border-brand bg-brand-soft text-brand-strong'
                  : 'border-line text-foreground hover:bg-elevated',
              )}
            >
              {preset}%
            </button>
          ))}
          <label className="flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-xs text-foreground">
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              data-testid="liquidity-withdraw-custom"
              value={percentInput}
              onChange={(event) => {
                setCustomMode(true);
                setPercentInput(event.target.value);
                const parsed = parseWithdrawPercent(event.target.value);
                if (parsed !== undefined) setPercent(parsed);
                setSubmitError(null);
              }}
              aria-label={copy.liquidity.mine.customPercent}
              className="w-12 bg-transparent text-right outline-none"
            />
            <span className="text-muted">{copy.liquidity.mine.percentUnit}</span>
          </label>
        </div>
        {percentError !== null ? (
          <p className="mt-1.5 text-xs leading-5 text-danger-strong">{percentError}</p>
        ) : null}

        <dl className="mt-3 space-y-2 rounded-2xl border border-line bg-elevated p-3 text-sm">
          <div className="flex items-start justify-between gap-3">
            <dt className="shrink-0 text-muted">{copy.liquidity.mine.withdrawableLabel}</dt>
            <dd className="text-right font-medium text-foreground" data-testid="liquidity-withdraw-amount">
              {copy.liquidity.mine.withdrawableValue(
                formatTokenAmount(plan.amountA, token.decimals),
                token.symbol,
                formatTokenAmount(plan.amountB, native.decimals),
                native.symbol,
              )}
            </dd>
          </div>
          <div className="flex items-start justify-between gap-3">
            <dt className="shrink-0 text-muted">{copy.liquidity.mine.minLabel}</dt>
            <dd className="text-right font-medium text-foreground" data-testid="liquidity-withdraw-min">
              {copy.liquidity.mine.withdrawableValue(
                formatTokenAmount(minToken, token.decimals),
                token.symbol,
                formatTokenAmount(minNative, native.decimals),
                native.symbol,
              )}
            </dd>
          </div>
        </dl>
        <p className="mt-2 text-[11px] leading-4 text-muted">{copy.liquidity.mine.minNote}</p>

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

      {needsApproval ? (
        <>
          <StickyAction>
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              data-testid="liquidity-withdraw-approve"
              onClick={() => {
                void handleApprove();
              }}
              disabled={tx.approveStage !== 'idle'}
              loading={tx.approveStage === 'wallet'}
            >
              {copy.liquidity.mine.approveLp}
            </Button>
          </StickyAction>
          <p className="text-xs leading-5 text-muted">{copy.liquidity.mine.approveLpNote}</p>
          {tx.approveWatch.hash !== null ? <TxWatchCard watch={tx.approveWatch} /> : null}
        </>
      ) : (
        <>
          <StickyAction>
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              data-testid="liquidity-withdraw-submit"
              onClick={() => {
                void handleSubmit();
              }}
              disabled={!canSubmit}
              loading={tx.stage === 'wallet'}
            >
              {tx.stage === 'pending' ? copy.liquidity.mine.withdrawing : copy.liquidity.mine.withdraw}
            </Button>
          </StickyAction>
          {tx.watch.hash !== null ? <TxWatchCard watch={tx.watch} onResubmit={tx.resubmit} /> : null}
        </>
      )}

      <LiquidityReceiptSheet
        record={tx.receipt}
        onDismiss={tx.clearReceipt}
        onAgain={tx.clearReceipt}
      />
    </div>
  );
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
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={customSlippage}
          onChange={(event) => onCustomSlippageChange(event.target.value)}
          aria-label={copy.liquidity.settings.slippageCustom}
          className="h-7 w-14 rounded-full border border-line bg-surface px-2 text-right text-[11px] text-foreground outline-none"
        />
        {customSlippageError !== undefined ? (
          <span className="text-[11px] text-danger-strong">{customSlippageError}</span>
        ) : null}
      </div>
    </div>
  );
}
