import { useEffect, useMemo, useState } from 'react';
import { useReadContract, useReadContracts } from 'wagmi';
import { memberNftAbi, stakeAbi } from '@/config/abis';
import { copy } from '@/shared/config/copy-pages';
import { copyText } from '@/shared/lib/clipboard';
import { cn } from '@/shared/lib/cn';
import { formatPercent, formatTokenAmount, UNKNOWN } from '@/shared/lib/format';
import { parseMemberIdInput } from '@/shared/lib/identity-input';
import { Button } from '@/shared/ui/button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';
import { CopyableAddress } from '@/shared/ui/copyable-address';
import { Check, Copy } from '@/shared/ui/icons';
import { useMemberNftAddress } from '@/entities/member-identity/model/use-member-nft-address';
import { sharePercent } from '@/features/governance-stake/lib/gov-share';
import type { GovContextValue } from '@/features/governance-stake/model/use-gov-context';

const VOTE_DECIMALS = 18;

type QueryMode = 'id' | 'name';

type QueryTarget =
  { readonly mode: 'id'; readonly id: bigint } | { readonly mode: 'name'; readonly name: string };

/** 数值后的复制按钮（旧版查询结果卡上的复制图标）。 */
function CopyValueButton({ value, testId }: { readonly value: string; readonly testId: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={copy.gov.query.copy}
      title={copy.gov.query.copy}
      data-testid={testId}
      onClick={() => {
        void copyText(value).then((ok) => setCopied(ok));
      }}
      className="shrink-0 rounded-lg p-1.5 text-muted transition-colors hover:bg-elevated hover:text-brand-strong"
    >
      {copied ? (
        <Check aria-hidden="true" className="h-4 w-4" />
      ) : (
        <Copy aria-hidden="true" className="h-4 w-4" />
      )}
      <span className="sr-only">{copied ? copy.gov.query.copied : copy.gov.query.copy}</span>
    </button>
  );
}

interface ResultStatProps {
  readonly label: string;
  readonly note?: string | undefined;
  readonly value: string;
  readonly testId: string;
}

/** 查询结果的一个大数字块（治理权 / 占比）：标题 + 大数 + 复制。 */
function ResultStat({ label, note, value, testId }: ResultStatProps) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-3 py-3">
      <p className="text-sm leading-5 text-muted">{label}</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="min-w-0 break-words text-2xl font-semibold leading-8 text-foreground">
          <span data-testid={testId}>{value}</span>
        </p>
        <CopyValueButton value={value} testId={`${testId}-copy`} />
      </div>
      {note !== undefined ? <p className="mt-1 text-[11px] leading-4 text-muted">{note}</p> : null}
    </div>
  );
}

function readBigint(entry: { status: string; result?: unknown } | undefined): bigint | undefined {
  return entry?.status === 'success' && typeof entry.result === 'bigint' ? entry.result : undefined;
}

function readString(entry: { status: string; result?: unknown } | undefined): string | undefined {
  return entry?.status === 'success' && typeof entry.result === 'string' ? entry.result : undefined;
}

/** 输入即查询：名称输入用 300 ms 防抖，避免每个字符都打一次链上读。 */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/**
 * 治理权查询（owner 2026-11-18 23:20：移除按地址查询，只按身份 NFT，支持 ID / 名称两种）：
 *
 * - **按 NFT ID**：输入编号 → `govVotes(token, 当前阶段, memberId)` + `memberStake`；
 * - **按 NFT 名称**：先用合约的 `memberId(name)` 把名称解析成编号（O(1)，未知名称返回 0），
 *   再走同一套读取。名称不区分大小写由合约负责，页面不做二次猜测。
 *
 * 结果显示 NFT ID / 名称 / 当前持有人地址 / 查询目标地址 / 治理权 / 占总治理权比例（都带复制）
 * 与备注。全部是 view，不发交易。
 */
