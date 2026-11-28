#!/usr/bin/env node
// ABI/address drift gate (ADR-0002 §3, ADR-0004 §6).
//
// Checks the frontend manifest even in a frontend-only checkout. With the deployment export
// available, also regenerates every artifact `pnpm sync:anvil` owns and compares the bytes.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { relative, sep } from 'node:path';
import {
  ANVIL_EXPORT_DIR,
  FRONTEND_MANIFEST_FILE,
  ROOT,
  assertManifestSources,
  buildSyncOutputs,
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
  const staged = process.argv.includes('--staged');
  const pathInRepo = relative(ROOT, FRONTEND_MANIFEST_FILE).split(sep).join('/');
  const text = staged
    ? execFileSync('git', ['show', `:${pathInRepo}`], { cwd: ROOT, encoding: 'utf8' })
    : readFileSync(FRONTEND_MANIFEST_FILE, 'utf8');
  const drafts = assertManifestSources(JSON.parse(text), {
    allowWorkingTree: !staged && process.argv.includes('--allow-working-tree'),
  });
  if (drafts.length > 0) {
    console.log(`[abis:check] working-tree deployment sources: ${drafts.join(', ')}.`);
  } else {
    console.log('[abis:check] ABI manifest records committed deployment sources.');
  }
  if (staged || process.argv.includes('--sources-only')) return;

  if (!existsSync(ANVIL_EXPORT_DIR)) {
    console.log(`[abis:check] ${ANVIL_EXPORT_DIR} not found; skipping export comparison.`);
    return;
  }

  const { outputs } = await buildSyncOutputs();
  const mismatches = [];

  for (const [path, expected] of outputs) {
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

  if (mismatches.length === 0) {
    console.log(
      `[abis:check] ABIs, manifest, address book and snapshot match ${ANVIL_EXPORT_DIR}.`,
    );
    return;
  }

  console.error(`[abis:check] FAIL: generated files do not match ${ANVIL_EXPORT_DIR}:`);
  for (const mismatch of mismatches) console.error(`  ${mismatch}`);
  console.error('\n  Regenerate and commit: pnpm sync:anvil');
  process.exit(1);
}

main().catch((error) => {
  console.error(`[abis:check] ${error.message}`);
  process.exit(1);
});
