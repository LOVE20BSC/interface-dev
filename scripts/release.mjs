#!/usr/bin/env node
// Fast-forward release helper for the three-repository model (ADR-0002 §4).
//
//   pnpm release:test   -> LOVE20BSC/interface-test (git remote "test")
//   pnpm release:prod   -> LOVE20BSC/interface      (git remote "prod")
//
// The command is deliberately write-free: it never commits, tags, amends,
// force-pushes, or writes a log file. Preflight order:
//
//   1. working tree clean, including untracked files
//   2. CI green for this exact SHA (or a loud RELEASE_SKIP_CI_CHECK=1)
//   3. target main is an ancestor of HEAD (fetch first; fast-forward only)
//   4. print SHA / target / commit summary and ask for confirmation
//   5. git push <remote> HEAD:main
//
// Remote resolution, so releases work before the GitHub repositories exist:
//   1. RELEASE_REMOTE_URL_<TEST|PROD>  direct URL or path (highest precedence)
//   2. RELEASE_REMOTE_<TEST|PROD>      configured remote name, or a URL/path
//   3. a git remote literally named "test" / "prod"
// A missing remote is an error, never a silent no-op.
//
// RELEASE_YES=1 skips only the final confirmation. RELEASE_SKIP_CI_CHECK=1
// skips only the CI gate (with a prominent warning). --dry-run runs every
// preflight and prints the plan, never pushes and never prompts; it still
// aborts on a dirty tree, a non-fast-forward, or an unreadable target.

import { spawnSync } from 'node:child_process';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';

const TARGETS = Object.freeze({
  test: Object.freeze({ repo: 'LOVE20BSC/interface-test', remote: 'test' }),
  prod: Object.freeze({ repo: 'LOVE20BSC/interface', remote: 'prod' }),
});

const EXIT = Object.freeze({
  OK: 0,
  INTERNAL: 1,
  USAGE: 2,
  DIRTY: 3,
  CI: 4,
  NOT_FAST_FORWARD: 5,
  REMOTE: 6,
  FETCH: 7,
  CONFIRM: 8,
  PUSH: 9,
});

const CI_BAD_CONCLUSIONS = new Set([
  'failure',
  'cancelled',
  'timed_out',
  'startup_failure',
  'stale',
]);

// Build outputs and local research inputs are ignored by git and by design;
// they never reach a commit, so they must not block a release.
const LOCAL_ONLY_PREFIXES = Object.freeze(['.research/', 'dist/']);

const MAX_BUFFER = 10 * 1024 * 1024;

// Set once main() has parsed its arguments, so `--help` also works outside a
// repository checkout.
let repoRoot = '';

class ReleaseError extends Error {
  constructor(code, message, hints = []) {
    super(String(message));
    this.name = 'ReleaseError';
    this.code = code;
    this.hints = hints;
  }
}

function findRepoRoot() {
  const probe = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  if (probe.error !== undefined || probe.status !== 0) {
    fail(EXIT.INTERNAL, 'Not inside a git working tree.');
  }
  return probe.stdout.trim();
}

// Throw instead of process.exit(): exiting immediately can truncate buffered
// stdout when the command runs with piped output (CI logs, smoke tests).
function fail(code, message, hints = []) {
  throw new ReleaseError(code, message, hints);
}

function reportFailure(error) {
  console.error('');
  for (const line of String(error.message).split('\n')) {
    console.error(`[release] ERROR: ${line}`);
  }
  for (const hint of error.hints) {
    if (hint !== '') console.error(`[release]   ${hint}`);
  }
  console.error(`[release] Aborted (exit ${error.code}).`);
  console.error('');
}

function warn(title, details = []) {
  const rule = '!'.repeat(68);
  console.error('');
  console.error(`[release] ${rule}`);
  console.error(`[release] WARNING: ${title}`);
  for (const detail of details) {
    if (detail !== '') console.error(`[release]   ${detail}`);
  }
  console.error(`[release] ${rule}`);
  console.error('');
}

