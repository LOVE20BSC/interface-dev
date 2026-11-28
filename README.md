# LOVE20 interface — M0 skeleton

Static, mobile-first interface for the LOVE20 protocol on BNB Chain. This repository is the
application skeleton: the shell, routing, three-environment injection, identity/community
context, error copy layer and the pure domain round axes are in place. **It contains no real
deployment addresses and deliberately shows `未配置` / `未接入` everywhere instead of fake data.**

Read the decisions in [docs/adr/0001..0003](docs/adr/), [docs/product/m0-scope.md](docs/product/m0-scope.md)
and [GLOSSARY.md](GLOSSARY.md) before changing architecture or user-facing wording.

**开始写代码前先读 [AGENTS.md](AGENTS.md)**（人和 AI 代理的统一入口）：必读顺序、十条硬规则、
提交前命令、以及「遇到什么问题上哪份文档」。开发规范正文在
[docs/engineering/frontend-standards.md](docs/engineering/frontend-standards.md)。

## Stack

React 19 (pinned 19.1.0), TypeScript strict, Vite 6, Tailwind CSS 4, wagmi v2, viem v2,
TanStack Query, react-router-dom 7 (browser router), Radix UI primitives, lucide-react,
clsx + tailwind-merge. pnpm. Vitest + Testing Library; Playwright config is ready for later
E2E. No Next.js, no MUI, no WalletConnect/RainbowKit, no PWA/service worker, no third-party
API calls. Wallet support is **injected-only** (`window.ethereum`).

## Commands

```bash
pnpm install
pnpm dev            # http://127.0.0.1:5173
pnpm typecheck
pnpm lint
pnpm test
pnpm check          # format:check + typecheck + lint + test（pre-commit 钩子跑的就是这个）
pnpm build          # typecheck + vite build + 404.html + bundle gate
pnpm preview        # http://127.0.0.1:4173
pnpm e2e            # Playwright, requires browsers; runs `vite preview`
pnpm hooks:install  # 一次性：把 git 钩子指向仓库内的 .githooks/（见 §开发规范）
pnpm gen:errors     # regenerate src/config/errors.generated.ts
```

## 开发规范（人或 AI 代理都从这里进）

规则只有一个出处：根目录 [AGENTS.md](AGENTS.md)（必读顺序 / 十条硬规则 / 命令 / 文档路由）
和规范正文 [docs/engineering/frontend-standards.md](docs/engineering/frontend-standards.md)
（分层与门禁 / 文案 / 数据与错误 / 组件与 UI / 测试 / 发布 / 已知坑）。
`CLAUDE.md`、`.github/copilot-instructions.md`、`.cursor/rules/love20.mdc` 是**只写指针的 shim**，
由 `src/architecture.test.ts` 强制（必须指向 `AGENTS.md` 且 ≤30 行），避免规则多处漂移。

| 主题                                                     | 文档                                                                               |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 术语与中文纪律                                           | [GLOSSARY.md](GLOSSARY.md)                                                         |
| 交互规格（设计原则、授权阶梯、pending 三态、nonce 口径） | [docs/product/m0-ux-spec.md](docs/product/m0-ux-spec.md)                           |
| 三线校验（读链上数值的页面必须有）                       | [docs/product/three-line-verification.md](docs/product/three-line-verification.md) |
| 文案审查口径                                             | [docs/product/copy-audit.md](docs/product/copy-audit.md)                           |
| e2e 的链隔离硬边界与 harness 守卫                        | [e2e/README.md](e2e/README.md)                                                     |
| 技术决策（不可回退）                                     | [docs/adr/](docs/adr/)                                                             |
| 已知合约缺陷（不绕过、不硬编码）                         | [docs/contract-issues/](docs/contract-issues/)                                     |
| 交付与验收状态                                           | [docs/STATUS.md](docs/STATUS.md)                                                   |

### Pre-commit 门禁

