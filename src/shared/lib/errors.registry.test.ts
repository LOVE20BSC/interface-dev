import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTRACT_ERROR_CATALOG, CONTRACT_ERROR_MESSAGES } from '@/config/errors.generated';
import { copy } from '@/shared/config/copy';
import { getContractErrorMessage } from './errors';

/**
 * Guards the committed snapshot in `errors.generated.ts` against the protocol
 * error registry it is generated from. A clean frontend checkout has no sibling
 * `matt-gov` repo, so the whole suite skips there; whenever the registry is
 * present it is the source of truth and drift must fail here instead of
 * silently rendering the generic fallback sentence.
 */

/** Same override the generator accepts, so tests and `pnpm gen:errors` agree. */
const REGISTRY_PATH =
  process.env.LOVE20_ERRORS_JSON ?? resolve(process.cwd(), '../matt-gov/registry/errors.json');

const registryAvailable = existsSync(REGISTRY_PATH);

/** The generator's own placeholder; a real sentence must never equal it. */
const GENERATED_PLACEHOLDER = '操作没有完成，请稍后重试。';

interface RegistryError {
  readonly signature: string;
  readonly selector: string;
}

function readRegistry(): readonly RegistryError[] {
  if (!registryAvailable) return [];
  const parsed: unknown = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
  const errors = (parsed as { errors?: unknown }).errors;
  if (!Array.isArray(errors)) throw new Error(`${REGISTRY_PATH} has no "errors" array`);
  return errors as readonly RegistryError[];
}

function errorName(signature: string): string {
  return signature.replace(/\(.*$/, '');
}

describe.skipIf(!registryAvailable)('generated error catalog vs protocol registry', () => {
  const registry = readRegistry();
  const names = [...new Set(registry.map((error) => errorName(error.signature)))].sort();
  const selectors = [...new Set(registry.map((error) => error.selector.toLowerCase()))].sort();

  it('declares one Chinese sentence for every registry error name', () => {
    expect(names.length).toBeGreaterThan(0);
    const byName = new Map(CONTRACT_ERROR_CATALOG.map((entry) => [entry.name, entry]));
    const missing = names.filter((name) => {
      const entry = byName.get(name);
      return entry === undefined || entry.message.trim().length === 0;
    });
    expect(missing, `names without Chinese copy: ${missing.join(', ')}`).toEqual([]);
    for (const name of names) {
      expect(byName.get(name)?.message, name).toMatch(/[\u4e00-\u9fff]/);
    }
  });

  it('resolves every registry selector to its specific sentence, never the fallback', () => {
    expect(selectors).toHaveLength(Object.keys(CONTRACT_ERROR_MESSAGES).length);
    for (const selector of selectors) {
      const mapped = getContractErrorMessage(selector);
      expect(mapped, selector).not.toBeNull();
      expect(mapped, selector).not.toBe(copy.errors.contractGeneric);
      expect(mapped, selector).not.toBe(GENERATED_PLACEHOLDER);
      expect(mapped, selector).toBe(CONTRACT_ERROR_MESSAGES[selector]);
    }
  });

  it('matches generation from this exact registry, revision and copy', () => {
    expect(
      execFileSync(process.execPath, ['scripts/gen-errors.mjs', '--check'], { encoding: 'utf8' }),
    ).toContain('selector(s) and registry revision match');
  });
});
