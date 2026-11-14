import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { AlertTriangle, Check, RefreshCw } from '@/shared/ui/icons';
import { NETWORK, configuredAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { cn } from '@/shared/lib/cn';
import { formatAmount, formatTokenAmount } from '@/shared/lib/format';
import { Button, buttonStyles } from '@/shared/ui/button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { ActionStack } from '@/shared/ui/action-stack';
import { approvalKind } from '@/shared/lib/approval-kind';
import { TokenPicker, type TokenPickerGroup, type TokenPickerItem } from '@/shared/ui/token-picker';
import { TxWatchCard } from '@/shared/ui/tx-watch-card';
import { parseBatchText } from '@/features/batch-transfer/lib/batch-parse';
import {
  BATCH_GAS_DEFAULT_NATIVE,
  BATCH_GAS_DEFAULT_TOKEN,
  BATCH_GAS_MAX,
  BATCH_GAS_MIN,
  isBatchGasOverBlock,
  nativeBatchAvailable,
  parseBatchGas,
} from '@/features/batch-transfer/lib/batch-gas';
import { buildBatchReceipt, type BatchReceiptRecord } from '@/features/batch-transfer/lib/batch-receipt';
import type { BatchMode, BatchRequest } from '@/features/batch-transfer/lib/batch-types';
import { useBatchAllowance } from '@/features/batch-transfer/model/use-batch-allowance';
import {
  useBatchAddresses,
  useBatchBalanceReader,
  useBatchRecipientBalances,
} from '@/features/batch-transfer/model/use-batch-recipient-balances';
import { useBatchRecipientCodes } from '@/features/batch-transfer/model/use-batch-recipient-codes';
import { useBatchTransaction } from '@/features/batch-transfer/model/use-batch-transaction';
import { BatchEntryTable } from '@/features/batch-transfer/ui/batch-entry-table';
import { BatchReceipt } from '@/features/batch-transfer/ui/batch-receipt';
import { transferTokenKey, type TransferToken } from '@/features/transfer-token/lib/transfer-types';
import { useTransferBalance } from '@/features/transfer-token/model/use-transfer-balance';
import { useTransferCatalog } from '@/features/transfer-token/model/use-transfer-catalog';

export interface BatchTransferPanelProps {
  readonly isConnected: boolean;
  readonly isWrongChain: boolean;
  readonly connectAction: ReactNode;
}

function StateCard({
  title,
  description,
  children,
}: {
  readonly title?: string;
  readonly description: string;
  readonly children: ReactNode;
}) {
  return (
    <Card>
      {title !== undefined ? <CardTitle>{title}</CardTitle> : null}
      <CardDescription>{description}</CardDescription>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {children}
      </div>
    </Card>
  );
}

/**
 * 批量转账 (owner 2026-11-14). One batch of one asset through BatchTransfer:
 * either the native coin or one ERC20, an optional `approve` of the exact total,
 * and a per-recipient gas budget. The contract is atomic, so the page never
 * implies a partial success: every copy path either says 「整批一起执行」 or
 * 「全部都不会到账」.
 *
 * owner 2026-11-14 09:30 (页面整理): block order follows the legacy page —
 * 资产/币种 → 收款清单 → 逐行错误就地 → 合计与余额对比 → 主按钮 →
 * 预余额核对 → 高级选项（默认折叠）. Recipients are pasted as lines, parsed with
 * per-line errors; a repeated address is reported in place (行号 + 与第 N 行重复)
 * and blocks submission instead of being merged silently.
 */
export function BatchTransferPanel({
  isConnected,
  isWrongChain,
  connectAction,
}: BatchTransferPanelProps) {
  const { address: account } = useAccount();
  const batchTransfer = configuredAddress('batchTransfer');
  const catalog = useTransferCatalog();

  const [mode, setMode] = useState<BatchMode>('native');
  const [selectedToken, setSelectedToken] = useState<TransferToken | undefined>(undefined);
  const [input, setInput] = useState('');
  const [gasInput, setGasInput] = useState(String(BATCH_GAS_DEFAULT_NATIVE));
  const [receipt, setReceipt] = useState<BatchReceiptRecord | null>(null);
  const [lastReceipt, setLastReceipt] = useState<BatchReceiptRecord | null>(null);
  // True between "batch mined" and "post-mined balance re-read finished": no form,
  // no CTA, so a second batch cannot be submitted while the receipt is built.
  const [finalizing, setFinalizing] = useState(false);

  const ready = isConnected && !isWrongChain && batchTransfer !== undefined;

  const token: TransferToken | undefined =
    mode === 'native'
      ? catalog.nativeToken
      : (selectedToken ?? catalog.communityTokens[0] ?? catalog.wrappedToken ?? catalog.lpToken);
  const decimals = token?.decimals ?? NETWORK.nativeCurrency.decimals;
  const symbol = token?.symbol ?? NETWORK.nativeCurrency.symbol;

  const balance = useTransferBalance(token, account, ready);
  const allowance = useBatchAllowance(
    mode === 'token' ? token?.address : undefined,
    account,
    batchTransfer,
    ready,
  );

  const parse = useMemo(
    () =>
      parseBatchText(input, {
        decimals,
        self: account,
        batchContract: batchTransfer,
      }),
    [account, batchTransfer, decimals, input],
  );
  const addresses = useBatchAddresses(parse.rows);
  const hasCode = useBatchRecipientCodes(addresses, ready && addresses.length > 0);
  const recipientBalances = useBatchRecipientBalances(
    mode,
    mode === 'token' ? token?.address : undefined,
    addresses,
    batchTransfer,
    ready,
  );
  const readBalances = useBatchBalanceReader();

  const gasParsed = parseBatchGas(gasInput);
  const gasValue =
    gasParsed.kind === 'ok'
      ? gasParsed.value
      : mode === 'native'
        ? BATCH_GAS_DEFAULT_NATIVE
        : BATCH_GAS_DEFAULT_TOKEN;
  const gasError = (() => {
    if (gasParsed.kind === 'ok') {
      return parse.rows.length > 0 && isBatchGasOverBlock(parse.rows.length, gasParsed.value)
        ? copy.batchTransfer.gasOverBlock
        : null;
    }
    switch (gasParsed.reason) {
      case 'empty':
        return copy.batchTransfer.gasInvalid;
      case 'invalid':
        return copy.batchTransfer.gasInvalid;
      case 'belowMin':
        return copy.batchTransfer.gasBelowMin(formatAmount(BigInt(BATCH_GAS_MIN), 0));
      case 'aboveMax':
        return copy.batchTransfer.gasAboveMax(formatAmount(BigInt(BATCH_GAS_MAX), 0));
      default:
        return null;
    }
  })();
  const gasOk = gasParsed.kind === 'ok' && gasError === null;

  const available =
    mode === 'native'
      ? nativeBatchAvailable(balance.balance, parse.rows.length, gasValue)
      : balance.balance;
  const insufficient =
    parse.total > 0n && available !== undefined && parse.total > available;
  const shortfall = insufficient && available !== undefined ? parse.total - available : undefined;

  const needsApproval =
    mode === 'token' &&
    allowance.value !== undefined &&
    parse.total > 0n &&
    allowance.value < parse.total;
  const allowanceUnavailable = mode === 'token' && allowance.value === undefined;
  const longTermApproved =
    mode === 'token' &&
    allowance.value !== undefined &&
    approvalKind(allowance.value) === 'unlimited';

  const tx = useBatchTransaction({
    onApproved: () => {
      allowance.refetch();
      balance.refetch();
    },
    onBatchConfirmed: (hash, request) => {
      setFinalizing(true);
      void (async () => {
        const post = await readBalances(
          request.mode,
          request.tokenAddress,
          batchTransfer,
          request.rows.map((row) => row.address),
        );
        setReceipt(buildBatchReceipt(hash, request, post));
        setFinalizing(false);
        balance.refetch();
        allowance.refetch();
        recipientBalances.refetch();
      })();
    },
  });

  const busy = tx.stage !== 'idle' || finalizing;
  // After an approve confirmation the allowance is re-read; keep the CTA disabled
  // until that read lands so the same total cannot be approved twice in a row.
  const approvalRefreshing = mode === 'token' && allowance.isFetching;
  // 重复地址不合并也不提交：解析器已排除重复行，这里把「有重复」也算进不可提交条件。
  const rowsValid =
    parse.rows.length > 0 && parse.errors.length === 0 && parse.duplicates.length === 0;
  const baseValid = ready && !busy && rowsValid && !insufficient && gasOk;

  const canApprove = baseValid && needsApproval && token?.address !== undefined;
  const canBatch =
    baseValid &&
    !allowanceUnavailable &&
    (mode === 'native' || (token?.address !== undefined && allowance.value !== undefined));
  const actionEnabled = !approvalRefreshing && (mode === 'token' && needsApproval ? canApprove : canBatch);

  const buildRequest = (): BatchRequest | undefined => {
    if (token === undefined || parse.rows.length === 0) return undefined;
    return {
      mode,
      tokenAddress: mode === 'token' ? token.address : undefined,
      tokenSymbol: token.symbol,
      tokenDecimals: token.decimals,
      rows: parse.rows.map((row) => ({ address: row.address, amount: row.amount })),
      total: parse.total,
      gasLimit: gasValue,
      preBalances: recipientBalances.values,
      recipientHasCode: hasCode,
    };
  };

  const submit = () => {
    const request = buildRequest();
    if (request === undefined) return;
    if (mode === 'token' && needsApproval) {
      void tx.approve(request);
    } else {
      void tx.submit(request);
    }
  };

  const switchMode = (next: BatchMode) => {
    if (next === mode) return;
    setMode(next);
    setGasInput(
      String(next === 'native' ? BATCH_GAS_DEFAULT_NATIVE : BATCH_GAS_DEFAULT_TOKEN),
    );
    tx.clearError();
  };

  const resetInputs = () => {
    setInput('');
    setGasInput(String(mode === 'native' ? BATCH_GAS_DEFAULT_NATIVE : BATCH_GAS_DEFAULT_TOKEN));
    tx.clearError();
  };

  const contractRows = parse.rows.filter((_, index) => hasCode[index] === true);

  const itemTokens = new Map<string, TransferToken>();
  const toItem = (entry: TransferToken): TokenPickerItem => {
    const key = transferTokenKey(entry);
    itemTokens.set(key, entry);
    return { key, symbol: entry.symbol };
  };
  const groups: TokenPickerGroup[] = [
    {
      key: 'community',
      label: copy.batchTransfer.groupCommunity,
      items: catalog.communityTokens.map(toItem),
      emptyLabel: copy.batchTransfer.noCommunityTokens,
    },
  ];
  if (catalog.wrappedToken !== undefined) {
    groups.push({
      key: 'wrapped',
      label: copy.batchTransfer.groupWrapped,
      items: [toItem(catalog.wrappedToken)],
    });
  }
  if (catalog.lpToken !== undefined) {
    groups.push({
      key: 'lp',
      label: copy.batchTransfer.groupLp,
      items: [toItem(catalog.lpToken)],
    });
  }

  const balanceText = balance.isLoading
    ? copy.batchTransfer.balanceLoading
    : balance.isError
      ? copy.batchTransfer.balanceError
      : `${copy.batchTransfer.balanceLabel(symbol)} ${formatTokenAmount(balance.balance, decimals)}`;

  const txError = tx.error;
  const recoveryAction =
    txError?.kind === 'nonce'
      ? { run: tx.resubmit, label: copy.txWatch.actions.resubmit }
      : txError?.kind === 'staleBlock'
        ? { run: () => window.location.reload(), label: copy.txWatch.actions.reload }
        : null;

  const ctaLabel = (() => {
    if (tx.stage === 'wallet') return copy.batchTransfer.submitting;
    if (tx.stage === 'pending') {
      return tx.pendingKind === 'approve'
        ? copy.approve.confirming
        : copy.batchTransfer.pendingBatch;
    }
    if (mode === 'token') {
      // Global 授权 copy (owner 2026-11-14): same sentence on every page.
      if (needsApproval) return copy.approve.action(symbol);
      return copy.batchTransfer.ctaBatch;
    }
    return copy.batchTransfer.ctaNative;
  })();

  if (batchTransfer === undefined) {
    return (
      <StateCard description={copy.batchTransfer.notConfigured}>
        <Link to="/" className={buttonStyles('ghost', 'md', 'w-full sm:w-auto')}>
          {copy.batchTransfer.states.backHome}
        </Link>
      </StateCard>
    );
  }

  if (!isConnected) {
    return (
      <StateCard
        title={copy.batchTransfer.states.connectTitle}
        description={copy.batchTransfer.states.connectBody}
      >
        <div className="[&>button]:w-full sm:[&>button]:w-auto">{connectAction}</div>
      </StateCard>
    );
  }

  if (isWrongChain) {
    return (
      <StateCard description={copy.batchTransfer.states.wrongChainBody}>
        <Link to="/" className={buttonStyles('ghost', 'md', 'w-full sm:w-auto')}>
          {copy.batchTransfer.states.backHome}
        </Link>
      </StateCard>
    );
  }

  if (finalizing && receipt === null) {
    return (
      <Card>
        <CardTitle>{copy.batchTransfer.receiptTitle}</CardTitle>
        <CardDescription>{copy.batchTransfer.finalizing}</CardDescription>
        <div className="mt-4 space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
        </div>
      </Card>
    );
  }

  if (receipt !== null) {
    return (
      <BatchReceipt
        record={receipt}
        onDismiss={() => {
          setLastReceipt(receipt);
          setReceipt(null);
          resetInputs();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {lastReceipt !== null ? (
        <div
          className="rounded-3xl border border-line bg-surface p-5 shadow-soft"
          data-testid="batch-transfer-success-strip"
        >
          <p className="flex items-center gap-1.5 text-sm font-semibold text-success">
            <Check className="h-4 w-4" aria-hidden="true" />
            {copy.batchTransfer.stripTitle}
          </p>
          <p
            className="mt-1 text-base font-medium text-foreground"
            data-testid="batch-transfer-success-strip-amount"
          >
            {copy.batchTransfer.stripAmount(
              `${formatTokenAmount(lastReceipt.total, lastReceipt.decimals)} ${lastReceipt.symbol}`,
            )}
          </p>
        </div>
      ) : null}

      <p className="px-1 text-xs leading-5 text-muted">{copy.batchTransfer.intro}</p>

      <Card className="space-y-3 p-4 sm:p-5">
        {/* 区块 1：转出资产（币种 + 余额） */}
        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted">{copy.batchTransfer.modeLabel}</span>
            <div
              role="radiogroup"
              aria-label={copy.batchTransfer.modeLabel}
              className="flex gap-1 rounded-xl bg-elevated p-0.5"
            >
              {(
                [
                  { key: 'native', label: copy.batchTransfer.modeNative },
                  { key: 'token', label: copy.batchTransfer.modeToken },
                ] as const
              ).map((option) => (
                <button
                  key={option.key}
                  type="button"
                  role="radio"
                  aria-checked={mode === option.key}
                  data-testid={`batch-transfer-mode-${option.key}`}
                  disabled={busy}
                  onClick={() => switchMode(option.key)}
                  className={cn(
                    'rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors',
                    mode === option.key
                      ? 'bg-surface text-foreground shadow-soft'
                      : 'text-muted hover:text-foreground',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {mode === 'token' ? (
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted">{copy.batchTransfer.tokenLabel}</span>
              <TokenPicker
                optionTestIdPrefix="batch-transfer"
                triggerTestId="batch-transfer-token"
                triggerAriaLabel={copy.batchTransfer.tokenLabel}
                labels={{
                  title: copy.batchTransfer.tokenSheetTitle,
                  searchPlaceholder: copy.transfer.searchPlaceholder,
                  searchHint: copy.transfer.searchHint,
                  searchEmpty: copy.transfer.searchEmpty,
                  searchLoading: copy.transfer.searchLoading,
                  loadMore: copy.transfer.loadMore,
                }}
                groups={groups}
                searchResults={catalog.searchResults.map(toItem)}
                searchResultsGroupKey="community"
                searchStatus={catalog.searchStatus}
                search={catalog.search}
                onSearchChange={catalog.setSearch}
                selected={token !== undefined ? toItem(token) : undefined}
                onSelect={(item) => {
                  const next = itemTokens.get(item.key);
                  if (next === undefined) return;
                  setSelectedToken(next);
                  tx.clearError();
                }}
                hasMore={catalog.hasMore}
                onLoadMore={catalog.loadMore}
                isLoading={catalog.isLoading}
                disabled={busy}
              />
            </div>
          ) : null}

          <div className="mt-2 flex items-baseline justify-between gap-2 text-xs leading-5 text-muted">
            <span data-testid="batch-transfer-balance">
              {balance.isLoading ? <Skeleton className="h-3.5 w-28" /> : balanceText}
            </span>
            <span className="shrink-0">{copy.batchTransfer.amountDecimals(decimals)}</span>
          </div>
        </div>

        {/* 区块 2：收款清单（逐行错误、重复提示就地显示） */}
        <div className="border-t border-line pt-3">
          <label htmlFor="batch-recipients" className="text-xs font-medium text-muted">
            {copy.batchTransfer.recipientsLabel}
          </label>
          <p className="mt-0.5 text-[11px] leading-4 text-muted">
            {copy.batchTransfer.recipientsHint}
          </p>
          <textarea
            id="batch-recipients"
            data-testid="batch-transfer-input"
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              tx.clearError();
            }}
            placeholder={copy.batchTransfer.recipientsPlaceholder}
            aria-label={copy.batchTransfer.recipientsLabel}
            rows={4}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            disabled={busy}
            className="mt-1.5 w-full resize-y rounded-2xl border border-line bg-surface p-2.5 font-mono text-[11px] leading-4 text-foreground outline-none placeholder:text-muted focus:border-brand/40 focus:ring-2 focus:ring-brand/20 disabled:opacity-60"
          />
          {parse.truncated ? (
            <p className="mt-1 text-[11px] leading-4 text-muted">
              {copy.batchTransfer.amountTruncated(decimals)}
            </p>
          ) : null}
          {parse.errors.length > 0 ? (
            <ul className="mt-2 space-y-1" data-testid="batch-transfer-line-errors">
              {parse.errors.map((error) => (
                <li
                  key={`${error.line}-${error.reason}`}
                  data-testid={`batch-transfer-line-error-${error.line}`}
                  role="alert"
                  className="text-xs leading-5 text-danger-strong"
                >
                  {copy.batchTransfer.lineError(
                    error.line,
                    copy.batchTransfer.reasons[error.reason],
                  )}
                </li>
              ))}
            </ul>
          ) : null}
          {parse.duplicates.length > 0 ? (
            <ul className="mt-2 space-y-1" data-testid="batch-transfer-duplicates">
              {parse.duplicates.map((duplicate) => (
                <li
                  key={`duplicate-${duplicate.line}`}
                  data-testid={`batch-transfer-duplicate-${duplicate.line}`}
                  role="alert"
                  className="text-xs leading-5 text-warning"
                >
                  {copy.batchTransfer.duplicateLine(duplicate.line, duplicate.firstLine)}
                </li>
              ))}
            </ul>
          ) : null}
          {parse.lineCount === 0 ? (
            <p className="mt-2 text-xs text-muted" data-testid="batch-transfer-empty">
              {copy.batchTransfer.emptyRows}
            </p>
          ) : null}
        </div>

        {/* 区块 3：合计与余额对比 */}
        <div className="border-t border-line pt-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[11px] text-muted" data-testid="batch-transfer-summary">
              {copy.batchTransfer.summary(String(parse.lineCount), String(parse.rows.length))}
            </span>
            <span
              className="text-sm font-semibold text-foreground"
              data-testid="batch-transfer-total"
            >
              {`${copy.batchTransfer.totalLabel} ${formatTokenAmount(parse.total, decimals)} ${symbol}`}
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-4 text-muted">{copy.batchTransfer.atomicNote}</p>
          {insufficient && shortfall !== undefined ? (
            <p
              className="mt-1.5 text-xs leading-5 text-danger-strong"
              data-testid="batch-transfer-insufficient"
            >
              {copy.batchTransfer.insufficient(symbol, formatTokenAmount(shortfall, decimals))}
            </p>
          ) : null}
          {mode === 'native' && insufficient ? (
            <p className="mt-1 text-[11px] leading-4 text-muted">
              {copy.batchTransfer.nativeGasNote(symbol)}
            </p>
          ) : null}
        </div>

        {contractRows.length > 0 ? (
          <div
            role="status"
            data-testid="batch-transfer-contract-warning"
            className="rounded-2xl border border-warning/40 bg-warning-soft/60 p-3 text-xs leading-5"
          >
            <p className="flex items-start gap-1.5 font-semibold text-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {copy.batchTransfer.contractWarningTitle}
            </p>
            <p className="mt-1 text-foreground/80">{copy.batchTransfer.contractWarningBody}</p>
          </div>
        ) : null}

        {mode === 'token' ? (
          <div className="rounded-2xl border border-line bg-elevated/60 p-3 text-xs leading-5">
            <p className="text-muted" data-testid="batch-transfer-allowance">
              {allowance.isLoading
                ? copy.batchTransfer.allowanceLoading
                : allowance.value !== undefined && token !== undefined
                  ? longTermApproved
                    ? copy.batchTransfer.allowanceLongTerm(
                        formatTokenAmount(parse.total, decimals),
                        symbol,
                      )
                    : copy.batchTransfer.allowanceLine(
                        formatTokenAmount(allowance.value, decimals),
                        formatTokenAmount(parse.total, decimals),
                        symbol,
                      )
                  : copy.batchTransfer.allowanceError}
            </p>
            {parse.total > 0n ? (
              <p className={cn('mt-1', needsApproval ? 'text-warning' : 'text-muted')}>
                {needsApproval
                  ? copy.batchTransfer.allowanceNeed
                  : copy.batchTransfer.allowanceReady}
              </p>
            ) : null}
            {needsApproval ? (
              <p className="mt-1 text-[11px] leading-4 text-muted">
                {copy.approve.note(symbol)}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* 区块 4：主按钮（先决的授权仍由同一个位置承担） */}
        <section aria-label={copy.batchTransfer.actionsLabel} className="space-y-2 pt-1">
          <ActionStack>
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              data-testid="batch-transfer-submit"
              onClick={submit}
              disabled={!actionEnabled}
              loading={tx.stage === 'wallet'}
            >
              {ctaLabel}
            </Button>
          </ActionStack>

          {tx.watch.hash !== null ? <TxWatchCard watch={tx.watch} onResubmit={tx.resubmit} /> : null}

          {txError !== null ? (
            <div
              role="alert"
              data-testid="batch-transfer-error"
              className="rounded-2xl border border-danger/20 bg-danger-soft/50 p-3 text-sm leading-6 text-danger-strong"
            >
              <p>{txError.message}</p>
              {recoveryAction !== null ? (
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-2"
                  onClick={recoveryAction.run}
                  leadingIcon={<RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
                >
                  {recoveryAction.label}
                </Button>
              ) : null}
            </div>
          ) : null}
        </section>

        {/* 区块 5：高级选项（默认折叠） */}
        <details className="rounded-2xl border border-line bg-elevated/60 px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-muted">
            {copy.batchTransfer.gasTitle}
          </summary>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label htmlFor="batch-gas" className="text-[11px] text-muted">
              {copy.batchTransfer.gasLabel}
            </label>
            <input
              id="batch-gas"
              data-testid="batch-transfer-gas"
              type="text"
              inputMode="numeric"
              value={gasInput}
              onChange={(event) => {
                setGasInput(event.target.value);
                tx.clearError();
              }}
              disabled={busy}
              autoComplete="off"
              spellCheck={false}
              className="h-9 w-28 rounded-xl border border-line bg-surface px-2.5 font-mono text-xs text-foreground outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/20 disabled:opacity-60"
            />
          </div>
          <p className="mt-1.5 text-[11px] leading-4 text-muted">
            {copy.batchTransfer.gasHint(
              formatAmount(BigInt(BATCH_GAS_MIN), 0),
              formatAmount(BigInt(BATCH_GAS_MAX), 0),
            )}
          </p>
          {gasError !== null ? (
            <p
              className="mt-1 text-[11px] leading-4 text-danger-strong"
              data-testid="batch-transfer-gas-error"
            >
              {gasError}
            </p>
          ) : null}
        </details>
      </Card>

      {/* 区块 6：预余额核对（主按钮之后，提交前逐行核对用） */}
      <BatchEntryTable
        rows={parse.rows}
        balances={recipientBalances.values}
        hasCode={hasCode}
        symbol={symbol}
        decimals={decimals}
        loading={recipientBalances.isLoading}
        error={recipientBalances.isError}
      />
    </div>
  );
}