`pnpm hooks:install` 把本 clone 的 `core.hooksPath` 指向仓库内的 `.githooks/`（git 配置不入库，
换机器要重跑一次）。钩子调 `pnpm check`（格式 + typecheck + lint + 单测），**不跑** `pnpm build` 与
`pnpm e2e`（慢、要链）。只改文档的提交自动跳过；逃生口 `SKIP_PRE_COMMIT=1 git commit …`
（用过请在提交信息里说明）。CI 仍是最终底线，钩子只是把反馈提前。

`pnpm build` also runs `scripts/check-bundle.mjs`, which:

- sums gzip size of the module script + modulepreload JS in `dist/index.html`;
- fails above **200 kB** and warns above **160 kB**;
- fails if any shipped chunk contains WalletConnect / AppKit / MetaMask SDK bytes.

Current entry: **~157 kB gzip** by `scripts/check-bundle.mjs` (Vite reports ~161 kB with its own
gzip setting; React 19.1 + viem is most of it). Overlay code, all secondary routes (including
mint / my-nft / airdrop / swap / placeholders / 404) and the build-version banner are split so
the first paint stays inside the budget; this is under ADR-0001's 160 kB warning line, with the
200 kB hard gate as the actual failure. Intent prefetch (hover/focus/touch) keeps lazy
navigation instant.

## Layout

```
src/
  app/          providers, router, deep-link restore, shell, nav, build-version gate
  pages/        one folder per route (home, my-nft, mint, airdrop, swap, placeholders)
  widgets/      connect pill + menus, empty state, page section, placeholder page
  features/     connect-wallet, switch-community, select-identity, mint-identity,
                claim-airdrop, swap-token
  entities/     member-identity, community-token, phase read models/hooks
  shared/       ui primitives, lib (cache, errors, format, clipboard), config (copy)
  domain/       pure TS: phase/round axes (no React, no window)
  config/       environment package, chain, address book, ABIs, generated errors
```

Dependency direction is **app → pages → widgets → features → entities → shared**, with
`domain` and `config` as leaf packages. It is enforced twice:

- ESLint `no-restricted-imports` per layer (`eslint.config.js`);
- `src/architecture.test.ts`, which also fails if any file other than
  `src/shared/lib/cache.ts` references `localStorage` / `sessionStorage`, or if `src/domain`
  imports React/viem/wagmi or uses browser globals.

## Environment injection (ADR-0002)

The only explicit switch is `VITE_ENV` (`dev` | `test` | `prod`), falling back to the Vite mode;
in CI the default comes from the repository name (contains `dev` → dev; else contains `test` →
test; else prod; ADR-0002 §5), and `vars.VITE_ENV` overrides it. A fork whose name contains
`dev` therefore builds dev — an accepted consequence of the keyword rule.
`vite.config.ts` aliases `@deployments` to exactly one of:

| variant | file                                              | chain                                   |
| ------- | ------------------------------------------------- | --------------------------------------- |
| `dev`   | `src/config/network/anvil31337_dev/network.json`  | 31337 (anvil)                           |
| `test`  | `src/config/network/bscTestnet_test/network.json` | 97 (placeholder; ADR leaves 97/56 open) |
| `prod`  | `src/config/network/bscMainnet_prod/network.json` | 56                                      |

The dev book is filled from the local chain; test/prod remain zero-address stubs (no deployment
exists yet). The address book has an explicit slot for every ADR-0002 contract
(`tokenAddress`, `memberNFT`, `launch`, executors, group chat, WETH/factory/router,
multicall3, airdrop, …) plus `phase`.

