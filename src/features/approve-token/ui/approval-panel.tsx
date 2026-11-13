import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { AlertTriangle, Check, RefreshCw, ShieldCheck } from '@/shared/ui/icons';
import { ADDRESSES, type HexAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { buttonStyles, Button } from '@/shared/ui/button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';
import { cn } from '@/shared/lib/cn';
import { formatTokenAmount, shortenAddress } from '@/shared/lib/format';
import { Skeleton } from '@/shared/ui/skeleton';
import { TokenPicker, type TokenPickerGroup, type TokenPickerItem } from '@/shared/ui/token-picker';
import { TxWatchCard } from '@/shared/ui/tx-watch-card';
import { useTransferBalance } from '@/features/transfer-token/model/use-transfer-balance';
import { useTransferCatalog } from '@/features/transfer-token/model/use-transfer-catalog';
import { transferTokenKey, type TransferToken } from '@/features/transfer-token/lib/transfer-types';
import {
  approvalDisplayText,
  canRaiseAllowance,
  canRevokeAllowance,
} from '@/features/approve-token/lib/approval-amount';
import {
  buildApprovalSpenders,
  checkSpenderInput,
} from '@/features/approve-token/lib/approval-spenders';
import {
  readUnlimitedApprovalPreference,
  writeUnlimitedApprovalPreference,
} from '@/features/approve-token/lib/approval-preference';
import type { ApprovalMode } from '@/features/approve-token/lib/approval-types';
import { useApprovalAllowances } from '@/features/approve-token/model/use-approval-allowances';
import {
  approvalActionLabel,
  useApprovalTransaction,
} from '@/features/approve-token/model/use-approval-transaction';
import {
  ApprovalConfirmSheet,
  type PendingApprovalAction,
} from '@/features/approve-token/ui/approval-confirm-sheet';

export interface ApprovalsPanelProps {
  readonly isConnected: boolean;
  readonly isWrongChain: boolean;
  readonly connectAction: ReactNode;
}

const TEXT_LINK =
  'inline-flex items-center text-sm font-medium text-muted underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

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

function riskLines(): readonly string[] {
  return [
    copy.approvals.riskWhat,
    copy.approvals.riskWhy,
    copy.approvals.riskDanger,
    copy.approvals.riskAdvice,
  ];
}

/**
 * 代币授权 (owner 2026-11-14). One token at a time: pick a token, see the
 * current allowance of the address-book contracts, then 长期授权 / 撤销 through
 * a confirmation sheet. A custom spender query sits below the list for anything
 * not in the address book. The page never prints allowance/approve; a
 * collapsible details block owns the raw addresses.
 */
export function ApprovalsPanel({ isConnected, isWrongChain, connectAction }: ApprovalsPanelProps) {
  const { address: account } = useAccount();
  const catalog = useTransferCatalog();
  const spenders = useMemo(() => buildApprovalSpenders(ADDRESSES), []);

  const [selectedToken, setSelectedToken] = useState<TransferToken | undefined>(undefined);
  const [customTokenInput, setCustomTokenInput] = useState('');
  const [customInput, setCustomInput] = useState('');
  const [preference, setPreference] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingApprovalAction | null>(null);
  const [submitBusy, setSubmitBusy] = useState(false);

  const ready = isConnected && !isWrongChain;
  const token = selectedToken;
  const tokenAddress = token?.address;

  const balance = useTransferBalance(token, account, ready);
  const spenderCheck = checkSpenderInput(customInput, account);
  const customSpender = spenderCheck === 'ok' ? (customInput.trim() as HexAddress) : undefined;

  const allowances = useApprovalAllowances(tokenAddress, account, spenders, customSpender, ready);
  const tx = useApprovalTransaction(() => {
    allowances.refetch();
    balance.refetch();
  });

  // Preference is a device-local memory, never chain state.
  /* eslint-disable react-hooks/set-state-in-effect -- hydration-safe read of a browser preference */
  useEffect(() => {
    setPreference(readUnlimitedApprovalPreference());
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // A resolved custom token becomes the selection exactly once per address, the
  // same pattern the 代币转账 page uses.
  const appliedCustomKey = useRef('');
  useEffect(() => {
    const resolved = catalog.custom.token;
    if (catalog.custom.status !== 'ok' || resolved === undefined) return;
    const key = transferTokenKey(resolved);
    if (appliedCustomKey.current === key) return;
    appliedCustomKey.current = key;
    setSelectedToken(resolved);
  }, [catalog.custom.status, catalog.custom.token]);

  // First usable token: community → wrapped → LP. Native coins cannot be
  // approved, so they are deliberately absent from this page's universe.
  const appliedDefaultKey = useRef('');
  useEffect(() => {
    if (selectedToken !== undefined) return;
    const fallback = catalog.communityTokens[0] ?? catalog.wrappedToken ?? catalog.lpToken;
    if (fallback === undefined) return;
    const key = transferTokenKey(fallback);
    if (appliedDefaultKey.current === key) return;
    appliedDefaultKey.current = key;
    setSelectedToken(fallback);
  }, [catalog.communityTokens, catalog.lpToken, catalog.wrappedToken, selectedToken]);

  const busy = tx.stage !== 'idle' || submitBusy;

  const itemTokens = new Map<string, TransferToken>();
  const toItem = (entry: TransferToken): TokenPickerItem => {
    const key = transferTokenKey(entry);
    itemTokens.set(key, entry);
    return {
      key,
      symbol: entry.symbol,
      ...(entry.kind === 'custom' ? { badge: copy.approvals.customBadge } : {}),
    };
  };

  const groups: TokenPickerGroup[] = [
    {
      key: 'community',
      label: copy.approvals.groupCommunity,
      items: catalog.communityTokens.map(toItem),
      emptyLabel: copy.approvals.noCommunityTokens,
    },
  ];
  if (catalog.wrappedToken !== undefined) {
    groups.push({
      key: 'wrapped',
      label: copy.approvals.groupWrapped,
      items: [toItem(catalog.wrappedToken)],
    });
  }
  if (catalog.lpToken !== undefined) {
    groups.push({
      key: 'lp',
      label: copy.approvals.groupLp,
      items: [toItem(catalog.lpToken)],
    });
  }
  if (catalog.custom.token !== undefined) {
    groups.push({
      key: 'custom',
      label: copy.approvals.groupCustom,
      items: [toItem(catalog.custom.token)],
    });
  }

  const customTokenError = (() => {
    switch (catalog.custom.status) {
      case 'invalid':
        return copy.approvals.customInvalid;
      case 'no-code':
        return copy.approvals.customNoCode;
      case 'unreadable':
        return copy.approvals.customUnreadable;
      default:
        return null;
    }
  })();

  const spenderAmountText = (address: HexAddress): string | undefined => {
    const value = allowances.byAddress.get(address.toLowerCase());
    if (value === undefined || token === undefined) return undefined;
    return approvalDisplayText(value, token.symbol, token.decimals);
  };

  const rowAmountText = (address: HexAddress): ReactNode => {
    if (token === undefined) return <Skeleton className="ml-auto h-4 w-16" />;
    const text = spenderAmountText(address);
    if (text !== undefined) return text;
    if (allowances.isLoading) return copy.approvals.knownLoading;
    return copy.approvals.knownError;
  };

  const customLabel =
    spenders.find((spender) => spender.address.toLowerCase() === customSpender?.toLowerCase())
      ?.id ?? null;
  const customSpenderLabel =
    customLabel !== null
      ? copy.approvals.spenders[customLabel].label
      : copy.approvals.customSpenderLabel;

  const visibleSpenders = spenders.filter(
    (spender) =>
      customSpender === undefined || spender.address.toLowerCase() !== customSpender.toLowerCase(),
  );

  const openAction = (spender: HexAddress, label: string, mode: ApprovalMode) => {
    if (token === undefined) return;
    tx.clearError();
    setPendingAction({
      spender,
      label,
      mode,
      currentText: spenderAmountText(spender) ?? copy.approvals.states.unapproved,
    });
  };

  const rowCurrentAllowance = (address: HexAddress): bigint | undefined =>
    allowances.byAddress.get(address.toLowerCase());

  const customAllowance =
    customSpender === undefined ? undefined : allowances.byAddress.get(customSpender.toLowerCase());

  const confirmAction = async () => {
    if (pendingAction === null || token?.address === undefined) return;
    setSubmitBusy(true);
    const ok = await tx.submit({
      tokenAddress: token.address,
      tokenSymbol: token.symbol,
      tokenDecimals: token.decimals,
      spender: pendingAction.spender,
      spenderLabel: pendingAction.label,
      mode: pendingAction.mode,
    });
    setSubmitBusy(false);
    if (ok) setPendingAction(null);
  };

  const balanceText =
    token === undefined || balance.isLoading
      ? copy.approvals.balanceLoading
      : balance.isError
        ? copy.approvals.balanceError
        : `${copy.approvals.balanceLabel(token.symbol)} ${formatTokenAmount(balance.balance, token.decimals)}`;

  if (!isConnected) {
    return (
      <StateCard
        title={copy.approvals.statesCard.connectTitle}
        description={copy.approvals.statesCard.connectBody}
      >
        <div className="[&>button]:w-full sm:[&>button]:w-auto">{connectAction}</div>
      </StateCard>
    );
  }

  if (isWrongChain) {
    return (
      <StateCard description={copy.approvals.statesCard.wrongChainBody}>
        <Link to="/" className={buttonStyles('ghost', 'md', 'w-full sm:w-auto')}>
          {copy.approvals.statesCard.backHome}
        </Link>
      </StateCard>
    );
  }

  const suggestUnlimited = preference;

  return (
    <div className="space-y-4">
      {tx.record !== null ? (
        <div
          data-testid="approvals-success-strip"
          className="rounded-3xl border border-success/30 bg-success-soft/40 p-4 shadow-soft"
        >
          <p className="flex items-start gap-1.5 text-sm font-semibold text-success">
            <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{approvalActionLabel(tx.record.mode, tx.record.spenderLabel)}</span>
          </p>
          <p
            className="mt-1 break-all font-mono text-[11px] text-muted"
            data-testid="approvals-success-strip-hash"
          >
            {tx.record.hash}
          </p>
          <Button variant="secondary" size="sm" className="mt-2" onClick={tx.clearRecord}>
            {copy.approvals.stripClose}
          </Button>
        </div>
      ) : null}

      <p className="px-1 text-xs leading-5 text-muted">{copy.approvals.intro}</p>

      <Card>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted">{copy.approvals.tokenLabel}</span>
          <TokenPicker
            optionTestIdPrefix="approvals"
            triggerTestId="approvals-token"
            triggerAriaLabel={copy.approvals.tokenLabel}
            labels={{
              title: copy.approvals.tokenSheetTitle,
              searchPlaceholder: copy.approvals.searchPlaceholder,
              searchHint: copy.approvals.searchHint,
              searchEmpty: copy.approvals.searchEmpty,
              searchLoading: copy.approvals.searchLoading,
              loadMore: copy.approvals.loadMore,
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
            extraContent={
              <div className="mt-3 space-y-1.5 border-t border-line pt-3">
                <p className="px-1 text-[11px] font-medium text-muted">
                  {copy.approvals.customTitle}
                </p>
                <div className="flex gap-2">
                  <input
                    data-testid="approvals-token-custom-address"
                    type="text"
                    value={customTokenInput}
                    onChange={(event) => setCustomTokenInput(event.target.value)}
                    placeholder={copy.approvals.customPlaceholder}
                    aria-label={copy.approvals.customPlaceholder}
                    autoComplete="off"
                    spellCheck={false}
                    className="h-9 min-w-0 flex-1 rounded-xl border border-line bg-surface px-2.5 font-mono text-xs text-foreground outline-none placeholder:text-muted/70 focus:border-brand/40 focus:ring-2 focus:ring-brand/20"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => catalog.addCustomToken(customTokenInput)}
                    disabled={
                      customTokenInput.trim().length === 0 || catalog.custom.status === 'checking'
                    }
                  >
                    {copy.approvals.customAdd}
                  </Button>
                </div>
                {catalog.custom.status === 'checking' ? (
                  <p className="px-1 text-[11px] text-muted">{copy.approvals.customChecking}</p>
                ) : null}
                {customTokenError !== null ? (
                  <p
                    className="px-1 text-[11px] leading-4 text-danger-strong"
                    data-testid="approvals-token-custom-error"
                  >
                    {customTokenError}{' '}
                    <button
                      type="button"
                      onClick={catalog.custom.retry}
                      className="font-medium underline underline-offset-4"
                    >
                      {copy.approvals.customRetry}
                    </button>
                  </p>
                ) : null}
              </div>
            }
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-2 text-xs leading-5 text-muted">
          <span data-testid="approvals-balance">{balanceText}</span>
          {token !== undefined ? (
            <span>{copy.approvals.decimalsLabel(token.decimals.toString())}</span>
          ) : null}
        </div>
      </Card>

      {token === undefined ? (
        <Card>
          <CardTitle>{copy.approvals.noTokenTitle}</CardTitle>
          <CardDescription>{copy.approvals.noTokenBody}</CardDescription>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="px-4 pb-2 pt-4">
            <h2 className="text-base font-semibold text-foreground">{copy.approvals.knownTitle}</h2>
            <p className="mt-1 text-xs leading-5 text-muted">{copy.approvals.knownBody}</p>
            {allowances.isError ? (
              <p className="mt-2 text-xs leading-5 text-danger-strong">
                {copy.approvals.knownError}{' '}
                <button
                  type="button"
                  onClick={() => allowances.refetch()}
                  className="font-medium underline underline-offset-4"
                >
                  {copy.approvals.knownRetry}
                </button>
              </p>
            ) : null}
          </div>
          {spenders.length === 0 ? (
            <p className="border-t border-line px-4 py-4 text-sm text-muted">
              {copy.approvals.knownEmpty}
            </p>
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {visibleSpenders.map((spender) => {
                const item = copy.approvals.spenders[spender.id];
                const allowance = rowCurrentAllowance(spender.address);
                const suggestHere = suggestUnlimited && canRaiseAllowance(allowance);
                return (
                  <li
                    key={spender.id}
                    className="px-4 py-3"
                    data-testid={`approvals-row-${spender.id}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">{item.label}</p>
                        <p className="mt-0.5 text-xs leading-5 text-muted">{item.purpose}</p>
                      </div>
                      <span
                        className="shrink-0 text-right text-sm font-semibold text-foreground"
                        data-testid={`approvals-amount-${spender.id}`}
                      >
                        {rowAmountText(spender.address)}
                      </span>
                    </div>
                    <details className="mt-1">
                      <summary className="cursor-pointer text-[11px] leading-5 text-muted">
                        {copy.approvals.rowAddress}
                      </summary>
                      <p className="mt-0.5 break-all font-mono text-[11px] leading-4 text-muted">
                        {spender.address}
                      </p>
                    </details>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        data-testid={`approvals-revoke-${spender.id}`}
                        disabled={busy || !canRevokeAllowance(allowance)}
                        onClick={() => openAction(spender.address, item.label, 'revoke')}
                      >
                        {copy.approvals.revoke}
                      </Button>
                      <Button
                        size="sm"
                        variant={suggestHere ? 'outline' : 'secondary'}
                        data-testid={`approvals-unlimited-${spender.id}`}
                        disabled={busy || !canRaiseAllowance(allowance)}
                        onClick={() => openAction(spender.address, item.label, 'unlimited')}
                      >
                        {copy.approvals.unlimitedAction}
                        {suggestHere ? (
                          <span className="rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] font-medium text-brand-strong">
                            {copy.approvals.recommended}
                          </span>
                        ) : null}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      <Card>
        <CardTitle>{copy.approvals.customSpenderTitle}</CardTitle>
        <CardDescription>{copy.approvals.customSpenderBody}</CardDescription>
        <input
          data-testid="approvals-spender"
          type="text"
          value={customInput}
          onChange={(event) => {
            setCustomInput(event.target.value);
            tx.clearError();
          }}
          placeholder={copy.approvals.customSpenderPlaceholder}
          aria-label={copy.approvals.customSpenderPlaceholder}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          disabled={busy}
          aria-invalid={spenderCheck === 'invalid' || spenderCheck === 'zero'}
          className={cn(
            'mt-3 h-11 w-full rounded-2xl border bg-surface px-3 font-mono text-sm text-foreground',
            'outline-none focus:ring-2 focus:ring-brand',
            spenderCheck === 'invalid' || spenderCheck === 'zero'
              ? 'border-danger/50'
              : 'border-line',
          )}
        />
        {spenderCheck === 'invalid' ? (
          <p
            className="mt-1.5 text-xs leading-5 text-danger-strong"
            data-testid="approvals-spender-error"
          >
            {copy.approvals.customSpenderInvalid}
          </p>
        ) : null}
        {spenderCheck === 'zero' ? (
          <p
            className="mt-1.5 text-xs leading-5 text-danger-strong"
            data-testid="approvals-spender-error"
          >
            {copy.approvals.customSpenderZero}
          </p>
        ) : null}
        {spenderCheck === 'self' ? (
          <p
            className="mt-1.5 text-xs leading-5 text-danger-strong"
            data-testid="approvals-spender-error"
          >
            {copy.approvals.customSpenderSelf}
          </p>
        ) : null}

        {customSpender !== undefined ? (
          <div className="mt-3 rounded-2xl border border-line bg-elevated/40 p-3">
            <p className="break-all font-mono text-[11px] leading-4 text-muted">
              {shortenAddress(customSpender, 10, 8)}
            </p>
            {customAllowance === undefined ? (
              <p className="mt-1.5 text-xs leading-5 text-muted">
                {allowances.isLoading ? (
                  copy.approvals.customSpenderChecking
                ) : (
                  <>
                    {copy.approvals.customSpenderReadFailed}{' '}
                    <button
                      type="button"
                      onClick={() => allowances.refetch()}
                      className="font-medium text-brand-strong underline underline-offset-4"
                    >
                      {copy.approvals.customSpenderRetry}
                    </button>
                  </>
                )}
              </p>
            ) : (
              <>
                <p
                  className="mt-1.5 text-sm font-semibold text-foreground"
                  data-testid="approvals-custom-amount"
                >
                  {customAllowance === 0n
                    ? copy.approvals.customNoAllowance
                    : approvalDisplayText(
                        customAllowance,
                        token?.symbol ?? '',
                        token?.decimals ?? 18,
                      )}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    data-testid="approvals-custom-revoke"
                    disabled={busy || !canRevokeAllowance(customAllowance)}
                    onClick={() => openAction(customSpender, customSpenderLabel, 'revoke')}
                  >
                    {copy.approvals.revoke}
                  </Button>
                  <Button
                    size="sm"
                    variant={suggestUnlimited ? 'outline' : 'secondary'}
                    data-testid="approvals-custom-unlimited"
                    disabled={busy || !canRaiseAllowance(customAllowance)}
                    onClick={() => openAction(customSpender, customSpenderLabel, 'unlimited')}
                  >
                    {copy.approvals.unlimitedAction}
                    {suggestUnlimited && canRaiseAllowance(customAllowance) ? (
                      <span className="rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] font-medium text-brand-strong">
                        {copy.approvals.recommended}
                      </span>
                    ) : null}
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : null}
      </Card>

      <Card>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            data-testid="approvals-preference"
            checked={preference}
            onChange={(event) => {
              const next = event.target.checked;
              setPreference(next);
              writeUnlimitedApprovalPreference(next);
            }}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-line accent-brand"
          />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-foreground">
              {copy.approvals.preferenceLabel}
            </span>
            <span className="mt-0.5 block text-xs leading-5 text-muted">
              {copy.approvals.preferenceBody}
            </span>
          </span>
        </label>
      </Card>

      <Card>
        <h2 className="flex items-center gap-1.5 text-base font-semibold text-foreground">
          <ShieldCheck className="h-4 w-4 text-brand-strong" aria-hidden="true" />
          {copy.approvals.riskTitle}
        </h2>
        <ul className="mt-2 space-y-1.5 text-xs leading-5 text-muted">
          {riskLines().map((line) => (
            <li key={line} className="flex gap-1.5">
              <span aria-hidden="true" className="text-brand-strong">
                ·
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </Card>

      {tx.watch.hash !== null ? <TxWatchCard watch={tx.watch} onResubmit={tx.resubmit} /> : null}

      {tx.error !== null ? (
        <div
          role="alert"
          data-testid="approvals-error"
          className="rounded-2xl border border-danger/20 bg-danger-soft/50 p-3 text-sm leading-6 text-danger-strong"
        >
          <p>{tx.error.message}</p>
          {tx.error.kind === 'nonce' ? (
            <Button
              variant="secondary"
              size="sm"
              className="mt-2"
              onClick={tx.resubmit}
              leadingIcon={<RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
            >
              {copy.txWatch.actions.resubmit}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3 px-1 pb-2">
        <span className="flex items-center gap-1 text-[11px] leading-5 text-muted">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {copy.approvals.footerNote}
        </span>
        <Link to="/" className={TEXT_LINK}>
          {copy.approvals.statesCard.backHome}
        </Link>
      </div>

      <ApprovalConfirmSheet
        action={pendingAction}
        tokenSymbol={token?.symbol ?? ''}
        busy={busy}
        onCancel={() => {
          if (!busy) setPendingAction(null);
        }}
        onConfirm={() => {
          void confirmAction();
        }}
      />
    </div>
  );
}
