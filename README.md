# LOVE20 interface — M0 skeleton

Static, mobile-first interface for the LOVE20 protocol on BNB Chain. This repository is the
application skeleton: the shell, routing, three-environment injection, identity/community
context, error copy layer and the pure domain round axes are in place. **It contains no real
deployment addresses and deliberately shows `未配置` / `未接入` everywhere instead of fake data.**

Read the decisions in `docs/adr/0001..0003`, `docs/product/m0-scope.md` and `GLOSSARY.md`
before changing architecture or user-facing wording.

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
pnpm build          # typecheck + vite build + 404.html + bundle gate
pnpm preview        # http://127.0.0.1:4173
pnpm e2e            # Playwright, requires browsers; runs `vite preview`
pnpm gen:errors     # regenerate src/config/errors.generated.ts
```

`pnpm build` also runs `scripts/check-bundle.mjs`, which:

- sums gzip size of the module script + modulepreload JS in `dist/index.html`;
- fails above **200 kB** and warns above **160 kB**;
- fails if any shipped chunk contains WalletConnect / AppKit / MetaMask SDK bytes.

Current entry: **~152 kB gzip** (React 19.1 + viem is most of it). Overlay code and secondary
routes are split so the first paint stays inside the budget. The stricter 150 kB line in
ADR-0001 is missed by ~2 kB; see “Decisions” below.

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

Only one switch exists: `VITE_ENV` (`dev` | `test` | `prod`), falling back to the Vite mode.
`vite.config.ts` aliases `@deployments` to exactly one of:

| variant | file                                          | chain                                   |
| ------- | --------------------------------------------- | --------------------------------------- |
| `dev`   | `src/config/deployments/anvil31337_dev.json`  | 31337 (anvil)                           |
| `test`  | `src/config/deployments/bscTestnet_test.json` | 97 (placeholder; ADR leaves 97/56 open) |
| `prod`  | `src/config/deployments/bscMainnet_prod.json` | 56                                      |

All three stubs currently contain the zero address in every slot and real public BSC RPC
endpoints. The address book has an explicit slot for every ADR-0002 contract
(`tokenAddress`, `memberNFT`, `launch`, executors, group chat, WETH/factory/router,
multicall3, airdrop, …) plus `phase`.

**To fill it:** run the anvil repo export, copy `addresses.json` fields into the matching
deployment file, set `defaultSymbol` to the first token's on-chain `symbol()` (dev may carry
a test prefix), then set `deployment.blockNumber`. Do not hard-code addresses anywhere else.
Missing or zero addresses are treated as “not configured” by `isConfiguredAddress()`.

Brand strings come from the current community token's on-chain `name()` / `symbol()`
(`entities/community-token`); `LOVE20` is only the fallback when the chain cannot be read.

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
  (189 unique selectors) with a small hand-written fallback plus `// TODO: regenerate` when the
  registry is unavailable. Raw revert data, gas/allowance/nonce/revert words and library internals
  never reach the user. Wallet-layer errors live in `features/connect-wallet/lib/wallet-errors.ts`
  so the large contract map is not in the entry chunk.
- All UI copy is in `shared/config/copy.ts` (Chinese only; i18n deferred). Follow GLOSSARY terms.

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
- `.github/workflows/deploy.yml` builds → uploads `dist` → deploys Pages. It expects repo variables
  `VITE_ENV`, `VITE_BASE`, `VITE_SITE_ORIGIN`; defaults contain `__GH_OWNER__` / `__GH_REPO__`
  placeholders that must be replaced. The ABI drift gate must run in the contract/anvil job
  (this repo has no forge and no sibling repos).

## What is stubbed / next agent checklist

1. **Deployment data**: fill the three `src/config/deployments/*.json` files from the anvil export;
   verify `pnpm test` (deployment validator) and `pnpm build`.
2. **ABIs**: replace the hand-written fragments in `src/config/abis/index.ts` with generated
   `*.generated.ts` from forge `out/` + a manifest (source repo, HEAD SHA, entry counts), per
   ADR-0002 §3. Add the drift gate to a job that has forge + sibling repos.
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

- **Bottom-nav center tab**: the task asked for a raised center action tab; the later
  `docs/product/m0-ux-spec.md` says not to raise it because the action feature is a placeholder.
  This build follows the task instruction and raises 行动, while the four other tabs are plain.
  Reverting is a one-line change in `app/shell/bottom-nav.tsx`.
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