**To fill the dev book:** from a clean chain run `make -C ../anvil stop`, `make -C ../anvil clean` and
`make -C ../anvil bootstrap`, then `pnpm sync:anvil`. That single command writes the address book,
`src/config/abis/*.ts`, `src/config/abis/manifest.json` and `src/config/network/anvil31337_dev/airdrop.json`
from `../anvil/export`; never hand-edit the generated files and never adjust a deployer nonce to
match an old book. `pnpm abis:check` compares the generated files with the sibling deployment export
and checks that the deployment used committed sources. For a draft built from working trees, use
`pnpm abis:check --allow-working-tree`. The manifest records the source revision or working-tree
fingerprint captured by Anvil at deployment, plus the SHA-256 of each exported ABI.
An alternate port such as 8566 writes `../anvil/.anvil/8566/export`. Set `ANVIL_EXPORT_DIR` to that
directory for both `pnpm sync:anvil` and `pnpm abis:check` when reviewing that deployment.
Missing or zero addresses are treated as “not configured” by `isConfiguredAddress()`.

Each `src/config/network/<network>/` contains its `network.json` (addresses and public
parameters) and, once available, `airdrop.json`. Run
`pnpm sync:network ../core/script/network/<network>` to read the original public parameters,
address files and snapshot directly. The command never reads `.account` and verifies every
Merkle proof before writing either frontend file; the anvil command above also syncs ABIs.
`sync:network` owns public `params` and its notes; `sync:anvil` preserves those fields while
updating deployment data. Both commands write `airdrop.json`, and the two sources must agree
byte-for-byte: the anvil export snapshot and core's `script/network/<network>/airdrop.json` are the
same Merkle fixture, each verified against its chain's `merkleRoot` before writing. `abis:check`
compares the committed snapshot with the **anvil export** (the local deployment that produced the
addressbook), so a `sync:network`-only change must still match it or the gate fails.
Additional module addresses belong in core's network directory as `addresses.*.params`.

The frontend loads the bundled genesis snapshot on demand and compares its root with
`airdropInfo(token).merkleRoot`. A match needs no request to GitHub Pages. A missing, invalid
or mismatched local snapshot falls back to the on-chain HTTP(S) URI; wallet proofs are still
verified with `claimableAmount`. Snapshot `sourceChainId` describes provenance and may differ
from the destination chain. Older deployments with an empty URI can still use a matching local
snapshot. Changes are developed in `interface-dev-dsh`, then manually promoted to test and prod.

Brand and community labels use the current community token's on-chain `symbol()`
(`entities/community-token`). When no community is selected or known, the label is
`LOVE20协议` — the protocol name, not a token community. A selected community keeps its
on-chain `symbol()`: the LOVE20 community shows `LOVE20`, any other community shows its own
symbol. `name()` (a code-level `<child symbol>@<parent symbol>` composite) is read only for
technical details/debug and is never shown as the community name.

## Community context and identity

- `?symbol=` is the single source of truth (`features/switch-community/useCommunityContext`).
  It is seeded once with `replace` from the address book's `defaultSymbol`; switching preserves
  other query params, uses `replace` and never reloads. The current token is **not** persisted.
- Recent communities live in the namespaced cache, scoped to launch/token address + wallet.
- The MemberNFT is resolved from `config.addresses.memberNFT`, or from any seed core contract's
  `MEMBER_NFT_ADDRESS()`. Candidate identities use `balanceOf` + `tokenOfOwnerByIndex`; the
  selected token is cached and re-validated with `ownerOf` on every load. Invalid identities are
  cleared with a neutral message.
- No `tokenURI`, no avatar fetch, no event logs, no indexer.

## Connect pill

One header entry, three states: disconnected / wrong chain / connected pill.

- Disconnected: `连接钱包`; after ~3 s with no `window.ethereum` the click opens a “no wallet”
  sheet with in-app-browser guidance and a copy-link action.
- Wrong chain: red button; `wallet_switchEthereumChain`, then `wallet_addEthereumChain` (EIP-3085
  params from the environment package) on 4902, then switch again.
- Connected: one bordered pill with two independent triggers:
  - left chip → 最近访问 / 父币 / 子币 (parent/child are visibly stubbed; recents are real);
  - right address + identity → full address + copy, identity row (查看NFT / 未关联 NFT),
    LOVE20 + native balance rows, 断开连接.