function firstLines(text, count) {
  return String(text ?? '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .slice(0, count)
    .join('\n');
}

function short(sha) {
  return String(sha).slice(0, 7);
}

function readEnv(name) {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

function isInteractive() {
  return Boolean(input.isTTY);
}

function git(args, options = {}) {
  const { allowFailure = false, timeoutMs = 120_000 } = options;
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: MAX_BUFFER,
    timeout: timeoutMs,
  });
  const stdout = (result.stdout ?? '').trimEnd();
  const stderr = (result.stderr ?? '').trimEnd();
  if (result.error !== undefined) {
    if (!allowFailure) {
      fail(EXIT.INTERNAL, `git ${args.join(' ')} could not run: ${result.error.message}`);
    }
    return { ok: false, status: result.status, stdout, stderr, error: result.error.message };
  }
  if (result.status !== 0 && !allowFailure) {
    fail(
      EXIT.INTERNAL,
      `git ${args.join(' ')} failed (exit ${result.status}).`,
      [firstLines(stderr, 8)].filter(Boolean),
    );
  }
  return { ok: result.status === 0, status: result.status, stdout, stderr, error: undefined };
}

function usageText() {
  return [
    'Usage: node scripts/release.mjs --target <test|prod> [--dry-run]',
    '',
    '  --dry-run  run every preflight and print the plan, but never push or prompt.',
    '',
    'Targets:',
    '  test  LOVE20BSC/interface-test  (default git remote "test")',
    '  prod  LOVE20BSC/interface       (default git remote "prod")',
    '',
    'Overrides:',
    '  RELEASE_REMOTE_TEST / RELEASE_REMOTE_PROD          remote name or URL/path',
    '  RELEASE_REMOTE_URL_TEST / RELEASE_REMOTE_URL_PROD  direct URL/path (wins)',
    '  RELEASE_SKIP_CI_CHECK=1  skip the CI-green gate (prints a loud warning)',
    '  RELEASE_YES=1            skip the final interactive confirmation',
    '',
    'A missing remote is an error. Configuration wins in this order:',
    '  RELEASE_REMOTE_URL_<TARGET> > RELEASE_REMOTE_<TARGET> > remote "test"/"prod".',
    '',
    'Exit codes:',
    '  0 success   1 internal error   2 usage   3 dirty tree',
    '  4 CI not green or unverified   5 not fast-forward   6 remote not configured',
    '  7 fetch failed   8 confirmation refused/unavailable   9 push failed',
    '',
    'The command writes no files: no log, no commit, no tag, no amend, no force.',
  ].join('\n');
}

function parseArgs(argv) {
  let target;
  let dryRun = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--target') {
      target = argv[index + 1];
      index += 1;
      if (target === undefined || target.startsWith('-')) {
        fail(EXIT.USAGE, '--target requires a value (test or prod).', [
          'Run with --help for usage.',
        ]);
      }
    } else if (arg.startsWith('--target=')) {
      target = arg.slice('--target='.length);
    } else if (arg === '--help' || arg === '-h') {
      console.log(usageText());
      return null;
    } else {
      fail(EXIT.USAGE, `Unknown argument: ${arg}`, ['Run with --help for usage.']);
    }
  }
  if (target === undefined || target.length === 0) {
    fail(EXIT.USAGE, 'Missing --target.', ['Expected --target test or --target prod.']);
  }
  if (!Object.hasOwn(TARGETS, target)) {
    fail(EXIT.USAGE, `Unknown target "${target}".`, ['Expected "test" or "prod".']);
  }
  return { target, dryRun };
}

function resolveHead() {
  const head = git(['rev-parse', '--verify', 'HEAD'], { allowFailure: true });
  if (!head.ok) {
    fail(EXIT.INTERNAL, 'HEAD does not point at a commit; nothing can be released.');
  }
  return head.stdout.trim();
}

function isLocalOnly(path) {
  const normalized = path.replace(/^"|"$/g, '');
  return LOCAL_ONLY_PREFIXES.some(
    (prefix) => normalized === prefix.slice(0, -1) || normalized.startsWith(prefix),
  );
}

function assertCleanWorktree() {
  const status = git([
    'status',
    '--porcelain=v1',
    '--untracked-files=all',
    '--ignore-submodules=none',
  ]);
  const entries = status.stdout
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
  const blocking = entries.filter((line) => {
    const path = line.slice(3).split(' -> ').pop() ?? '';
    return !isLocalOnly(path);
  });
  if (blocking.length > 0) {
    fail(EXIT.DIRTY, 'Working tree is not clean (tracked changes or untracked files).', [
      'Release only committed work: CI must have run on exactly this commit.',
      'Commit, stash, or remove the following, then retry:',
      ...blocking.slice(0, 20).map((line) => `  ${line}`),
      ...(blocking.length > 20 ? [`  ... and ${blocking.length - 20} more`] : []),
      'Ignored paths (.research/, dist/, build outputs) do not block a release.',
    ]);
  }
  console.log('[release] 1/4 working tree clean (tracked + untracked, ignored outputs excluded).');
}

