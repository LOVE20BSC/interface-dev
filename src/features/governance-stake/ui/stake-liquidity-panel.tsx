import { useEffect, useMemo, useState } from 'react';
import { useAccount, useBalance } from 'wagmi';
import { love20HubAbi, love20TokenAbi, stakeAbi } from '@/config/abis';
import { NETWORK, configuredAddress, type HexAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { decideApproveAmount } from '@/shared/lib/approve-amount';
import { formatPercent, formatTokenAmount, formatUnits, UNKNOWN } from '@/shared/lib/format';
import { useUnlimitedApprovalPreference } from '@/shared/model/use-unlimited-approval-preference';
import { Button, buttonStyles } from '@/shared/ui/button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';
import type { MemberStake } from '@/entities/stake/model/use-member-stake';
import type { StakeBalances } from '@/entities/stake/model/use-stake-balances';
import type { StakePool } from '@/entities/stake/model/use-stake-pool';
import type { StakeCommunity } from '@/entities/stake/model/use-stake-community';
import type { StakeParams } from '@/entities/stake/model/use-stake-params';
import { useHubStakeQuote } from '@/entities/stake/model/use-hub-stake-quote';
import {
  amountShortfall,
  parsePhaseCount,
  parseStakeAmount,
  PHASE_PRESETS,
  resolveStakePhases,
  stakeDeadline,
} from '@/features/governance-stake/lib/stake-form';
import { computeStakePreview } from '@/features/governance-stake/lib/stake-preview';
import { useStakeAllowances } from '@/features/governance-stake/model/use-stake-allowances';
import type { StakeTransactionState } from '@/features/governance-stake/model/use-stake-transaction';
import { StakeAmountField, StakeApproveRow } from '@/features/governance-stake/ui/stake-controls';

/** 治理权按 18 位小数展示：份额来自 LP 记账，与代币精度无关。 */
const VOTE_DECIMALS = 18;
/** 原生币「全部」给网络手续费留的展示口径（与兑换/流动性页一致）。 */
const NATIVE_FEE_RESERVE_WEI = 10n ** 15n;
/** 旧版 stakelp 的滑点默认 2.5%；给出的档位与流动性页同一套。 */
const SLIPPAGE_PRESETS = [0.1, 0.5, 1, 2.5] as const;
const DEFAULT_SLIPPAGE_PERCENT = 2.5;

function percentToBps(percent: number): number {
  return Math.round(percent * 100);
}

/** `value × (10000 − bps) / 10000`，向下取整（最少获得份额）。 */
function applySlippageDown(value: bigint, bps: number): bigint {
  return (value * BigInt(10_000 - bps)) / 10_000n;
}

/** wei → 可编辑的十进制字符串（无千分位、不丢小数）。 */
function rawInputValue(value: bigint, decimals: number): string {
  const raw = formatUnits(value, decimals);
  return raw === UNKNOWN ? '' : raw;
}

export interface StakeLiquidityPanelProps {
  readonly token: {
    readonly address: HexAddress;
    readonly symbol: string;
    readonly decimals: number | undefined;
  };
  readonly parent: {
    readonly address: HexAddress;
    readonly symbol: string;
    readonly decimals: number | undefined;
  };
  readonly stakeAddress: HexAddress;
  readonly hubAddress: HexAddress | undefined;
  readonly memberId: bigint;
  readonly member: MemberStake;
  readonly pool: StakePool;
  readonly community: StakeCommunity;
  readonly params: StakeParams;
  readonly balances: StakeBalances;
  readonly tx: StakeTransactionState;
  readonly disabled: boolean;
}

/**
 * 流动性质押表单（TKM 旧版「质押LP」页的三步式表单，按新协议实现）。
 *
 * 两种模式：
 * - **智能模式（默认开）**：只填一侧也行。走 Hub `stakeLiquidityWithNative`：合约先把
 *   可支配的一侧换一点成另一侧再一起质押；报价给出实际进池两侧、是否发生兑换、以及
 *   **最终治理权增量**。需要授权的是 Hub（社区代币；原生币不需要授权）。
 * - **关闭智能模式**：两侧都填（社区代币 + 父币），按池子比例联动，直接
 *   `Stake.stakeLiquidity`，不经过兑换；两侧比例由合约再截断一次。
 *
 * 已有质押时承诺解锁期锁在当前值：Hub 要求与当前值完全相等，Stake 也不允许变小；
 * 想加大请用「增加承诺解锁期」（旧设计里没有这个动作，属协议适配）。
 */
export function StakeLiquidityPanel({
  token,
  parent,
  stakeAddress,
  hubAddress,
  memberId,
  member,
  pool,
  community,
  params,
  balances,
  tx,
  disabled,
}: StakeLiquidityPanelProps) {
  const { address: account } = useAccount();
  const approvalPreference = useUnlimitedApprovalPreference();
  const nativeBalance = useBalance({ address: account });

  const [tokenInput, setTokenInput] = useState('');
  const [parentInput, setParentInput] = useState('');
  const [nativeInput, setNativeInput] = useState('');
  const [smartMode, setSmartMode] = useState(true);
  const [slippagePercent, setSlippagePercent] = useState<number>(DEFAULT_SLIPPAGE_PERCENT);
  const [phasesInput, setPhasesInput] = useState('');

  /**
   * 承诺解锁期（owner 2026-11-18）：
   * - **首次质押**（没有仓位）：合约允许任意合法值，表单里由用户选择；
   * - **已有质押**：必须保持当前值（Hub 的 `_stake` 要求相等），表单不再给选择，
   *   改为页面顶部的「调整承诺解锁期」卡单独调整。
   */
  const currentPhases = member.promisedWaitingPhases ?? 0n;
  const hasExistingPosition = currentPhases > 0n;
  const defaultPhases = params.minPhases;
  const phasesText =
    phasesInput.trim().length === 0
      ? defaultPhases === undefined
        ? ''
        : String(defaultPhases)
      : phasesInput;
  const phasesParsed = useMemo(() => parsePhaseCount(phasesText), [phasesText]);
  const phasesChosen = phasesParsed.kind === 'ok' ? phasesParsed.value : undefined;
  const phasesReady = resolveStakePhases(currentPhases, phasesChosen);

  const wrappedNative = configuredAddress('weth');
  const smartAvailable =
    hubAddress !== undefined && wrappedNative !== undefined && parent.address === wrappedNative;
  const hubPath = smartMode && smartAvailable;

  const tokenParsed = useMemo(
    () => parseStakeAmount(tokenInput, token.decimals ?? 18),
    [token.decimals, tokenInput],
  );
  const parentParsed = useMemo(
    () => parseStakeAmount(parentInput, parent.decimals ?? 18),
    [parent.decimals, parentInput],
  );
  const nativeParsed = useMemo(
    () => parseStakeAmount(nativeInput, NETWORK.nativeCurrency.decimals),
    [nativeInput],
  );

  const tokenAmount = tokenParsed.kind === 'ok' ? tokenParsed.value : undefined;
  const parentAmount = parentParsed.kind === 'ok' ? parentParsed.value : undefined;
  const nativeAmount = nativeParsed.kind === 'ok' ? nativeParsed.value : undefined;

  /**
   * Hub 有两个入口：带原生币的一边用 `stakeLiquidityWithNative`（必须 msg.value>0），
   * 只填社区代币时必须用 `stakeLiquidityWithToken`，否则原生币变体在
   * `msg.value == 0` 时会 revert `ZeroNativeTokenAmount`（2026-11-17 实测）。
   */
  const hubVariant: 'native' | 'token' = (nativeAmount ?? 0n) > 0n ? 'native' : 'token';
  const quote = useHubStakeQuote({
    hub: hubAddress,
    tokenAddress: token.address,
    tokenAmountDesired: hubPath ? (tokenAmount ?? 0n) : 0n,
    nativeAmountDesired: hubPath ? (nativeAmount ?? 0n) : 0n,
    variant: hubVariant,
    memberId,
    promisedWaitingPhases: phasesReady,
    enabled: hubPath && !disabled,
  });

  const preview = useMemo(
    () =>
      computeStakePreview({
        tokenAmount: hubPath ? undefined : tokenAmount,
        parentTokenAmount: hubPath ? undefined : parentAmount,
        promisedWaitingPhases: phasesReady,
        reserveToken: pool.reserveToken,
        reserveParent: pool.reserveParent,
        lpTotalSupply: pool.lpTotalSupply,
        totalLiquidityShares: community.totalLiquidityShares,
        withdrawableLp: community.withdrawableLp,
        currentLiquidityShares: member.liquidityShares,
        currentGovVotes: member.govVotes,
      }),
    [
      community.totalLiquidityShares,
      community.withdrawableLp,
      hubPath,
      member.govVotes,
      member.liquidityShares,
      parentAmount,
      phasesReady,
      pool.lpTotalSupply,
      pool.reserveParent,
      pool.reserveToken,
      tokenAmount,
    ],
  );

  // 授权：智能模式只授权 Hub（原生币不需要授权）；关掉后授权质押合约的两枚代币。
  const approveSpender = hubPath ? hubAddress : stakeAddress;
  const approveTokens = hubPath ? [token.address] : [token.address, parent.address];
  const allowances = useStakeAllowances(account, approveSpender, approveTokens);

  const allowanceRefetch = allowances.refetch;
  const { approveRevision, receipt } = tx;
  useEffect(() => {
    if (approveRevision === 0 && receipt === null) return;
    allowanceRefetch();
    // refetch 每次渲染都会重建；触发条件是授权/回执计数。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveRevision, receipt]);

  const bps = percentToBps(slippagePercent);
  const hubQuote = quote.data;
  const hubReady = hubPath && hubQuote !== undefined && !quote.isLoading && !quote.isError;
  const minShares =
    hubReady && hubQuote !== undefined
      ? applySlippageDown(hubQuote.liquiditySharesAdded, bps)
      : undefined;

  // 余额校验用「合约实际会扣走的量」：Hub 是 desired 全额（多余会退），关闭模式用比例截断后的两侧。
  const requiredTokenAmount = hubPath ? tokenAmount : (preview.optimalTokenAmount ?? tokenAmount);
  const requiredParentAmount = hubPath ? undefined : (preview.optimalParentAmount ?? parentAmount);
  const tokenShortfall = amountShortfall(balances.tokenBalance, requiredTokenAmount);
  const parentShortfall = amountShortfall(balances.parentBalance, requiredParentAmount);
  const nativeShortfall = (() => {
    if (!hubPath || nativeAmount === undefined) return undefined;
    const available = nativeBalance.data?.value;
    if (available === undefined) return undefined;
    const shortfall = nativeAmount - available;
    return shortfall > 0n ? shortfall : undefined;
  })();

  let validationMessage: string | undefined;
  if (phasesReady === undefined) {
    validationMessage = copy.gov.stats.loading;
  } else if (
    !hasExistingPosition &&
    params.minPhases !== undefined &&
    params.maxPhases !== undefined &&
    (phasesParsed.kind !== 'ok' ||
      phasesParsed.value < params.minPhases ||
      phasesParsed.value > params.maxPhases)
  ) {
    validationMessage = copy.gov.liquidity.phasesInvalid(
      formatTokenAmount(params.minPhases, 0),
      formatTokenAmount(params.maxPhases, 0),
    );
  } else if (
    tokenParsed.kind === 'too-precise' ||
    parentParsed.kind === 'too-precise' ||
    nativeParsed.kind === 'too-precise'
  ) {
    const digits =
      tokenParsed.kind === 'too-precise'
        ? tokenParsed.digits
        : parentParsed.kind === 'too-precise'
          ? parentParsed.digits
          : (nativeParsed as { digits: number }).digits;
    validationMessage = copy.gov.liquidity.amountTooPrecise(digits);
  } else if (
    tokenParsed.kind === 'invalid' ||
    parentParsed.kind === 'invalid' ||
    nativeParsed.kind === 'invalid'
  ) {
    validationMessage = copy.gov.liquidity.amountInvalid;
  } else if (hubPath) {
    if ((tokenAmount ?? 0n) === 0n && (nativeAmount ?? 0n) === 0n) {
      validationMessage = copy.gov.smart.shortfallBoth;
    } else if (quote.isError) {
      validationMessage = copy.gov.smart.quoteFailed;
    } else if (nativeShortfall !== undefined) {
      validationMessage = copy.gov.liquidity.insufficient(
        NETWORK.nativeCurrency.symbol,
        formatTokenAmount(nativeShortfall, NETWORK.nativeCurrency.decimals),
      );
    } else if (tokenShortfall !== undefined) {
      validationMessage = copy.gov.liquidity.insufficient(
        token.symbol,
        formatTokenAmount(tokenShortfall, token.decimals),
      );
    }
  } else if ((tokenAmount ?? 0n) === 0n || (parentAmount ?? 0n) === 0n) {
    validationMessage = copy.gov.liquidity.amountZero;
  } else if (tokenShortfall !== undefined) {
    validationMessage = copy.gov.liquidity.insufficient(
      token.symbol,
      formatTokenAmount(tokenShortfall, token.decimals),
    );
  } else if (parentShortfall !== undefined) {
    validationMessage = copy.gov.liquidity.insufficient(
      parent.symbol,
      formatTokenAmount(parentShortfall, parent.decimals),
    );
  }

  const tokenApproved =
    requiredTokenAmount === undefined || (allowances.allowances[0] ?? 0n) >= requiredTokenAmount;
  const parentApproved = hubPath
    ? true
    : requiredParentAmount === undefined ||
      (allowances.allowances[1] ?? 0n) >= requiredParentAmount;

  const readyToSubmit =
    validationMessage === undefined &&
    phasesReady !== undefined &&
    tokenApproved &&
    parentApproved &&
    (hubPath ? hubReady : preview.status === 'ready') &&
    !disabled &&
    tx.stage === 'idle';

  const handleSubmit = () => {
    if (!readyToSubmit) return;
    if (hubPath) {
      if (hubAddress === undefined || minShares === undefined) return;
      if (hubVariant === 'native') {
        void tx.run(
          {
            address: hubAddress,
            abi: love20HubAbi,
            functionName: 'stakeLiquidityWithNative',
            args: [
              {
                tokenAddress: token.address,
                tokenAmountDesired: tokenAmount ?? 0n,
                minLiquidityShares: minShares,
                promisedWaitingPhases: phasesReady ?? 1n,
                memberId,
                deadline: stakeDeadline(),
              },
            ],
            value: nativeAmount ?? 0n,
          },
          'stakeLiquidity',
        );
        return;
      }
      // 只填社区代币：走两枚 ERC20 的入口（原生币数量恒为 0）。
      void tx.run(
        {
          address: hubAddress,
          abi: love20HubAbi,
          functionName: 'stakeLiquidityWithToken',
          args: [
            {
              tokenAddress: token.address,
              tokenAmountDesired: tokenAmount ?? 0n,
              parentTokenAmountDesired: 0n,
              minLiquidityShares: minShares,
              promisedWaitingPhases: phasesReady ?? 1n,
              memberId,
              deadline: stakeDeadline(),
            },
          ],
        },
        'stakeLiquidity',
      );
      return;
    }
    if (tokenAmount === undefined || parentAmount === undefined) return;
    void tx.run(
      {
        address: stakeAddress,
        abi: stakeAbi,
        functionName: 'stakeLiquidity',
        args: [
          token.address,
          tokenAmount,
          parentAmount,
          phasesReady ?? 1n,
          memberId,
          stakeDeadline(),
        ],
      },
      'stakeLiquidity',
    );
  };

  const votesPreview = hubPath
    ? hubReady && hubQuote !== undefined
      ? hubQuote.govVotesAdded
      : undefined
    : preview.status === 'ready'
      ? preview.votesAdded
      : undefined;

  return (
    <Card data-testid="gov-liquidity-card">
      <CardTitle>{copy.gov.liquidity.title}</CardTitle>
      <CardDescription>{copy.gov.liquidity.body}</CardDescription>

      {/* 智能模式开关（旧版 stakelp 没有开关；owner 2026-11-17 要求支持单币智能质押） */}
      <div className="mt-4 flex items-start justify-between gap-3 rounded-2xl border border-line bg-elevated/60 px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{copy.gov.smart.label}</p>
          <p className="mt-0.5 text-[11px] leading-4 text-muted">
            {smartAvailable
              ? hubPath
                ? copy.gov.smart.onHint
                : copy.gov.smart.offHint
              : copy.gov.smart.hubMissing}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={hubPath}
          aria-label={copy.gov.smart.label}
          data-testid="gov-liquidity-smart-mode"
          disabled={!smartAvailable || disabled}
          onClick={() => setSmartMode((value) => !value)}
          className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors ${
            hubPath ? 'border-brand bg-brand' : 'border-line bg-surface'
          } disabled:opacity-60`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow-soft transition-all ${
              hubPath ? 'left-6' : 'left-0.5'
            }`}
            aria-hidden="true"
          />
        </button>
      </div>

      <div className="mt-4 space-y-4">
        <StakeAmountField
          label={copy.gov.liquidity.tokenLabel(token.symbol)}
          symbol={token.symbol}
          decimals={token.decimals}
          value={tokenInput}
          onChange={setTokenInput}
          balance={balances.tokenBalance}
          balanceLoading={balances.status === 'loading'}
          testId="gov-liquidity-token-input"
          disabled={disabled}
          onMax={() => {
            if (balances.tokenBalance !== undefined) {
              setTokenInput(rawInputValue(balances.tokenBalance, token.decimals ?? 18));
            }
          }}
        />

        {hubPath ? (
          <StakeAmountField
            label={copy.gov.smart.nativeLabel(NETWORK.nativeCurrency.symbol)}
            symbol={NETWORK.nativeCurrency.symbol}
            decimals={NETWORK.nativeCurrency.decimals}
            value={nativeInput}
            onChange={setNativeInput}
            balance={nativeBalance.data?.value}
            balanceLoading={nativeBalance.isLoading}
            testId="gov-liquidity-native-input"
            disabled={disabled}
            onMax={() => {
              const value = nativeBalance.data?.value;
              if (value === undefined) return;
              const usable = value > NATIVE_FEE_RESERVE_WEI ? value - NATIVE_FEE_RESERVE_WEI : 0n;
              setNativeInput(rawInputValue(usable, NETWORK.nativeCurrency.decimals));
            }}
          />
        ) : (
          <StakeAmountField
            label={copy.gov.liquidity.parentLabel(parent.symbol)}
            symbol={parent.symbol}
            decimals={parent.decimals}
            value={parentInput}
            onChange={setParentInput}
            balance={balances.parentBalance}
            balanceLoading={balances.status === 'loading'}
            testId="gov-liquidity-parent-input"
            disabled={disabled}
            onMax={() => {
              if (balances.parentBalance !== undefined) {
                setParentInput(rawInputValue(balances.parentBalance, parent.decimals ?? 18));
              }
            }}
          />
        )}

        {hasExistingPosition ? (
          <p className="text-xs leading-5 text-muted" data-testid="gov-liquidity-phases-note">
            {copy.gov.smart.phasesLocked(formatTokenAmount(currentPhases, 0))}
          </p>
        ) : (
          <div data-testid="gov-liquidity-phases">
            <span className="text-sm font-medium text-foreground">
              {copy.gov.liquidity.phasesLabel}
            </span>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {PHASE_PRESETS.map((preset) => {
                const value = BigInt(preset);
                const available =
                  params.minPhases !== undefined &&
                  params.maxPhases !== undefined &&
                  value >= params.minPhases &&
                  value <= params.maxPhases;
                const selected = phasesParsed.kind === 'ok' && phasesParsed.value === value;
                return (
                  <button
                    key={preset}
                    type="button"
                    disabled={!available || disabled}
                    onClick={() => setPhasesInput(String(preset))}
                    data-testid={`gov-liquidity-phases-preset-${preset}`}
                    className={
                      selected
                        ? 'rounded-xl bg-brand px-3 py-1.5 text-sm font-medium text-on-brand'
                        : 'rounded-xl border border-line bg-surface px-3 py-1.5 text-sm text-foreground hover:bg-elevated disabled:text-muted'
                    }
                  >
                    {copy.gov.liquidity.phasesPreset(preset)}
                  </button>
                );
              })}
              <input
                type="text"
                inputMode="numeric"
                value={phasesInput}
                placeholder={defaultPhases === undefined ? '' : String(defaultPhases)}
                onChange={(event) => setPhasesInput(event.target.value)}
                aria-label={copy.gov.liquidity.phasesLabel}
                data-testid="gov-liquidity-phases-input"
                disabled={disabled}
                className="w-20 rounded-xl border border-line bg-surface px-2 py-1.5 text-right text-sm text-foreground focus:border-brand focus:outline-none"
              />
              <span className="text-xs text-muted">{copy.gov.liquidity.phasesUnit}</span>
            </div>
            <p className="mt-1.5 text-xs leading-5 text-muted">{copy.gov.liquidity.phasesHint}</p>
            {params.minPhases !== undefined && params.maxPhases !== undefined ? (
              <p className="text-xs leading-5 text-muted">
                {copy.gov.liquidity.phasesRange(
                  formatTokenAmount(params.minPhases, 0),
                  formatTokenAmount(params.maxPhases, 0),
                )}
              </p>
            ) : null}
          </div>
        )}

        {/* 报价 / 预览 */}
        {hubPath ? (
          <div className="space-y-1" data-testid="gov-liquidity-hub-quote">
            {quote.isError ? (
              <p className="text-xs leading-5 text-danger-strong">{copy.gov.smart.quoteFailed}</p>
            ) : hubQuote !== undefined ? (
              <>
                <p className="text-xs leading-5 text-muted">
                  {hubQuote.willSwap
                    ? (() => {
                        // 兑换方向由 swapTokenIn/swapTokenOut 决定：只填原生币时是
                        // 「原生币 → 社区代币」，不能按「社区代币 → 原生币」写死。
                        const tokenIn =
                          hubQuote.swapTokenIn.toLowerCase() === token.address.toLowerCase();
                        const inSymbol = tokenIn ? token.symbol : NETWORK.nativeCurrency.symbol;
                        const outSymbol = tokenIn ? NETWORK.nativeCurrency.symbol : token.symbol;
                        const inDecimals = tokenIn
                          ? token.decimals
                          : NETWORK.nativeCurrency.decimals;
                        const outDecimals = tokenIn
                          ? NETWORK.nativeCurrency.decimals
                          : token.decimals;
                        return copy.gov.smart.swapNote(
                          formatTokenAmount(hubQuote.amountToSwap, inDecimals),
                          inSymbol,
                          formatTokenAmount(hubQuote.amountOutFromSwap, outDecimals),
                          outSymbol,
                        );
                      })()
                    : copy.gov.smart.noSwapNote}
                </p>
                <p className="text-xs leading-5 text-muted">
                  {copy.gov.smart.preparedNote(
                    formatTokenAmount(hubQuote.preparedTokenAmount, token.decimals),
                    token.symbol,
                    formatTokenAmount(hubQuote.preparedParentTokenAmount, parent.decimals),
                    parent.symbol,
                  )}
                </p>
              </>
            ) : quote.isLoading ? (
              <p className="text-xs leading-5 text-muted">{copy.common.loading}</p>
            ) : null}
          </div>
        ) : preview.status === 'ready' &&
          preview.optimalTokenAmount !== undefined &&
          preview.optimalParentAmount !== undefined ? (
          <p data-testid="gov-liquidity-optimal" className="text-xs leading-5 text-muted">
            {copy.gov.liquidity.optimalHint(
              formatTokenAmount(preview.optimalTokenAmount, token.decimals),
              token.symbol,
              formatTokenAmount(preview.optimalParentAmount, parent.decimals),
              parent.symbol,
            )}
          </p>
        ) : null}

        <div className="rounded-2xl border border-line bg-elevated/60 px-3 py-2">
          <span className="text-xs text-muted">{copy.gov.liquidity.votesLabel}</span>
          <p
            data-testid="gov-liquidity-preview-votes"
            className="text-2xl font-semibold text-foreground"
          >
            {votesPreview === undefined
              ? UNKNOWN
              : copy.gov.liquidity.votesValue(formatTokenAmount(votesPreview, VOTE_DECIMALS))}
          </p>
          <span className="text-[11px] leading-4 text-muted">{copy.gov.liquidity.votesNote}</span>
        </div>

        {hubPath ? (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {copy.gov.smart.slippageLabel}
              </span>
              {SLIPPAGE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setSlippagePercent(preset)}
                  data-testid={`gov-liquidity-slippage-${preset}`}
                  className={
                    slippagePercent === preset
                      ? 'rounded-full bg-brand px-3 py-1 text-xs font-medium text-on-brand'
                      : 'rounded-full border border-line bg-surface px-3 py-1 text-xs text-foreground hover:bg-elevated'
                  }
                >
                  {`${formatPercent(preset)}%`}
                </button>
              ))}
            </div>
            {minShares !== undefined ? (
              <p
                className="mt-1 text-xs leading-5 text-muted"
                data-testid="gov-liquidity-min-shares"
              >
                {copy.gov.smart.minSharesNote(formatTokenAmount(minShares, VOTE_DECIMALS))}
              </p>
            ) : null}
          </div>
        ) : null}

        {validationMessage !== undefined ? (
          <p data-testid="gov-liquidity-error" className="text-sm leading-6 text-danger-strong">
            {validationMessage}
          </p>
        ) : null}

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted">
            {hubPath ? copy.gov.liquidity.approveTitle : copy.gov.liquidity.approveTitle}
          </p>
          <StakeApproveRow
            symbol={token.symbol}
            allowance={allowances.allowances[0]}
            required={requiredTokenAmount}
            stage={tx.approveStage}
            unlimitedPreferred={approvalPreference.enabled}
            testId="gov-liquidity-approve-token"
            disabled={disabled || tx.stage !== 'idle'}
            onApprove={() => {
              if (requiredTokenAmount === undefined || approveSpender === undefined) return;
              void tx.approve({
                tokenAddress: token.address,
                abi: love20TokenAbi,
                spender: approveSpender,
                amount: decideApproveAmount(approvalPreference.enabled, requiredTokenAmount),
              });
            }}
          />
          {hubPath ? null : (
            <StakeApproveRow
              symbol={parent.symbol}
              allowance={allowances.allowances[1]}
              required={requiredParentAmount}
              stage={tx.approveStage}
              unlimitedPreferred={approvalPreference.enabled}
              testId="gov-liquidity-approve-parent"
              disabled={disabled || tx.stage !== 'idle'}
              onApprove={() => {
                if (requiredParentAmount === undefined) return;
                void tx.approve({
                  tokenAddress: parent.address,
                  abi: love20TokenAbi,
                  spender: stakeAddress,
                  amount: decideApproveAmount(approvalPreference.enabled, requiredParentAmount),
                });
              }}
            />
          )}
        </div>

        <Button
          variant="primary"
          size="lg"
          className="w-full"
          onClick={handleSubmit}
          disabled={!readyToSubmit}
          loading={tx.stage !== 'idle'}
          data-testid="gov-liquidity-submit"
        >
          {tx.stage === 'idle' ? copy.gov.liquidity.submit : copy.gov.liquidity.submitting}
        </Button>
        {smartAvailable && !hubPath ? (
          <button
            type="button"
            className={buttonStyles('ghost', 'sm', 'w-full')}
            onClick={() => setSmartMode(true)}
          >
            {copy.gov.smart.label}
          </button>
        ) : null}
      </div>
    </Card>
  );
}
