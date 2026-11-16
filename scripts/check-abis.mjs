#!/usr/bin/env node
// ABI/address drift gate (ADR-0002 §3, ADR-0004 §6).
//
// Regenerates every artifact `pnpm sync:anvil` owns and compares it with the committed file. It
// fails when the committed ABI modules, manifest, address book or snapshot disagree with the
// current sibling export. A clean frontend checkout / CI job has no `../anvil/export`, so in that
// case the check skips with an explicit message instead of failing for the wrong reason.
import { existsSync, readFileSync } from 'node:fs';
import {
  ANVIL_EXPORT_DIR,
  buildSyncOutputs,
  manifestContent,
  manifestHeadDrift,
  FRONTEND_MANIFEST_FILE,
  readJson,
} from './lib/anvil-export.mjs';

function firstDifference(expected, actual) {
  const expectedLines = expected.split('\n');
  const actualLines = actual.split('\n');
  const length = Math.max(expectedLines.length, actualLines.length);
  for (let index = 0; index < length; index += 1) {
    if (expectedLines[index] !== actualLines[index]) {
      return {
        line: index + 1,
        expected: expectedLines[index] ?? '(missing)',
        actual: actualLines[index] ?? '(missing)',
      };
    }
  }
  return null;
}

function clip(value) {
  return value.length > 120 ? `${value.slice(0, 117)}...` : value;
}

async function main() {
  if (!existsSync(ANVIL_EXPORT_DIR)) {
    console.log(
      `[abis:check] ${ANVIL_EXPORT_DIR} not found; skipping ABI/address drift check ` +
        '(a clean frontend checkout or CI job has no sibling repos).',
    );
    return;
  }

  const { outputs, manifest } = await buildSyncOutputs();
  const mismatches = [];

  for (const [path, expected] of outputs) {
    if (path === FRONTEND_MANIFEST_FILE) continue;
    if (!existsSync(path)) {
      mismatches.push(`${path}: missing (run \`pnpm sync:anvil\`)`);
      continue;
    }
    const actual = readFileSync(path, 'utf8');
    if (actual === expected) continue;
    const diff = firstDifference(expected, actual);
    mismatches.push(
      `${path}: differs at line ${diff.line}\n` +
        `    committed: ${clip(diff.actual)}\n` +
        `    expected : ${clip(diff.expected)}`,
    );
  }

  if (!existsSync(FRONTEND_MANIFEST_FILE)) {
    mismatches.push(`${FRONTEND_MANIFEST_FILE}: missing (run \`pnpm sync:anvil\`)`);
  } else {
    const committed = readJson(FRONTEND_MANIFEST_FILE, 'manifest');
    const same = manifestContent(committed) === manifestContent(manifest);
    if (!same) {
      const diff = firstDifference(manifestContent(manifest), manifestContent(committed));
      mismatches.push(
        `${FRONTEND_MANIFEST_FILE}: differs at line ${diff.line}\n` +
          `    committed: ${clip(diff.actual)}\n` +
          `    expected : ${clip(diff.expected)}`,
      );
    }
  }

  if (mismatches.length === 0) {
    console.log(
      '[abis:check] ABIs, manifest, address book and airdrop snapshot match ../anvil/export.',
    );
    // Provenance-only drift: a sibling repo gained commits (typically docs/style) after the last
    // `pnpm sync:anvil`. The artifacts are identical, so this must not fail the gate; it is still
    // worth printing, because the manifest's `sources.*.head` is the record of what was built.
    const drift = manifestHeadDrift(readJson(FRONTEND_MANIFEST_FILE, 'manifest'), manifest);
    for (const { repo, committed, expected } of drift) {
      console.warn(
        `[abis:check] note: ${repo} HEAD moved ${committed.slice(0, 8)} → ${expected.slice(0, 8)} ` +
          'with no artifact change; run `pnpm sync:anvil` to refresh provenance.',
      );
    }
    return;
  }

  console.error('[abis:check] FAIL: committed generated files do not match ../anvil/export:');
  for (const mismatch of mismatches) console.error(`  ${mismatch}`);
  console.error('\n  Regenerate and commit: pnpm sync:anvil');
  process.exit(1);
}

main().catch((error) => {
  console.error(`[abis:check] ${error.message}`);
  process.exit(1);
});