function formatRuns(runs) {
  return runs
    .map(
      (run) =>
        `- ${run.workflowName ?? '(unnamed workflow)'}: ${run.status ?? '?'} / ` +
        `${run.conclusion ?? 'pending'}${run.url ? ` ${run.url}` : ''}`,
    )
    .join('\n');
}

function queryCi(sha) {
  const version = spawnSync('gh', ['--version'], { encoding: 'utf8', timeout: 10_000 });
  if (version.error !== undefined || version.status !== 0) {
    return {
      state: 'unavailable',
      reason: version.error?.message ?? 'gh is not installed',
    };
  }
  const result = spawnSync(
    'gh',
    [
      'run',
      'list',
      '--commit',
      sha,
      '--limit',
      '100',
      '--json',
      'workflowName,status,conclusion,url,headSha',
    ],
    { cwd: repoRoot, encoding: 'utf8', maxBuffer: MAX_BUFFER, timeout: 30_000 },
  );
  if (result.error !== undefined || result.status !== 0) {
    const reason = firstLines(result.error?.message ?? result.stderr ?? result.stdout, 2);
    return { state: 'unavailable', reason: `gh run list failed: ${reason || 'unknown error'}` };
  }
  let runs;
  try {
    runs = JSON.parse(result.stdout);
  } catch {
    return { state: 'unavailable', reason: 'gh run list returned invalid JSON.' };
  }
  if (!Array.isArray(runs)) {
    return { state: 'unavailable', reason: 'gh run list returned an unexpected payload.' };
  }
  const forSha = runs.filter((run) => run.headSha === undefined || run.headSha === sha);
  if (forSha.length === 0) {
    return {
      state: 'missing',
      message: `No GitHub Actions run found for ${sha}; CI cannot be proven green.`,
      hints: [
        'Push the commit to LOVE20BSC/interface-dev, wait for CI, then retry.',
        'To bypass deliberately: RELEASE_SKIP_CI_CHECK=1 (loud warning).',
      ],
    };
  }
  const failed = forSha.filter((run) => CI_BAD_CONCLUSIONS.has(run.conclusion));
  if (failed.length > 0) {
    return {
      state: 'failed',
      message: `CI is red for ${sha}:\n${formatRuns(failed)}`,
      hints: ['Fix CI and commit the fix; a release must point at a green commit.'],
    };
  }
  const pending = forSha.filter((run) => run.status !== 'completed');
  if (pending.length > 0) {
    return {
      state: 'pending',
      message: `CI is still running for ${sha}:\n${formatRuns(pending)}`,
      hints: ['Wait for those runs to finish, then retry.'],
    };
  }
  const successful = forSha.filter((run) => run.conclusion === 'success');
  if (successful.length === 0) {
    return {
      state: 'failed',
      message: `No successful GitHub Actions run for ${sha}:\n${formatRuns(forSha)}`,
      hints: [
        'Skipped/cancelled runs are not proof that CI passed.',
        'Re-run CI for this commit, or use RELEASE_SKIP_CI_CHECK=1 deliberately.',
      ],
    };
  }
  return { state: 'green', runs: successful };
}

