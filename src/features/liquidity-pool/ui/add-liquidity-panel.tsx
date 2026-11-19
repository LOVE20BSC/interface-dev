import { useEffect, useRef, useState } from 'react';
import { ArrowUpDown, ChevronDown, Zap } from 'lucide-react';
import { useAccount } from 'wagmi';
import { love20HubAbi, uniswapV2Router02Abi } from '@/config/abis';
import { configuredAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { cn } from '@/shared/lib/cn';
import { formatTokenAmount, formatUnits } from '@/shared/lib/format';
import { formatSharePercent } from '@/shared/lib/share-percent';

import { formatRate } from '@/shared/lib/format-rates';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { ActionStack } from '@/shared/ui/action-stack';
import { approvalKind } from '@/shared/lib/approval-kind';
import { decideApproveAmount } from '@/shared/lib/approve-amount';
import { TxWatchCard } from '@/shared/ui/tx-watch-card';
import { useUnlimitedApprovalPreference } from '@/shared/model/use-unlimited-approval-preference';
import {
  applySlippageDown,
  hubReservesAfterAdd,
  mirrorAmount,
  planDualAdd,
  priceChangePercent,
} from '@/features/liquidity-pool/lib/liquidity-math';
import {
  addSideIssue,
  approvalNeed,
  deadlineFromNow,
  NATIVE_GAS_RESERVE_WEI,
  parseAmount,
  percentToBps,
  poolNoticeKind,
} from '@/features/liquidity-pool/lib/liquidity-form';
import { useHubQuote } from '@/features/liquidity-pool/model/use-hub-quote';
import {
  useNativeBalance,
  useTokenAllowance,
  useTokenBalance,
} from '@/features/liquidity-pool/model/use-liquidity-reads';
import { useLiquidityTransaction } from '@/features/liquidity-pool/model/use-liquidity-transaction';
import type { PoolStateResult } from '@/features/liquidity-pool/model/use-pool-state';
import type { LiquidityToken } from '@/features/liquidity-pool/lib/liquidity-types';
import { LiquidityReceiptSheet } from '@/features/liquidity-pool/ui/liquidity-receipt';
import { LiquiditySettings } from '@/features/liquidity-pool/ui/liquidity-settings';

export interface AddLiquidityPanelProps {
  readonly token: LiquidityToken;
  readonly wrapped: LiquidityToken | undefined;
  readonly native: LiquidityToken;
  readonly pool: PoolStateResult;
  readonly slippagePercent: number;
  readonly customSlippage: string;
  readonly customSlippageError: string | undefined;
  readonly onSelectSlippagePreset: (percent: number) => void;
  readonly onCustomSlippageChange: (value: string) => void;
  /** 加池抬头里的「撤出」：本站不新开路由，切到「我的流动性」页签。 */
  readonly onGoWithdraw: () => void;
  readonly isConnected: boolean;
}

/**
 * 添加流动性的两种交互（owner 2026-11-14）：
 *
 * - **智能模式开（默认）**：两侧都可自由填写，只填一侧也行；Hub 报价把这一笔自动
 *   配平（先用一部分换成另一侧再一起进池），页面只显示「预计获得 X 流动性凭证」，
 *   swap 段 / 实进池 / 至少获得的流动性凭证收在默认折叠的「详情」里。
 * - **智能模式关**：用户在哪一侧输入，另一侧就按池子比例自动填好并变成只读，用户
 *   不用自己算比例；这一笔由 Router `addLiquidityETH` 按比例进场。
 *   池子还没有储备（首次建池）时没有比例可依，两侧都必须填、决定初始价格。
 *
 * Hub 缺失或空池时智能模式不可用，自动降级到 Router 两侧都填，并在页面上写清原因。
 */

const CARD = 'rounded-3xl border border-line bg-surface p-5 shadow-soft';
/** 右侧留出代币徽标的位置（旧库把代币符号放在输入框右端）。 */
const INPUT =
  'mt-1.5 h-12 w-full rounded-2xl border border-line bg-elevated pl-3 pr-24 text-xl font-semibold text-foreground outline-none placeholder:text-muted focus:border-brand-strong/40 focus:ring-2 focus:ring-brand-strong/20';
const INPUT_LINKED =
  'cursor-default border-dashed bg-elevated/60 text-muted focus:border-line focus:ring-0';
const BADGE =
  'pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-foreground';
const QUICK_BUTTON =
  'rounded-full border border-line px-2.5 py-0.5 text-[11px] font-medium text-foreground hover:bg-elevated disabled:opacity-50';
/** 旧库两个输入框的快捷比例（另有「最高」= 100%）。 */
const QUICK_PERCENTS = [25, 50] as const;

type Side = 'token' | 'native';

export function AddLiquidityPanel(props: AddLiquidityPanelProps) {
  const {
    token,
    wrapped,
    native,
    pool,
    slippagePercent,
    customSlippage,
    customSlippageError,
    onSelectSlippagePreset,
    onCustomSlippageChange,
    onGoWithdraw,
    isConnected,
  } = props;
  const { address: account } = useAccount();
  // 默认使用长期授权 (owner 2026-11-16): same device preference as /approvals;
  // off → exact required amount (unchanged), on → maxUint256 + 长期授权 copy.
  const { enabled: useUnlimitedApproval } = useUnlimitedApprovalPreference();
  const hub = configuredAddress('hub');
  const router = configuredAddress('router');

  const [smartMode, setSmartMode] = useState(true);
  const [tokenInput, setTokenInput] = useState('');
  const [nativeInput, setNativeInput] = useState('');
  /** 智能模式关时被自动填出来的一侧（只读）。 */
  const [linkedSide, setLinkedSide] = useState<Side | null>(null);
  /** 只有用户点过「全部」原生币，才提「已为网络手续费预留」。 */
  const [nativeMaxPicked, setNativeMaxPicked] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  /** 旧库 `Liquidity.tsx` 的「当前池价格」方向：默认 1 社区代币 = X 原生币。 */
  const [showTokenToBase, setShowTokenToBase] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const tokenBalance = useTokenBalance(token, account);
  const nativeBalance = useNativeBalance(account);
  const tokenAllowanceHub = useTokenAllowance(token.address, account, hub);
  const tokenAllowanceRouter = useTokenAllowance(token.address, account, router);

  /**
   * The Hub quote is fetched after this closure is created (it needs the parsed
   * inputs), so the re-read goes through a ref.
   */
  const quoteRefetchRef = useRef<() => void>(() => {});
  const refetchAll = () => {
    pool.refetch();
    tokenBalance.refetch();
    nativeBalance.refetch();
    tokenAllowanceHub.refetch();
    tokenAllowanceRouter.refetch();
    /**
     * QA: a mined add moves the pool ratio, so the Hub quote — and the
     * `expectedLiquidity`/`usable*` numbers the next submit derives from it — must be
     * re-read. Without this the second consecutive add sent the previous quote's
     * `minLiquidity` and the Hub reverted `InsufficientLiquidity`.
     */
    quoteRefetchRef.current();
  };
  const tx = useLiquidityTransaction(refetchAll);
  const refetchRef = useRef(refetchAll);
  useEffect(() => {
    refetchRef.current = refetchAll;
  });

  const reserves = pool.reserves;
  const reserveToken = reserves?.reserveToken ?? 0n;
  const reserveNative = reserves?.reserveNative ?? 0n;
  const totalSupply = pool.snapshot?.totalSupply ?? 0n;
  /** 有储备才有比例可依：空池 / 首币建池前不联动。 */
  const ratioAvailable = reserveToken > 0n && reserveNative > 0n;

  const hubReady = hub !== undefined && pool.hasLiquidity;
  /** 走 Hub 的唯一条件：智能模式开 + Hub 可用；否则走 Router 按比例。 */
  const hubPath = smartMode && hubReady;
  /**
   * 智能模式提示（QA D3）：池子还在读的时候只说「正在读取池子…」，绝不断言
   * 「这个代币还没有池子」——慢 RPC 下那句会把人骗去第一次建池。
   */
  const poolNotice = poolNoticeKind({
    smartMode,
    hubConfigured: hub !== undefined,
    hasLiquidity: pool.hasLiquidity,
    isLoading: pool.isLoading,
    isError: pool.isError,
  });
  const fallbackText = (() => {
    switch (poolNotice) {
      case 'hub-missing':
        return `${copy.liquidity.add.fallbackTitle}${copy.liquidity.add.hubMissing}`;
      case 'loading':
        return copy.liquidity.add.poolReading;
      case 'read-failed':
        return `${copy.liquidity.add.fallbackTitle}${copy.liquidity.states.readFailed}`;
      case 'empty':
        return `${copy.liquidity.add.fallbackTitle}${copy.liquidity.add.fallbackEmptyPool}`;
      case 'none':
        return undefined;
    }
  })();

  const parsedToken = parseAmount(tokenInput, token.decimals);
  const parsedNative = parseAmount(nativeInput, native.decimals);
  const tokenAmount = parsedToken.kind === 'ok' ? parsedToken.value : 0n;
  const nativeAmount = parsedNative.kind === 'ok' ? parsedNative.value : 0n;

  const quote = useHubQuote({
    hub,
    tokenAddress: token.address,
    amountTokenDesired: hubPath ? tokenAmount : 0n,
    amountNativeDesired: hubPath ? nativeAmount : 0n,
    enabled: hubPath && token.address !== undefined && (tokenAmount > 0n || nativeAmount > 0n),
  });

  useEffect(() => {
    quoteRefetchRef.current = quote.refetch;
  });

  const plan = planDualAdd(reserveToken, reserveNative, totalSupply, tokenAmount, nativeAmount);

  const bps = percentToBps(slippagePercent);
  const usableToken = hubPath && quote.data !== undefined ? quote.data.usableAmountA : plan.amountA;
  const usableNative =
    hubPath && quote.data !== undefined ? quote.data.usableAmountB : plan.amountB;
  const expectedLiquidity =
    hubPath && quote.data !== undefined ? quote.data.expectedLiquidity : plan.liquidity;
  /**
   * 两条路径的最少额口径不同（协议 2026-11-15 升级后）：
   * - Hub：`addLiquidity*` 只收 `minLiquidity`（最少获得的流动性凭证），按
   *   `expectedLiquidity × (1 − 滑点)` 向下取整；两侧的最少进池数量不再上链。
   * - Router：`addLiquidityETH` 仍按两侧的数量最小值保护，用 `usable × (1 − 滑点)`。
   */
  const minToken = applySlippageDown(usableToken, bps);
  const minNative = applySlippageDown(usableNative, bps);
  const minLiquidity = applySlippageDown(expectedLiquidity, bps);

  const firstMint = !hubPath && plan.firstMint;
  const firstMintPrice =
    firstMint && tokenAmount > 0n && nativeAmount > 0n
      ? formatRate(tokenAmount, nativeAmount, native.decimals, token.decimals)
      : undefined;

  const nativeAvailable =
    nativeBalance.value === undefined
      ? undefined
      : nativeBalance.value > NATIVE_GAS_RESERVE_WEI
        ? nativeBalance.value - NATIVE_GAS_RESERVE_WEI
        : 0n;

  /** Hub 报价 / Router 计划是否已经算出一个可提交的数量（QA D7 用它区分「还在算」与「太小」）。 */
  const quoteReady = hubPath
    ? quote.data !== undefined && quote.data.expectedLiquidity > 0n
    : plan.liquidity > 0n && plan.amountA > 0n && plan.amountB > 0n;
  const quotePending = hubPath && (quote.isLoading || quote.isError);
  const hasInput = tokenAmount > 0n || nativeAmount > 0n;

  const sideIssue = addSideIssue({
    tokenRaw: tokenInput,
    nativeRaw: nativeInput,
    tokenAmount,
    nativeAmount,
    routerPath: !hubPath,
  });

  const amountError = (() => {
    if (parsedToken.kind === 'invalid' || parsedNative.kind === 'invalid') {
      return copy.liquidity.add.amountInvalid;
    }
    if (parsedToken.kind === 'too-precise') {
      return copy.liquidity.add.amountTooPrecise(parsedToken.digits);
    }
    if (parsedNative.kind === 'too-precise') {
      return copy.liquidity.add.amountTooPrecise(parsedNative.digits);
    }
    // QA D6/D7：分清「两侧都没填」「显式填了 0」「只填了一侧（缺另一侧）」。
    if (sideIssue === 'zero') return copy.liquidity.add.amountZero;
    if (sideIssue === 'missing-other-side') return copy.liquidity.add.missingOtherSide;
    if (tokenBalance.value !== undefined && tokenBalance.value < tokenAmount) {
      return copy.liquidity.add.insufficient(
        token.symbol,
        formatTokenAmount(tokenAmount - tokenBalance.value, token.decimals),
      );
    }
    if (nativeAvailable !== undefined && nativeAvailable < nativeAmount) {
      return copy.liquidity.add.insufficient(
        native.symbol,
        formatTokenAmount(nativeAmount - nativeAvailable, native.decimals),
      );
    }
    // QA D7：有输入、也读完了，却算不出可用的份额（例如 1 wei）→ 给原因，不静默禁用。
    if (hasInput && !quoteReady && !quotePending) {
      return copy.liquidity.errors.amountTooSmall;
    }
    return null;
  })();

  const requiredTokenAmount = hubPath ? tokenAmount : plan.amountA;
  const spender = hubPath ? hub : router;
  const allowance = hubPath ? tokenAllowanceHub : tokenAllowanceRouter;
  // QA D8：这一笔不需要代币授权（原生币单边 / 数量为 0）时，不能显示成「已授权」。
  const approval = approvalNeed(requiredTokenAmount, allowance.value);
  const needsApproval = approval === 'required';

  // QA D1（P1）：授权每确认一次就无条件重读额度/余额。不能只监听「同一个 token+spender
  // 的 key 变化」——第二次授权后 key 不变，主按钮会永久停在禁用。
  const approveRevisionRef = useRef(0);
  useEffect(() => {
    if (tx.approveRevision === approveRevisionRef.current) return;
    approveRevisionRef.current = tx.approveRevision;
    refetchRef.current();
  }, [tx.approveRevision]);

  const canSubmit =
    isConnected &&
    !pool.isLoading &&
    hasInput &&
    amountError === null &&
    customSlippageError === undefined &&
    quoteReady &&
    (hubPath ? nativeAmount === 0n || nativeBalance.value !== undefined : true) &&
    !pool.isError &&
    tx.stage === 'idle' &&
    tx.approveStage === 'idle' &&
    tx.receipt === null;

  /** 智能模式关：改一侧就把另一侧按池子比例填好，并把它变成只读。 */
  const mirrorOtherSide = (side: Side, raw: string) => {
    if (smartMode || !ratioAvailable) {
      setLinkedSide(null);
      return;
    }
    if (side === 'token') {
      const parsed = parseAmount(raw, token.decimals);
      if (parsed.kind === 'empty') {
        setNativeInput('');
        setLinkedSide(null);
        return;
      }
      if (parsed.kind !== 'ok') {
        setLinkedSide(null);
        return;
      }
      setNativeInput(
        formatUnits(mirrorAmount(parsed.value, reserveToken, reserveNative), native.decimals),
      );
      setLinkedSide('native');
      return;
    }
    const parsed = parseAmount(raw, native.decimals);
    if (parsed.kind === 'empty') {
      setTokenInput('');
      setLinkedSide(null);
      return;
    }
    if (parsed.kind !== 'ok') {
      setLinkedSide(null);
      return;
    }
    setTokenInput(
      formatUnits(mirrorAmount(parsed.value, reserveNative, reserveToken), token.decimals),
    );
    setLinkedSide('token');
  };

  /**
   * 只读联动的「切换输入侧」：点一下被自动填好的那一侧，就改成由它来驱动另一侧。
   * 否则用户第一下点在哪一侧，另一侧就永远只能看不能改（只剩「全部」按钮）。
   */
  const switchDriverTo = (side: Side) => {
    if (smartMode || !ratioAvailable) return;
    if (side === 'token' && linkedSide === 'token') setLinkedSide('native');
    if (side === 'native' && linkedSide === 'native') setLinkedSide('token');
  };

  const handleTokenChange = (value: string) => {
    setTokenInput(value);
    setSubmitError(null);
    tx.clearError();
    mirrorOtherSide('token', value);
  };

  const handleNativeChange = (value: string) => {
    setNativeInput(value);
    setNativeMaxPicked(false);
    setSubmitError(null);
    tx.clearError();
    mirrorOtherSide('native', value);
  };

  const setTokenMax = () => {
    if (tokenBalance.value === undefined) return;
    const value = formatUnits(tokenBalance.value, token.decimals);
    setTokenInput(value);
    setSubmitError(null);
    tx.clearError();
    mirrorOtherSide('token', value);
  };

  const setNativeMax = () => {
    if (nativeAvailable === undefined) return;
    const value = formatUnits(nativeAvailable, native.decimals);
    setNativeInput(value);
    setNativeMaxPicked(true);
    setSubmitError(null);
    tx.clearError();
    mirrorOtherSide('native', value);
  };

  /** 旧库同类快捷按钮：25% / 50% 按余额（原生币按「余额 − 手续费预留」）填，仍可手改。 */
  const setTokenPercent = (percent: number) => {
    if (tokenBalance.value === undefined) return;
    const value = formatUnits((tokenBalance.value * BigInt(percent)) / 100n, token.decimals);
    setTokenInput(value);
    setSubmitError(null);
    tx.clearError();
    mirrorOtherSide('token', value);
  };

  const setNativePercent = (percent: number) => {
    if (nativeAvailable === undefined) return;
    const value = formatUnits((nativeAvailable * BigInt(percent)) / 100n, native.decimals);
    setNativeInput(value);
    setNativeMaxPicked(false);
    setSubmitError(null);
    tx.clearError();
    mirrorOtherSide('native', value);
  };

  const toggleSmartMode = () => {
    setSmartMode((current) => !current);
    setLinkedSide(null);
    setSubmitError(null);
    tx.clearError();
  };

  const handleApprove = async () => {
    if (token.address === undefined || spender === undefined) return;
    setSubmitError(null);
    await tx.approve({
      tokenAddress: token.address,
      kind: 'erc20',
      spender,
      amount: decideApproveAmount(useUnlimitedApproval, requiredTokenAmount),
    });
  };

  const handleSubmit = async () => {
    if (account === undefined) return;
    setSubmitError(null);
    const deadline = deadlineFromNow();

    if (hubPath && hub !== undefined) {
      if (nativeAmount > 0n) {
        await tx.run(
          {
            address: hub,
            abi: love20HubAbi,
            functionName: 'addLiquidityWithNative',
            args: [
              {
                tokenAddress: token.address,
                amountTokenDesired: tokenAmount,
                minLiquidity,
                to: account,
                deadline,
              },
            ],
            value: nativeAmount,
          },
          {
            title: copy.liquidity.add.receiptTitle,
            detail: copy.liquidity.add.receiptRefreshHint,
          },
        );
        return;
      }
      if (token.address !== undefined && wrapped?.address !== undefined) {
        await tx.run(
          {
            address: hub,
            abi: love20HubAbi,
            functionName: 'addLiquidityWithToken',
            args: [
              {
                tokenA: token.address,
                tokenB: wrapped.address,
                amountADesired: tokenAmount,
                amountBDesired: nativeAmount,
                minLiquidity,
                to: account,
                deadline,
              },
            ],
          },
          {
            title: copy.liquidity.add.receiptTitle,
            detail: copy.liquidity.add.receiptRefreshHint,
          },
        );
      }
      return;
    }

    if (router !== undefined && token.address !== undefined) {
      await tx.run(
        {
          address: router,
          abi: uniswapV2Router02Abi,
          functionName: 'addLiquidityETH',
          args: [token.address, plan.amountA, minToken, minNative, account, deadline],
          value: plan.amountB,
        },
        {
          title: copy.liquidity.add.receiptTitle,
          detail: copy.liquidity.add.receiptRefreshHint,
        },
      );
    }
  };

  const errorMessage = submitError ?? tx.error?.message ?? null;
  const tokenLinked = !smartMode && ratioAvailable && linkedSide === 'token';
  const nativeLinked = !smartMode && ratioAvailable && linkedSide === 'native';

  /** 加池抬头：底池总 LP / 我的 LP（占比）。 */
  const lpShare = formatSharePercent(pool.snapshot?.lpBalance ?? 0n, totalSupply);

  /** 旧库「当前池价格」：默认 1 社区代币 = X 原生币，箭头切换方向。 */
  const stableRateOptions = { maxFractionDigits: 6 } as const;
  const nativePerTokenRate = ratioAvailable
    ? formatRate(reserveNative, reserveToken, token.decimals, native.decimals, stableRateOptions)
    : undefined;
  const tokenPerNativeRate = ratioAvailable
    ? formatRate(reserveToken, reserveNative, native.decimals, token.decimals, stableRateOptions)
    : undefined;
  const currentPriceText = !ratioAvailable
    ? undefined
    : showTokenToBase
      ? `1 ${token.symbol} = ${nativePerTokenRate} ${native.symbol}`
      : `1 ${native.symbol} = ${tokenPerNativeRate} ${token.symbol}`;

  /**
   * 旧库「添加后价格」：只有 Hub 会先把一侧换掉时才有意义（Router 两侧按比例进池
   * 不改变价格）。储备由 `hubReservesAfterAdd` 按 quote 的 swap 段 + usable 进池量算。
   */
  const afterReserves = (() => {
    const data = quote.data;
    if (!ratioAvailable || !hubPath || data === undefined || !data.willSwap) return undefined;
    return hubReservesAfterAdd({
      reserveToken,
      reserveNative,
      swapTokenInIsToken: data.swapTokenIn.toLowerCase() === token.address?.toLowerCase(),
      amountToSwap: data.amountToSwap,
      amountOutFromSwap: data.amountOutFromSwap,
      usableToken: data.usableAmountA,
      usableNative: data.usableAmountB,
    });
  })();
  const afterPriceText =
    afterReserves === undefined
      ? undefined
      : showTokenToBase
        ? `1 ${token.symbol} = ${formatRate(afterReserves.reserveNative, afterReserves.reserveToken, token.decimals, native.decimals, stableRateOptions)} ${native.symbol}`
        : `1 ${native.symbol} = ${formatRate(afterReserves.reserveToken, afterReserves.reserveNative, native.decimals, token.decimals, stableRateOptions)} ${token.symbol}`;
  const priceChange =
    afterReserves === undefined
      ? undefined
      : showTokenToBase
        ? priceChangePercent(
            { quote: reserveNative, base: reserveToken },
            { quote: afterReserves.reserveNative, base: afterReserves.reserveToken },
          )
        : priceChangePercent(
            { quote: reserveToken, base: reserveNative },
            { quote: afterReserves.reserveToken, base: afterReserves.reserveNative },
          );

  const swapLeg = (() => {
    if (quote.data === undefined || !quote.data.willSwap) return undefined;
    const tokenIsIn = quote.data.swapTokenIn.toLowerCase() === token.address?.toLowerCase();
    return copy.liquidity.add.quoteSwap(
      formatTokenAmount(quote.data.amountToSwap, tokenIsIn ? token.decimals : native.decimals),
      tokenIsIn ? token.symbol : native.symbol,
      formatTokenAmount(quote.data.amountOutFromSwap, tokenIsIn ? native.decimals : token.decimals),
      tokenIsIn ? native.symbol : token.symbol,
    );
  })();

  return (
    <div className="space-y-4">
      {/* 旧库 LOVE20TKM `Liquidity.tsx` 的加池抬头：底池总LP / 我的LP（占比）/ 撤出。 */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 text-xs leading-5"
        data-testid="liquidity-pool-header"
      >
        <p className="text-muted">
          {copy.liquidity.add.poolTotalLp}{' '}
          <span className="font-medium text-foreground" data-testid="liquidity-pool-total-supply">
            {formatTokenAmount(pool.snapshot?.totalSupply, 18)}
          </span>
        </p>
        <div className="flex items-center gap-2">
          <p className="text-muted">
            {copy.liquidity.add.poolMyLp}{' '}
            <span className="font-medium text-foreground" data-testid="liquidity-pool-my-lp">
              {formatTokenAmount(pool.snapshot?.lpBalance, 18)}
            </span>
            {(pool.snapshot?.lpBalance ?? 0n) > 0n && lpShare !== undefined ? (
              <span className="text-muted">（{lpShare}%）</span>
            ) : null}
          </p>
          {(pool.snapshot?.lpBalance ?? 0n) > 0n ? (
            <button
              type="button"
              data-testid="liquidity-go-withdraw"
              onClick={onGoWithdraw}
              className="rounded-full border border-line px-2.5 py-0.5 text-[11px] font-medium text-brand-strong hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong"
            >
              {copy.liquidity.add.poolWithdraw}
            </button>
          ) : null}
        </div>
      </div>

      <div className={CARD}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {copy.liquidity.add.smartModeLabel}
            </p>
            <p className="mt-0.5 text-[11px] leading-4 text-muted">
              {smartMode
                ? copy.liquidity.add.smartOnHint
                : ratioAvailable
                  ? copy.liquidity.add.smartOffHint
                  : copy.liquidity.add.smartOffEmptyHint}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={smartMode}
            aria-label={copy.liquidity.add.smartModeLabel}
            data-testid="liquidity-smart-mode"
            onClick={toggleSmartMode}
            className={cn(
              'relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong',
              smartMode ? 'border-brand-strong bg-brand' : 'border-line bg-elevated',
            )}
          >
            {/* 修复：button 的内容默认居中，绝对定位的滑块没有左锚点会跑到胶囊中间/外面。
                与 `shared/ui/asset-protection-switch.tsx` 统一用 left-0.5 + translate-x；
                行程按盒模型算：44 − 2(border) − 4(两侧 gap) − 20(滑块) = 18px。 */}
            <span
              className={cn(
                'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-surface shadow-soft transition-transform',
                smartMode ? 'translate-x-[18px]' : 'translate-x-0',
              )}
              aria-hidden="true"
            />
          </button>
        </div>

        {fallbackText !== undefined || (hubPath && quote.isError) ? (
          <p
            className="mt-2 rounded-xl border border-warning/20 bg-warning-soft/50 p-2 text-[11px] leading-4 text-warning"
            data-testid="liquidity-fallback-note"
          >
            {fallbackText ?? copy.liquidity.add.quoteFailed}
          </p>
        ) : null}

        <div className="mt-4 space-y-3">
          <div>
            <div className="relative">
              <input
                id="liquidity-token-amount"
                data-testid="liquidity-token-amount"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                spellCheck={false}
                aria-label={copy.liquidity.add.amountTokenLabel}
                value={tokenInput}
                readOnly={tokenLinked}
                aria-readonly={tokenLinked}
                onFocus={() => switchDriverTo('token')}
                onChange={(event) => handleTokenChange(event.target.value)}
                placeholder={copy.liquidity.add.amountPlaceholder}
                className={cn(INPUT, tokenLinked && INPUT_LINKED)}
              />
              <span className={BADGE} data-testid="liquidity-token-badge">
                {token.symbol}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                {QUICK_PERCENTS.map((percent) => (
                  <button
                    key={percent}
                    type="button"
                    data-testid={`liquidity-token-percent-${percent}`}
                    onClick={() => setTokenPercent(percent)}
                    disabled={tokenBalance.value === undefined || tokenBalance.value === 0n}
                    className={QUICK_BUTTON}
                  >
                    {percent}%
                  </button>
                ))}
                <button
                  type="button"
                  onClick={setTokenMax}
                  data-testid="liquidity-token-max"
                  disabled={tokenBalance.value === undefined || tokenBalance.value === 0n}
                  className={QUICK_BUTTON}
                >
                  {copy.liquidity.add.max}
                </button>
              </div>
              <span
                className="text-[11px] leading-4 text-muted"
                data-testid="liquidity-balance-token"
              >
                {tokenBalance.isLoading
                  ? copy.liquidity.balanceLoading
                  : `${copy.liquidity.balanceLabel(token.symbol)} ${formatTokenAmount(tokenBalance.value, token.decimals)}`}
              </span>
            </div>
          </div>

          <div>
            <div className="relative">
              <input
                id="liquidity-native-amount"
                data-testid="liquidity-native-amount"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                spellCheck={false}
                aria-label={copy.liquidity.add.amountNativeLabel(native.symbol)}
                value={nativeInput}
                readOnly={nativeLinked}
                aria-readonly={nativeLinked}
                onFocus={() => switchDriverTo('native')}
                onChange={(event) => handleNativeChange(event.target.value)}
                placeholder={copy.liquidity.add.amountPlaceholder}
                className={cn(INPUT, nativeLinked && INPUT_LINKED)}
              />
              <span className={BADGE} data-testid="liquidity-native-badge">
                {native.symbol}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                {QUICK_PERCENTS.map((percent) => (
                  <button
                    key={percent}
                    type="button"
                    data-testid={`liquidity-native-percent-${percent}`}
                    onClick={() => setNativePercent(percent)}
                    disabled={nativeAvailable === undefined || nativeAvailable === 0n}
                    className={QUICK_BUTTON}
                  >
                    {percent}%
                  </button>
                ))}
                <button
                  type="button"
                  onClick={setNativeMax}
                  data-testid="liquidity-native-max"
                  disabled={nativeAvailable === undefined || nativeAvailable === 0n}
                  className={QUICK_BUTTON}
                >
                  {copy.liquidity.add.max}
                </button>
              </div>
              <span
                className="text-[11px] leading-4 text-muted"
                data-testid="liquidity-balance-native"
              >
                {nativeBalance.isLoading
                  ? copy.liquidity.balanceLoading
                  : `${copy.liquidity.balanceLabel(native.symbol)} ${formatTokenAmount(nativeBalance.value, native.decimals)}`}
              </span>
            </div>
          </div>

          {!smartMode && ratioAvailable ? (
            <p className="text-[11px] leading-4 text-muted">{copy.liquidity.add.linkedNote}</p>
          ) : null}
          {/* owner 2026-11-14：「已为网络手续费预留」只在用户点过「全部」原生币时出现。 */}
          {nativeMaxPicked && nativeAmount > 0n ? (
            <p className="text-[11px] leading-4 text-muted" data-testid="liquidity-native-gas-note">
              {copy.liquidity.add.maxNativeNote(
                formatTokenAmount(NATIVE_GAS_RESERVE_WEI, native.decimals),
                native.symbol,
              )}
            </p>
          ) : null}
          {amountError !== null ? (
            <p
              className="text-xs leading-5 text-danger-strong"
              data-testid="liquidity-amount-error"
            >
              {amountError}
            </p>
          ) : null}
        </div>
      </div>

      {/* 旧库顺序：输入 → 预估获得 LP → 当前池价格 → 滑点 → 按钮。 */}
      {hasInput && (quotePending || quote.isError || quoteReady) ? (
        <div className={CARD} data-testid="liquidity-quote">
          {hubPath && quote.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-3.5 w-full" />
            </div>
          ) : hubPath && quote.isError ? (
            <div>
              <p className="text-sm text-danger-strong">{copy.liquidity.add.quoteErrorTitle}</p>
              <p className="mt-1 text-xs leading-5 text-muted">
                {copy.liquidity.add.quoteErrorBody}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => quote.refetch()}>
                  {copy.liquidity.add.quoteErrorRetry}
                </Button>
                <Button variant="secondary" size="sm" onClick={toggleSmartMode}>
                  {copy.liquidity.add.disableSmartMode}
                </Button>
              </div>
            </div>
          ) : quoteReady ? (
            <>
              <p
                className="flex items-center gap-1.5 text-base font-semibold text-foreground"
                data-testid="liquidity-quote-liquidity"
              >
                <Zap className="h-4 w-4 text-brand-strong" aria-hidden="true" />
                {copy.liquidity.add.quoteLiquidity(formatTokenAmount(expectedLiquidity, 18))}
              </p>
              <button
                type="button"
                data-testid="liquidity-details-toggle"
                aria-expanded={detailsOpen}
                onClick={() => setDetailsOpen((current) => !current)}
                className="mt-2 inline-flex items-center gap-1 rounded-full px-1 py-0.5 text-[11px] font-medium text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong"
              >
                {detailsOpen ? copy.liquidity.add.detailsHide : copy.liquidity.add.detailsToggle}
                <ChevronDown
                  className={cn('h-3.5 w-3.5 transition-transform', detailsOpen && 'rotate-180')}
                  aria-hidden="true"
                />
              </button>
              {detailsOpen ? (
                <div
                  className="mt-2 space-y-1.5 rounded-2xl border border-line bg-elevated p-3 text-xs leading-5"
                  data-testid="liquidity-details"
                >
                  {hubPath ? (
                    swapLeg !== undefined ? (
                      <p className="text-muted" data-testid="liquidity-quote-swap">
                        {swapLeg}
                      </p>
                    ) : (
                      <p className="text-muted">{copy.liquidity.add.quoteNoSwap}</p>
                    )
                  ) : firstMint && firstMintPrice !== undefined ? (
                    <p className="text-muted" data-testid="liquidity-quote-first-mint">
                      {copy.liquidity.add.quoteFirstMint(
                        firstMintPrice,
                        token.symbol,
                        native.symbol,
                      )}
                    </p>
                  ) : null}
                  <p className="text-foreground" data-testid="liquidity-quote-prepared">
                    {copy.liquidity.add.quotePrepared(
                      formatTokenAmount(usableToken, token.decimals),
                      token.symbol,
                      formatTokenAmount(usableNative, native.decimals),
                      native.symbol,
                    )}
                  </p>
                  <p className="text-muted" data-testid="liquidity-quote-min">
                    {hubPath
                      ? copy.liquidity.add.quoteMinLiquidity(formatTokenAmount(minLiquidity, 18))
                      : copy.liquidity.add.quoteMin(
                          formatTokenAmount(minToken, token.decimals),
                          token.symbol,
                          formatTokenAmount(minNative, native.decimals),
                          native.symbol,
                        )}
                  </p>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {currentPriceText !== undefined ? (
        <div className="space-y-1 text-xs leading-5" data-testid="liquidity-price">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted">{copy.liquidity.add.priceCurrent}</span>
            <span className="font-medium text-foreground" data-testid="liquidity-price-current">
              {currentPriceText}
            </span>
            <button
              type="button"
              data-testid="liquidity-price-toggle"
              aria-label={copy.liquidity.add.priceToggle}
              onClick={() => setShowTokenToBase((current) => !current)}
              className="rounded-full p-0.5 text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong"
            >
              <ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          {afterPriceText !== undefined ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted">{copy.liquidity.add.priceAfter}</span>
              <span className="font-medium text-foreground" data-testid="liquidity-price-after">
                {afterPriceText}
              </span>
              {priceChange !== undefined ? (
                <span
                  className={cn(
                    'text-[11px]',
                    priceChange.startsWith('-')
                      ? 'text-danger-strong'
                      : priceChange.startsWith('+')
                        ? 'text-success'
                        : 'text-muted',
                  )}
                  data-testid="liquidity-price-change"
                >
                  （{priceChange}）
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-1.5">
        <LiquiditySettings
          slippagePercent={slippagePercent}
          customSlippage={customSlippage}
          customSlippageError={customSlippageError}
          onSelectPreset={onSelectSlippagePreset}
          onCustomChange={onCustomSlippageChange}
        />
        {/* QA D2：关掉设置弹层后，非法的自定义滑点仍要在页面上可见并挡住提交。 */}
        {customSlippageError !== undefined ? (
          <p
            className="text-xs leading-5 text-danger-strong"
            data-testid="liquidity-slippage-error"
          >
            {customSlippageError}
          </p>
        ) : null}
      </div>

      {errorMessage !== null ? (
        <div
          role="alert"
          data-testid="liquidity-add-error"
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

      {/* Owner 2026-11-14: prerequisite 授权 first, primary action right after.
          The 授权 button stays visible after a long-term approval as a read-only
          「已长期授权」 state instead of disappearing. */}
      <ActionStack>
        <Button
          variant={needsApproval ? 'primary' : 'secondary'}
          size="lg"
          className="w-full"
          data-testid="liquidity-add-approve"
          onClick={() => {
            void handleApprove();
          }}
          disabled={
            !needsApproval ||
            tx.approveStage !== 'idle' ||
            amountError !== null ||
            customSlippageError !== undefined
          }
          loading={tx.approveStage === 'wallet'}
        >
          {needsApproval
            ? useUnlimitedApproval
              ? copy.approve.longTermAction(token.symbol)
              : copy.liquidity.add.approveToken(token.symbol)
            : approval === 'not-needed'
              ? copy.approve.notNeeded
              : allowance.value === undefined
                ? copy.approve.loading
                : approvalKind(allowance.value) === 'unlimited'
                  ? copy.approve.longTermActive
                  : copy.liquidity.add.approvedToken(token.symbol)}
        </Button>
        {approval !== 'not-needed' && (needsApproval || allowance.value !== undefined) ? (
          <p className="text-xs leading-5 text-muted">
            {needsApproval
              ? useUnlimitedApproval
                ? copy.approve.longTermApproveNote(token.symbol)
                : copy.liquidity.add.approveNote
              : approvalKind(allowance.value ?? 0n) === 'unlimited'
                ? copy.approve.longTermNote
                : copy.approve.approvedNote}
          </p>
        ) : null}
        {tx.approveWatch.hash !== null ? <TxWatchCard watch={tx.approveWatch} /> : null}
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          data-testid="liquidity-add-submit"
          onClick={() => {
            void handleSubmit();
          }}
          disabled={needsApproval || !canSubmit}
          loading={tx.stage === 'wallet'}
        >
          {tx.stage === 'pending' ? copy.liquidity.add.submitting : copy.liquidity.add.submit}
        </Button>
        {tx.watch.hash !== null ? (
          <TxWatchCard
            watch={tx.watch}
            onResubmit={tx.resubmit}
            resubmitDisabled={tx.isResubmitting}
          />
        ) : null}
      </ActionStack>

      <LiquidityReceiptSheet record={tx.receipt} onDismiss={tx.clearReceipt} />
    </div>
  );
}
