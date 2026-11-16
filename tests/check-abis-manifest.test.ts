import { describe, expect, it } from 'vitest';
import { manifestContent, manifestHeadDrift } from '../scripts/lib/anvil-export.mjs';

/**
 * The drift gate compares generated artifacts. Sibling HEAD SHAs are provenance: a docs-only
 * commit in `core` must not fail `pnpm abis:check`, because no ABI, address or snapshot changed.
 * These cases pin that split so the gate cannot silently become content-blind either.
 */
function manifest(head: string, stakeEntries = 75) {
  return {
    schemaVersion: 1,
    generatedBy: 'pnpm sync:anvil',
    anvilExport: { profile: 'anvil31337_dev', chainId: 31337, deployBlock: 34, exportedAt: 'x' },
    sources: {
      core: { head, path: '../core', abis: { Stake: stakeEntries } },
    },
    artifacts: { modules: 13, abiEntries: 340 },
  };
}

describe('manifest drift comparison', () => {
  it('ignores sibling HEAD and export timestamp', () => {
    const committed = manifest('a'.repeat(40));
    const expected = { ...manifest('b'.repeat(40)) };
    expected.anvilExport.exportedAt = 'y';

    expect(manifestContent(committed)).toBe(manifestContent(expected));
    expect(manifestHeadDrift(committed, expected)).toEqual([
      { repo: 'core', committed: 'a'.repeat(40), expected: 'b'.repeat(40) },
    ]);
  });

  it('still sees a real artifact difference', () => {
    const committed = manifest('a'.repeat(40), 75);
    const expected = manifest('a'.repeat(40), 76);

    expect(manifestContent(committed)).not.toBe(manifestContent(expected));
    expect(manifestHeadDrift(committed, expected)).toEqual([]);
  });
});
