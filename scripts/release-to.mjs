#!/usr/bin/env node
// Generic fast-forward release helper: push this exact commit to that repository.
//
//   node scripts/release-to.mjs [--dry-run] <target>
//
// <target> answers one question only: where should HEAD be pushed? It is never
// interpreted as an environment. Accepted forms, resolved in this order:
//
//   1. owner/repo     -> https://github.com/owner/repo.git
//   2. full git URL   -> used verbatim (contains "://" or starts with "git@")
//   3. local path     -> used verbatim (starts with /, ./, ../, or exists)
//   4. bare repo name -> the owner is read from the "origin" remote at runtime:
//                        https://github.com/<origin-owner>/<name>.git
//                        If origin is missing or not a GitHub URL the command
//                        fails and asks for an explicit owner/repo.
//
// The command is deliberately write-free: it never commits, tags, amends,
// force-pushes, or writes a log file. Preflight order:
//
//   1. working tree clean, including untracked files
//   2. CI green for this exact SHA (or a loud RELEASE_SKIP_CI_CHECK=1)
//   3. target main is an ancestor of HEAD (fetch first; fast-forward only)
//   4. print source SHA / resolved target / commit subject(s), then confirm
//   5. git push <target> HEAD:main
//
// RELEASE_YES=1 skips only the final confirmation. RELEASE_SKIP_CI_CHECK=1
// skips only the CI gate (with a prominent warning). --dry-run runs every
// preflight and prints the plan, but never pushes and never prompts; it still
// aborts on a dirty tree, a non-fast-forward, or an unreadable target.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';

const EXIT = Object.freeze({
  OK: 0,
  INTERNAL: 1,
  USAGE: 2,
  DIRTY: 3,
  CI: 4,
  NOT_FAST_FORWARD: 5,
  TARGET: 6,
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

const MAX_SUBJECTS = 20;
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

function shellArg(value) {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
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
    'Usage: node scripts/release-to.mjs [--dry-run] <target>',
    '',
    '  <target>  where to push this commit. Four forms, resolved in order:',
    '              owner/repo    GitHub repository -> https://github.com/owner/repo.git',
    '              <git URL>     used verbatim (https://..., ssh://..., git@host:...)',
    '              <local path>  /abs, ./rel, ../rel, or an existing path; used verbatim',
    '              <bare name>   https://github.com/<owner-of-origin>/<name>.git',
    "            A bare name reads the owner from the current repository's",
    '            "origin" remote; origin must be a GitHub URL.',
    '',
    '  --dry-run  run every preflight and print the plan, but never push or prompt.',
    '',
    'Environment:',
    '  RELEASE_SKIP_CI_CHECK=1  skip the CI-green gate (prints a loud warning)',
    '  RELEASE_YES=1            skip the final interactive confirmation',
    '',
    'Exit codes:',
    '  0 success   1 internal error   2 usage   3 dirty tree',
    '  4 CI not green or unverified   5 not fast-forward   6 target not resolvable',
    '  7 fetch failed   8 confirmation refused/unavailable   9 push failed',
    '',
    'The command writes no files: no log, no commit, no tag, no amend, no force.',
  ].join('\n');
}

function parseArgs(argv) {
  let target;
  let dryRun = false;
  let optionsEnded = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!optionsEnded && arg === '--') {
      optionsEnded = true;
    } else if (!optionsEnded && arg === '--dry-run') {
      dryRun = true;
    } else if (!optionsEnded && (arg === '--help' || arg === '-h')) {
      console.log(usageText());
      return null;
    } else if (!optionsEnded && arg.startsWith('-') && arg !== '-') {
      fail(EXIT.USAGE, `Unknown option: ${arg}`, ['Run with --help for usage.']);
    } else if (target !== undefined) {
      fail(EXIT.USAGE, `Unexpected extra argument: ${arg}`, ['Exactly one <target> is accepted.']);
    } else {
      target = arg;
    }
  }
  if (target === undefined || target.trim().length === 0) {
    fail(EXIT.USAGE, 'Missing <target>: where should this commit be pushed?', [
      'Examples:',
      '  node scripts/release-to.mjs owner/repo',
      '  node scripts/release-to.mjs https://github.com/owner/repo.git',
      '  node scripts/release-to.mjs ../mirror.git',
      '  node scripts/release-to.mjs <bare-repository-name>',
    ]);
  }
  return { target: target.trim(), dryRun };
}

const OWNER_REPO_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const BARE_NAME_RE = /^[A-Za-z0-9._-]+$/;

function stripGitSuffix(value) {
  return value.endsWith('.git') ? value.slice(0, -4) : value;
}

function isGitUrl(value) {
  return value.includes('://') || /^git@[^/\s]+:/.test(value);
}

function isPathLike(value) {
  return (
    value.startsWith('/') ||
    value.startsWith('./') ||
    value.startsWith('../') ||
    value === '.' ||
    value === '..' ||
    existsSync(resolve(process.cwd(), value))
  );
}

