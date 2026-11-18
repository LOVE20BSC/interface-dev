import { useEffect, useMemo, useState } from 'react';
import { useAccount } from 'wagmi';
import { love20TokenAbi, stakeAbi } from '@/config/abis';
import type { HexAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { boostAmountFitsCap, boostRemainingCap } from '@/domain/gov-stake';
import { decideApproveAmount } from '@/shared/lib/approve-amount';
import { formatTokenAmount } from '@/shared/lib/format';
import { useUnlimitedApprovalPreference } from '@/shared/model/use-unlimited-approval-preference';
import { Button } from '@/shared/ui/button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';
import type { MemberStake } from '@/entities/stake/model/use-member-stake';
import type { StakeBalances } from '@/entities/stake/model/use-stake-balances';
import { amountShortfall, parseStakeAmount } from '@/features/governance-stake/lib/stake-form';
import { useStakeAllowances } from '@/features/governance-stake/model/use-stake-allowances';
import type { StakeTransactionState } from '@/features/governance-stake/model/use-stake-transaction';
import {
  StakeAmountField,
  StakeApproveRow,
  StakeStatRow,
} from '@/features/governance-stake/ui/stake-controls';

const DEADLINE_SECONDS = 20 * 60;

export interface StakeBoostPanelProps {
  readonly token: {
    readonly address: HexAddress;
    readonly symbol: string;
    readonly decimals: number | undefined;
  };
  readonly stakeAddress: HexAddress;
  readonly memberId: bigint;
  readonly member: MemberStake;
  readonly balances: StakeBalances;
  readonly tx: StakeTransactionState;
  readonly disabled: boolean;
  readonly onGoLiquidity: () => void;
}

/**
 * 加速质押表单（owner 2026-11-17：治理页的「加速激励质押」）。
 *
 * 加速质押不产生治理权：它把社区代币挂到已有的流动性质押上，决定本阶段的加速
 * 份额（治理激励里「加速激励」那一半按占比分配）。上限由合约 `boostStakeCap`
 * 给出（与流动性本金、发行进度、本人治理权占比相关），页面只显示「本阶段还能
 * 加速多少」，不自己造公式。
 *
 * 没有流动性质押时这里是明确的「先完成流动性质押」卡，不显示半成品表单。
 */
export function StakeBoostPanel({
  token,
  stakeAddress,
  memberId,
  member,
  balances,
  tx,
  disabled,
  onGoLiquidity,
}: StakeBoostPanelProps) {
  const { address: account } = useAccount();
  const approvalPreference = useUnlimitedApprovalPreference();
  const [amountInput, setAmountInput] = useState('');

  const parsed = useMemo(
    () => parseStakeAmount(amountInput, token.decimals ?? 18),
    [amountInput, token.decimals],
  );
  const amount = parsed.kind === 'ok' ? parsed.value : undefined;

  const remainingCap = useMemo(() => {
    if (member.boostCap === undefined || member.boostUsed === undefined) return undefined;
    return boostRemainingCap(member.boostCap, member.boostUsed);
  }, [member.boostCap, member.boostUsed]);

  const allowances = useStakeAllowances(account, stakeAddress, [token.address]);
  const allowanceRefetch = allowances.refetch;
  const { approveRevision, receipt } = tx;
  useEffect(() => {
    if (approveRevision === 0 && receipt === null) return;
    allowanceRefetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveRevision, receipt]);
  const approved = amount !== undefined && (allowances.allowances[0] ?? 0n) >= amount;
  const shortfall = amountShortfall(balances.tokenBalance, amount);

  const hasLiquidity = member.liquidityShares !== undefined && member.liquidityShares > 0n;

  if (member.status === 'loading' || member.status === 'idle') {
    return (
      <Card data-testid="gov-boost-card">
        <CardTitle>{copy.gov.boost.title}</CardTitle>
        <CardDescription>{copy.gov.stats.loading}</CardDescription>
      </Card>
    );
  }

  if (member.status === 'error') {
    return (
      <Card data-testid="gov-boost-read-error">
        <CardTitle>{copy.gov.boost.title}</CardTitle>
        <CardDescription>{copy.gov.stats.errorBody}</CardDescription>
        <div className="mt-4">
          <Button variant="secondary" size="md" className="w-full" onClick={member.refetch}>
            {copy.gov.stats.retry}
          </Button>
        </div>
      </Card>
    );
  }

  if (!hasLiquidity) {
    return (
      <Card data-testid="gov-boost-locked">
        <CardTitle>{copy.gov.boost.lockedTitle}</CardTitle>
        <CardDescription>{copy.gov.boost.lockedBody}</CardDescription>
        <div className="mt-4">
          <Button variant="secondary" size="md" className="w-full" onClick={onGoLiquidity}>
            {copy.gov.boost.lockedAction}
          </Button>
        </div>
      </Card>
    );
  }

  let validationMessage: string | undefined;
  if (parsed.kind === 'too-precise') {
    validationMessage = copy.gov.boost.amountInvalid;
  } else if (parsed.kind === 'invalid') {
    validationMessage = copy.gov.boost.amountInvalid;
  } else if (amount !== undefined && amount <= 0n) {
    validationMessage = copy.gov.boost.amountZero;
  } else if (
    amount !== undefined &&
    remainingCap !== undefined &&
    !boostAmountFitsCap({
      amount,
      memberCap: member.boostCap ?? 0n,
      memberUsed: member.boostUsed ?? 0n,
    })
  ) {
    validationMessage = copy.gov.boost.capExceeded(
      formatTokenAmount(remainingCap, token.decimals),
      token.symbol,
    );
  } else if (shortfall !== undefined) {
    validationMessage = copy.gov.boost.insufficient(
      token.symbol,
      formatTokenAmount(shortfall, token.decimals),
    );
  }

  const readyToSubmit =
    amount !== undefined &&
    amount > 0n &&
    remainingCap !== undefined &&
    validationMessage === undefined &&
    approved &&
    !disabled &&
    tx.stage === 'idle';

  const handleSubmit = () => {
    if (!readyToSubmit || amount === undefined) return;
    const phases = member.promisedWaitingPhases ?? 1n;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS);
    void tx.run(
      {
        address: stakeAddress,
        abi: stakeAbi,
        functionName: 'stakeBoost',
        args: [token.address, amount, phases, memberId, deadline],
      },
      'stakeBoost',
    );
  };

  return (
    <Card data-testid="gov-boost-card">
      <CardTitle>{copy.gov.boost.title}</CardTitle>
      <CardDescription>{copy.gov.boost.body}</CardDescription>

      <div className="mt-3">
        <StakeStatRow
          label={copy.gov.boost.capLabel}
          value={
            remainingCap === undefined
              ? copy.gov.boost.capLoading
              : copy.gov.boost.capValue(
                  formatTokenAmount(remainingCap, token.decimals),
                  token.symbol,
                )
          }
          testId="gov-boost-cap"
        />
        <StakeStatRow
          label={copy.gov.boost.usedLabel}
          value={formatTokenAmount(member.boostUsed, token.decimals)}
          testId="gov-boost-used"
        />
      </div>

      <div className="mt-4 space-y-4">
        <StakeAmountField
          label={copy.gov.boost.amountLabel(token.symbol)}
          symbol={token.symbol}
          decimals={token.decimals}
          value={amountInput}
          onChange={setAmountInput}
          balance={balances.tokenBalance}
          balanceLoading={balances.status === 'loading'}
          testId="gov-boost-input"
          disabled={disabled}
          onMax={() => {
            if (remainingCap !== undefined) {
              setAmountInput(rawInputValue(remainingCap, token.decimals ?? 18));
            }
          }}
        />

        {validationMessage !== undefined ? (
          <p data-testid="gov-boost-error" className="text-sm leading-6 text-danger-strong">
            {validationMessage}
          </p>
        ) : null}

        <StakeApproveRow
          symbol={token.symbol}
          allowance={allowances.allowances[0]}
          required={amount}
          stage={tx.approveStage}
          unlimitedPreferred={approvalPreference.enabled}
          testId="gov-boost-approve"
          disabled={disabled || tx.stage !== 'idle'}
          onApprove={() => {
            if (amount === undefined) return;
            void tx.approve({
              tokenAddress: token.address,
              abi: love20TokenAbi,
              spender: stakeAddress,
              amount: decideApproveAmount(approvalPreference.enabled, amount),
            });
          }}
        />

        <Button
          variant="primary"
          size="lg"
          className="w-full"
          onClick={handleSubmit}
          disabled={!readyToSubmit}
          loading={tx.stage !== 'idle'}
          data-testid="gov-boost-submit"
        >
          {tx.stage === 'idle' ? copy.gov.boost.submit : copy.gov.boost.submitting}
        </Button>
      </div>
    </Card>
  );
}

/** 把 wei 还原成可编辑的十进制字符串（无千分位、不丢小数）。 */
function rawInputValue(value: bigint, decimals: number): string {
  const raw = formatTokenAmount(value, decimals, { maxFractionDigits: decimals });
  return raw.replace(/,/g, '');
}
