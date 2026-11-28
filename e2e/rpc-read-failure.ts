import type { Page, Route } from '@playwright/test';
import { decodeFunctionData, decodeFunctionResult, encodeFunctionResult, parseAbi } from 'viem';
import { RPC_URL } from './wallet-stub';

/**
 * 降级读注入：按 ABI 选择器让指定的合约读失败。
 *
 * 页面的读全部由 viem client 的 multicall 批处理发出（wagmi `createConfig` 的
 * `batch` 默认 `{ multicall: true }`，代码里的 `http(...{ batch: { batchSize, wait } })`
 * 只影响 JSON-RPC 打包），所以 `eth_call` 的 data 是 Multicall3 的 `aggregate3`
 * 选择器，目标选择器只出现在它内层的 `callData` 里。直接在 JSON-RPC 层把整条
 * `eth_call` 改成 error 会把同一批里的目录/发送方余额等无关读一起打掉；正确做法
 * 是把 `aggregate3` 的**响应**里只属于目标调用的那一项改成 `success=false`，
 * 其余子调用原样保留。命中不到 multicall 时（例如回执的 imperative read 走单条
 * `eth_call`）再把整条改成 JSON-RPC error。返回的函数用于解除注入以验证自愈。
 */
const AGGREGATE3_SELECTOR = '0x82ad56cb';

/** The subset of Multicall3 needed to rewrite one failed sub-call. */
const MULTICALL3_ABI = parseAbi([
  'struct Call3 { address target; bool allowFailure; bytes callData; }',
  'struct Result3 { bool success; bytes returnData; }',
  'function aggregate3(Call3[] calls) payable returns (Result3[] results)',
]);

/** Matches the app's endpoint with or without viem's normalized trailing slash. */
export const RPC_URL_PATTERN = new RegExp(
  `^${RPC_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(/.*)?$`,
);

export async function failReadsWithSelector(
  page: Page,
  selector: string,
): Promise<() => Promise<void>> {
  const target = selector.toLowerCase();
  const handler = async (route: Route): Promise<void> => {
    const raw = route.request().postData() ?? '';
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      await route.continue();
      return;
    }
    type RpcRequest = { id?: unknown; method?: unknown; params?: unknown };
    const items: RpcRequest[] = Array.isArray(payload)
      ? (payload as RpcRequest[])
      : [payload as RpcRequest];
    /** JSON-RPC id → indexes inside `aggregate3` whose sub-call must fail. */
    const aggregateTargets = new Map<number, number[]>();
    /** JSON-RPC ids whose whole `eth_call` must fail (no multicall wrapper). */
    const directIds = new Set<number>();
    for (const item of items) {
      if (item.method !== 'eth_call' || typeof item.id !== 'number') continue;
      const params = (item.params ?? []) as { data?: unknown }[];
      const data = typeof params[0]?.data === 'string' ? params[0].data.toLowerCase() : '';
      if (data.startsWith(target)) {
        directIds.add(item.id);
        continue;
      }
      if (!data.startsWith(AGGREGATE3_SELECTOR)) continue;
      try {
        const decoded = decodeFunctionData({
          abi: MULTICALL3_ABI,
          data: data as `0x${string}`,
        });
        const calls = decoded.args[0] as readonly { callData: `0x${string}` }[];
        const indexes: number[] = [];
        calls.forEach((call, index) => {
          if (call.callData.toLowerCase().startsWith(target)) indexes.push(index);
        });
        if (indexes.length > 0) aggregateTargets.set(item.id, indexes);
      } catch {
        // Another contract answering with the same 4-byte prefix: leave it alone.
      }
    }
    if (aggregateTargets.size === 0 && directIds.size === 0) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const body = (await response.json()) as unknown;
    const rewrite = (entry: unknown): unknown => {
      const record = entry as { id?: unknown; result?: unknown };
      if (typeof record.id !== 'number') return entry;
      if (directIds.has(record.id)) {
        return {
          jsonrpc: '2.0',
          id: record.id,
          error: { code: -32000, message: 'e2e injected read failure' },
        };
      }
      const indexes = aggregateTargets.get(record.id);
      if (indexes === undefined || typeof record.result !== 'string') return entry;
      const results = [
        ...(decodeFunctionResult({
          abi: MULTICALL3_ABI,
          functionName: 'aggregate3',
          data: record.result as `0x${string}`,
        }) as readonly { success: boolean; returnData: `0x${string}` }[]),
      ];
      for (const index of indexes) {
        results[index] = { success: false, returnData: '0x' };
      }
      return {
        ...record,
        result: encodeFunctionResult({
          abi: MULTICALL3_ABI,
          functionName: 'aggregate3',
          result: results,
        }),
      };
    };
    const next = Array.isArray(body) ? body.map(rewrite) : rewrite(body);
    await route.fulfill({ response, json: next });
  };
  await page.route(RPC_URL_PATTERN, handler);
  return async () => {
    await page.unroute(RPC_URL_PATTERN, handler);
  };
}