async function askYesNo(question) {
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(`${question} [y/N] `);
    return /^(y|yes)$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

async function assertCiGreen(sha, dryRun) {
  if (readEnv('RELEASE_SKIP_CI_CHECK') === '1') {
    warn('CI green gate skipped by RELEASE_SKIP_CI_CHECK=1.', [
      'This commit is being released without proof that CI passed.',
      'CI evidence must come from the same SHA (ADR-0002 §4).',
    ]);
    console.log('[release] 2/4 CI check skipped on purpose.');
    return;
  }

  const ci = queryCi(sha);
  if (ci.state === 'green') {
    console.log(`[release] 2/4 CI green for ${short(sha)} (${ci.runs.length} successful run(s)).`);
    return;
  }
  if (ci.state !== 'unavailable') {
    fail(EXIT.CI, ci.message, ci.hints);
  }

  warn('CI status could not be verified.', [
    ci.reason,
    'The CI-green requirement is not proven for this SHA.',
  ]);
  if (dryRun) {
    console.log('[release] 2/4 CI unverified — dry run continues without it.');
    return;
  }
  if (!isInteractive()) {
    fail(EXIT.CI, 'CI status could not be verified and stdin is not interactive.', [
      'Re-run in a terminal, install/authenticate gh, or set RELEASE_SKIP_CI_CHECK=1.',
    ]);
  }
  const proceed = await askYesNo('Continue without verified CI?');
  if (!proceed) {
    fail(EXIT.CI, 'Aborted: CI status could not be verified.');
  }
}

function listRemotes() {
  return git(['remote'])
    .stdout.split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function looksLikeRemote(value) {
  return (
    /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ||
    /^[^\s/]+@[^\s:]+:/.test(value) ||
    value.startsWith('/') ||
    value.startsWith('./') ||
    value.startsWith('../')
  );
}

function resolveRemote(targetKey, target) {
  const suffix = targetKey.toUpperCase();
  const remotes = listRemotes();
  const urlOverride = readEnv(`RELEASE_REMOTE_URL_${suffix}`);
  const namedOverride = readEnv(`RELEASE_REMOTE_${suffix}`);

  if (urlOverride !== '') {
    return { arg: urlOverride, label: urlOverride, source: `RELEASE_REMOTE_URL_${suffix}` };
  }
  if (namedOverride !== '') {
    if (remotes.includes(namedOverride)) {
      return { arg: namedOverride, label: namedOverride, source: `RELEASE_REMOTE_${suffix}` };
    }
    if (looksLikeRemote(namedOverride)) {
      return { arg: namedOverride, label: namedOverride, source: `RELEASE_REMOTE_${suffix}` };
    }
    fail(
      EXIT.REMOTE,
      `RELEASE_REMOTE_${suffix}="${namedOverride}" is neither a configured git remote ` +
        'nor a git URL/path.',
      [
        `Existing remotes: ${remotes.length > 0 ? remotes.join(', ') : '(none)'}`,
        `Set RELEASE_REMOTE_URL_${suffix} to an explicit URL/path instead.`,
      ],
    );
  }
  if (remotes.includes(target.remote)) {
    return { arg: target.remote, label: target.remote, source: 'default remote name' };
  }
  fail(
    EXIT.REMOTE,
    `No git remote named "${target.remote}" for ${target.repo}, and no override is set.`,
    [
      'Configure one of the following, then retry:',
      `  git remote add ${target.remote} git@github.com:${target.repo}.git`,
      `  RELEASE_REMOTE_${suffix}=${target.remote} pnpm release:${targetKey}`,
      `  RELEASE_REMOTE_URL_${suffix}=git@github.com:${target.repo}.git pnpm release:${targetKey}`,
      `Existing remotes: ${remotes.length > 0 ? remotes.join(', ') : '(none)'}`,
    ],
  );
}

function checkFastForward(head, targetKey) {
  const target = TARGETS[targetKey];
  const remote = resolveRemote(targetKey, target);
  console.log(`[release] Remote: ${remote.label} (from ${remote.source})`);

  const fetched = git(['fetch', '--no-tags', remote.arg, 'main'], { allowFailure: true });
  if (!fetched.ok) {
    const details = firstLines(fetched.stderr || fetched.stdout, 8);
    if (/couldn't find remote ref|could not find remote ref/i.test(details)) {
      fail(
        EXIT.FETCH,
        `Target ${target.repo} has no "main" branch (empty or not initialised).`,
        [
          'ADR-0002 expects three long-lived main branches. Seed target main once,',
          'then every release afterwards must be a fast-forward.',
          details,
        ].filter(Boolean),
      );
    }
    fail(
      EXIT.FETCH,
      `Could not fetch "main" from ${target.repo} via ${remote.label}.`,
      [
        details,
        `Check access: git ls-remote ${remote.arg} main`,
        `Check the repository exists: gh repo view ${target.repo}`,
      ].filter(Boolean),
    );
  }

  const targetMain = git(['rev-parse', '--verify', 'FETCH_HEAD^{commit}']).stdout.trim();
  const ancestor = git(['merge-base', '--is-ancestor', targetMain, head], { allowFailure: true });
  if (ancestor.status === 1) {
    const targetOnly = git(['rev-list', '--count', `${head}..${targetMain}`], {
      allowFailure: true,
    }).stdout.trim();
    fail(
      EXIT.NOT_FAST_FORWARD,
      `Target main ${short(targetMain)} is not an ancestor of HEAD ${short(head)}.`,
      [
        `Target-only commit(s): ${targetOnly || 'unknown'}.`,
        'Fast-forward only: merging or force-pushing is forbidden (ADR-0002 §4/§5).',
        'Find out who advanced the target, restore it, then re-run the release.',
      ],
    );
  }
  if (ancestor.status !== 0) {
    fail(
      EXIT.INTERNAL,
      `git merge-base --is-ancestor failed (exit ${ancestor.status}).`,
      [firstLines(ancestor.stderr, 4)].filter(Boolean),
    );
  }
  console.log(
    `[release] 3/4 fast-forward check passed: ${short(targetMain)} is an ancestor of HEAD ` +
      `${short(head)}.`,
  );
  return { target, remote, targetMain };
}

function summarizeCommits(targetMain, head) {
  const count = Number.parseInt(
    git(['rev-list', '--count', `${targetMain}..${head}`]).stdout.trim(),
    10,
  );
  if (!Number.isFinite(count) || count === 0) {
    return { count: 0, line: 'none (target main already contains HEAD)' };
  }
  const newest = git(['log', '--no-decorate', '--format=%h %s', `${targetMain}..${head}`])
    .stdout.split('\n')
    .filter((line) => line.length > 0)[0];
  const suffix = count > 1 ? ` (+${count - 1} earlier)` : '';
  return {
    count,
    line: `${count} commit${count === 1 ? '' : 's'} ${short(targetMain)}..${short(head)}: ${newest}${suffix}`,
  };
}

function printPlan(head, target, remote, targetMain, summary) {
  console.log(`[release] Source HEAD  : ${head}`);
  console.log(`[release] Target repo  : ${target.repo}`);
  console.log(`[release] Remote       : ${remote.label} (from ${remote.source})`);
  console.log(`[release] Target main  : ${targetMain}`);
  console.log(`[release] FF check     : PASS (target main is an ancestor of HEAD)`);
  console.log(`[release] Commits      : ${summary.line}`);
  console.log(`[release] Push command : git push ${remote.arg} HEAD:main`);
}

async function main(argv) {
  const parsed = parseArgs(argv);
  if (parsed === null) return;
  repoRoot = findRepoRoot();
  const { target: targetKey, dryRun } = parsed;
  const target = TARGETS[targetKey];

  console.log(`[release] Target ${targetKey} -> ${target.repo}${dryRun ? ' (DRY RUN)' : ''}`);
  const head = resolveHead();
  assertCleanWorktree();
  await assertCiGreen(head, dryRun);
  const { remote, targetMain } = checkFastForward(head, targetKey);
  const summary = summarizeCommits(targetMain, head);
  printPlan(head, target, remote, targetMain, summary);

  if (summary.count === 0) {
    console.log('[release] Target main already points at HEAD; nothing to push (explicit no-op).');
    return;
  }
  if (dryRun) {
    console.log('');
    console.log('[release] DRY RUN complete: no push, no files written.');
    return;
  }

  if (readEnv('RELEASE_YES') === '1') {
    console.log('[release] Confirmation skipped by RELEASE_YES=1.');
  } else {
    if (!isInteractive()) {
      fail(EXIT.CONFIRM, 'Refusing to push in a non-interactive shell without confirmation.', [
        'Re-run in a terminal, or set RELEASE_YES=1 to confirm non-interactively.',
      ]);
    }
    const proceed = await askYesNo(`Push ${short(head)} to ${target.repo} main?`);
    if (!proceed) {
      fail(EXIT.CONFIRM, 'Release aborted by the operator; target main was not updated.');
    }
  }

  const pushed = git(['push', remote.arg, 'HEAD:main'], { allowFailure: true });
  if (!pushed.ok) {
    fail(
      EXIT.PUSH,
      `git push ${remote.arg} HEAD:main failed (exit ${pushed.status}).`,
      [
        firstLines(pushed.stderr || pushed.stdout, 10),
        'Common causes: target main advanced since the fetch, branch protection, or auth.',
        'Do not force-push. Restore a fast-forwardable target, then retry.',
      ].filter(Boolean),
    );
  }
  console.log(`[release] Pushed ${head} to ${target.repo} main.`);
  console.log(`[release] Verify: gh run list --repo ${target.repo} --commit ${head}`);
}

main(process.argv.slice(2)).catch((error) => {
  if (error instanceof ReleaseError) {
    reportFailure(error);
    process.exitCode = error.code;
    return;
  }
  reportFailure(
    new ReleaseError(
      EXIT.INTERNAL,
      error instanceof Error ? (error.stack ?? error.message) : String(error),
    ),
  );
  process.exitCode = EXIT.INTERNAL;
});