function parseGitHubRepo(value) {
  const raw = String(value).trim();
  if (raw.length === 0) return null;

  let host;
  let owner;
  let repo;
  if (raw.startsWith('git@')) {
    const match = /^git@([^:/\s]+):(.+)$/.exec(raw);
    if (match === null) return null;
    host = match[1];
    const segments = match[2].replace(/^\/+/, '').split('/');
    if (segments.length !== 2) return null;
    [owner, repo] = segments;
  } else {
    let url;
    try {
      url = new URL(raw);
    } catch {
      return null;
    }
    if (!/^(https?|ssh|git):$/.test(url.protocol)) return null;
    host = url.hostname;
    const segments = url.pathname.replace(/^\/+|\/+$/g, '').split('/');
    if (segments.length !== 2) return null;
    [owner, repo] = segments;
  }

  if (host.toLowerCase() !== 'github.com') return null;
  owner = stripGitSuffix(owner);
  repo = stripGitSuffix(repo);
  if (!BARE_NAME_RE.test(owner) || !BARE_NAME_RE.test(repo)) return null;
  return { owner, repo };
}

function originUrl() {
  // Read the raw config first: `git remote get-url` applies url.*.insteadOf
  // rewrites, which can hide the GitHub owner behind a local mirror path.
  const config = git(['config', '--get', 'remote.origin.url'], { allowFailure: true });
  if (config.ok && config.stdout.trim() !== '') return config.stdout.trim();
  const remote = git(['remote', 'get-url', 'origin'], { allowFailure: true });
  if (remote.ok && remote.stdout.trim() !== '') return remote.stdout.trim();
  return '';
}

function resolveBareName(name) {
  const repo = stripGitSuffix(name);
  const origin = originUrl();
  if (origin === '') {
    fail(
      EXIT.TARGET,
      `Cannot expand bare target "${name}": this checkout has no "origin" remote.`,
      [
        'Pass the repository explicitly instead:',
        `  node scripts/release-to.mjs <owner>/${repo}`,
        `  node scripts/release-to.mjs https://github.com/<owner>/${repo}.git`,
        'Or add an origin remote so the owner can be derived:',
        '  git remote add origin git@github.com:<owner>/<repository>.git',
      ],
    );
  }

  const parsed = parseGitHubRepo(origin);
  if (parsed === null) {
    fail(
      EXIT.TARGET,
      `Cannot expand bare target "${name}": "origin" is not a GitHub URL (${origin}).`,
      [
        'Pass the repository explicitly instead:',
        `  node scripts/release-to.mjs <owner>/${repo}`,
        `  node scripts/release-to.mjs https://github.com/<owner>/${repo}.git`,
      ],
    );
  }

  return {
    argument: name,
    target: `https://github.com/${parsed.owner}/${repo}.git`,
    display: `https://github.com/${parsed.owner}/${repo}.git`,
    source: `bare name "${name}", owner "${parsed.owner}" from origin`,
  };
}

