import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAccount, useBytecode } from 'wagmi';
import { AlertTriangle, Check, RefreshCw } from '@/shared/ui/icons';
import { configuredAddress, type HexAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { formatTokenAmount, formatUnits } from '@/shared/lib/format';
import {
  identityInputErrorMessage,
  identityInputReadingText,
  isIdentityInputMode,
  type IdentityInputMode,
} from '@/shared/lib/identity-input';
import { Button, buttonStyles } from '@/shared/ui/button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';
import { IdentityRecipientField } from '@/shared/ui/identity-input-mode';
import { IdentityRecipientCard } from '@/shared/ui/identity-recipient-card';
import { Skeleton } from '@/shared/ui/skeleton';
import { ActionStack } from '@/shared/ui/action-stack';
import { TokenPicker, type TokenPickerGroup, type TokenPickerItem } from '@/shared/ui/token-picker';
import { TxWatchCard } from '@/shared/ui/tx-watch-card';
import {
  maxTransferAmount,
  parseTransferAmount,
  spendableTransferBalance,
} from '@/features/transfer-token/lib/transfer-amount';
import {
  checkTransferRecipient,
  decideRecipientProtection,
  knownContractLabel,
} from '@/features/transfer-token/lib/transfer-recipient';
import {
  transferAmountText,
  type TransferRecord,
} from '@/features/transfer-token/lib/transfer-receipt';
import {
  NATIVE_FEE_RESERVE_WEI,
  transferTokenKey,
  type TransferToken,
} from '@/features/transfer-token/lib/transfer-types';
import {
  useIdentityRecipient,
  type IdentityRecipientMode,
} from '@/features/transfer-token/model/use-identity-recipient';
import { useTransferBalance } from '@/features/transfer-token/model/use-transfer-balance';
import { useTransferCatalog } from '@/features/transfer-token/model/use-transfer-catalog';
import { useTransferTransaction } from '@/features/transfer-token/model/use-transfer-transaction';
import { TransferReceipt } from '@/features/transfer-token/ui/transfer-receipt';

export interface TransferTokenPanelProps {
  readonly isConnected: boolean;
  readonly isWrongChain: boolean;
  readonly connectAction: ReactNode;
  /** Test seam only; production always opens on 按地址. */
  readonly initialMode?: IdentityInputMode | undefined;
}

/** Owner 2026-11-14: the card row order is ① 收款方 → ② 代币数量. */
const IDENTITY_MODE: Readonly<Record<IdentityInputMode, IdentityRecipientMode>> = {
  address: 'id',
  member: 'id',
  name: 'name',
};

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
 * 代币转账 (owner 2026-11-14 layout). One card, 收款方 first, then the token
 * amount block: its first line is the bare balance number (no 「代币」 heading, no
 * symbol, no 「余额」) with the token picker on the right; precision only appears
 * when it is not the 18-digit default. ERC20 goes straight to `transfer` (no
 * approval ladder), the native coin is a plain value transfer. Recipient
 * protection is visible before submit: an address-book contract must be
 * acknowledged, any other contract only warns. Success is an in-page receipt
 * that collapses to a strip on 知道了.
 */
export function TransferTokenPanel({
  isConnected,
  isWrongChain,
  connectAction,
  initialMode = 'address',
}: TransferTokenPanelProps) {
  const { address: account } = useAccount();
  const memberNftAddress = configuredAddress('memberNFT');
  const catalog = useTransferCatalog();

  const [selectedToken, setSelectedToken] = useState<TransferToken | undefined>(undefined);
  const [amountInput, setAmountInput] = useState('');
  const [mode, setMode] = useState<IdentityInputMode>(initialMode);
  const [addressInput, setAddressInput] = useState('');
  const [identityInput, setIdentityInput] = useState('');
  const [knownAck, setKnownAck] = useState(false);
  const [identityAck, setIdentityAck] = useState(false);
  const [usedNativeMax, setUsedNativeMax] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [lastReceipt, setLastReceipt] = useState<TransferRecord | null>(null);

  const token = selectedToken ?? catalog.nativeToken;
  const native = token.kind === 'native';
  const catalogReady = isConnected && !isWrongChain;
  const identityMode = isIdentityInputMode(mode);

  const balance = useTransferBalance(token, account, catalogReady);
  const identity = useIdentityRecipient(
    memberNftAddress,
    identityInput,
    catalogReady && identityMode,
    account,
    IDENTITY_MODE[mode],
  );

  const addressCheck = checkTransferRecipient(addressInput, account);
  const identityResolved =
    identity.status === 'ok' && identity.address !== null && identity.memberId !== null;
  const recipientAddress: HexAddress | undefined =
    mode === 'address'
      ? addressCheck === 'ok'
        ? (addressInput.trim() as HexAddress)
        : undefined
      : identityResolved
        ? (identity.address as HexAddress)
        : undefined;

  const bytecode = useBytecode({
    address: recipientAddress,
    query: { enabled: recipientAddress !== undefined },
  });
  // viem returns undefined/null for an address without code (wagmi may surface null).
  const hasBytecode = bytecode.data == null ? undefined : bytecode.data !== '0x';
  const protection = decideRecipientProtection(recipientAddress ?? '', hasBytecode);
  const protectionLabel =
    protection.kind === 'known' ? knownContractLabel(protection.labelKey) : undefined;

  const tx = useTransferTransaction(() => {
    balance.refetch();
  });

  // A resolved custom token becomes the selection exactly once per address: the
  // user can still pick another token afterwards (the resolved token object is
  // rebuilt every render, so the key — not the object — guards the effect).
  const customTokenKey =
    catalog.custom.token !== undefined ? transferTokenKey(catalog.custom.token) : '';
  const appliedCustomKey = useRef('');
  useEffect(() => {
    const resolved = catalog.custom.token;
    if (catalog.custom.status !== 'ok' || resolved === undefined) return;
    if (appliedCustomKey.current === customTokenKey) return;
    appliedCustomKey.current = customTokenKey;
    setSelectedToken(resolved);
  }, [catalog.custom.status, catalog.custom.token, customTokenKey]);

  // A different recipient invalidates the previous contract acknowledgement.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setKnownAck(false);
  }, [recipientAddress]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const parsed = parseTransferAmount(amountInput, token.decimals);
  const spendable = spendableTransferBalance(balance.balance, native);
  const insufficient = parsed.kind === 'ok' && spendable !== undefined && parsed.value > spendable;
  const shortfall =
    insufficient && parsed.kind === 'ok' && spendable !== undefined
      ? parsed.value - spendable
      : undefined;

  const busy = tx.stage !== 'idle' || tx.receipt !== null;
  const canSubmit =
    catalogReady &&
    !busy &&
    parsed.kind === 'ok' &&
    !insufficient &&
    (mode === 'address'
      ? addressCheck === 'ok' && (protection.kind !== 'known' || knownAck)
      : identityResolved && identityAck);

  const addressInvalid = addressCheck !== 'ok' && addressCheck !== 'empty';
  const identityInvalid =
    identity.status === 'invalid' ||
    identity.status === 'not-found' ||
    identity.status === 'self' ||
    identity.status === 'error';

  const amountError =
    parsed.kind === 'invalid'
      ? copy.transfer.amountInvalid
      : parsed.kind === 'zero'
        ? copy.transfer.amountZero
        : insufficient && shortfall !== undefined
          ? copy.transfer.insufficient(token.symbol, formatTokenAmount(shortfall, token.decimals))
          : null;

  const identityError = identityInputErrorMessage(mode, identity.status);
  const identityReading =
    identityMode &&
    (identity.status === 'reading' || identity.status === 'idle') &&
    identityInput.trim().length > 0;
  const addressInvalidNow = mode === 'address' && addressInvalid;
  const identityInvalidNow = identityMode && identityInvalid;

  const itemTokens = new Map<string, TransferToken>();
  const toItem = (entry: TransferToken): TokenPickerItem => {
    const key = transferTokenKey(entry);
    itemTokens.set(key, entry);
    return {
      key,
      symbol: entry.symbol,
      ...(entry.kind === 'custom' ? { badge: copy.transfer.customBadge } : {}),
    };
  };

  const groups: TokenPickerGroup[] = [
    { key: 'native', label: copy.transfer.groupNative, items: [toItem(catalog.nativeToken)] },
    {
      key: 'community',
      label: copy.transfer.groupCommunity,
      items: catalog.communityTokens.map(toItem),
      emptyLabel: copy.transfer.noCommunityTokens,
    },
  ];
  if (catalog.wrappedToken !== undefined) {
    groups.push({
      key: 'wrapped',
      label: copy.transfer.groupWrapped,
      items: [toItem(catalog.wrappedToken)],
    });
  }
  if (catalog.lpToken !== undefined) {
    groups.push({ key: 'lp', label: copy.transfer.groupLp, items: [toItem(catalog.lpToken)] });
  }
  if (catalog.custom.token !== undefined) {
    groups.push({
      key: 'custom',
      label: copy.transfer.groupCustom,
      items: [toItem(catalog.custom.token)],
    });
  }

  const customError = (() => {
    switch (catalog.custom.status) {
      case 'invalid':
        return copy.transfer.customInvalid;
      case 'no-code':
        return copy.transfer.customNoCode;
      case 'unreadable':
        return copy.transfer.customUnreadable;
      default:
        return null;
    }
  })();

  const resetInputs = () => {
    setAmountInput('');
    setUsedNativeMax(false);
    setAddressInput('');
    setIdentityInput('');
    setKnownAck(false);
    setIdentityAck(false);
  };

  const submit = () => {
    if (!canSubmit || parsed.kind !== 'ok' || recipientAddress === undefined) return;
    const recipientLabel =
      identityMode && identity.memberId !== null
        ? copy.transfer.identityTitle(identity.memberId.toString(), identity.name ?? '')
        : undefined;
    void tx.submit({
      token,
      amount: parsed.value,
      recipient: recipientAddress,
      recipientLabel,
    });
  };

  // Owner 2026-11-14: the balance line is the bare number — no symbol, no 「余额」,
  // and precision is only written when it is not the 18-digit default.
  const balanceText = balance.isLoading
    ? null
    : balance.isError
      ? copy.transfer.balanceError
      : formatTokenAmount(balance.balance, token.decimals);

  const txError = tx.error;
  const recoveryAction =
    txError?.kind === 'nonce'
      ? { run: tx.resubmit, label: copy.txWatch.actions.resubmit }
      : txError?.kind === 'staleBlock'
        ? { run: () => window.location.reload(), label: copy.txWatch.actions.reload }
        : null;

  if (!isConnected) {
    return (
      <StateCard
        title={copy.transfer.states.connectTitle}
        description={copy.transfer.states.connectBody}
      >
        <div className="[&>button]:w-full sm:[&>button]:w-auto">{connectAction}</div>
      </StateCard>
    );
  }

  if (isWrongChain) {
    return (
      <StateCard description={copy.transfer.states.wrongChainBody}>
        <Link to="/" className={buttonStyles('ghost', 'md', 'w-full sm:w-auto')}>
          {copy.transfer.states.backHome}
        </Link>
      </StateCard>
    );
  }

  if (tx.receipt !== null) {
    return (
      <TransferReceipt
        record={tx.receipt}
        onDismiss={() => {
          setLastReceipt(tx.receipt);
          tx.clearReceipt();
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
          data-testid="transfer-success-strip"
        >
          <p className="flex items-center gap-1.5 text-sm font-semibold text-success">
            <Check className="h-4 w-4" aria-hidden="true" />
            {copy.transfer.stripTitle}
          </p>
          <p
            className="mt-1 text-base font-medium text-foreground"
            data-testid="transfer-success-strip-amount"
          >
            {copy.transfer.stripAmount(
              transferAmountText(
                lastReceipt.amount,
                lastReceipt.tokenDecimals,
                lastReceipt.tokenSymbol,
              ),
            )}
          </p>
        </div>
      ) : null}

      <p className="px-1 text-xs leading-5 text-muted">{copy.transfer.intro}</p>

      <div className="rounded-3xl border border-line bg-surface p-5 shadow-soft">
        {/* ① 收款方（owner 2026-11-14：先收款方，再代币数量） */}
        <div>
          <IdentityRecipientField
            id="transfer-recipient"
            label={copy.transfer.recipientLabel}
            mode={mode}
            onModeChange={(next) => {
              if (next === mode) return;
              setMode(next);
              setKnownAck(false);
              setIdentityAck(false);
              tx.clearError();
            }}
            value={identityMode ? identityInput : addressInput}
            onValueChange={(next) => {
              if (mode === 'address') {
                setAddressInput(next);
              } else {
                setIdentityInput(next);
                setIdentityAck(false);
              }
              tx.clearError();
            }}
            disabled={busy}
            invalid={identityMode ? identityInvalid : addressInvalid}
            inputTestId="transfer-recipient"
            modeTriggerTestId="transfer-recipient-mode"
            modeOptionTestIdPrefix="transfer-mode"
          />

          {addressInvalidNow && addressCheck === 'invalid' ? (
            <p className="mt-1.5 text-xs text-danger-strong" role="alert">
              {copy.transfer.recipientInvalid}
            </p>
          ) : null}
          {addressInvalidNow && addressCheck === 'zero' ? (
            <p className="mt-1.5 text-xs text-danger-strong" role="alert">
              {copy.transfer.recipientZero}
            </p>
          ) : null}
          {addressInvalidNow && addressCheck === 'self' ? (
            <p className="mt-1.5 text-xs text-danger-strong" role="alert">
              {copy.transfer.recipientSelf}
            </p>
          ) : null}

          {identityReading ? (
            <p className="mt-1.5 text-xs text-muted" role="status">
              {identityInputReadingText(mode)}
            </p>
          ) : null}
          {identityInvalidNow && identityError !== null ? (
            <p className="mt-1.5 text-xs text-danger-strong" role="alert">
              {identityError}
              {identity.status === 'error' ? (
                <button
                  type="button"
                  onClick={identity.retry}
                  className="ml-2 font-medium underline underline-offset-4"
                >
                  {copy.transfer.identityRetry}
                </button>
              ) : null}
            </p>
          ) : null}
          {identityInvalidNow && identity.status === 'error' && memberNftAddress === undefined ? (
            <p className="mt-1.5 text-xs text-muted">{copy.transfer.identityUnavailable}</p>
          ) : null}

          {identityMode && identityResolved && identity.memberId !== null ? (
            <IdentityRecipientCard
              title={copy.transfer.identityTitle(
                identity.memberId.toString(),
                identity.name ?? '',
              )}
              recipientLabel={copy.transfer.receiptTo}
              address={identity.address ?? ''}
              addressLabel={copy.transfer.receiptTo}
              checkboxLabel={copy.transfer.identityConfirmCheckbox(identity.memberId.toString())}
              checked={identityAck}
              onCheckedChange={setIdentityAck}
              testId="transfer-identity-summary"
              recipientTestId="transfer-identity-recipient"
              checkboxTestId="transfer-identity-ack"
            />
          ) : null}

          {protection.kind === 'known' && protectionLabel !== undefined ? (
            <div
              data-testid="transfer-protection"
              role="alert"
              className="mt-2 space-y-2 rounded-2xl border border-warning/40 bg-warning-soft/60 p-3 text-xs leading-5"
            >
              <p className="flex items-start gap-1.5 text-sm font-semibold text-warning">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {copy.transfer.knownContractTitle(protectionLabel)}
              </p>
              <p className="text-foreground/80">{copy.transfer.knownContractBody}</p>
              <label className="flex items-start gap-2 rounded-xl bg-surface/80 p-2 font-medium text-foreground">
                <input
                  type="checkbox"
                  data-testid="transfer-known-ack"
                  checked={knownAck}
                  onChange={(event) => setKnownAck(event.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-line accent-brand"
                />
                <span>{copy.transfer.knownContractCheckbox(protectionLabel)}</span>
              </label>
            </div>
          ) : null}

          {protection.kind === 'contract' ? (
            <div
              data-testid="transfer-contract-warning"
              role="status"
              className="mt-2 rounded-2xl border border-warning/40 bg-warning-soft/60 p-3 text-xs leading-5"
            >
              <p className="flex items-start gap-1.5 font-semibold text-warning">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {copy.transfer.contractTitle}
              </p>
              <p className="mt-1 text-foreground/80">{copy.transfer.contractBody}</p>
            </div>
          ) : null}
        </div>

        {/* ② 代币数量：第一行是余额（不带 symbol / 不带「余额」二字），右侧是代币下拉 */}
        <div className="mt-5 border-t border-line pt-4">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
            <div
              className="min-w-0"
              role="group"
              aria-label={copy.transfer.balanceLabel(token.symbol)}
            >
              <p
                className="text-xl font-semibold leading-7 tracking-tight text-foreground tabular-nums sm:text-2xl"
                data-testid="transfer-balance"
              >
                {balanceText === null ? (
                  <>
                    <span className="sr-only">{copy.transfer.balanceLoading}</span>
                    <Skeleton className="h-6 w-32" />
                  </>
                ) : (
                  balanceText
                )}
              </p>
              {token.decimals !== 18 ? (
                <p
                  className="mt-0.5 text-[11px] leading-4 text-muted"
                  data-testid="transfer-decimals"
                >
                  {copy.transfer.decimalsLabel(token.decimals.toString())}
                </p>
              ) : null}
            </div>
            <TokenPicker
              optionTestIdPrefix="transfer"
              triggerTestId="transfer-token"
              triggerAriaLabel={copy.transfer.tokenPickerAria}
              labels={{
                title: copy.transfer.tokenSheetTitle,
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
              selected={toItem(token)}
              onSelect={(item) => {
                const next = itemTokens.get(item.key);
                if (next === undefined) return;
                setSelectedToken(next);
                setUsedNativeMax(false);
                tx.clearError();
              }}
              hasMore={catalog.hasMore}
              onLoadMore={catalog.loadMore}
              isLoading={catalog.isLoading}
              disabled={busy}
              extraContent={
                <div className="mt-3 space-y-1.5 border-t border-line pt-3">
                  <p className="px-1 text-[11px] font-medium text-muted">
                    {copy.transfer.customTitle}
                  </p>
                  <div className="flex gap-2">
                    <input
                      data-testid="transfer-custom-address"
                      type="text"
                      value={customInput}
                      onChange={(event) => setCustomInput(event.target.value)}
                      placeholder={copy.transfer.customPlaceholder}
                      aria-label={copy.transfer.customPlaceholder}
                      autoComplete="off"
                      spellCheck={false}
                      className="h-9 min-w-0 flex-1 rounded-xl border border-line bg-surface px-2.5 font-mono text-xs text-foreground outline-none placeholder:text-muted focus:border-brand/40 focus:ring-2 focus:ring-brand/20"
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => catalog.addCustomToken(customInput)}
                      disabled={
                        customInput.trim().length === 0 || catalog.custom.status === 'checking'
                      }
                    >
                      {copy.transfer.customAdd}
                    </Button>
                  </div>
                  {catalog.custom.status === 'checking' ? (
                    <p className="px-1 text-[11px] text-muted">{copy.transfer.customChecking}</p>
                  ) : null}
                  {customError !== null ? (
                    <p
                      className="px-1 text-[11px] leading-4 text-danger-strong"
                      data-testid="transfer-custom-error"
                    >
                      {customError}{' '}
                      <button
                        type="button"
                        onClick={catalog.custom.retry}
                        className="font-medium underline underline-offset-4"
                      >
                        {copy.transfer.customRetry}
                      </button>
                    </p>
                  ) : null}
                </div>
              }
            />
          </div>

          <div className="mt-3">
            <label htmlFor="transfer-amount" className="text-xs font-medium text-muted">
              {copy.transfer.amountLabel}
            </label>
            <input
              id="transfer-amount"
              data-testid="transfer-amount"
              name="transfer-amount"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              spellCheck={false}
              value={amountInput}
              onChange={(event) => {
                setAmountInput(event.target.value);
                setUsedNativeMax(false);
                tx.clearError();
              }}
              placeholder={copy.transfer.amountPlaceholder}
              aria-label={copy.transfer.amountLabel}
              disabled={busy}
              className="mt-1 h-12 w-full bg-transparent text-3xl font-semibold tracking-tight text-foreground outline-none placeholder:text-muted"
            />
            <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] leading-4 text-muted">
                {parsed.kind === 'ok' && parsed.truncated
                  ? copy.transfer.amountTruncated(token.decimals)
                  : null}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (balance.balance === undefined) return;
                  setAmountInput(
                    formatUnits(maxTransferAmount(balance.balance, native), token.decimals),
                  );
                  setUsedNativeMax(native);
                  tx.clearError();
                }}
                disabled={busy || balance.balance === undefined}
                className="rounded-full border border-line px-2.5 py-1 text-[11px] font-medium text-brand-strong hover:bg-brand-soft disabled:opacity-50"
              >
                {copy.transfer.max}
              </button>
            </div>
            {amountError !== null ? (
              <p
                className="mt-1.5 text-xs leading-5 text-danger-strong"
                data-testid="transfer-amount-error"
              >
                {amountError}
              </p>
            ) : null}
            {native && usedNativeMax ? (
              <p className="mt-1 text-[11px] leading-4 text-muted">
                {copy.transfer.maxNativeNote(
                  formatTokenAmount(NATIVE_FEE_RESERVE_WEI, token.decimals),
                  token.symbol,
                )}
              </p>
            ) : null}
            {native && insufficient ? (
              <p className="mt-1 text-[11px] leading-4 text-muted">
                {copy.transfer.nativeGasNote(token.symbol)}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {txError !== null ? (
        <div
          role="alert"
          data-testid="transfer-error"
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

      <section aria-label={copy.transfer.actionsLabel} className="space-y-2">
        <ActionStack>
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            data-testid="transfer-submit"
            onClick={submit}
            disabled={!canSubmit}
            loading={tx.stage === 'wallet'}
          >
            {tx.stage === 'wallet' ? copy.transfer.submitting : copy.transfer.submit}
          </Button>
        </ActionStack>

        {tx.watch.hash !== null ? <TxWatchCard watch={tx.watch} onResubmit={tx.resubmit} /> : null}
      </section>
    </div>
  );
}
