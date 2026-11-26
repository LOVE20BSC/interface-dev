import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 前端 ABI / 地址簿 与已部署产物的**一致性守门**（2026-11-27）。
 *
 * 起因：兄弟仓的 `Launch.launchToken` 从 `bytes[]` 改成了 `bytes`（破坏性接口变更），
 * 前端 ABI 与链上合约对不上。这个漂移是靠**跑 40 分钟全量 e2e** 才暴露的：e2e 的
 * fixture 调 `cast send ... launchToken(...,bytes)` 直接 revert。而它 1 秒就能查出来：
 *
 *   前端 ABI 里用到的每个 selector  ⊆  已部署产物的 selector
 *
 * 这个测试把「前端 ABI 与合约不匹配」从 e2e 级别降到 `pnpm test` 级别。
 *
 * 干净检出没有兄弟 anvil 仓，整组跳过；有 anvil 仓时它是唯一真相，漂移必须在这里红。
 */

const ROOT = process.cwd();
const ANVIL_EXPORT = resolve(ROOT, '../anvil/export');
const EXPORT_ABIS = resolve(ANVIL_EXPORT, 'abis');
const MANIFEST_PATH = resolve(ROOT, 'src/config/abis/manifest.json');
const NETWORK_PATH = resolve(ROOT, 'src/config/network/anvil31337_dev/network.json');

const siblingAvailable = existsSync(EXPORT_ABIS);

interface AbiEntry {
  readonly type?: string;
  readonly name?: string;
  readonly inputs?: readonly {
    readonly type?: string;
    readonly components?: readonly AbiEntryInput[];
  }[];
}
interface AbiEntryInput {
  readonly type?: string;
  readonly components?: readonly AbiEntryInput[];
}

interface Manifest {
  readonly modules: Record<string, { readonly file: string }>;
}

function readManifest(): Manifest {
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Manifest;
}

/**
 * Canonical Solidity signature: tuples expand to their component list, because
 * that is what the selector is computed from (`(address,uint256)` not `tuple`).
 */
function canonicalType(input: AbiEntryInput): string {
  if (input.type === 'tuple' && input.components !== undefined) {
    return `(${input.components.map(canonicalType).join(',')})`;
  }
  if (input.type === 'tuple[]' && input.components !== undefined) {
    return `(${input.components.map(canonicalType).join(',')})[]`;
  }
  return input.type ?? '';
}

function signatureOf(entry: AbiEntry): string | undefined {
  if (entry.type !== 'function' && entry.type !== 'event' && entry.type !== 'error')
    return undefined;
  if (entry.name === undefined) return undefined;
  const args = (entry.inputs ?? []).map(canonicalType);
  return `${entry.name}(${args.join(',')})`;
}

function selectorsOf(abi: readonly AbiEntry[]): Set<string> {
  const out = new Set<string>();
  for (const entry of abi) {
    const signature = signatureOf(entry);
    if (signature !== undefined) out.add(signature);
  }
  return out;
}

function readExportAbi(contract: string): readonly AbiEntry[] | undefined {
  const path = resolve(EXPORT_ABIS, `${contract}.json`);
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, 'utf8')) as readonly AbiEntry[];
}

function readNetwork(): { addresses: Record<string, string> } {
  return JSON.parse(readFileSync(NETWORK_PATH, 'utf8')) as { addresses: Record<string, string> };
}

/**
 * All generated ABI modules, loaded eagerly. `import.meta.glob` is Vite-native,
 * so the test picks up a newly generated module without another hand-kept list
 * (a static import map would drift the moment `pnpm sync:anvil` adds a contract).
 */
const MODULES = import.meta.glob('/src/config/abis/*.ts', { eager: true }) as Record<
  string,
  Record<string, unknown>
>;

/** Return the single ABI array exported by a generated module file. */
function loadFrontendAbi(file: string): readonly AbiEntry[] {
  const key = `/src/${file.replace(/^src\//, '').replace(/\\/g, '/')}`;
  const module = MODULES[key];
  if (module === undefined) throw new Error(`${file}: 没有被 import.meta.glob 收录`);
  const arrays = Object.values(module).filter((value): value is AbiEntry[] => Array.isArray(value));
  if (arrays.length !== 1) {
    throw new Error(`${file}: expected exactly one ABI array export, found ${arrays.length}`);
  }
  return arrays[0] ?? [];
}

describe.skipIf(!siblingAvailable)('ABI/地址簿 与已部署产物一致', () => {
  it('每个前端 ABI 模块的 selector 都存在于已部署合约的 ABI 里', async () => {
    const { modules } = readManifest();
    const problems: string[] = [];

    for (const [contract, { file }] of Object.entries(modules)) {
      const deployed = readExportAbi(contract);
      if (deployed === undefined) {
        problems.push(`${contract}: 兄弟仓导出里没有 abis/${contract}.json`);
        continue;
      }
      const deployedSelectors = selectorsOf(deployed);
      const frontendSelectors = selectorsOf(loadFrontendAbi(file));
      const missing = [...frontendSelectors].filter((selector) => !deployedSelectors.has(selector));
      for (const selector of missing) {
        problems.push(`${contract} (${file}): 前端有、已部署合约没有的 selector → ${selector}`);
      }
    }

    expect(problems, problems.join('\n')).toEqual([]);
  });

  it('地址簿里的每个地址都出现在部署导出里', () => {
    if (!existsSync(resolve(ANVIL_EXPORT, 'deployments/anvil31337_dev.json'))) {
      // 导出目录存在但缺部署文件：这是异常，不是跳过的情形。
      throw new Error('anvil/export/deployments/anvil31337_dev.json is missing');
    }
    const deployment = JSON.parse(
      readFileSync(resolve(ANVIL_EXPORT, 'deployments/anvil31337_dev.json'), 'utf8'),
    ) as { addresses?: Record<string, string>; contracts?: Record<string, { address?: string }> };

    const deployed = new Set(
      [
        ...Object.values(deployment.addresses ?? {}),
        ...Object.values(deployment.contracts ?? {}).map((entry) => entry.address ?? ''),
      ]
        .filter((address) => /^0x[0-9a-fA-F]{40}$/.test(address))
        .map((address) => address.toLowerCase()),
    );

    const { addresses } = readNetwork();
    const problems: string[] = [];
    for (const [key, address] of Object.entries(addresses)) {
      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) continue;
      if (address === '0x0000000000000000000000000000000000000000') continue;
      if (!deployed.has(address.toLowerCase())) {
        problems.push(`network.json addresses.${key}=${address} 不在 anvil 部署导出里`);
      }
    }

    expect(problems, problems.join('\n')).toEqual([]);
  });

  it('manifest 里的模块清单覆盖全部生成的前端 ABI 文件', () => {
    const { modules } = readManifest();
    for (const [contract, { file }] of Object.entries(modules)) {
      expect(existsSync(resolve(ROOT, file)), `${contract} → ${file} 不存在`).toBe(true);
      // 文件必须真实可解析，且导出唯一一个 ABI 数组（防止手改坏文件后测试假绿）。
      const abi = loadFrontendAbi(file);
      expect(abi.length, `${contract} (${file}) 的 ABI 是空的`).toBeGreaterThan(0);
    }
  });
});
