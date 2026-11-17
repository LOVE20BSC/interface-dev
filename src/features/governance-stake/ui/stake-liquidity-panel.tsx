import { useEffect, useMemo, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { love20TokenAbi, stakeAbi } from '@/config/abis';
import type { HexAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { formatTokenAmount, UNKNOWN } from '@/shared/lib/format';
import { decideApproveAmount } from '@/shared/lib/approve-amount';
import { useUnlimitedApprovalPreference } from '@/shared/model/use-unlimited-approval-preference';
import { Button } from '@/shared/ui/button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';
import type { MemberStake } from '@/entities/stake/model/use-member-stake';
import type { StakeBalances } from '@/entities/stake/model/use-stake-balances';
import type { StakePool } from '@/entities/stake/model/use-stake-pool';
import type { StakeCommunity } from '@/entities/stake/model/use-stake-community';
import type { StakeParams } from '@/entities/stake/model/use-stake-params';
import {
  amountShortfall,
  parsePhaseCount,
  parseStakeAmount,
  PHASE_PRESETS,
} from '@/features/governance-stake/lib/stake-form';
import { computeStakePreview } from '@/features/governance-stake/lib/stake-preview';
import { useStakeAllowances } from '@/features/governance-stake/model/use-stake-allowances';
import type { StakeTransactionState } from '@/features/governance-stake/model/use-stake-transaction';
import { StakeAmountField, StakeApproveRow } from '@/features/governance-stake/ui/stake-controls';

/** 治理权按 18 位小数展示：份额来自 LP 记账，与代币精度无关。 */
const VOTE_DECIMALS = 18;
const DEADLINE_SECONDS = 20 * 60;

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
 * 流动性质押表单。
 *
 * 任务：把社区代币 + 父币按池子比例存进质押合约，选择承诺解锁期，换治理权。
 * 页面先给用户确定性信息（按池子比例实际会存入多少、预计治理权 +X），再给授权阶梯
 * 与主按钮；估算都标「预计」，成交后以回执里的链上数值为准。
 */
export function StakeLiquidityPanel({
  token,
  parent,
  stakeAddress,
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

  const [tokenInput, setTokenInput] = useState('');
  const [parentInput, setParentInput] = useState('');
  const [phasesInput, setPhasesInput] = useState('');
  /** 用户改过就不再自动同步默认值（默认值随「当前承诺解锁期」异步到达）。 */
  const phasesEdited = useRef(false);

  /**
   * 再质押时承诺解锁期**只能加大**（合约 PromisedWaitingPhasesDecreased，Stake.sol
   * §725-739）：默认值取「当前值」，空输入也按当前值算，避免回访用户一提交就被拒。
   */
  const currentPhases = member.promisedWaitingPhases ?? 0n;
  const defaultPhases = currentPhases > 0n ? currentPhases : (params.minPhases ?? 1n);
  const phasesText = phasesInput.trim().length === 0 ? String(defaultPhases) : phasesInput;

  // 默认值来自异步的成员/参数读（第一次渲染时多半还没到），同步进输入框。
  useEffect(() => {
    if (phasesEdited.current) return;
    setPhasesInput(String(defaultPhases));
  }, [defaultPhases]);

  const tokenParsed = useMemo(
    () => parseStakeAmount(tokenInput, token.decimals ?? 18),
    [token.decimals, tokenInput],
  );
  const parentParsed = useMemo(
    () => parseStakeAmount(parentInput, parent.decimals ?? 18),
    [parent.decimals, parentInput],
  );
  const phasesParsed = useMemo(() => parsePhaseCount(phasesText), [phasesText]);
  const phasesReady = phasesParsed.kind === 'ok' ? phasesParsed.value : defaultPhases;

  const preview = useMemo(
    () =>
      computeStakePreview({
        tokenAmount: tokenParsed.kind === 'ok' ? tokenParsed.value : undefined,
        parentTokenAmount: parentParsed.kind === 'ok' ? parentParsed.value : undefined,
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
      member.govVotes,
      member.liquidityShares,
      parentParsed,
      phasesReady,
      pool.lpTotalSupply,
      pool.reserveParent,
      pool.reserveToken,
      tokenParsed,
    ],
  );

  const allowances = useStakeAllowances(account, stakeAddress, [token.address, parent.address]);

  // 授权成交后无条件重读额度：同一个 token+spender 的第二次授权不会改变任何读的
  // key，只听 key 变化会让页面停在「授权中…」并永久禁用主按钮（QA D1/P1）。
  const allowanceRefetch = allowances.refetch;
  const { approveRevision, receipt } = tx;
  useEffect(() => {
    if (approveRevision === 0 && receipt === null) return;
    allowanceRefetch();
    // refetch 每次渲染都会重建；触发条件是授权/回执计数，不需要把它放进依赖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveRevision, receipt]);

  const tokenAmount = tokenParsed.kind === 'ok' ? tokenParsed.value : undefined;
  const parentAmount = parentParsed.kind === 'ok' ? parentParsed.value : undefined;

  const phasesInRange =
    phasesParsed.kind === 'ok' &&
    params.minPhases !== undefined &&
    params.maxPhases !== undefined &&
    phasesParsed.value >= params.minPhases &&
    phasesParsed.value <= params.maxPhases;
  const phasesAtLeastCurrent = phasesParsed.kind === 'ok' && phasesParsed.value >= currentPhases;

  /**
   * 余额校验用**合约实际会扣走的量**（池子比例截断后的两侧），不是用户原始输入：
   * 输入 1,000 + 1 时合约只扣 1,000 + 0.5，用输入校验会误报「不够」并禁用主按钮
   * （复核 P2）。preview 不可用时退回输入值（保守：多要授权不会错）。
   */
  const requiredTokenAmount =
    preview.status === 'ready' && preview.optimalTokenAmount !== undefined
      ? preview.optimalTokenAmount
      : tokenAmount;
  const requiredParentAmount =
    preview.status === 'ready' && preview.optimalParentAmount !== undefined
      ? preview.optimalParentAmount
      : parentAmount;
  const tokenShortfall = amountShortfall(balances.tokenBalance, requiredTokenAmount);
  const parentShortfall = amountShortfall(balances.parentBalance, requiredParentAmount);

  let validationMessage: string | undefined;
  if (phasesParsed.kind === 'ok' && !phasesAtLeastCurrent) {
    validationMessage = copy.gov.liquidity.phasesBelowCurrent(formatTokenAmount(currentPhases, 0));
  } else if (
    phasesParsed.kind === 'ok' &&
    !phasesInRange &&
    params.minPhases !== undefined &&
    params.maxPhases !== undefined
  ) {
    validationMessage = copy.gov.liquidity.phasesInvalid(
      formatTokenAmount(params.minPhases, 0),
      formatTokenAmount(params.maxPhases, 0),
    );
  } else if (tokenParsed.kind === 'too-precise' || parentParsed.kind === 'too-precise') {
    const digits =
      tokenParsed.kind === 'too-precise'
        ? tokenParsed.digits
        : (parentParsed as { digits: number }).digits;
    validationMessage = copy.gov.liquidity.amountTooPrecise(digits);
  } else if (tokenParsed.kind === 'invalid' || parentParsed.kind === 'invalid') {
    validationMessage = copy.gov.liquidity.amountInvalid;
  } else if (tokenAmount === 0n || parentAmount === 0n) {
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
    tokenAmount !== undefined && (allowances.allowances[0] ?? 0n) >= tokenAmount;
  const parentApproved =
    parentAmount !== undefined && (allowances.allowances[1] ?? 0n) >= parentAmount;
  const readyToSubmit =
    tokenAmount !== undefined &&
    tokenAmount > 0n &&
    parentAmount !== undefined &&
    parentAmount > 0n &&
    phasesInRange &&
    phasesAtLeastCurrent &&
    validationMessage === undefined &&
    tokenApproved &&
    parentApproved &&
    !disabled &&
    tx.stage === 'idle';

  const handleSubmit = () => {
    if (!readyToSubmit || tokenAmount === undefined || parentAmount === undefined) return;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS);
    void tx.run(
      {
        address: stakeAddress,
        abi: stakeAbi,
        functionName: 'stakeLiquidity',
        args: [token.address, tokenAmount, parentAmount, phasesReady, memberId, deadline],
      },
      'stakeLiquidity',
    );
  };

  const handleMaxToken = () => {
    if (balances.tokenBalance === undefined) return;
    setTokenInput(formatRawInput(balances.tokenBalance, token.decimals ?? 18));
  };
  const handleMaxParent = () => {
    if (balances.parentBalance === undefined) return;
    setParentInput(formatRawInput(balances.parentBalance, parent.decimals ?? 18));
  };

  return (
    <Card data-testid="gov-liquidity-card">
      <CardTitle>{copy.gov.liquidity.title}</CardTitle>
      <CardDescription>{copy.gov.liquidity.body}</CardDescription>

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
          onMax={handleMaxToken}
        />
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
          onMax={handleMaxParent}
        />

        <div>
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
                value <= params.maxPhases &&
                value >= currentPhases;
              const selected = phasesParsed.kind === 'ok' && phasesParsed.value === value;
              return (
                <button
                  key={preset}
                  type="button"
                  disabled={!available || disabled}
                  onClick={() => {
                    phasesEdited.current = true;
                    setPhasesInput(String(preset));
                  }}
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
              onChange={(event) => {
                phasesEdited.current = true;
                setPhasesInput(event.target.value);
              }}
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

        {preview.status === 'ready' &&
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
            {preview.status === 'ready' && preview.votesAdded !== undefined
              ? copy.gov.liquidity.votesValue(formatTokenAmount(preview.votesAdded, VOTE_DECIMALS))
              : UNKNOWN}
          </p>
          <span className="text-[11px] leading-4 text-muted">{copy.gov.liquidity.votesNote}</span>
        </div>

        {validationMessage !== undefined ? (
          <p data-testid="gov-liquidity-error" className="text-sm leading-6 text-danger-strong">
            {validationMessage}
          </p>
        ) : null}

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted">{copy.gov.liquidity.approveTitle}</p>
          <StakeApproveRow
            symbol={token.symbol}
            allowance={allowances.allowances[0]}
            required={tokenAmount}
            stage={tx.approveStage}
            unlimitedPreferred={approvalPreference.enabled}
            testId="gov-liquidity-approve-token"
            disabled={disabled || tx.stage !== 'idle'}
            onApprove={() => {
              if (tokenAmount === undefined) return;
              void tx.approve({
                tokenAddress: token.address,
                abi: love20TokenAbi,
                spender: stakeAddress,
                amount: decideApproveAmount(approvalPreference.enabled, tokenAmount),
              });
            }}
          />
          <StakeApproveRow
            symbol={parent.symbol}
            allowance={allowances.allowances[1]}
            required={parentAmount}
            stage={tx.approveStage}
            unlimitedPreferred={approvalPreference.enabled}
            testId="gov-liquidity-approve-parent"
            disabled={disabled || tx.stage !== 'idle'}
            onApprove={() => {
              if (parentAmount === undefined) return;
              void tx.approve({
                tokenAddress: parent.address,
                abi: love20TokenAbi,
                spender: stakeAddress,
                amount: decideApproveAmount(approvalPreference.enabled, parentAmount),
              });
            }}
          />
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
      </div>
    </Card>
  );
}

/** 输入框里的「全部」：把 wei 还原成用户可读的十进制字符串。 */
function formatRawInput(value: bigint, decimals: number): string {
  const raw = formatTokenAmount(value, decimals, { maxFractionDigits: decimals });
  return raw === UNKNOWN ? '' : raw.replace(/,/g, '');
}