export function GovQueryPanel({ ctx }: { readonly ctx: GovContextValue }) {
  const { token, stakeAddress, clock, community } = ctx;
  const memberNft = useMemberNftAddress();
  const [mode, setMode] = useState<QueryMode>('id');
  const [input, setInput] = useState('');

  const phase = clock.currentPhase;
  const trimmedName = input.trim();
  // 切到 ID 模式时把名称输入清空，避免 300 ms 内用旧名称发一次查询。
  const debouncedName = useDebouncedValue(mode === 'name' ? trimmedName : '', 300);
  const parsedId = parseMemberIdInput(input);
  /**
   * owner 2026-11-19：输入即查询。ID 模式按编号即时查；名称模式对输入做 300 ms
   * 防抖后自动解析，不再要求先点「查询」。
   */
  const target: QueryTarget | null =
    mode === 'id'
      ? parsedId === null
        ? null
        : { mode: 'id', id: parsedId }
      : debouncedName.length === 0
        ? null
        : { mode: 'name', name: debouncedName };

  // 名称 → 编号：合约 memberId(name) 是唯一的权威解析，未知名称返回 0。
  const nameRead = useReadContract({
    address: memberNft.address,
    abi: memberNftAbi,
    functionName: 'memberId',
    args: target?.mode === 'name' ? [target.name] : undefined,
    query: {
      enabled: target?.mode === 'name' && memberNft.address !== undefined,
      retry: false,
    },
  });

  const resolvedId =
    target === null
      ? undefined
      : target.mode === 'id'
        ? target.id
        : nameRead.data !== undefined && nameRead.data > 0n
          ? nameRead.data
          : undefined;

  const nftContracts = useMemo(() => {
    if (
      resolvedId === undefined ||
      stakeAddress === undefined ||
      token === undefined ||
      phase === undefined
    ) {
      return [];
    }
    const contracts = [
      {
        address: stakeAddress,
        abi: stakeAbi,
        functionName: 'govVotes' as const,
        args: [token.address, phase, resolvedId] as const,
      },
      {
        address: stakeAddress,
        abi: stakeAbi,
        functionName: 'memberStake' as const,
        args: [token.address, resolvedId] as const,
      },
    ] as const;
    if (memberNft.address === undefined) return [...contracts];
    return [
      ...contracts,
      {
        address: memberNft.address,
        abi: memberNftAbi,
        functionName: 'memberName' as const,
        args: [resolvedId] as const,
      },
      {
        address: memberNft.address,
        abi: memberNftAbi,
        functionName: 'ownerOf' as const,
        args: [resolvedId] as const,
      },
    ];
  }, [memberNft.address, resolvedId, phase, stakeAddress, token]);

  const nftRead = useReadContracts({
    contracts: nftContracts,
    query: { enabled: nftContracts.length > 0 },
  });

  const invalid = mode === 'id' && trimmedName.length > 0 && parsedId === null;

  const reset = () => {
    setInput('');
  };

  const retry = () => {
    if (target?.mode === 'name') nameRead.refetch();
    if (nftContracts.length > 0) void nftRead.refetch();
  };

  // ---- 读结果 -------------------------------------------------------------
  const data = nftRead.data;
  const votes = readBigint(data?.[0]);
  const stakeTuple =
    data?.[1]?.status === 'success' && Array.isArray(data[1].result)
      ? (data[1].result as readonly bigint[])
      : undefined;
  const chainName = readString(data?.[2]) ?? null;
  const owner = readString(data?.[3]) ?? null;

  const nameLoading = target?.mode === 'name' && nameRead.isLoading;
  const nameFailed =
    target?.mode === 'name' && (memberNft.address === undefined || nameRead.isError);
  const nameMissing =
    target?.mode === 'name' &&
    !nameLoading &&
    !nameFailed &&
    nameRead.data !== undefined &&
    nameRead.data === 0n;

  const nftLoading =
    resolvedId !== undefined &&
    (phase === undefined || (nftContracts.length > 0 && nftRead.isLoading));
  const nftFailed =
    resolvedId !== undefined &&
    !nftLoading &&
    (nftRead.isError ||
      data?.[0]?.status === 'failure' ||
      votes === undefined ||
      stakeTuple === undefined);
  // 编号不存在时 ownerOf 会 revert（其余读成功）：这是「查不到」，不是「读不到」。
  const nftMissing = resolvedId !== undefined && !nftFailed && data?.[3]?.status === 'failure';
  const nftEmpty =
    resolvedId !== undefined &&
    !nftFailed &&
    stakeTuple !== undefined &&
    (stakeTuple[0] ?? 0n) === 0n &&
    (votes ?? 0n) === 0n;

  const share = sharePercent(votes, community.totalGovVotes);
  const displayId = resolvedId ?? (target?.mode === 'id' ? target.id : undefined);

  return (
    <Card data-testid="gov-query-panel">
      <CardTitle>{copy.gov.query.title}</CardTitle>
      <CardDescription>{copy.gov.query.hint}</CardDescription>

      <div
        role="tablist"
        aria-label={copy.gov.query.modeLabel}
        className="mt-3 grid grid-cols-2 gap-1 rounded-2xl border border-line bg-elevated p-1 text-xs"
      >
        {(['id', 'name'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            data-testid={`gov-query-mode-${value}`}
            onClick={() => {
              setMode(value);
              setInput('');
            }}
            className={cn(
              'rounded-xl px-2 py-2 font-medium transition-colors',
              mode === value
                ? 'bg-surface text-brand-strong shadow-soft'
                : 'text-muted hover:text-foreground',
            )}
          >
            {copy.gov.query.modes[value]}
          </button>
        ))}
      </div>

      <div className="mt-3 space-y-2">
        <label className="block">
          <span className="text-sm text-foreground">
            {mode === 'id' ? copy.gov.query.idLabel : copy.gov.query.nameLabel}
          </span>
          <input
            type="text"
            inputMode={mode === 'id' ? 'numeric' : 'text'}
            autoComplete="off"
            spellCheck={false}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={
              mode === 'id' ? copy.gov.query.idPlaceholder : copy.gov.query.namePlaceholder
            }
            data-testid="gov-query-input"
            className="mt-1 w-full rounded-2xl border border-line bg-surface px-3 py-2.5 text-sm text-foreground focus:border-brand-strong focus:outline-none focus:ring-2 focus:ring-brand-strong/30"
          />
        </label>
        {invalid ? (
          <p className="text-sm text-danger-strong" data-testid="gov-query-invalid">
            {copy.gov.query.invalidId}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button
            variant="primary"
            size="md"
            className="flex-1"
            data-testid="gov-query-submit"
            onClick={() => {
              if (target?.mode === 'name') nameRead.refetch();
              if (nftContracts.length > 0) void nftRead.refetch();
            }}
          >
            {copy.gov.query.submit}
          </Button>
          <Button variant="secondary" size="md" data-testid="gov-query-reset" onClick={reset}>
            {copy.gov.query.reset}
          </Button>
        </div>
      </div>

      {target !== null ? (
        <div className="mt-4 space-y-3" data-testid="gov-query-result">
          {nameLoading || nftLoading ? (
            <p className="text-sm text-muted">{copy.gov.query.loading}</p>
          ) : nameFailed || nftFailed ? (
            <div className="space-y-2">
              <p className="text-sm text-danger-strong" data-testid="gov-query-error">
                {copy.gov.query.error}
              </p>
              <Button variant="secondary" size="sm" onClick={retry}>
                {copy.gov.stats.retry}
              </Button>
            </div>
          ) : nameMissing ? (
            <p className="text-sm text-muted" data-testid="gov-query-empty">
              {copy.gov.query.nameNotFound}
            </p>
          ) : nftMissing || nftEmpty ? (
            <p className="text-sm text-muted" data-testid="gov-query-empty">
              {copy.gov.query.notFoundNft}
            </p>
          ) : (
            <>
              <div className="space-y-2 rounded-2xl border border-line bg-elevated/60 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-muted">{copy.gov.query.nftId}</span>
                  <span
                    className="text-sm font-semibold text-brand-strong"
                    data-testid="gov-query-nft-id"
                  >
                    {displayId === undefined ? UNKNOWN : `#${displayId}`}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-muted">{copy.gov.query.nftName}</span>
                  <span
                    className="min-w-0 truncate text-sm font-medium text-foreground"
                    data-testid="gov-query-nft-name"
                  >
                    {chainName ??
                      (target.mode === 'name' ? target.name : copy.gov.query.nameUnknown)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="shrink-0 text-sm text-muted">{copy.gov.query.holder}</span>
                  {owner !== null ? (
                    <CopyableAddress
                      address={owner}
                      label={copy.gov.query.holder}
                      testId="gov-query-holder"
                    />
                  ) : (
                    <span className="text-sm text-foreground" data-testid="gov-query-holder">
                      {UNKNOWN}
                    </span>
                  )}
                </div>
              </div>

              {owner !== null ? (
                <div className="rounded-2xl border border-line bg-elevated/60 px-3 py-2">
                  <p className="text-xs leading-5 text-muted">{copy.gov.query.target}</p>
                  <CopyableAddress
                    address={owner}
                    label={copy.gov.query.target}
                    testId="gov-query-target-address"
                  />
                </div>
              ) : null}

              <ResultStat
                label={copy.gov.query.votes}
                note={copy.gov.query.votesNote}
                value={formatTokenAmount(votes, VOTE_DECIMALS)}
                testId="gov-query-votes"
              />
              <ResultStat
                label={copy.gov.query.share}
                value={share === undefined ? UNKNOWN : `${formatPercent(share)}%`}
                testId="gov-query-share"
              />
              <div
                className="rounded-2xl border border-line bg-elevated/60 px-3 py-2"
                data-testid="gov-query-note"
              >
                <p className="text-sm font-semibold text-foreground">{copy.gov.query.noteTitle}</p>
                <p className="mt-1 text-xs leading-5 text-muted">{copy.gov.query.note}</p>
              </div>
            </>
          )}
        </div>
      ) : null}
    </Card>
  );
}
