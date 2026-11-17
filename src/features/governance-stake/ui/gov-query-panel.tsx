import { useState } from 'react';
import { useReadContracts } from 'wagmi';
import { stakeAbi } from '@/config/abis';
import { copy } from '@/shared/config/copy-pages';
import { parseMemberIdInput } from '@/shared/lib/identity-input';
import { formatTokenAmount } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';
import type { GovContextValue } from '@/features/governance-stake/model/use-gov-context';
import { StakeStatRow } from '@/features/governance-stake/ui/stake-controls';

const VOTE_DECIMALS = 18;

/**
 * 治理权查询（TKM 旧版 `GovQueryPanel` 是按钱包地址查；本协议没有
 * 「地址 → 身份」的反查索引，所以改成按**身份 NFT 编号**查，页面写清原因）。
 *
 * 查询是纯 view：`govVotes(token, 当前阶段, memberId)` + `memberStake(token, memberId)`。
 */
export function GovQueryPanel({ ctx }: { readonly ctx: GovContextValue }) {
  const { token, stakeAddress, clock } = ctx;
  const [input, setInput] = useState('');
  const [queriedId, setQueriedId] = useState<bigint | null>(null);
  const parsed = parseMemberIdInput(input);

  const enabled = queriedId !== null && stakeAddress !== undefined && token !== undefined;
  const contracts =
    enabled && stakeAddress !== undefined && token !== undefined && clock.currentPhase !== undefined
      ? [
          {
            address: stakeAddress,
            abi: stakeAbi,
            functionName: 'govVotes' as const,
            args: [token.address, clock.currentPhase, queriedId as bigint] as const,
          },
          {
            address: stakeAddress,
            abi: stakeAbi,
            functionName: 'memberStake' as const,
            args: [token.address, queriedId as bigint] as const,
          },
        ]
      : [];

  const read = useReadContracts({ contracts, query: { enabled } });

  const votesEntry = read.data?.[0];
  const stakeEntry = read.data?.[1];
  const votes =
    votesEntry?.status === 'success' && typeof votesEntry.result === 'bigint'
      ? votesEntry.result
      : undefined;
  const tuple =
    stakeEntry?.status === 'success' && Array.isArray(stakeEntry.result)
      ? (stakeEntry.result as readonly bigint[])
      : undefined;

  return (
    <Card data-testid="gov-query-panel">
      <CardTitle>{copy.gov.query.title}</CardTitle>
      <CardDescription>{copy.gov.query.hint}</CardDescription>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1">
          <span className="text-sm text-foreground">{copy.gov.query.label}</span>
          <input
            type="text"
            inputMode="numeric"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={copy.gov.query.placeholder}
            data-testid="gov-query-input"
            className="mt-1 w-full rounded-2xl border border-line bg-surface px-3 py-2 text-sm text-foreground focus:border-brand focus:outline-none"
          />
        </label>
        <Button
          variant="secondary"
          size="md"
          data-testid="gov-query-submit"
          disabled={parsed === null}
          onClick={() => setQueriedId(parsed)}
        >
          {copy.gov.query.submit}
        </Button>
        {queriedId !== null ? (
          <Button
            variant="ghost"
            size="md"
            data-testid="gov-query-reset"
            onClick={() => {
              setQueriedId(null);
              setInput('');
            }}
          >
            {copy.gov.query.reset}
          </Button>
        ) : null}
      </div>

      {input.trim().length > 0 && parsed === null ? (
        <p className="mt-2 text-sm text-danger-strong" data-testid="gov-query-invalid">
          {copy.gov.query.invalid}
        </p>
      ) : null}

      {queriedId !== null ? (
        read.isLoading ? (
          <p className="mt-3 text-sm text-muted">{copy.gov.query.loading}</p>
        ) : read.isError || votesEntry?.status === 'failure' ? (
          <div className="mt-3 space-y-2">
            <p className="text-sm text-danger-strong">{copy.gov.query.error}</p>
            <Button variant="secondary" size="sm" onClick={() => void read.refetch()}>
              {copy.gov.stats.retry}
            </Button>
          </div>
        ) : tuple === undefined || tuple[0] === 0n ? (
          <p className="mt-3 text-sm text-muted" data-testid="gov-query-empty">
            {copy.gov.query.notFound}
          </p>
        ) : (
          <div className="mt-3">
            <StakeStatRow
              label={copy.gov.query.votes}
              value={formatTokenAmount(votes, VOTE_DECIMALS)}
              testId="gov-query-votes"
            />
            <StakeStatRow
              label={copy.gov.query.phases}
              value={copy.gov.stats.phasesValue(formatTokenAmount(tuple[2], 0))}
              testId="gov-query-phases"
            />
            <StakeStatRow
              label={copy.gov.query.shares}
              value={formatTokenAmount(tuple[0], VOTE_DECIMALS)}
              testId="gov-query-shares"
            />
            <StakeStatRow
              label={copy.gov.query.boost}
              value={formatTokenAmount(tuple[1], token?.decimals)}
              testId="gov-query-boost"
            />
          </div>
        )
      ) : null}
    </Card>
  );
}