function resolveTarget(raw) {
  const value = String(raw).trim();

  // 1. owner/repo. Path-like strings such as "." and ".." are excluded even
  // though they match the loose segment pattern.
  if (OWNER_REPO_RE.test(value)) {
    const segments = value.split('/');
    const pathLikeSegment = segments.some((segment) => segment === '.' || segment === '..');
    if (!pathLikeSegment && !isGitUrl(value)) {
      const owner = segments[0];
      const repo = stripGitSuffix(segments[1]);
      const target = `https://github.com/${owner}/${repo}.git`;
      return { argument: value, target, display: target, source: 'owner/repo' };
    }
  }

  // 2. Full git URL, used verbatim.
  if (isGitUrl(value)) {
    return { argument: value, target: value, display: value, source: 'git URL (verbatim)' };
  }

  // 3. Local path, used verbatim. Relative paths are anchored to the caller's
  // cwd (not the repository root) and passed to git as an absolute path so the
  // form keeps working from a subdirectory.
  if (isPathLike(value)) {
    const absolute = resolve(process.cwd(), value);
    return {
      argument: value,
      target: absolute,
      display: absolute,
      source: value === absolute ? 'local path (verbatim)' : `local path "${value}" (verbatim)`,
    };
  }

  // 4. Bare repository name, with the owner read from origin at runtime.
  if (!value.includes('/') && BARE_NAME_RE.test(stripGitSuffix(value))) {
    return resolveBareName(value);
  }

  fail(EXIT.TARGET, `Cannot resolve target "${value}".`, [
    'Accepted forms, in order:',
    '  owner/repo              e.g. owner/repository',
    '  full git URL            e.g. https://github.com/owner/repository.git',
    '  local path              e.g. ../mirror.git or /srv/repository.git',
    '  bare repository name    e.g. repository (owner read from "origin")',
  ]);
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
        'Push the commit to the source repository, wait for CI, then retry.',
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
      'CI evidence must come from the same SHA.',
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

function checkFastForward(target, head) {
  console.log(`[release] Fetching "main" from ${target.display} ...`);
  const fetched = git(['fetch', '--no-tags', target.target, 'main'], { allowFailure: true });
  if (!fetched.ok) {
    const details = firstLines(fetched.stderr || fetched.stdout, 8);
    if (/couldn't find remote ref|could not find remote ref/i.test(details)) {
      fail(
        EXIT.FETCH,
        `Target ${target.display} has no "main" branch (empty or not initialised).`,
        [
          'All participating repositories need one long-lived main branch.',
          'Seed the target main once, then every release afterwards must be a fast-forward.',
          details,
        ].filter(Boolean),
      );
    }
    fail(
      EXIT.FETCH,
      `Could not fetch "main" from ${target.display}.`,
      [
        details,
        `Check that the target exists and is readable: git ls-remote ${shellArg(target.target)} main`,
        'For a local path, check that it exists and is a git repository.',
      ].filter(Boolean),
    );
  }

  const targetMain = git(['rev-parse', '--verify', 'FETCH_HEAD^{commit}']).stdout.trim();
  const ancestor = git(['merge-base', '--is-ancestor', targetMain, 'HEAD'], {
    allowFailure: true,
  });
  if (ancestor.status === 1) {
    const targetOnly = git(['rev-list', '--count', `HEAD..${targetMain}`], {
      allowFailure: true,
    }).stdout.trim();
    fail(EXIT.NOT_FAST_FORWARD, `Target main ${short(targetMain)} is not an ancestor of HEAD.`, [
      `Target-only commit(s): ${targetOnly || 'unknown'}.`,
      'Fast-forward only: merging or force-pushing is forbidden.',
      'Find out who advanced the target, restore it, then re-run the release.',
    ]);
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
  return { targetMain };
}

function summarizeCommits(targetMain, head) {
  const raw = git(['rev-list', '--count', `${targetMain}..${head}`]).stdout.trim();
  const count = Number.parseInt(raw, 10);
  if (!Number.isFinite(count) || count === 0) {
    return { count: 0, subjects: [], truncated: false };
  }
  const subjects = git([
    'log',
    '--no-decorate',
    '--format=%h %s',
    `--max-count=${MAX_SUBJECTS}`,
    `${targetMain}..${head}`,
  ])
    .stdout.split('\n')
    .filter((line) => line.length > 0);
  return { count, subjects, truncated: count > subjects.length };
}

function printPlan(head, target, targetMain, summary) {
  console.log(`[release] Source HEAD  : ${head}`);
  console.log(`[release] Target       : ${target.display}`);
  if (target.argument !== target.display) {
    console.log(`[release] Target arg   : ${target.argument}`);
  }
  console.log(`[release] Resolution   : ${target.source}`);
  console.log(`[release] Target main  : ${targetMain}`);
  console.log('[release] FF check     : PASS (target main is an ancestor of HEAD)');
  if (summary.count === 0) {
    console.log('[release] Commits      : none (target main already contains HEAD)');
  } else {
    console.log(
      `[release] Commits      : ${summary.count} commit${summary.count === 1 ? '' : 's'} ` +
        `${short(targetMain)}..${short(head)}`,
    );
    for (const subject of summary.subjects) {
      console.log(`[release]   ${subject}`);
    }
    if (summary.truncated) {
      console.log(`[release]   ... and ${summary.count - summary.subjects.length} more`);
    }
  }
  console.log(`[release] Push command : git push ${shellArg(target.target)} HEAD:main`);
}

async function main(argv) {
  const parsed = parseArgs(argv);
  if (parsed === null) return;
  repoRoot = findRepoRoot();
  const { target: targetArgument, dryRun } = parsed;
  const target = resolveTarget(targetArgument);

  console.log(`[release] ${dryRun ? 'DRY RUN — ' : ''}push HEAD to ${target.display}`);
  const head = resolveHead();
  assertCleanWorktree();
  await assertCiGreen(head, dryRun);
  const { targetMain } = checkFastForward(target, head);
  const summary = summarizeCommits(targetMain, head);
  printPlan(head, target, targetMain, summary);

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
    const proceed = await askYesNo(
      `Fast-forward ${target.display} main to ${short(head)} (${summary.count} commit(s))?`,
    );
    if (!proceed) {
      fail(EXIT.CONFIRM, 'Release aborted by the operator; target main was not updated.');
    }
  }

  const pushed = git(['push', target.target, 'HEAD:main'], { allowFailure: true });
  if (!pushed.ok) {
    fail(
      EXIT.PUSH,
      `git push ${shellArg(target.target)} HEAD:main failed (exit ${pushed.status}).`,
      [
        firstLines(pushed.stderr || pushed.stdout, 10),
        'Common causes: target main advanced since the fetch, branch protection, or auth.',
        'Do not force-push. Restore a fast-forwardable target, then retry.',
      ].filter(Boolean),
    );
  }
  console.log(`[release] Pushed ${head} to ${target.display} main.`);
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
