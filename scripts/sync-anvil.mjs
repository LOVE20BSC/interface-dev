#!/usr/bin/env node
// One-command ABI/address sync from the sibling anvil export.
//
// The address book always follows the deployment, never the reverse: run
// `make -C ../anvil bootstrap` (fresh chain, nonce 0), then `pnpm sync:anvil`. This writes the
// frontend deployment book, the generated `as const` ABI modules + manifest, and the merkle
// snapshot. It is idempotent: a second run reports "unchanged" and leaves every mtime alone.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  ANVIL_EXPORT_DIR,
  buildSyncOutputs,
  FRONTEND_ABIS_DIR,
  FRONTEND_AIRDROP_FILE,
  FRONTEND_DEPLOYMENT_FILE,
  FRONTEND_MANIFEST_FILE,
  ROOT,
} from './lib/anvil-export.mjs';

function relativePath(path) {
  return path.startsWith(`${ROOT}/`) ? path.slice(ROOT.length + 1) : path;
}

function summary(path, before, after) {
  if (before === after) return 'unchanged';
  if (before === null) return 'created';
  const beforeLines = before.split('\n').length;
  const afterLines = after.split('\n').length;
  return `updated (${beforeLines} -> ${afterLines} lines)`;
}

function addressDiff(beforeText, afterText) {
  if (beforeText === null) return [];
  let before;
  let after;
  try {
    before = JSON.parse(beforeText).addresses;
    after = JSON.parse(afterText).addresses;
  } catch {
    return [];
  }
  return Object.keys(after ?? {}).flatMap((key) =>
    before?.[key] === after?.[key] ? [] : [`${key}: ${before?.[key] ?? '(none)'} -> ${after[key]}`],
  );
}

async function main() {
  if (!existsSync(ANVIL_EXPORT_DIR)) {
    console.error(
      `[sync-anvil] ${ANVIL_EXPORT_DIR} does not exist.\n` +
        '  Run `make -C ../anvil bootstrap` first (fresh chain, nonce 0), then re-run this command.',
    );
    process.exit(1);
  }

  const { outputs, root, exportData } = await buildSyncOutputs();
  const before = new Map();
  for (const path of outputs.keys()) {
    before.set(path, existsSync(path) ? readFileSync(path, 'utf8') : null);
  }

  console.log(
    `[sync-anvil] ${exportData.network} chain ${exportData.chainId}, deploy block ${exportData.deployBlock}`,
  );
  console.log(`[sync-anvil] merkle root copied: ${root}`);
  console.log(
    `[sync-anvil] airdrop: ${exportData.snapshot.entries.length} entries, totalShare ${exportData.snapshot.totalShare}`,
  );

  let changed = 0;
  for (const [path, after] of outputs) {
    const pathBefore = before.get(path);
    const status = summary(path, pathBefore, after);
    if (status !== 'unchanged') changed += 1;
    console.log(`  ${status.padEnd(24)} ${relativePath(path)}`);
    if (path === FRONTEND_DEPLOYMENT_FILE) {
      for (const line of addressDiff(pathBefore, after)) console.log(`    ${line}`);
    }
    if (status !== 'unchanged') {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, after, 'utf8');
    }
  }

  console.log(
    `[sync-anvil] ${changed === 0 ? 'up to date' : `${changed} file(s) written`}; ` +
      `${relativePath(FRONTEND_ABIS_DIR)} + ${relativePath(FRONTEND_MANIFEST_FILE)} + ${relativePath(FRONTEND_AIRDROP_FILE)}`,
  );
}

main().catch((error) => {
  console.error(`[sync-anvil] ${error.message}`);
  process.exit(1);
});
