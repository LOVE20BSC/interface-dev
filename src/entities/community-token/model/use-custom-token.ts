import { useMemo } from 'react';
import { useBytecode, useReadContracts } from 'wagmi';
import { love20TokenAbi } from '@/config/abis';
import type { HexAddress } from '@/config/networks';

/**
 * 自定义 ERC20 的合法性判定与读取（候选 A，2026-11-26）。
 *
 * 转账页与加池页原先各写一份 `useCustomToken`，判定已经分叉：
 * - 零地址：加池判 `no-code`（「这个地址上没有合约」），转账先用 `isConfiguredAddress`
 *   过滤 → 落到 `invalid`（「这不是一个有效的代币地址」）——对一个格式完全正确的
 *   地址说格式错。加池那份的注释写明这是修过的 QA D9 P3：**修了一处、漏了一处**。
 * - 精度读不到：加池不放进可选列表（「猜一个 18 会让用户看到错误的数量」），
 *   转账用 `?? 18` 猜。
 *
 * 现在判定只有一份：零地址一律 `no-code`，精度读不到一律不是 `ok`。
 * 各 feature 只做状态投影（转账把「格式不对」叫 invalid、加池叫 idle——两个页面的
 * 输入框分工不同，这是有意的产品差异）。
 */

/** 共享判定结果；比两个 feature 各自的对外状态多一个 `malformed` / `empty` 区分。 */
export type CustomTokenLookupStatus =
  'empty' | 'malformed' | 'checking' | 'no-code' | 'unreadable' | 'ok';

export const TOKEN_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export interface CustomTokenLookup {
  readonly status: CustomTokenLookupStatus;
  readonly address: HexAddress | undefined;
  readonly symbol: string | undefined;
  readonly decimals: number | undefined;
  readonly retry: () => void;
}

/** 纯判定：零地址不必等 RPC 就是 `no-code`；格式不对是 `malformed`。 */
export function customTokenLookupStatus(input: {
  readonly candidate: string | undefined;
  readonly codeLoading: boolean;
  readonly codeError: boolean;
  readonly codeData: string | undefined;
  readonly symbol: string | undefined;
  readonly decimals: number | undefined;
  readonly metadataLoading: boolean;
}): CustomTokenLookupStatus {
  if (input.candidate === undefined || input.candidate.length === 0) return 'empty';
  if (input.candidate.toLowerCase() === ZERO_ADDRESS) return 'no-code';
  if (!TOKEN_ADDRESS_RE.test(input.candidate)) return 'malformed';
  if (input.codeLoading) return 'checking';
  if (input.codeError) return 'unreadable';
  if (input.codeData === undefined || input.codeData === '0x') return 'no-code';
  if (input.symbol !== undefined && input.decimals !== undefined) return 'ok';
  if (input.metadataLoading) return 'checking';
  return 'unreadable';
}

/**
 * 读一个候选地址：bytecode → `symbol()` / `decimals()`。
 *
 * 注意 `address` 只按**格式**过滤，不按「地址簿是否配置」过滤——零地址也要走到
 * bytecode 这一步，才能给出「没有合约」而不是静默无响应（QA D9）。
 */
export function useCustomToken(candidate: string | undefined): CustomTokenLookup {
  const address =
    candidate !== undefined && TOKEN_ADDRESS_RE.test(candidate)
      ? (candidate as HexAddress)
      : undefined;

  const code = useBytecode({ address, query: { enabled: address !== undefined } });
  const contracts = useMemo(
    () =>
      address === undefined
        ? []
        : [
            { address, abi: love20TokenAbi, functionName: 'symbol' as const },
            { address, abi: love20TokenAbi, functionName: 'decimals' as const },
          ],
    [address],
  );
  const metadata = useReadContracts({ contracts, query: { enabled: address !== undefined } });

  const symbolResult = metadata.data?.[0];
  const decimalsResult = metadata.data?.[1];
  const symbol =
    symbolResult?.status === 'success' &&
    typeof symbolResult.result === 'string' &&
    symbolResult.result.length > 0
      ? symbolResult.result
      : undefined;
  const decimals =
    decimalsResult?.status === 'success' && typeof decimalsResult.result === 'number'
      ? decimalsResult.result
      : undefined;

  const status = customTokenLookupStatus({
    candidate,
    codeLoading: address !== undefined && code.isLoading,
    codeError: address !== undefined && code.isError,
    codeData: address !== undefined ? (code.data ?? undefined) : undefined,
    symbol,
    decimals,
    metadataLoading: metadata.isLoading,
  });

  return {
    status,
    address,
    symbol,
    decimals,
    retry: () => {
      // 规范 §5.2：TanStack Query 的 `refetch()` 无视 `enabled: false`。地址格式不对
      // 时两个读都是 disabled，重读只会拿空参数发请求；这个按钮在这种情况下也不该
      // 出现（两个面板只对 `unreadable` 渲染它）。禁用态绝不手动重读。
      if (address === undefined) return;
      void code.refetch();
      void metadata.refetch();
    },
  };
}