- Same content on mobile and desktop: the overlay layer uses Radix Popover at `md:` and a Radix
  Dialog bottom sheet below `md:`. **The overlay code is lazy-loaded on the first interaction**
  so Radix/Floating UI never enters the entry chunk.

## Round axis (domain)

`src/domain/round-axis.ts` implements the contract facts with `currentPhase = p`:

| layer        | vote | join  | verify                 | mint                                 |
| ------------ | ---- | ----- | ---------------------- | ------------------------------------ |
| governance   | `p`  | —     | —                      | round `p`, only after phase `p` ends |
| LP           | `p`  | `p-1` | no such stage          | `p-2`                                |
| GroupAction  | `p`  | `p-1` | `p-2`                  | `p-3`                                |
| GroupService | `p`  | `p-1` | `p-2` (no user action) | `p-3`                                |

A computed value < 1 is a **discriminated union** `{ status: 'not-started', computedRound, opensAtPhase }`
with no round sentinel; `governanceMintWindow(p)` returns the mintable governance round (`p-1`)
and a separate `awaiting-phase-end` state models the current round’s mint. Boundary tests cover
`p = 1..4`, every layer/stage, silent verify and invalid phases.

## Storage and errors

- `shared/lib/cache.ts` is the only storage boundary. Key format:
  `love20:v1:<chainId>:<contractAddress>:<wallet>:<businessKey>` (addresses lower-cased).
  It provides get/set/remove/clear-by-prefix/clear-scope/clear-all, self-heals malformed JSON,
  and exposes one-shot session flags for preload recovery. No other source file may touch storage.
- `shared/lib/errors.ts` maps contract custom-error selectors to Chinese sentences. The map is
  generated from `matt-gov/registry/errors.json` into `src/config/errors.generated.ts`
  with the registry revision and content hash in the header. The generator has a small hand-written
  fallback plus `// TODO: regenerate` when the registry is unavailable.
  Raw revert data, gas/allowance/nonce/revert words and library internals
  never reach the user. Wallet-layer errors live in `features/connect-wallet/lib/wallet-errors.ts`
  so the large contract map is not in the entry chunk.
- 新增合约错误时，要同步 `scripts/error-messages.zh.json`（这条中文文案就是界面用语），再跑
  `pnpm gen:errors` 重新生成 `src/config/errors.generated.ts`。`pnpm gen:errors --check` 可校验生成物是否与注册表来源和文案一致。
- All UI copy is in `shared/config/copy.ts` (Chinese only; i18n deferred). Follow GLOSSARY terms.

## i18n readiness (discipline now, library later)

所有用户可见文案在 `copy.ts`；组件内禁止中文字面量，由测试门禁强制（`src/architecture.test.ts`
扫 `src/**` 的 CJK 字面量；ESLint 没有这条规则，见 [frontend-standards](docs/engineering/frontend-standards.md) §3）；
句子用参数化模板；格式化走 `format.*` 并显式传 locale。
Concretely: `src/architecture.test.ts` («keeps every CJK string literal inside copy.ts or the generated
error copy») fails the build if a Chinese string literal appears in `src/**` outside
`shared/config/copy.ts` and the generated error registry (test files are exempt). Reusable
sentences are parameterised copy functions rather than `+`/template-literal glue, and every
locale-sensitive formatter in `shared/lib/format.ts` takes a `locale` argument (default
`zh-CN`) so no call site hard-codes browser locale.

## Static hosting

- `base` is baked at build time from `VITE_BASE`. Use `/` for a custom domain and `/<repo>/` for
  project Pages. All assets use Vite’s `BASE_URL`; router basename is derived from it.
- `scripts/postbuild.mjs` generates `dist/404.html` (standard `?/path` → `history.replaceState`
  deep-link trick; path segment count derived from the base), `.nojekyll` and `build-id.json`.
