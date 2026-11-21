import { useState } from 'react';
import type { HexAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { formatTokenAmount } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';
import { Sheet } from '@/shared/ui/sheet';
import { Skeleton } from '@/shared/ui/skeleton';
import { TxWatchCard } from '@/shared/ui/tx-watch-card';
import type { SubmitContext } from '@/entities/gov-core/model/use-submit-context';
import {
  EMPTY_SUBMIT_DRAFT,
  buildProposalBody,
  measureSubmitDraft,
  submitDraftIssue,
  submitRatioPercent,
  type SubmitDraft,
  type SubmitDraftIssue,
} from '../lib/submit-form';
import type { SubmitWrite } from '../model/use-submit-write';

/**
 * 推举面板：资格 → 表单（标题 / 详情 / 目标）→ 提交 → 回执。
 *
 * 交互口径（UX spec §4）：
 * - 提交前先做本地校验（`lib/submit-form#submitDraftIssue`，对应合约的
 *   `_checkProposalBody`），错误显示在按钮上方，不进钱包；
 * - 一笔写操作在途时按钮禁用并写明原因，不做全屏遮罩；
 * - 回执的提案编号与标题只认链上 `ProposalCreated` 事件，解析不到就只显示提示；
 * - 本轮已经推举过（`proposalIdBySubmitterId` 非 0）时整张表单换成「本轮已经推举」。
 */

/** 治理权是 18 位小数的数量（`Stake.govVotes`）。 */
const GOV_DECIMALS = 18;

const INPUT_CLASS =
  'mt-1 h-11 w-full rounded-2xl border border-line bg-surface px-3 text-sm text-foreground outline-none placeholder:text-muted focus:border-brand-strong/40 focus:ring-2 focus:ring-brand-strong/20 disabled:opacity-60';

const TEXTAREA_CLASS =
  'mt-1 min-h-24 w-full resize-y rounded-2xl border border-line bg-surface px-3 py-2 text-sm leading-6 text-foreground outline-none placeholder:text-muted focus:border-brand-strong/40 focus:ring-2 focus:ring-brand-strong/20 disabled:opacity-60';

type SubmitLimits = NonNullable<SubmitContext['limits']>;

export interface SubmitPanelProps {
  readonly submitAddress: HexAddress;
  readonly tokenAddress: HexAddress;
  readonly memberId: bigint;
  readonly context: SubmitContext;
  /** 本轮已推举提案的标题（链上读不到就是 undefined，卡片用「—」兜底）。 */
  readonly submittedTitle: string | undefined;
  readonly write: SubmitWrite;
  readonly onRefetch: () => void;
}

export function SubmitPanel({
  submitAddress,
  tokenAddress,
  memberId,
  context,
  submittedTitle,
  write,
  onRefetch,
}: SubmitPanelProps) {
  const [draft, setDraft] = useState<SubmitDraft>(EMPTY_SUBMIT_DRAFT);
  const [localError, setLocalError] = useState<string | null>(null);

  const limits = context.limits;
  const bytes = measureSubmitDraft(draft);
  const busy = write.stage !== 'idle' || write.receipt !== null;
  const submittedId = context.submittedProposalThisRound;
  const hasSubmitted = submittedId !== undefined && submittedId !== 0n;
  const canPress =
    !busy && limits !== undefined && context.status === 'ready' && context.canSubmit === true;
  const disabledReason = disabledReasonOf(write, context, limits);

  const update = (patch: Partial<SubmitDraft>): void => {
    setDraft((current) => ({ ...current, ...patch }));
    setLocalError(null);
  };

  const submit = (): void => {
    if (limits === undefined) return;
    const issue = submitDraftIssue(draft, limits);
    if (issue !== null) {
      setLocalError(issueCopy(issue, limits));
      return;
    }
    const body = buildProposalBody(draft);
    if (body === undefined) {
      setLocalError(copy.gov.submit.issueTargetInvalid);
      return;
    }
    setLocalError(null);
    write.submit({ submitAddress, tokenAddress, memberId, body });
  };

  return (
    <div className="space-y-4">
      <EligibilityCard context={context} onRefetch={onRefetch} />

      {hasSubmitted && submittedId !== undefined ? (
        <SubmittedCard id={submittedId} title={submittedTitle} />
      ) : (
        <>
          <Card data-testid="gov-submit-form">
            <CardTitle>{copy.gov.submit.formTitle}</CardTitle>
            {limits === undefined ? (
              <div className="mt-3 space-y-2" data-testid="gov-submit-form-loading">
                <Skeleton className="h-4 w-56" />
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : (
              <div className="mt-3 space-y-4">
                <p className="text-xs leading-5 text-muted" data-testid="gov-submit-limit">
                  {copy.gov.submit.limitTitle(
                    limits.maxTitleLength.toString(),
                    limits.maxDetailsLength.toString(),
                  )}
                </p>
                <label htmlFor="gov-submit-title" className="block">
                  <span className="text-xs font-medium text-muted">
                    {copy.gov.submit.titleLabel}
                  </span>
                  <input
                    id="gov-submit-title"
                    data-testid="gov-submit-title"
                    type="text"
                    className={INPUT_CLASS}
                    placeholder={copy.gov.submit.titlePlaceholder}
                    value={draft.title}
                    disabled={busy}
                    autoComplete="off"
                    onChange={(event) => update({ title: event.target.value })}
                  />
                  <span
                    className="mt-1 block text-[11px] leading-4 text-muted"
                    data-testid="gov-submit-title-counter"
                  >
                    {copy.gov.submit.counter(
                      bytes.title.toString(),
                      limits.maxTitleLength.toString(),
                    )}
                  </span>
                </label>
                <label htmlFor="gov-submit-details" className="block">
                  <span className="text-xs font-medium text-muted">
                    {copy.gov.submit.detailsLabel}
                  </span>
                  <textarea
                    id="gov-submit-details"
                    data-testid="gov-submit-details"
                    className={TEXTAREA_CLASS}
                    placeholder={copy.gov.submit.detailsPlaceholder}
                    value={draft.details}
                    rows={5}
                    disabled={busy}
                    autoComplete="off"
                    onChange={(event) => update({ details: event.target.value })}
                  />
                  <span
                    className="mt-1 block text-[11px] leading-4 text-muted"
                    data-testid="gov-submit-details-counter"
                  >
                    {copy.gov.submit.counter(
                      bytes.details.toString(),
                      limits.maxDetailsLength.toString(),
                    )}
                  </span>
                </label>
                <label htmlFor="gov-submit-target" className="block">
                  <span className="text-xs font-medium text-muted">
                    {copy.gov.submit.targetLabel}
                  </span>
                  <input
                    id="gov-submit-target"
                    data-testid="gov-submit-target"
                    type="text"
                    className={INPUT_CLASS}
                    placeholder={copy.gov.submit.targetPlaceholder}
                    value={draft.target}
                    disabled={busy}
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    onChange={(event) => update({ target: event.target.value })}
                  />
                  <span className="mt-1 block text-[11px] leading-4 text-muted">
                    {copy.gov.submit.targetHint}
                  </span>
                </label>
                <p className="text-xs leading-5 text-muted" data-testid="gov-submit-no-callback">
                  {copy.gov.submit.noCallbackNote}
                </p>
              </div>
            )}
          </Card>

          {localError !== null ? (
            <p
              role="alert"
              data-testid="gov-submit-local-error"
              className="text-sm text-danger-strong"
            >
              {localError}
            </p>
          ) : null}
          {write.error !== null ? (
            <p role="alert" data-testid="gov-submit-error" className="text-sm text-danger-strong">
              {write.error}
            </p>
          ) : null}

          <div className="space-y-2">
            <Button
              type="button"
              variant="primary"
              size="lg"
              className="w-full"
              data-testid="gov-submit-submit"
              disabled={!canPress}
              onClick={submit}
            >
              {write.stage === 'wallet'
                ? copy.gov.submit.waitingWallet
                : write.stage === 'pending'
                  ? copy.gov.submit.submitting
                  : copy.gov.submit.submit}
            </Button>
            {!canPress && disabledReason !== null ? (
              <p className="text-xs text-muted" data-testid="gov-submit-disabled-reason">
                {disabledReason}
              </p>
            ) : null}
          </div>
        </>
      )}

      <TxWatchCard watch={write.watch} onResubmit={write.resubmit} />

      <Sheet
        open={write.receipt !== null}
        onOpenChange={(open) => {
          if (!open) write.closeReceipt();
        }}
        title={copy.gov.submit.receiptTitle}
      >
        <div className="space-y-3" data-testid="gov-submit-receipt">
          {write.receipt !== null && write.receipt.proposalId !== null ? (
            <p className="text-sm text-foreground" data-testid="gov-submit-receipt-line">
              {copy.gov.submit.receiptLine(
                write.receipt.proposalId.toString(),
                write.receipt.title ?? copy.common.unknown,
              )}
            </p>
          ) : null}
          <p className="text-sm leading-6 text-muted">{copy.gov.submit.receiptHint}</p>
          <Button
            type="button"
            variant="secondary"
            size="md"
            className="w-full"
            data-testid="gov-submit-receipt-close"
            onClick={write.closeReceipt}
          >
            {copy.gov.receipt.close}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

function EligibilityCard({
  context,
  onRefetch,
}: {
  readonly context: SubmitContext;
  readonly onRefetch: () => void;
}) {
  const requiredText = formatTokenAmount(context.requiredVotes, GOV_DECIMALS);
  return (
    <Card data-testid="gov-submit-eligibility">
      <CardTitle>{copy.gov.submit.eligibilityTitle}</CardTitle>
      {context.status === 'loading' ? (
        <div className="mt-3 space-y-2" data-testid="gov-submit-eligibility-loading">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-28" />
        </div>
      ) : context.status !== 'ready' ? (
        <div className="mt-3" data-testid="gov-submit-read-error">
          <CardDescription>{copy.common.readFailed}</CardDescription>
          <Button
            type="button"
            variant="secondary"
            size="md"
            className="mt-3"
            data-testid="gov-submit-retry"
            onClick={onRefetch}
          >
            {copy.gov.gates.retry}
          </Button>
        </div>
      ) : (
        <div className="mt-3 space-y-1">
          {context.canSubmit === true ? (
            <CardDescription>{copy.gov.submit.eligibilityCan}</CardDescription>
          ) : (
            <>
              <CardDescription>{copy.gov.submit.eligibilityCannot}</CardDescription>
              <CardDescription data-testid="gov-submit-eligibility-reason">
                {context.totalGovVotes === 0n
                  ? copy.gov.submit.eligibilityNoCommunity
                  : copy.gov.submit.eligibilityReason(
                      formatTokenAmount(context.myGovVotes, GOV_DECIMALS),
                      requiredText,
                      submitRatioPercent(context.submitMinRatio) ?? copy.common.unknown,
                    )}
              </CardDescription>
            </>
          )}
          <p
            className="text-xs leading-5 text-muted"
            data-testid="gov-submit-eligibility-threshold"
          >
            {copy.gov.submit.eligibilityThreshold(requiredText)}
          </p>
        </div>
      )}
    </Card>
  );
}

function SubmittedCard({ id, title }: { readonly id: bigint; readonly title: string | undefined }) {
  return (
    <Card data-testid="gov-submit-submitted">
      <CardTitle>{copy.gov.submit.submittedTitle}</CardTitle>
      <CardDescription data-testid="gov-submit-submitted-body">
        {copy.gov.submit.submittedBody(id.toString(), title ?? copy.common.unknown)}
      </CardDescription>
    </Card>
  );
}

/** 按钮为什么按不动：一句可见文字，按「在途 → 读模型未就绪 → 没有资格」的顺序给。 */
function disabledReasonOf(
  write: SubmitWrite,
  context: SubmitContext,
  limits: SubmitLimits | undefined,
): string | null {
  if (write.stage === 'wallet') return copy.gov.tx.wallet;
  if (write.stage === 'pending' || write.receipt !== null) return copy.gov.submit.pending;
  if (context.status === 'loading') return copy.common.loading;
  if (context.status !== 'ready' || limits === undefined) return copy.common.readFailed;
  if (context.canSubmit !== true) return copy.gov.submit.eligibilityCannot;
  return null;
}

/** 本地校验 issue → 页面文案；规则本身在 `domain/gov-core`，这里只做翻译。 */
function issueCopy(issue: SubmitDraftIssue, limits: SubmitLimits): string {
  switch (issue) {
    case 'title-empty':
      return copy.gov.submit.issueTitleEmpty;
    case 'title-too-long':
      return copy.gov.submit.issueTitleTooLong(limits.maxTitleLength.toString());
    case 'details-too-long':
      return copy.gov.submit.issueDetailsTooLong(limits.maxDetailsLength.toString());
    case 'target-invalid':
      return copy.gov.submit.issueTargetInvalid;
  }
}
