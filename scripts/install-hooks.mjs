#!/usr/bin/env node
// Points this clone's git hooks at the committed `.githooks/` directory.
//
// Why a script instead of husky: the repo has a no-new-dependencies rule (README
// «Stack»), and `core.hooksPath` is per-clone git config, so it cannot be committed.
// Running `pnpm hooks:install` once after cloning is the whole ceremony; the hook
// itself (`.githooks/pre-commit`) is versioned with the code it gates.
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOOKS_DIR = '.githooks';
const hookFile = resolve(root, HOOKS_DIR, 'pre-commit');

const git = (args) =>
  execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

function fail(message) {
  console.error(`[hooks] ${message}`);
  process.exit(1);
}

try {
  if (git(['rev-parse', '--is-inside-work-tree']) !== 'true') {
    fail(`${root} is not inside a git work tree.`);
  }
} catch {
  fail(`cannot run git in ${root}; install git or run this from a clone.`);
}

if (!existsSync(hookFile)) {
  fail(`${HOOKS_DIR}/pre-commit is missing — this checkout is incomplete.`);
}
const contents = readFileSync(hookFile, 'utf8');
if (!contents.startsWith('#!/bin/sh')) {
  fail(`${HOOKS_DIR}/pre-commit does not start with a #!/bin/sh shebang.`);
}

chmodSync(hookFile, 0o755);

let previous = '';
try {
  previous = git(['config', '--local', '--get', 'core.hooksPath']);
} catch {
  previous = '';
}
git(['config', '--local', 'core.hooksPath', HOOKS_DIR]);
const configured = git(['config', '--local', '--get', 'core.hooksPath']);

if (configured !== HOOKS_DIR) {
  fail(`core.hooksPath is "${configured}" after writing; expected "${HOOKS_DIR}".`);
}

console.log(`[hooks] core.hooksPath = ${configured}`);
if (previous !== '' && previous !== HOOKS_DIR) {
  console.log(`[hooks] replaced previous core.hooksPath = ${previous}`);
}
console.log('[hooks] pre-commit gate: pnpm check (typecheck + lint + unit tests)');
console.log('[hooks] skip once with SKIP_PRE_COMMIT=1; docs-only commits skip automatically.');