- `src/app/router/restore-deep-link.ts` restores the real URL before React mounts.
- The build id module (`src/config/build-id.generated.ts`, gitignored, generated by
  `scripts/gen-build-id.mjs`) is compared with `build-id.json` on load/visibility. A mismatch opens
  a blocking “有新版本，请刷新” sheet. `vite:preloadError` reloads once per tab, then falls back to
  the same mismatch notice.
- No service worker, no PWA manifest, no runtime config fetch, no custom headers.
- `.github/workflows/deploy.yml` builds → uploads `dist` → deploys Pages. The variant is derived
  from the repository name (contains `dev` → dev; else contains `test` → test; else prod); repo
  variables `VITE_ENV`, `VITE_BASE`, `VITE_SITE_ORIGIN` are overrides, and there are no
  `__GH_OWNER__` / `__GH_REPO__` placeholders. `pnpm abis:check` is the local/with-siblings drift
  gate; a frontend CI job without `../anvil/export` skips it explicitly, so the gate must also run
  in a job that checks out the contract/anvil repos.

## What is stubbed / next agent checklist

1. **Deployment data**: the dev book is generated by `pnpm sync:anvil` (see above); test/prod stay
   zero until their deployments exist. Run `pnpm test` (deployment validator) and `pnpm build`.
2. **ABIs**: `pnpm sync:anvil` generates the `as const` modules and deployment manifest per
   ADR-0002 §3. `pnpm abis:check` is the drift gate.
3. **Write paths**: mint identity, airdrop claim, swap buy, identity selection transactions.
   The panels currently render honest `未配置` / `待接入` states with a next step. Wire
   `shared/lib/errors.ts` into every write path.
4. **Identity names / NFT list**: read models exist; connect them to the page UI once ABIs land.
   Re-validate `ownerOf` before writes.
5. **Parent/child token resolution**: the menus show `未接入`. Add Launch reads and the child
   drawer; do not reintroduce the old `_currentToken` localStorage key.
6. **E2E**: install Playwright browsers and run against `vite preview` with `E2E_BASE_PATH=/<repo>/`;
   test the connect → identity welcome/onboarding paths and a rendered contract error.
7. **Page content/polish and i18n** are explicitly out of scope for this skeleton.

## Decisions where the ADRs/spec were silent or conflicting

- **Bottom-nav center tab**: all five tabs share one plain treatment. The original task asked
  for a raised center action tab, but M0's 行动 page is only a placeholder; a raised
  primary-action disc would over-promise, so the owner chose no raised tab (matching
  `docs/product/m0-ux-spec.md`).
- **Route names**: used `/gov`, `/act`, `/group`, `/me` per the task, not the longer
  `/governance`, `/actions`, `/groups` from the UX spec.
- **React pin**: 19.1.0 instead of latest 19.3.x to hold the first-screen budget; typing stays
  on `@types/react` 19.3. Upgrade with a fresh bundle measurement.
- **Tailwind v4** (CSS-first `@theme`) instead of a `tailwind.config.js`; ADR only says Tailwind.
- **Test chain id 97** is used as the testnet placeholder; ADR-0002 leaves 97/56 open. It is data,
  so replacing the file and rebuilding is enough.
- **RPC endpoints** are public BSC dataseed URLs (explicit primary/fallback, batch ≤ 50),
  not contract addresses; no requests are made until an address is configured.
- **Address book zeros**: every slot is present and zero rather than omitted, so “未配置” is a
  first-class state and no stale address can leak between environments.
- **Overlay lazy-loading**: chosen to stay under the JS budget while keeping the same Radix
  behavior; the trigger buttons remain eagerly rendered.
- **SPECIFIC TEST ENV**: Vitest pins `VITE_ENV=dev` so the `@deployments` alias resolves to the
  anvil stub; `pnpm build` reads the real environment variable.

## Inputs not to modify

`.research/` is read-only local input and is gitignored. `docs/` and `GLOSSARY.md` are inputs;
only append to `docs/` when explicitly instructed.
