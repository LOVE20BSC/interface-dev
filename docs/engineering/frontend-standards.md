# 前端开发规范（LOVE20 interface）

> **适用**：本仓 `interface-dev-dsh`（dev 变体），同一套规范适用于 `interface-test` / `interface` 两个变体。
> **入口**：[AGENTS.md](../../AGENTS.md)——人和 AI 代理都从这里进；本文件是它的展开与证据。
> **产品面规则不在这里**：[GLOSSARY.md](../../GLOSSARY.md)（术语与中文纪律）、
> [m0-ux-spec.md](../product/m0-ux-spec.md)（交互规格）。
> **采集时点**：2026-11-17（Asia/Taipei），证据基于 HEAD `2a35dcb` 与同批未提交改动
> （`AGENTS.md`、`CLAUDE.md`、`.githooks/`、`scripts/install-hooks.mjs`、`package.json` 的 `check`/`hooks:install`）。
> **维护纪律**：规则改动需 owner 同意并记入 §11；行号只用于定位，**规则以「哪个文件、什么要点」为准**。

## 目录

1. [这份规范怎么用](#1-这份规范怎么用)
2. [目录与分层](#2-目录与分层)
3. [强制门禁](#3-强制门禁)
4. [文案纪律](#4-文案纪律)
5. [数据与错误](#5-数据与错误)
6. [组件与 UI](#6-组件与-ui)
7. [测试](#7-测试)
8. [依赖与包体](#8-依赖与包体)
9. [提交与发布](#9-提交与发布)
10. [已知坑清单](#10-已知坑清单)
11. [未决项、已知缺口与变更记录](#11-未决项已知缺口与变更记录)

---
## 1. 这份规范怎么用

**它是什么**：本仓「怎么改代码」的唯一正文。入口是根目录 [AGENTS.md](../../AGENTS.md)（一页纸：
必读顺序、十条硬规则、提交前命令），本文件是它的展开与证据。产品面（该做什么、文案怎么说）
在 [GLOSSARY.md](../../GLOSSARY.md) 与 [m0-ux-spec.md](../product/m0-ux-spec.md)，不在这里重复。

### 1.1 优先级：冲突时按这个顺序

1. **owner 的原话**（决策、验收口径）——任何文档与之冲突，先改文档；
2. **术语与产品规则**：GLOSSARY → m0-ux-spec §0/§4；
3. **本规范**（工程实现方式：分层、门禁、测试、发布）；
4. **个人/团队习惯**（格式化偏好、命名品味、编辑器配置）。

低优先级的写法不得覆盖高优先级；确实需要例外时，写进 §11 并说明理由，不要静默违反。

### 1.2 三条读法约定

| 标记 | 含义 | 不服会怎样 |
| --- | --- | --- |
| **[门禁]** | 机器强制，`pnpm check` / `pnpm build` / CI 会红 | 提交或构建被拦下 |
| **[必守]** | 靠人守：没有自动化检查，只有 code review、验收和 e2e 兜底 | 门禁不报错，但验收会打回 |
| **[现状]** | 描述当前实现的真实状态，不是要求；改动时不要误以为有门禁保护 | 你改了没人拦，但可能踩到 §10 的坑 |

每条规则都给**证据**（载体文件 + 规则要点，必要时附行号）。行号会随改动漂移，
**以「哪个文件、什么规则」为准，行号只用来快速定位**。发现证据失效（文件改名、规则被删），
先把证据改成事实，再谈规则。

### 1.3 适用范围

- 覆盖：`src/`、`e2e/`、`scripts/`、`tests/`、根配置（`*.config.ts`、`package.json`）、`docs/` 下的实现与文档。
- 不覆盖：兄弟仓 `../anvil/`（合约与部署导出，只读消费）、`dist*/`（构建产物）、`.research/`（本地产物，不入库）。

### 1.4 谁能改、怎么改

- **规则改动**（新增/删除/放宽一条要求）需要 owner 同意，并在 §11 留一条记录；
  agent 可以修正事实性错误（行号、文件名、命令），但不能自己放宽规则。
- 每次发现「文档写 A、代码做 B」，当次就要修掉其中一边，或写进 §11 的未决项——
  **不允许留着两边不一致**。本仓已经因为这事翻过车：首页空投提醒的规格被一个无引用的
  死组件里的旧文案带偏过一次。

### 1.5 与门禁的边界（先说清楚，避免误信）

本规范里约三分之一是 **[门禁]**，其余是 **[必守]**。判断方法：把这条规则违反一遍，
看 `pnpm check` 会不会红。不会红的，就只能靠 §7 的测试策略和 review 兜住——
所以「`pnpm check` 绿了」永远不等于「符合规范」。
## 2. 目录与分层

结论先行：**层由依赖方向定义，不由功能分类定义**。写文件前先问「它会 import 谁」，答案决定层；一条越级 import 就是一个落层错误，而不是一次代码风格问题。

### 2.1 八层的职责与边界

`src/` 顶层共 8 个层目录（`app|pages|widgets|features|entities|shared|domain|config`），另有 `src/test/`（测试装配，不是层）与 4 个根文件（`main.tsx`、`index.css`、`vite-env.d.ts`、`architecture.test.ts`），根文件的处理见 2.4。

| 层 | 职责（一句话） | 可依赖（门禁口径） | 真实例子 |
| --- | --- | --- | --- |
| `app` | 应用外壳：Provider、路由表、启动与深链恢复、构建版本守卫、导航壳 | 全部 8 层 | `src/app/app.tsx:1-9`（providers 包 router）、`src/app/router/app-router.tsx:48-76`（路由表） |
| `pages` | 一个路由一个目录：路由入口 + 页面级编排 | widgets 及以下 + domain/config | `src/pages/home/home-page.tsx:24-38` |
| `widgets` | 页面级可复用组合块：连接药丸、空状态、占位页、合约地址详情 | features 及以下 + domain/config | `src/widgets/connect-pill/connect-pill.tsx:34-45` |
| `features` | 一个用户动作：连接钱包、切换社区、选身份、铸造、兑换、转账、批量转账、授权、加池 | entities 及以下 + domain/config | `src/features/swap-token/ui/swap-token-panel.tsx:1-30` |
| `entities` | 一个业务实体的读模型 / hook：身份 NFT、社区代币、空投、当前轮次 | shared/domain/config | `src/entities/member-identity/model/use-member-identity.ts:1-40` |
| `shared` | UI 原语、通用 lib（cache/format/errors/flip/…）、全局偏好 model、全部文案 | domain/config | `src/shared/lib/cache.ts:1-40`、`src/shared/ui/button.tsx` |
| `domain` | 协议事实的纯 TypeScript：轮次轴、空投规则、身份排序、名字规则 | 仅 `domain` | `src/domain/round-axis.ts:1-44`（文件头第 16 行自述 "Pure TypeScript. No React, no window, no chain SDKs."） |
| `config` | 环境与链数据：地址簿、ABI、变体解析、错误文案生成物 | 仅 `config`（另可用 `@deployments`） | `src/config/networks.ts:1-40` |

方向定义两处，口径不完全相同，第 3.2 节逐条说明：

- ESLint：`eslint.config.js:10` 的 `LAYER_ORDER = ['app','pages','widgets','features','entities','shared']`（6 层）。
- 测试：`src/architecture.test.ts:7-16` 的 `LAYERS`（8 层，多 `domain`、`config`）。

### 2.2 层内目录约定

| 位置 | 约定 | 例子 |
| --- | --- | --- |
| `app/{bootstrap,navigation,providers,router,shell}/` | 按「启动 / 导航元数据 / Provider / 路由 / 外壳」切分 | `src/app/providers/app-providers.tsx`、`src/app/shell/app-shell.tsx` |
| `pages/<route>/` | 目录名 = 路由名（`home`、`my-nft`、`mint`、`airdrop`、`swap`、`liquidity`、`transfer`、`batch-transfer`、`approvals`、`apps`、`about`、`gov`、`act`、`group`、`me`、`theme`、`not-found`） | `src/pages/mint/mint-page.tsx`；路由表见 `src/app/router/lazy-routes.ts:8-23` |
| `widgets/<widget>/` | 无 `lib/model/ui` 三段约定，按真实文件平铺 | `src/widgets/empty-state/empty-state.tsx` |
| `features/<动作>/{lib,model,ui}/` | `lib` = 纯函数（可脱离 React 单测）、`model` = hook/查询、`ui` = 组件；三段按需，不强制齐全 | 三段齐全：`src/features/swap-token/`；仅 `ui`：`src/features/select-identity/ui/`；仅 `model`：`src/features/switch-community/model/` |
| `entities/<实体>/{lib,model}/` | `model` 是读模型 hook，`lib` 放该实体专属纯计算 | `src/entities/airdrop/{lib,model}/`、`src/entities/phase/model/use-current-phase.ts` |
| `shared/{config,lib,model,types,ui}/` | `config` 只放 copy；`lib` 无 React 的通用函数；`model` 全局 hook；`ui` 无业务语义的原语 | `src/shared/config/copy.ts:18`、`src/shared/lib/format.ts:1-25`、`src/shared/model/use-theme.ts`、`src/shared/types/ethereum.d.ts` |
| `config/{abis,network,deployments}/` | `abis` 为生成物，`network/<network>/` 为每环境数据包，`deployments/types.ts` 为解析与类型 | `src/config/abis/index.ts`、`src/config/network/anvil31337_dev/network.json` |

### 2.3 落层判据（判断树）

新增一个文件时按顺序问，命中即停。第 1 步到第 10 步的顺序就是依赖方向（越靠后越底层）。

```
1. 是构建期按环境注入的数据或它的解析器吗？                → config/
   （地址簿、ABI、chain 参数、variant、errors.generated.ts）
2. 是不含 React / window / 链 SDK 的协议事实或规则吗？      → domain/
   （轮次轴、空投门禁、身份排序、名字规则、应用目录）
3. 是通用、与业务无关的纯函数吗？                          → shared/lib/
   （format、cache、cn、flip、token-precision）
4. 是无业务语义的 UI 原语吗？                              → shared/ui/
   （button、card、sheet、popover、skeleton）
5. 是全局（跨页面、无业务实体）的 hook 或常量对象吗？       → shared/model/ 或 shared/config/
6. 是一个业务实体的读模型 / hook 吗？                      → entities/<实体>/model/
   （身份 NFT、社区代币、空投、当前轮次）
7. 是一个用户动作（点击后产生交易或切换上下文）吗？         → features/<动作>/{lib,model,ui}/
8. 是页面里可复用的组合块，但不含独立动作入口吗？           → widgets/<widget>/
9. 是路由入口或页面级编排吗？                              → pages/<route>/
10. 是外壳、路由、Provider、启动序列、导航元数据吗？        → app/
```

三条反向判据（命中任一条说明落层错了）：

| 现象 | 正确动作 |
| --- | --- |
| 两个层都要用同一段逻辑 | 先下沉到更底层（`shared/lib` 或 `domain`），再各自 import |
| 一个 `features/` 目录里出现了第二个动作的按钮 | 拆成两个 feature，页面里组合；禁止 feature 互引 |
| 往 `shared/` 里塞业务词（身份、空投、兑换） | 业务词属于 `entities`/`features`；`shared` 只收无业务语义的东西 |

### 2.4 `src/` 根文件与 `src/test/`

| 路径 | 允许放什么 | 门禁事实 |
| --- | --- | --- |
| `src/main.tsx` | 唯一入口：深链恢复、preload 恢复、`createRoot` | `src/main.tsx:1-20`；根文件不在任何层，`src/architecture.test.ts:58` 会过滤掉 |
| `src/index.css` | Tailwind v4 `@theme`、keyframes、全局 class | `src/index.css:141-235` |
| `src/vite-env.d.ts` | Vite 类型引用 | — |
| `src/architecture.test.ts` | 架构门禁本体（不在任何层，且被自身 `:51` 排除） | — |
| `src/test/setup.ts` | Vitest 装配；被 `:52` 排除、ESLint 单独放宽 storage 规则（`eslint.config.js:180-187`） | `src/test/setup.ts` |

## 3. 强制门禁

结论先行：**能机器判定的规则才有资格写进规范**。本章每条规则都给出载体、失败命令和「违规长什么样 → 正确写法」。反例代码块是示意（用仓库里真实存在的文件名），标注「反例」即表示不允许提交。

### 3.1 门禁总表

| # | 规则 | 载体 | 失败命令 | 实测 |
| --- | --- | --- | --- | --- |
| G1 | 分层依赖方向 | `eslint.config.js:19-38,175-179` + `src/architecture.test.ts:92-105` | `pnpm lint` / `pnpm test` | 两处都通 |
| G2 | storage 唯一边界 | `eslint.config.js:40-51,90-97,100-107` + `src/architecture.test.ts:138-151` | `pnpm lint` / `pnpm test` | 两处都通 |
| G3 | `domain/` 纯 TS | `eslint.config.js:108-143` + `src/architecture.test.ts:107-135` | `pnpm lint` / `pnpm test` | 两处都通 |
| G4 | CJK 文案范围 | `src/architecture.test.ts:158-163,198-206`（仅测试） | `pnpm test` | 通 |
| G5 | TS 严格档 | `tsconfig.json:14-26`、`tsconfig.node.json:14-18` | `pnpm typecheck` | 通 |
| G6 | type-only 导入 / 未使用变量 | `eslint.config.js:82-89` | `pnpm lint`（`verbatimModuleSyntax` 在 `pnpm typecheck` 二次兜底） | 通 |
| G7 | 代码格式 | `.prettierrc.json:1-9`、`.prettierignore`、`eslint.config.js:192` | `pnpm check` 第一步（`pnpm format:check`） | 2026-11-17 起入门禁，见 3.8 |
| G8 | 首屏包体预算 + 钱包 SDK 字节扫描 | `scripts/check-bundle.mjs:11-30,92-121` | `pnpm build` | 159.2/160 kB |
| G9 | CI 顺序门禁 | `.github/workflows/deploy.yml:124-159` | GitHub Actions | — |
| G10 | 提交前快速门禁 | `.githooks/pre-commit:36` → `pnpm check`（`package.json:16`） | `git commit` | 已落地并装在本 clone，见 §9.2、§11.1 |

### 3.2 分层依赖（G1）：两处实现、两套口径

同一规则被查两遍，因为两处各有盲区：ESLint 只认路径别名，测试认得相对路径。

| 维度 | ESLint | `src/architecture.test.ts` |
| --- | --- | --- |
| 层清单 | `LAYER_ORDER` 6 层（`:10`） | `LAYERS` 8 层（`:7-16`，多 `domain`、`config`） |
| 方向表达 | 逐层禁「比自己高」的层：`forbiddenFor()` 取 `LAYER_ORDER.slice(0, index)`（`:12-17`） | `ALLOWED` 矩阵显式列出每层允许的目标层（`:19-28`） |
| `domain` / `config` | 不在链上，各自独立 block：`domain` 禁一切 `@/*` 与 React/viem/wagmi/tanstack（`:108-134`）；`config` 禁一切 `@/…`（`:144-174`） | 进矩阵：`domain: ['domain']`、`config: ['config']`（`:26-27`） |
| 匹配对象 | 只匹配 `@/x` 与 `@/x/*` 两种字符串（`:28-33`） | 匹配 `@/x`（`:78-81`）、**相对路径**（`:82-88`）、`@deployments`（`:77`） |
| 扫描范围 | `src/<layer>/**/*.{ts,tsx}`（`:23`，**含测试文件**） | 跳过 `*.test.ts(x)`（`:51`）、`src/test/`（`:52`）、`src/` 根文件（`:58`） |
| `app` 层 | 无规则（`forbiddenFor('app')` 为空，`:21-22`；`layerRule('app')` 也未调用，`:175-179`） | `ALLOWED.app = LAYERS`（`:20`），即全部允许 |
| 失败命令 | `pnpm lint`（`eslint . --max-warnings=0`，`package.json:18`） | `pnpm test`（`vitest run`，`package.json:14`；我运行时架构测试 5 条全过） |

为什么必须两套：ESLint 的 `no-restricted-imports` 按字面 pattern 匹配**模块字符串**，`../../../features/x` 不匹配 `@/features*`；测试用 `targetLayer()` 把相对路径 `resolve` 到 `src/` 内再判层（`src/architecture.test.ts:82-88`）。反过来，测试的 `importsOf()` 是正则爬文本（`:63-74`），不含 `require`、不做类型解析，跨层 `import type` 的语义判定仍以 ESLint 为准。

**反例 A（ESLint 抓，测试也抓）：下层反向 import 上层**

```ts
// 反例（示意）：src/entities/phase/model/use-current-phase.ts
import { useCommunityContext } from '@/features/switch-community/model/use-community-context';
```

`pnpm lint` 输出：`Dependency direction violation: entities may not import @/features.`（消息模板 `eslint.config.js:31`）。
正确写法：`entities` 只向外给数据，由 `widgets`/`pages` 组合上下文。

```ts
// 正确：src/entities/phase/model/use-current-phase.ts
import { useAccount, useReadContract } from 'wagmi';
import { NETWORK } from '@/config/networks';
```

**反例 B（ESLint 静默、测试抓）：用相对路径绕过别名**

```ts
// 反例（示意）：src/entities/phase/model/use-current-phase.ts
import { useCommunityContext } from '../../../features/switch-community/model/use-community-context';
```

`pnpm lint` 通过（pattern 只有 `@/…`，`eslint.config.js:28-33`）；`pnpm test` 失败在 `src/architecture.test.ts:82-88,99-104`。
正确写法：同上，或把需要的值放进 `entities` 自己的读模型。

**反例 C（两处都抓）：`config` 反向依赖业务层**

```ts
// 反例（示意）：src/config/networks.ts
import { copy } from '@/shared/config/copy';
```

`pnpm lint`：`src/config is a leaf package: data only, consumed by every layer.`（`eslint.config.js:152-168`）；`pnpm test` 亦失败（`ALLOWED.config = ['config']`，`:27`）。
正确写法：`config` 内只用相对路径（`src/config/networks.ts:1-9` 的 `./env`、`./deployments/types`）与 `@deployments`。

**反例 D（两处都抓）：`domain` 拉业务/链依赖**

```ts
// 反例（示意）：src/domain/round-axis.ts
import { formatUnits } from 'viem';
import { copy } from '@/shared/config/copy';
```

`pnpm lint` 报 `src/domain is pure TypeScript and must not depend on React, the browser, or chain libraries.`（`eslint.config.js:129-131`）；`pnpm test` 报 `src/domain/round-axis.ts: forbidden import "viem"`（`src/architecture.test.ts:113-127`）。
正确写法：`domain` 只导出纯数据与纯函数，调用方负责格式化与文案。

`import type` 同样算违规：`eslint.config.js:25-35` 未开 `allowTypeImports`，类型导入与值导入一视同仁。

### 3.3 storage 边界（G2）

结论：**只有 `src/shared/lib/cache.ts` 可以出现 `localStorage` / `sessionStorage` 字样**，其余文件一律走 `cache` API。

| 层 | 载体 | 内容 |
| --- | --- | --- |
| ESLint 全局禁用 | `eslint.config.js:40-51,90` | `no-restricted-globals` 禁 `localStorage`、`sessionStorage` |
| ESLint 属性形式 | `eslint.config.js:91-97` | `no-restricted-properties` 额外覆盖 `window.localStorage` / `window.sessionStorage`、`globalThis.localStorage` / `globalThis.sessionStorage` |
| 唯一豁免 | `eslint.config.js:100-107` | 仅 `src/shared/lib/cache.ts` 关掉上述两类 |
| 测试复核 | `src/architecture.test.ts:138-151` | 除 `shared/lib/cache.ts` 外任何文件出现该字样即失败；并要求该文件确实存在（`:148-150`） |

**反例（两处都抓）**

```ts
// 反例（示意）：src/features/switch-community/model/use-recent-communities.ts
const raw = window.localStorage.getItem('love20:recent');
```

`pnpm lint`：`Only src/shared/lib/cache.ts may touch localStorage. Use the cache API so keys stay namespaced.`（`eslint.config.js:42-45`）；`pnpm test`：`only src/shared/lib/cache.ts references localStorage or sessionStorage` 失败（`src/architecture.test.ts:139-146`）。

**正确写法**

```ts
// src/entities/member-identity/model/use-member-identity.ts:5 真实导入
import { cache, type CacheScope } from '@/shared/lib/cache';

const scope: CacheScope = { chainId, contractAddress, wallet };
cache.set(scope, 'identity', tokenId);
```

key 由 `cache` 统一拼装为 `love20:v1:<chainId>:<contractAddress>:<wallet>:<businessKey>`（`src/shared/lib/cache.ts:80-84`），`businessKey` 必须是语义名、不许含地址/JSON/冒号（`:54-60`）；坏 JSON 自愈只删该 key（`:99-105`）；存储不可用（隐私模式/受限 iframe）返回 null/false 而不是抛错（`:62-70,108-119`）。

### 3.4 `domain/` 纯 TS（G3）

两处实现一致，细节不同：

| 载体 | 禁止 |
| --- | --- |
| `eslint.config.js:112-134` | import `react`、`react-dom`、`wagmi`、`viem`、`@tanstack/*`、以及任何 `@/*`（即禁止依赖 `shared`、`config` 等） |
| `eslint.config.js:135-141` | 引用全局 `window`、`document`、`location`、`localStorage`、`sessionStorage` |
| `src/architecture.test.ts:113-127` | 同上 import 清单（正则） |
| `src/architecture.test.ts:128-131` | 去掉注释后，正文出现 `window`/`document`/`location`/`React` 即失败（比 ESLint 更严：连标识符文本也扫） |

`domain` 的单测只 import `vitest` 与同层相对模块（`src/domain/round-axis.test.ts:1-2`，其余 `src/domain/*.test.ts` 相同），纯度可脱离 DOM 环境验证。

**反例**

```ts
// 反例（示意）：src/domain/round-axis.ts
export function label(round: number): string {
  return `${round} · ${window.location.pathname}`;
}
```

`pnpm lint`：`src/domain must stay platform independent.`（`eslint.config.js:137-139`）；`pnpm test`：`forbidden identifier /\bwindow\b/`（`src/architecture.test.ts:128-131`）。
正确写法：`domain` 返回结构化结果，URL/文案在 `app`/`shared` 侧拼。

### 3.5 CJK 文案范围（G4）

结论：**`src/**` 里出现中文字符串字面量 = 门禁失败**，白名单只有 3 个文件。

| 项 | 载体 | 事实 |
| --- | --- | --- |
| 判定 | `src/architecture.test.ts:158` | `CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/` |
| 白名单 | `src/architecture.test.ts:159-163` | `shared/config/copy.ts`、`shared/config/copy-pages.ts`、`config/errors.generated.ts` |
| 扫描对象 | `src/architecture.test.ts:170-196` | 用 TypeScript AST 取字符串字面量 / 无插值模板 / JSX 文本；注释与标识符不算 |
| 豁免 | `src/architecture.test.ts:51-52` | `*.test.ts(x)` 与 `src/test/` 不参与 |
| 失败命令 | `pnpm test` | 报错形如 `路径:行号: 文本`（`:200-205`） |

注意：**ESLint 没有对应的 CJK 规则**（通读 `eslint.config.js` 全文，无手写 CJK 校验）。README 曾写「由测试/ESLint 门禁强制」，2026-11-17 已改为只认架构测试（§11.1）。

**反例**

```tsx
// 反例（示意）：src/pages/mint/mint-page.tsx
<Button>立即铸造</Button>
```

`pnpm test` 失败：`pages/mint/mint-page.tsx:NN: 立即铸造`；`pnpm lint` 不报。
**正确写法**

```tsx
import { copy } from '@/shared/config/copy-pages';
<Button>{copy.pages.mint.title}</Button>
```

（`copy.pages.mint.title = '铸造身份 NFT'`，`src/shared/config/copy-pages.ts:154-156`。）可复用句子写成参数化函数而不是字符串拼接，例如 `src/shared/config/copy-pages.ts:180` 的 `name.check.tooLong(maxBytes)`。

### 3.6 TypeScript 严格档（G5）

`pnpm typecheck` 一次跑两个 project：浏览器侧 `tsconfig.json`、脚本侧 `tsconfig.node.json`（`package.json:21`）。

| 项 | 位置 | 它实际拦住的东西 |
| --- | --- | --- |
| `strict` | `tsconfig.json:18` | 隐式 any、strictNullChecks 等全家桶 |
| `noUncheckedIndexedAccess` | `tsconfig.json:19` | `arr[0]`、`record[key]` 的结果类型含 `undefined` |
| `exactOptionalPropertyTypes` | `tsconfig.json:20` | 不许把 `undefined` 赋给 `foo?: T`（必须声明 `foo?: T \| undefined`） |
| `noImplicitOverride` | `tsconfig.json:21` | 覆写父类成员必须写 `override` |
| `noImplicitReturns` | `tsconfig.json:22` | 分支漏 `return` |
| `noFallthroughCasesInSwitch` | `tsconfig.json:23` | `switch` 落空 |
| `noUnusedLocals` / `noUnusedParameters` | `tsconfig.json:24-25` | 未使用的变量/参数 |
| `isolatedModules` | `tsconfig.json:14` | 依赖跨文件类型的 re-export 必须 `export type` |
| `verbatimModuleSyntax` | `tsconfig.json:15` | 类型导入必须显式 `import type`，否则产物里留下无意义的 import |
| `forceConsistentCasingInFileNames` | `tsconfig.json:26` | 大小写不一致的路径（Linux CI 与 macOS 本地不一致） |
| `allowImportingTsExtensions: false` | `tsconfig.json:11` | 不许写 `./x.ts` 后缀 |
| 脚本侧同档 | `tsconfig.node.json:14-18` | `vite.config.ts`、`vitest.config.ts`、`playwright.config.ts`、`scripts/**/*.mjs` 同受 strict / noUnused 约束 |

**反例 1：`exactOptionalPropertyTypes`**

```ts
// 反例（示意）：src/shared/lib/flip.ts
interface Options { readonly durationMs?: number }
const options: Options = { durationMs: undefined };   // TS2375
```

**正确写法**（仓库真实写法，`src/shared/lib/flip.ts:39-46`）：可选属性同时接受显式 `undefined`。

```ts
readonly durationMs?: number | undefined;
```

**反例 2：`noUncheckedIndexedAccess`**

```ts
// 反例（示意）
const first = values[0];           // string | undefined
first.toUpperCase();               // TS2532: Object is possibly 'undefined'
```

**正确写法**（`src/shared/lib/flip.ts:159-161`、`src/architecture.test.ts:69-70`）：

```ts
const hex = /^#([0-9a-f]{6})$/i.exec(color.trim());
const value = Number.parseInt(hex[1] ?? '', 16);
```

**反例 3：用 `_` 前缀绕过未使用检查的边界**

- 未使用**参数**：`_prefix` 同时满足 ESLint（`argsIgnorePattern: '^_'`，`eslint.config.js:84`）与 tsc（`noUnusedParameters` 对 `_` 开头参数不报）。
- 未使用**局部变量**：不要靠 `_` 前缀，直接删。`varsIgnorePattern: '^_'` 只影响 ESLint，`tsc` 的 `noUnusedLocals` 是另一套判定（`tsconfig.json:24`），两边口径不要混用。

### 3.7 type-only 导入与未使用变量（G6）

| 规则 | 配置 | 违规表现 | 正确写法 |
| --- | --- | --- | --- |
| 类型导入必须标 `type` | `@typescript-eslint/consistent-type-imports`，`prefer: 'type-imports'`，`fixStyle: 'inline-type-imports'`（`eslint.config.js:86-89`） | `import { ReactNode } from 'react'` 只当类型用时 lint 报错，`pnpm typecheck` 也会因 `verbatimModuleSyntax` 报 TS1484 | `import type { ReactNode } from 'react'`（`src/app/providers/app-providers.tsx:2`）或内联 `import { useState, type ReactNode } from 'react'`（`src/features/swap-token/ui/swap-token-panel.tsx:1`） |
| 未使用变量/参数 | `@typescript-eslint/no-unused-vars`，`argsIgnorePattern/varsIgnorePattern: '^_'`（`eslint.config.js:82-85`） | `const first = ...` 未被使用 | 删除；参数保持签名时改名为 `_args`（`src/features/transfer-token/model/use-identity-recipient.test.ts:29` 是真实用法） |
| 禁止显式 `any` | `tseslint.configs.recommended`（`eslint.config.js:69`）里 `@typescript-eslint/no-explicit-any` 的级别是 `error`（实测读取该 preset） | 写 `: any` 或 `as any` 即报错 | 用 `unknown` + 收窄 |
| 警告即失败 | `eslint . --max-warnings=0`（`package.json:18`） | 任何 warning 都让 `pnpm lint` exit 1 | — |
| React hooks 规则 | `reactHooks.configs.recommended.rules`（`eslint.config.js:79-81`） | 条件调用 hook、依赖数组缺项 | — |

**反例（lint 与 typecheck 双双报错）**

```ts
// 反例（示意）：src/app/providers/app-providers.tsx
import { ReactNode } from 'react';        // TS1484 + consistent-type-imports
const unused = 1;                          // no-unused-vars（删掉，别改名成 _unused）
```

**正确写法**（真实代码）

```ts
// src/app/providers/app-providers.tsx:2
import type { ReactNode } from 'react';

// src/features/swap-token/ui/swap-token-panel.tsx:1（同一规则的内联写法）
import { useEffect, useMemo, useState, type ReactNode } from 'react';
```

### 3.8 代码格式（G7）

| 配置项 | 值 | 位置 |
| --- | --- | --- |
| `semi` | `true` | `.prettierrc.json:2` |
| `singleQuote` | `true` | `.prettierrc.json:3` |
| `trailingComma` | `all` | `.prettierrc.json:4` |
| `printWidth` | `100` | `.prettierrc.json:5` |
| `tabWidth` | `2` | `.prettierrc.json:6` |
| `arrowParens` | `always` | `.prettierrc.json:7` |
| `bracketSpacing` | `true` | `.prettierrc.json:8` |
| `endOfLine` | `lf` | `.prettierrc.json:9` |
| 与 ESLint 的关系 | `eslint-config-prettier` 关闭所有格式类 lint 规则（`eslint.config.js:5,192`） | 格式只由 Prettier 判定 |
| 忽略 | `node_modules`、`dist*`、`coverage`、`pnpm-lock.yaml`、`.research`、`docs`、`errors.generated.ts`、`build-id.generated.ts`、`GLOSSARY.md`、**`ledger/`**（`.prettierignore:1-19`） | `ledger/` 由外部台账工具写表头，格式化会被工具改回，故永不参与 |

**反例**

```ts
// 反例（示意）
const label = "连接钱包"
const opts = { a: 1 }
```

`pnpm format:check` 失败（双引号、缺分号、缺尾逗号）。
**正确写法**：`const label = '连接钱包';` / `const opts = { a: 1, };`

**2026-11-17 起它是门禁（owner 选 A，见 §11.2 D1）**：`package.json` 的 `check` 现在是 `format:check → typecheck → lint → test`，所以 `pnpm check` 与 pre-commit 钩子都会拦；CI 的 `check` job 也加了独立的 `pnpm format:check` 步（`.github/workflows/deploy.yml`）。执行方式：先全仓一次性格式化（独立 `chore(format)` 提交，71 个文件、只动换行与缩进），再把门禁打开——**平时不要手工跑 `pnpm format` 之外的全仓写入**，只格式化自己改的文件即可。

### 3.9 首屏包体预算（G8）

| 项 | 值 | 位置 |
| --- | --- | --- |
| 硬失败线 | 200 kB gzip | `scripts/check-bundle.mjs:11` |
| 目标线 | 160 kB gzip | `scripts/check-bundle.mjs:12` |
| dev 变体宽限 | +1 kB（=161 kB） | `scripts/check-bundle.mjs:14-27` |
| 变体来源 | `process.env.VITE_ENV`，缺省 `prod` | `scripts/check-bundle.mjs:28-30` |
| 计入范围 | `dist/index.html` 的 module script + modulepreload 的 JS | `scripts/check-bundle.mjs:4-6,41-49` |
| gzip 口径 | `gzipSync(buffer, { level: 9 })` | `scripts/check-bundle.mjs:69` |
| 超目标线 | `console.warn`，exit 0 | `scripts/check-bundle.mjs:98-103` |
| 超硬线 | `process.exit(1)` | `scripts/check-bundle.mjs:92-97` |
| 禁用钱包 SDK 字节 | 任一 shipped chunk 含 `@walletconnect` / `@reown` / `rainbowkit` / `@metamask/sdk` 即失败（懒 chunk 也查） | `scripts/check-bundle.mjs:105-121` |

**反例（无任何 lint/test 报错，只有构建会失败）**

```ts
// 反例（示意）：src/app/router/app-router.tsx
import { MintPage } from '@/pages/mint/mint-page';   // 页面进首屏图
```

**正确写法**（真实代码，`src/app/router/lazy-routes.ts:9`）：路由一律走 `import()`。

```ts
const loadMintPage = () => import('@/pages/mint/mint-page');
```

历史证据：`src/app/router/lazy-routes.ts:3-7` 记录「mint/my-nft 曾 eager，入口被推到 195.8 kB」；`c8b8378` 提交信息记录「页面文案 eager 导致 163.6 kB → 拆分后 158.9 kB」。

### 3.10 CI 跑什么（G9）

`.github/workflows/deploy.yml` 三个 job：

| job | 行号 | 步骤（顺序即失败顺序） |
| --- | --- | --- |
| `prepare` | `:50-122` | 按仓库名解析变体（含 `dev` → dev；含 `test` → test；否则 prod，`:74-83`），默认 base `/interface-dev/`、`/interface-test/`、`/`（`:88-96`），`vars.VITE_ENV` / `vars.VITE_BASE` / `vars.VITE_SITE_ORIGIN` 显式覆盖 |
| `check` | `:124-159` | 拒绝被跟踪的 `.account`（`:130-135`）→ pnpm 11.5.1（`:137-139`）→ Node 24（`:141-144`）→ `pnpm install --frozen-lockfile`（`:146-147`）→ `pnpm typecheck`（`:149-150`）→ `pnpm lint`（`:152-153`）→ `pnpm format:check`（2026-11-17 新增）→ `pnpm test`（`:155-156`）→ `pnpm build`（`:158-159`） |
| `build` | `:161-199` | 再装一次 → `pnpm build`（`:182-187`，注入 `VITE_ENV`/`VITE_BASE`/`VITE_SITE_ORIGIN`）→ `configure-pages` → `upload-pages-artifact` |
| `deploy` | `:201-214` | `deploy-pages`（`permissions: pages: write, id-token: write`） |

CI 明确不做的两件事：

- ABI 漂移门禁（`pnpm abis:check`）不在这个 workflow：注释 `:189-191` 说明该 checkout 没有 forge / 兄弟仓库。
- 不跑 e2e（需要 anvil 链）。`format:check` 自 2026-11-17 起已在 `check` job 里，不再属于缺口。

`pnpm build` 自身是一条 5 段链：`gen-build-id` → `pnpm typecheck` → `vite build` → `postbuild` → `check-bundle`（`package.json:12`）；所以「CI 的 build 步」= 类型 + 产物 + 404.html + 包体门禁。

### 3.11 门禁覆盖不到的地方（诚实清单）

| 空白 | 证据 | 后果 |
| --- | --- | --- |
| CJK 只有测试拦，ESLint 没有对应规则 | `eslint.config.js` 全文无 CJK；`src/architecture.test.ts:198-206` | 单跑 `pnpm lint` 无法发现中文字面量；`README.md:216-219` 的措辞需修正 |
| 相对路径越层只在测试里拦 | `eslint.config.js:28-33` 仅 `@/…`；`src/architecture.test.ts:82-88` | 依赖 `pnpm test`；只跑 lint 会漏 |
| 测试文件里的相对路径越层两边都不拦 | ESLint 层规则含测试文件但只匹配 `@/…`（`:23,28-33`）；测试排除测试文件（`:51`） | 测试代码可绕过依赖方向，需自觉 |
| `src/` 根文件与 `src/test/` 不受依赖规则 | `src/architecture.test.ts:52,58` | `main.tsx` 可 import 任意层（实际只 import `@/app`，`src/main.tsx:4-6`） |
| 依赖黑白名单无机器校验 | `package.json:33-45` 无脚本校验；只有 `scripts/check-bundle.mjs:108-121` 扫钱包 SDK 字节 | 新增依赖只能靠 review + 包体实测 |
| 构建配置里的中文不受 CJK 门禁约束 | `vite.config.ts:65`（`og:image:alt` 中文）；门禁只扫 `src/`（`src/architecture.test.ts:49-59`） | 属已知缺口（门禁只扫 `src/`），见 §11.3 S1 |

## 4. 文案纪律

结论先行：**用户可见的中文只允许存在于两个 copy 模块和一张生成的错误文案表里；句子必须是函数，数字必须走 `format.*`。**

| # | 铁律 | 正确写法 | 证据 |
| --- | --- | --- | --- |
| 4-1 | 中文只有一个出口 | `shared/config/copy.ts`（首屏）/ `shared/config/copy-pages.ts`（懒加载页与弹层）/ `config/errors.generated.ts`（生成） | `src/architecture.test.ts:158-163`、`:198-206` |
| 4-2 | 一句话 = 一个函数 | `copy.airdrop.eligible.shareLine(percent, symbol)` | `src/shared/config/copy-pages.ts:293-294` |
| 4-3 | 术语按 GLOSSARY，一词一义 | 空投动作写「空投铸造」，不写「领取」 | `GLOSSARY.md:27`、`:145` |
| 4-4 | 数字只走 `shared/lib/format*.ts`（金额 `format.ts` / 极小值与可见值 `format-tiny.ts` / 费率与百分比 `format-rates.ts`） | `formatTokenAmount(value, decimals)` | `src/shared/lib/format.ts:186-196` |
| 4-5 | 按钮文案全局同形 | `授权 {symbol}` / `立即铸造` / `已铸造` | `copy-pages.ts:1081-1082`、`:301`、`:314` |
| 4-6 | 同一内容不在同一页面出现两次 | 解锁状态只在摘要卡出现一次，动作区不重复 | 本节 §4.7；`m0-ux-spec.md` §3.14 |

### 4.1 CJK 门禁：唯一出口 + 编译期断言

机制：`vitest` 用 TypeScript AST 遍历 `src/**`（排除测试文件与 `test/` 目录），收集所有中文字符串字面量、模板片段和 JSX 文本；只允许出现在白名单的三个文件里。

```ts
// src/architecture.test.ts:158-163
const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const CJK_ALLOWED = new Set([
  'shared/config/copy.ts',
  'shared/config/copy-pages.ts',
  'config/errors.generated.ts',
]);
```

**反例**（组件里直接写中文，门禁直接红）：

```tsx
// ❌ src/features/claim-airdrop/ui/claim-airdrop-panel.tsx
<p className="text-sm text-muted">
  我的份额 {sharePercent}，预计可铸造空投 {symbol}：
</p>
```

**正例**（本仓写法：句子在 copy，组件只传数据）：

```tsx
// ✅ src/features/claim-airdrop/ui/claim-airdrop-panel.tsx:361-363
<p className="text-sm leading-6 break-words text-muted" data-testid="airdrop-share-percent">
  {copy.airdrop.eligible.shareLine(claim.sharePercent ?? UNKNOWN, swapSymbol)}
</p>
```

补充判据：合法位置**只有**这三个文件；注释与标识符不是字符串字面量，所以注释里写中文不触发门禁（`copy-pages.ts:255` 就是一条中文注释）。

### 4.2 `copy.ts`（首屏）与 `copy-pages.ts`（懒加载）的拆分判据

| 判据 | 落在 `copy.ts` | 落在 `copy-pages.ts` |
| --- | --- | --- |
| 谁渲染 | app shell、首页、连接与身份路径（首帧就要） | 懒加载路由的页面体、只在交互后打开的弹层/抽屉、占位页 |
| 进入包体的时机 | entry chunk | 该路由/该弹层的 chunk |
| 典型段落 | `common`、`nav`、`header`、`wallet`（按钮与药丸态）、`community`、`identity`、`home`、`errors`、`pageTitles`、`placeholders` | `pages.*`、`airdrop`、`swap`、`mintIdentity`、`approve`、`transfer`、`batchTransfer`、`liquidity`、`advanced`、`about`、`theme` |
| 复用方式 | 权威副本，只写一次 | `...firstScreenCopy` 展开，再按需覆盖/新增 |

两处模块头注释就是判据原文：`copy.ts:3-17`（「Copy that only lazily loaded pages render … lives in ./copy-pages so the first-screen graph does not carry those strings」）与 `copy-pages.ts:4-13`。加载器证据：只有外壳与首页是首屏代码，其余 16 个路由全是 `lazy()`（`src/app/router/lazy-routes.ts:3-23`、`:25-60`）。

**反例**：把钱包菜单正文放进 `copy.ts`——菜单是懒加载层，正文会白白进首屏包。

```ts
// ❌ src/shared/config/copy.ts（菜单正文挤进 eager 模块）
wallet: { connect: '连接钱包', disconnect: '断开连接', footer: '当前身份 NFT 保存在这台设备；…' }
```

**正例**：首屏只留按钮态，正文在 `copy-pages` 里展开。

```ts
// ✅ src/shared/config/copy.ts:76-89（只放药丸/按钮态）
wallet: { connect: '连接钱包', connecting: '连接中…', wrongNetwork: '网络不对，点此切换', … }
// ✅ src/shared/config/copy-pages.ts:25-40（菜单体，用展开复用壳层键）
wallet: { ...firstScreenCopy.wallet, addressLabel: '钱包地址', disconnect: '断开连接', … }
```

一个已记录的例外：页面标题必须在 `copy.ts`（`copy.ts:136-149` 的 `pageTitles`、`:150-164` 的 `placeholders`），因为 eager 的路由与页头要先显示标题，正文才随页面 chunk 到。

统计（可复核）：非测试文件里 import `copy-pages` 的 67 个、import `copy` 的 21 个。

### 4.3 参数化 copy 函数，禁止字符串拼接

规则：**变量是数据，中文与标点由 copy 函数提供**；同一个句子只存在一个函数，不要在组件里加 `+`、模板串或 `{' '}` 拼装。

**反例**：

```tsx
// ❌ 标点、空格和单位散落在组件里，同一句话会出现多个版本
<p>{'预计可铸造空投 '}{amount}{' '}{symbol}</p>
<p>{copy.airdrop.eligible.prefix + amount + ' ' + symbol}</p>
```

**正例**：

```ts
// ✅ src/shared/config/copy-pages.ts:293-300
shareLine: (percent: string, symbol: string) =>
  `我的份额 ${percent}，预计可铸造空投 ${symbol}：`,
expected: (amount: string, symbol: string) => `预计可铸造空投 ${amount} ${symbol}`,
```

现成函数可直接参照：`copy.brand.pageTitle(page, symbol)`（`copy.ts:23`）、`copy.home.greeting(name)`（`:107`）、`copy.home.reminderAirdropWithAmount(amount, symbol)`（`:127-128`）、`copy.identity.memberId(id)`（`copy-pages.ts:56`）、`copy.approve.action(symbol)`（`:1081`）。

两条细则：

- **单位归上游**：份额百分比自带 `%`，函数不得再补一个（`copy-pages.ts:288-292` 明确写了这一点）。
- **同一句话的两行显示用 aria-label 补全**：金额行只渲染数字，完整句子给读屏（`claim-airdrop-panel.tsx:361-370` 的 `shareLine` + `expected` 组合）。

### 4.4 GLOSSARY 术语纪律（高发项）

| 概念 | 唯一写法 | 禁止写法 | 证据 |
| --- | --- | --- | --- |
| 空投动作 | 「空投铸造」/「已铸造」/「立即铸造」 | 领取、领取空投、一键领取、claim（界面文案） | `GLOSSARY.md:27`、`:145`；`copy-pages.ts:301`、`:314` |
| 空投对象 | 「空投份额」 | 铸造空投份额、奖励 | `GLOSSARY.md:145`；`copy-pages.ts:342` |
| LP | 「流动性凭证」/「份额」 | LP 代币、算力、积分 | `GLOSSARY.md:129`；`copy-pages.ts:1098` |
| 激励 | 「激励」/「铸造激励」 | 奖励、收益、空投奖励 | `GLOSSARY.md:91`、`:161-163` |
| 授权 | 「授权」 | approve、allowance、批准 | `GLOSSARY.md:122` |
| 轮次等待 | 「约 X 分钟」 | 阶段数字（`Phase`）、绝对解锁时间 | `GLOSSARY.md:75`；`copy-pages.ts:284` |

**反例 / 正例**（空投动作）：

```ts
// ❌ 把协议的铸造说成用户去"取"
cta: '领取空投', done: '已领取'
// ✅ src/shared/config/copy-pages.ts:301 / :314
cta: '立即铸造', title: '已铸造',
```

纪律不靠自觉兜底：`src/features/claim-airdrop/lib/airdrop-unavailable-copy.test.ts:27-32` 直接断言 S4 四种 unavailable 状态的标题与正文都不含「领取」。

### 4.5 数字与格式化：只走 `format.*`，`locale` 显式声明

| 函数 | 用途 | 硬规则 | 证据 |
| --- | --- | --- | --- |
| `formatTokenAmount` | 所有展示的代币数量 | 整数分组、小数**截断**（不四舍五入）、小数位按数量级自适应（最多 6 位）；**极小非零金额按「首有效位 + 2 位」显示、不设位数上限**（代币精度 ≤ 18，1 wei 就是 `0.000000000000000001`），见 §4.5.1 | `format.ts:186-196`（数量级 `:125-138`、有效位 `:145-159`） |
| `formatVisibleTokenAmount` | 会真正移动的金额（批量转账/回执/前后余额） | 走与 `formatTokenAmount` 同一套有效位规则（极小非零金额都显示得出来）；`< 最小可见单位` 只作**极端兜底**（显式传了 `maxFractionDigits` 等把值压成 `0` 的情况），如 `formatVisibleTokenAmount(1n, 18, { maxFractionDigits: 2 })` → `< 0.01` | `format-tiny.ts:28-54` |
| `formatPercent` / `formatBpsPercent` | 百分比、滑点档 | 最多 2 位（截断）；`minimumFractionDigits` 只给固定预置标签 | `format-rates.ts:68-79`、`:53-57` |
| `formatTinyPercent` | **「占比」类百分比**（治理权占比、加速份额占比、查询结果占比） | `≥ 0.01%` 走 2 位；`< 0.01%` 时用 **`0.{x}yyyy`** 形式（`x` = 小数点后前导 0 的个数，`yyyy` = 随后最多 4 位非零数字）显示、**不设 `x` 上限**，**永不落成 0**（§4.5.1） | `format-tiny.ts:64-78` |
| `formatRate` | 价格 / 汇率（`1 FROM ≈ X TO`） | 默认 2 位；价格行可显式传 6 位，避免反向价格被截成 0 | `format-rates.ts:24-50` |
| `formatPhase` | 高级视图里的轮次/阶段 | 不加千分位 | `format-rates.ts:60-66` |
| `UNKNOWN` / `DEFAULT_LOCALE` | 未知值 / 默认语言 | `'—'` / `'zh-CN'` | `format.ts:20-22` |

> **模块拆分（2026-11-19 四轮）**：数字格式化按职责拆成三个文件——金额在 `shared/lib/format.ts`、极小值与「看得见」兜底在 `shared/lib/format-tiny.ts`、费率 / 百分比 / 阶段 / 时间在 `shared/lib/format-rates.ts`。规则仍是「用户可见数字只走 `format.*`」，调用点从哪个文件 import 不影响规则。

`locale` 规则：**每个 locale 相关函数的签名都带 `locale` 参数（默认 `zh-CN`）**，调用点直接吃默认值；任何 `toLocaleString()`、`new Intl.*` 都只允许出现在 `format*.ts` 内部（统计：`grep` 全仓，`shared/lib/format.ts` 之外 0 处）。

**反例**：

```tsx
// ❌ 硬编码精度、绕过分组规则、又被浏览器 locale 影响
{(Number(balance) / 1e18).toFixed(2)}
{amount.toLocaleString()}
```

**正例**：

```tsx
// ✅ src/pages/me/me-page.tsx:60-63
const amountText =
  balance.status === 'ready' && balance.value !== undefined
    ? `${formatTokenAmount(balance.value, balance.decimals)} ${token.symbol}`
    : undefined;
// ✅ src/features/batch-transfer/ui/batch-receipt.tsx:132
{`${formatVisibleTokenAmount(record.total, record.decimals)} ${record.symbol}`}
```

### 4.5.1 数字显示规范：小数位按数量级自适应（owner 2026-11-19）

规则：**同一数量级用同一小数位**，整数部分一律千分位，小数一律**截断、不四舍五入**；未知值仍是「—」。

| 显示值的整数部分 | 最多小数位 | 例（18 位精度） |
| --- | --- | --- |
| `< 1` | 6 | `0.000001`、`0.999999` |
| `1 – 999` | 4 | `1.2345`、`999.9999` |
| `1e3 – < 1e6` | 2 | `1,000.12`、`99,999.99` |
| `≥ 1e6` | 0 | `99,799,100` |

- 判断依据是 `value / 10^decimals` 的**整数部分**（不是四舍五入后的值）。实现是 `shared/lib/format.ts#fractionDigitsForMagnitude(value, decimals)`，返回 0 / 2 / 4 / 6 四档；`formatTokenAmount` 现在**默认**按它取位数，调用点不要再传死位数。
- **极小非零金额要显示有效位（owner 2026-11-19 四轮）**：按数量级规则会被截成 `0` 的**非零**金额，改用「**第一个有效位 + 2 位**」的小数位，**不设位数上限**（代币精度本身 ≤ 18 位，`first + 2` 再被 `decimals` 封顶就是最多 18 位）。例：18 位精度 `100000000000 wei` → `0.0000001`；`999999999999 wei` → `0.000000999`；**`1 wei` → `0.000000000000000001`**（不再退化成 `< 最小可见单位`）。实现 `format.ts#tinyFractionDigits(value, decimals)`（本轮去掉了旧的 12 位上限），`formatTokenAmount` 已默认启用，调用点不要自己补位数。**全程截断、不四舍五入**（资金安全，多显示一位也不许进位）。`< 最小可见单位` 只留给「调用点显式传了 `maxFractionDigits` 把值压成 0」这类极端兜底（见 §4.5 表）。
- 只有**明确不是代币金额**的面才允许显式传 `maxFractionDigits`，且要在调用点写清原因。现状两个例外：**价格 / 汇率**（`formatRate` 传 6 位——反向价格常常很小，2 位会被截成 0）；**输入框回填 / 校验用的无损原文**（`rawInputValue`：位数 = `decimals`、去掉千分位，不能丢 wei）。**百分比与滑点档固定 2 位**（`formatPercent` / `formatBpsPercent`，最多 2 位、截断），不随数量级变化——唯一例外是「占比」类的极小值，见下一条。
- **占比小于 `0.01%` 时走极小占比规则**（owner 2026-11-19；实现 `shared/lib/format-tiny.ts#formatTinyPercent`）：`≥ 0.01%` 仍按 2 位（截断）；`< 0.01%` 时用 **`0.{x}yyyy`** 形式（`x` = 小数点后前导 0 的个数，`yyyy` = 随后最多 4 位非零数字）显示，`x` **不设上限**——`0.004%`、`0.000012%`、`0.0000001%`、`0.000000000000000001%` 都照实显示；`x` 不设上限，多长都照实显示，**永远不落成 `0.00%`、也不再写 `<0.00000001%` 这类笼统下限**。适用面 = **「占比」类百分比**（我的治理权占比 / 加速质押占比 / 查询结果里的占比）；滑点、费率、部署参数比例仍固定 2 位（它们是用户设定的值或协议参数，不是份额占比）。
- 未知值（`undefined` / `null`）仍渲染 `—`，绝不渲染 `0`（§5-2）。
- **会真正移动的金额**（批量转账合计 / 逐行金额 / 回执 / 前后余额）继续用 `formatVisibleTokenAmount`：与 `formatTokenAmount` 同一套有效位规则（极小非零金额都显示得出来）；`< 最小可见单位` 只在值被显式 `maxFractionDigits` 压成 `0` 时兜底，裸 `0` 只代表真的 0。

owner 原话（2026-11-19）：`|值| < 1` → 6 位；`1–999` → 4 位；`1e3–1e6` → 2 位；`≥1e6` → 0 位；一律千分位 + 截断不四舍五入；未知仍「—」，非零被截断成 0 时用 `< 最小可见单位`；百分比固定 2 位。
（2026-11-19 追加：**占比 < `0.01%`** 用「`0.{x}yyyy`」（`x` = 前导 0 个数、其后最多 4 位非零数字）显示、**不设 `x` 上限**，永不落成 0；**极小非零金额**同样不设位数上限（18 位精度 `1 wei` → `0.000000000000000001`），`< 最小可见单位` 只作极端兜底——本条覆盖同日早先的「6/8 位 / `<0.00000001%` / 12 位上限」旧口径。）

**反例 / 正例**：

```ts
// ❌ 调用点自己写死位数：同一个数在不同页面位数不同
formatTokenAmount(balance, 18, { maxFractionDigits: 6 });

// ✅ 默认按数量级取位数（9,999.885749 → 9,999.88）
formatTokenAmount(9_999_885_749n * 10n ** 12n, 18);
// ✅ 极小非零金额按有效位显示，不设上限（不再被数量级规则截成 0）
formatTokenAmount(100_000_000_000n, 18); // '0.0000001'
formatTokenAmount(999_999_999_999n, 18); // '0.000000999'
formatTokenAmount(1n, 18); // '0.000000000000000001'（1 wei，不再退化）
// ✅ 会真正移动的金额同一套规则；只有显式压位数时才兜底
formatVisibleTokenAmount(1n, 18); // '0.000000000000000001'
formatVisibleTokenAmount(1n, 18, { maxFractionDigits: 2 }); // '< 0.01'

// ✅ 极小占比（治理权占比 / 加速份额占比 / 查询结果占比）：< 0.01% 时 0.{x}yyyy，x 无上限、最多 4 位非零数字
`${formatTinyPercent(0.004)}%`; // '0.004%'
`${formatTinyPercent(0.0000001)}%`; // '0.0000001%'
`${formatTinyPercent(0.0000000001)}%`; // '0.0000000001%'
`${formatTinyPercent(0.000000000000000001)}%`; // '0.000000000000000001%'（x 不设上限）
// ❌ 有份额却显示 0.00%，用户会以为没有治理权
`${formatPercent(0.0002)}%`;
```

### 4.6 按钮与状态文案的统一形

| 场景 | 固定写法 | 证据 |
| --- | --- | --- |
| 精确额度授权 | `授权 {symbol}` | `copy-pages.ts:1081` |
| 长期授权 | `长期授权 {symbol}` / 流动性撤出用 `长期授权 流动性凭证` | `:1082`、`:1098` |
| 授权状态 | `读取授权额度中…` → `授权中…` → `确认中…` → `已授权`；长期为 `已长期授权` | `:1083-1089` |
| 空投主按钮 | `立即铸造`；进行中 `铸造中…` → `确认中…`；结果 `已铸造` | `:301`、`:335-336`、`:314` |
| 通用动作 | `重试` / `刷新` / `关闭` / `取消`（`copy.common`） | `copy.ts:26-38` |
| 关闭类按钮 | 回执、授权成功条、兜底抽屉、RPC 提示统一「好的」 | `docs/product/m0-ux-spec.md:730` |

四条形态规则：

1. **动词在前**：`动词 + 对象`（`铸造身份 NFT`、`确认转账`、`立即铸造`），不用光秃名词。
2. **只有"点下去立刻发生"的动作才加「立即」**：全仓「立即」只出现在空投 CTA（`grep 立即 copy*.ts` 命中 `copy-pages.ts:285`、`:301`）。
3. **进行中统一 `动词中…`，省略号用单个 `…`（U+2026）**，不写 `...`（`copy.ts:32`、`:78`、`copy-pages.ts:1087-1088`）。
4. **完成后是状态词，不是动词**：`已铸造`、`已授权`、`已转出`，同一状态在按钮 / 徽标 / 回执里必须同一个词。

**反例 / 正例**：

```ts
// ❌ 三处同义不同形，用户以为是三个功能
'1. 授权', '允许使用 USDT', 'Approve'
// ✅ src/shared/config/copy-pages.ts:1081-1089
action: (symbol: string) => `授权 ${symbol}`,
approving: '授权中…',
approved: '已授权',
```

### 4.7 同一内容不在同一页面出现两次（owner 2026-11-19）

规则：**除页面级帮助 / 提示信息外，同一内容不应在同一页面出现两次。** 「内容」包括状态词、字段名 + 数值、同一句说明；同一条状态只能从一处数据源渲染一次。

- **页面级帮助 / 提示**（各页底部「提示」卡、`GovIntro`「治理权的作用」、规则折叠、错误提示）可以解释同一个概念，但**不许复述数据卡里已经显示的状态句**——帮助是「为什么会这样」，不是第二份状态。
- **状态类信息只在摘要卡出现一次**：解锁状态由纯函数算一次（`domain/gov-stake.ts#stakeUnlockState`），只在一张卡的「状态块」渲染；动作区不再重复「已申请解锁」按钮或「还要再等…」小字。
- **摘要已经给出的数据，明细不再重复列**：`MyStakeSummary` 的 `showVotes` / `showPhases` / `showBoost` 就是这条规则的开关（治理首页摘要已显示治理权与承诺解锁期时，明细里不再列一遍）。
- 页面 intro 若只是复述下方摘要卡的状态，直接删掉，不要「引言 + 卡片」说两遍。

**反例（2026-11-19 修掉）**：取消质押页曾同时出现「已申请解锁」和「还要再等 N 个阶段（约 X 分钟）」各两次——一次在摘要卡的状态块，一次在动作区（一个禁用的「已申请解锁」按钮 + 一行等待提示）。两处口径一样，用户会以为其中一处是另一种状态。

**正例**：取消质押页只保留摘要卡里的状态块（「已申请解锁」+ 一句「还要再等…」）；解锁等待期间动作区不渲染任何按钮，可撤出时才多一个「撤出」。

**自查**：按页面数同一状态文案 / 同一 `data-testid` 前缀的出现次数；同一内容有两处渲染时，删掉信息量更少的那处（通常是动作区的重复说明），不要两处都留。这条与 GLOSSARY 文案纪律第 6 条「同一概念一页只能有一个叫法」同源：叫法不能有两个，同一内容也不该出现两次。

### 4.7.1 一页通常只做一件事、说明集中（参考性规范，owner 2026-11-19）

**性质：参考性规范，不是硬门禁。** 机器不拦、评审按它判断「这页是不是把多个任务和一堆说明堆在一起」；确实需要例外时按个例分析（见第 4 条）。

1. **一页一件事**：一个页面通常只承载一个用户任务（质押一份流动性、申请解锁、查一个地址的流动性…）。一页上并排两个不相关的任务时，优先拆页面或折进一处入口，而不是把两块表单并排摆出来。
2. **说明文字尽量集中**：同一页的规则 / 提示收进**一张**说明卡或一份说明里，不要「每张卡都配一段小字」。同页多张说明卡会把正文挤散，也让用户不知道先读哪张——2026-11-19 的 `/stake/liquidity` 就把「提示」与「治理权的作用」合并成一张「治理权的作用与提示」（`data-testid="gov-rules-card"`），`/stake/staketoken` 则把散落的提示收成一张「加速激励质押的作用」。
3. **多个元素各自都需要说明时，用信息符号按钮**：在元素旁放一枚 `Info` 图标按钮（`shared/ui/icons` 的 `Info`；图标 `aria-hidden`，按钮自身带 `aria-label` 说明点开是什么），点击**自下而上弹出面板**（用 `shared/ui/sheet` 的 `Sheet`：`<md` 底部 sheet / `≥md` 居中弹层，§6.5），面板里放该元素的解释。这样按钮不占正文行、页面也不会被说明文字撑长。范例就是 `/me`「质押资产」卡（owner 2026-11-19 四轮）：标题旁的信息按钮（`me-stake-info`，`aria-label` = `copy.gov.mine.infoAria`、`Info aria-hidden`）打开自下而上的 `Sheet`（`me-stake-info-panel`，标题 `copy.gov.mine.infoTitle`），面板里列份额与预计可取回；**它原来是锚定 popover，四轮已按本节改成 `Sheet`**（锚定弹层不再用于「解释一块内容」这类说明）。
4. **例外要具体分析**：确实需要在同页并排多块说明时（例如必须同屏对照的两份口径），在实现处写清为什么不能收进信息按钮，评审按个例判断，不套模板、也不为凑规则删掉用户真正需要的信息。
5. 本条与 §4.7 是同一取向的两面：§4.7 管**重复**（同一内容说两遍不行），本条管**分散**（每处都配一段小字也不行）。

### 4.8 第 4 章检查清单

- [ ] 新增中文没有落在 `copy.ts` / `copy-pages.ts` 之外（`pnpm vitest run src/architecture.test.ts`）。
- [ ] 新字符串进的是对的模块：首屏路径进 `copy.ts`，懒加载页/弹层进 `copy-pages.ts`。
- [ ] 句子是函数；组件里没有 `+`/模板串拼中文。
- [ ] 术语逐条过 `GLOSSARY.md`：空投=空投铸造、LP=流动性凭证、激励≠奖励。
- [ ] 数字走 `format.*`；没有新的 `toLocaleString` / `toFixed` / `Number(...)/1e18`。
- [ ] 金额位数跟数量级走（§4.5.1）：调用点没有写死位数；极小非零金额按有效位显示、**不设位数上限**（18 位精度 1 wei 也要显示出来），`< 最小可见单位` 只作显式压位数的极端兜底；「占比」类百分比用 `formatTinyPercent`（`< 0.01%` 时`0.{x}yyyy` 形式（x=前导零个数，最多 4 位非零数字，无 x 上限）），有份额时不会显示成 `0.00%`、也不再写 `<0.00000001%`。
- [ ] 按钮与状态用 4.6 的表里的固定形，省略号是 `…`。
- [ ] 同一内容没有在同一页面出现两次（§4.7）：状态只在一张卡出现，摘要与明细不重复；页面级帮助 / 提示除外。
- [ ] 一页只做一件事、说明集中（§4.7.1，参考性）：没有把两件无关的事并排堆在一页；同页说明已收进一张卡，多个元素各自要解释时用 `Info` 信息按钮 + `Sheet` 面板，例外处写清理由。

---

## 5. 数据与错误

结论先行：**加载是骨架、未知是「—」、失败是「读不到」；三者都不许退化成 `0` 或空白。读被 `enabled` 门住时，`refetch` 必须复检同一条件；错误文案只从生成的映射表来，原文永远不出现在界面。**

| # | 铁律 | 界面表现 | 证据 |
| --- | --- | --- | --- |
| 5-1 | 加载 → 骨架 | `Skeleton` + `aria-busy` + `sr-only` 「读取中…」 | `src/shared/ui/skeleton.tsx:4-11`；`src/app/shell/route-fallback.tsx:9-27` |
| 5-2 | 未知 → 「—」 | `UNKNOWN` / `copy.common.unknown`，**绝不先渲染 0** | `format.ts:20-22`、`:186-196`；`copy.ts:33` |
| 5-3 | 失败 → 「读不到」+ 重试 | `copy.common.readFailed` / 各页 `*ErrorTitle` + `copy.common.retry` | `copy.ts:36`；`wallet-menu-content.tsx:104-119` |

产品侧的同一条铁律写在 `docs/product/m0-ux-spec.md:15`（§0 第 6 条：「不显示未知值为 0：加载用骨架，未知用「—」，失败说「读不到」」）。

### 5.1 一个读取状态机的五态模板

本仓把「读不到」拆成**不重叠**的五态，渲染时按序短路。最完整的现成样例是钱包菜单的余额行：

```tsx
// ✅ src/widgets/connect-pill/wallet-menu-content.tsx:111-118
if (status === 'loading') return <Skeleton className="h-4 w-16" />;
if (status === 'unavailable') return <span className="text-xs text-muted">{copy.common.notConfigured}</span>;
if (status === 'error') return <span className="text-xs text-muted">{copy.common.readFailed}</span>;
return <span className="font-mono text-sm font-medium text-foreground">{display}</span>;
```

| 状态 | 用户看到 | 用词 |
| --- | --- | --- |
| `loading` | 骨架条（与最终布局同高，避免跳动） | 不写文字，`sr-only` 用 `copy.common.loading` |
| `unavailable` | 灰字 | `未配置`（部署槽还是零地址） |
| `error` | 灰字 | `暂时读不到` / `读不到` + 重试 |
| `unknown`（读到了但没有值） | `—` | `copy.common.unknown` / `UNKNOWN` |
| `ready` | 数字 | 只经 `format.*` |

**反例**（把「还没读到」渲染成 0 —— 用户会读成「我的钱没了」）：

```tsx
// ❌ undefined / null 被兜成 0
{balance ? formatTokenAmount(balance, decimals) : '0'}
{amount ?? 0}
```

**正例**：

```tsx
// ✅ src/pages/me/me-page.tsx:60-63 + :73 —— 读不到就留 undefined，渲染成 —
const amountText = balance.status === 'ready' && balance.value !== undefined
  ? `${formatTokenAmount(balance.value, balance.decimals)} ${token.symbol}`
  : undefined;
…
{amountText ?? copy.common.unknown}
```

金额场景还要更严一档：**0 就是 0**，非零金额绝不能被显示成 `0`——极小非零金额现在按有效位显示（18 位精度 `1 wei` → `0.000000000000000001`，§4.5.1）；只有调用点显式传 `maxFractionDigits` 把值压成 `0` 时，`formatVisibleTokenAmount` 才兜底写 `< 最小可见单位`（`format-tiny.ts:28-54`）。

### 5.2 TanStack Query 的 `enabled` 守卫约定

机制（本仓踩过的真 bug）：TanStack Query 的 `refetch()` **无视 `enabled: false`**。当查询被 `enabled` 门住、`args` 因此为 `undefined` 时，手动 `refetch()` 会让 viem 抛 `AbiEncodingLengthMismatchError`，`isError` 一真，整个列表被钉在错误卡上。

**反例**：

```ts
// ❌ 查询是 enabled 门控的，包装层却无条件重读
const enabled = active && memberNftAddress !== undefined && memberId !== null;
const retry = () => { void read.refetch(); };   // 禁用状态下 args 缺失 → 编码错误
```

**正例**（本仓的两处写法，语义相同）：

```ts
// ✅ src/features/transfer-identity/model/use-member-recipient.ts:42-44
const retry = () => {
  if (enabled) void read.refetch();
};
```

```ts
// ✅ src/entities/member-identity/model/use-member-identity.ts:156-162
const refetch = () => {
  enumeration.refetch();
  if (ownerReadEnabled) void ownerRead.refetch();
};
```

同一约定还要贯彻到**状态派生**上：被禁用的读，其 `isError` 不是结论，只有 enabled 的读才算数。

```ts
// ✅ src/entities/member-identity/model/use-member-identity.ts:169-171
} else if (enumeration.status === 'error' || (ownerReadEnabled && ownerRead.isError)) {
  status = 'error';
```

回归测试把这件事钉住了，注释就是 bug 报告：`src/entities/member-identity/model/use-member-identity.test.tsx:8-15`（「`refetch()` 曾经无条件重读 ownerOf() …… 列表就渲染错误卡」）、`:82-96`（断言禁用时 `ownerRefetch` 不被调用、启用后被调用一次）。

统计：全仓 `void ….refetch()` 共 33 处，显式复检 enabled 条件的只有上面 2 处；其余是否安全见文末 T-3，落地新代码请按本节写。

### 5.3 错误文案的生成流水线

| 步骤 | 动作 | 产物 / 证据 |
| --- | --- | --- |
| 1 | 新增合约自定义错误时，在 `scripts/error-messages.zh.json` 加一条 `错误名 → 中文一句（结论 + 下一步）` | `README.md:178-179`；该 json 的键是英文错误名，如 `"AlreadyJoined": "你已经加入过了，不需要重复加入。"` |
| 2 | `pnpm gen:errors`（= `node scripts/gen-errors.mjs`） | `package.json:25`；`scripts/gen-errors.mjs:13-17` |
| 3 | 读协议注册表 `matt-gov/registry/errors.json`，按 selector 生成映射 | `scripts/gen-errors.mjs:14-15`、`:50-68` |
| 4 | **缺中文文案 → 生成器直接失败并列出错误名** | `scripts/gen-errors.mjs:69-73` |
| 5 | 注册表不在（干净前端 checkout）→ 退回手写 `FALLBACK` 并写 `TODO: regenerate` | `scripts/gen-errors.mjs:76-80`；`src/shared/lib/errors.ts:6-13` |
| 6 | 产物是提交进仓的 | `src/config/errors.generated.ts:1-8`（`AUTO-GENERATED … Do not edit by hand`） |

界面侧的唯一入口是 `toUserMessage(error)`：它把任意 viem/wagmi 错误收敛成中文句子，**从不返回原始 revert 字节、selector 或库内部信息**。

```ts
// ✅ src/shared/lib/errors.ts:101-113（节选）
export function toUserMessage(error: unknown): string {
  if (isUserRejection(error)) return copy.errors.rejected;
  if (readNumber(error, 'code') === -32002) return copy.errors.requestPending;
  const data = extractRevertData(error);
  if (data !== null) {
    const selector = data.slice(0, 10).toLowerCase();
    …
    const mapped = getContractErrorMessage(selector);
    if (mapped !== null) return mapped;
    return copy.errors.contractGeneric;
```

**反例**：

```tsx
// ❌ 把库的原始 message 直接贴到界面：会漏出 revert data、selector、HTTP 码
setError(String(error));           // 或 error.message
<pre>{JSON.stringify(error)}</pre>
```

**正例**：

```tsx
// ✅ 只消费收敛后的中文句子（claim-airdrop-panel.tsx:389-394 同形）
{tx.error !== null ? <p role="alert">{tx.error}</p> : null}
```

### 5.4 永不出现在界面上的词

| 词 | 为什么不出现 | 界面写什么 | 证据 |
| --- | --- | --- | --- |
| gas / gas fee | 用户不认识，且不是他能算的数 | 网络手续费 | `m0-ux-spec.md:10`、`:750` |
| revert / selector / `0x…` 堆栈 | 泄露实现、不可读 | 操作没有完成 / 交易被合约拒绝 | `errors.ts:97-101`；`errors.generated.ts:5-6` |
| approve / allowance | 是函数名不是动作 | 授权 / 长期授权 | `GLOSSARY.md:122` |
| nonce | 用户无法操作 | 「这笔交易还卡在钱包里」+ 恢复按钮 | `m0-ux-spec.md:717` |
| 滑点 | 易被理解成手续费 | 最多可接受的价格变化 | `GLOSSARY.md:137` |
| 区块 / 合约地址 / 轮次序号 | 只属于高级视图 | `/about` 与折叠技术详情 | `m0-ux-spec.md:10` |

这条也写在 copy 模块的头注释里，改文案时会被强制读到：`src/shared/config/copy.ts:8-9`（「Never write gas/approve/allowance/nonce/revert on the happy path.」）。

### 5.5 钱包层错误单独一层（首屏包体约束）

合约错误表有 248 个 selector（`CONTRACT_ERROR_CATALOG`，条数与 `README.md:174` 一致），不能进 entry chunk。所以错误处理分两层：

| 错误来源 | 入口函数 | 文件 | 为什么分开 |
| --- | --- | --- | --- |
| 写交易、合约读 | `toUserMessage` | `src/shared/lib/errors.ts:101` | 需要完整 selector 映射 |
| 连接 / 切网（EIP-1193） | `toWalletErrorMessage` | `src/features/connect-wallet/lib/wallet-errors.ts:23` | 首屏路径只用 4 个错误码，避免把大表拉进 entry |

```ts
// ✅ src/features/connect-wallet/lib/wallet-errors.ts:3-7
/**
 * Wallet-layer errors (EIP-1193). Kept out of shared/lib/errors.ts so the large
 * contract selector map is not pulled into the first-screen bundle; wallet
 * connect/switch failures only need these few cases.
 */
```

**反例**：连接按钮的失败处理 import `shared/lib/errors.ts`（首屏即加载 250 条映射）。
**正例**：只有 `code === 4001` / `-32002` / `4901|4902` / `4100` 四组判断，其余落 `copy.errors.generic`（`wallet-errors.ts:23-29`、`:46`）。

### 5.6 第 5 章检查清单

- [ ] 新读取都有五态：`loading` 骨架 / `unavailable` 未配置 / `error` 读不到 / `unknown` 「—」/ `ready` 数字。
- [ ] 没有任何 `?? 0`、`|| 0`、`Number(x).toFixed(2)` 出现在数据展示里。
- [ ] 被 `enabled` 门住的读，暴露给 UI 的 `refetch` 复检了同一条件；`isError` 也只在 enabled 时采信。
- [ ] 新合约错误已加进 `scripts/error-messages.zh.json` 并跑过 `pnpm gen:errors`（缺文案会失败）。
- [ ] 界面错误只来自 `toUserMessage` / `toWalletErrorMessage`，没有 `error.message`、`String(error)`。
- [ ] 首屏路径没有 import `shared/lib/errors.ts`。

---

## 6. 组件与 UI

结论先行：**可测试的锚点（`data-testid`）与文案解耦；三种数据状态各有固定模板；动效只做"看得见的因果"，并且能被减动效降级；颜色只经语义 token；按钮在流内、先决条件在前。**

| # | 约定 | 一句话 | 证据 |
| --- | --- | --- | --- |
| 6-1 | `data-testid` 层级链 | `<页面/区域>-<元素>`，kebab-case | §6.1 的 5 个真实例子（5 种命名族） |
| 6-2 | 骨架 / 空态 / 错态三模板 | 骨架不写文案、空态给一个下一步、错态给重试 | §6.2 |
| 6-3 | 动效参数固定 | FLIP 300ms `cubic-bezier(0.22,1,0.36,1)`，减动效直接落位 | `src/shared/lib/flip.ts:61-65`、`:100-102` |
| 6-4 | 颜色只用语义 token | 禁止 palette 类与 `#rrggbb` | `docs/adr/0005-color-tokens-and-theme.md:13-15` |
| 6-5 | Radix 弹层一个实现两断点 | 必须有 Title；焦点归还由弹层统一负责 | `src/shared/ui/sheet.tsx:24-28`、`:16-22` |
| 6-6 | 按钮组顺序 | 先决条件（授权）在前、主按钮在后、同组在流内 | `src/shared/ui/action-stack.tsx:9-26` |
| 6-7 | 可点 / 不可点一眼分辨 | primary 禁用 → 灰底；secondary 禁用 → 虚线边框；禁用态 `cursor-not-allowed`；禁用时旁边给原因 | §6.6.1；`src/shared/ui/button.tsx:33-40` |

### 6.1 `data-testid` 命名约定

规律：**kebab-case 层级链，第一段是页面或区域，往后逐级收窄到元素**；不含驼峰、下划线、中文，也不承载文案（文案会变，锚点不能变）。统计口径见文末命令（`src` 下 221 个唯一值 / 230 处）。

| 真实例子 | 所在位置 | 拆解 |
| --- | --- | --- |
| `home-identity-error` | `src/pages/home/home-page.tsx:94` | 页面 `home` + 区域 `identity` + 元素 `error` |
| `airdrop-share-percent` | `src/features/claim-airdrop/ui/claim-airdrop-panel.tsx:361` | 页面 `airdrop` + 元素 `share-percent` |
| `batch-transfer-receipt-total` | `src/features/batch-transfer/ui/batch-receipt.tsx:130` | 页面 `batch-transfer` + 区域 `receipt` + 元素 `total` |
| `liquidity-withdraw-available` | `src/features/liquidity-pool/ui/my-liquidity-panel.tsx:322` | 页面 `liquidity` + 区域 `withdraw` + 元素 `available` |
| `approvals-confirm-submit` | `src/features/approve-token/ui/approval-confirm-sheet.tsx:107` | 页面 `approvals` + 区域 `confirm` + 元素 `submit` |

现有命名族（按第一段）：`home-*`、`airdrop-*`、`swap-*`、`transfer-*`、`batch-transfer-*`、`liquidity-*`、`approvals-*`、`mint-*`、`my-nft-*`、`connect-pill`、`community-*`、`theme-*`、`tx-watch-*`、`rpc-blocked-notice`。

**反例 / 正例**：

```tsx
// ❌ 驼峰、复述文案、把 testid 当选择器
<div data-testid="SharePercent">   <div data-testid="立即铸造按钮">
// ✅ 层级链、与文案无关
<p data-testid="airdrop-share-percent">
```

一条纪律：**测试只按 testid 找元素，不要按中文文本**——中文全在 copy 里，措辞随时会改（`copy-pages.ts:257-262` 记录过一次 owner 改文案）。同一元素需要多处断言时，复用同一个 testid，不新造同义锚点。

### 6.2 骨架 / 空态 / 错态三模板

| 状态 | 模板 | 必须有的三件 | 证据 |
| --- | --- | --- | --- |
| 加载 | 路由级骨架 | `aria-busy` + `sr-only` 状态文案 + 与最终布局同节奏的 `Skeleton` 块 | `src/app/shell/route-fallback.tsx:9-27`；`src/shared/ui/skeleton.tsx:4-11` |
| 空态 | 虚线卡 + 一个主 CTA | 标题（陈述事实）+ 正文（说明不损失什么）+ **一个**下一步 | `identity-list.tsx:230-248` |
| 错态 | 实线卡 + 重试 | 标题（「…读不到」）+ 正文（「资产 / 身份 NFT 没有变化」）+ 重试 | `identity-list.tsx:212-228`；`claim-airdrop-panel.tsx:183-212` |

骨架（只做形状，不写文案）：

```tsx
// ✅ src/app/shell/route-fallback.tsx:11-19
<div aria-busy="true" className="min-h-[55vh] space-y-3">
  <span className="sr-only" role="status">{copy.common.loading}</span>
  <Skeleton className="h-5 w-28" />
  <div className="rounded-3xl border border-line bg-surface p-5">
    <Skeleton className="h-6 w-40" />
```

空态（虚线边框是"这里还没有东西"的统一视觉，`border-dashed border-line`）：

```tsx
// ✅ src/features/select-identity/ui/identity-list.tsx:235-243
<div className="rounded-3xl border border-dashed border-line bg-surface/70 px-5 py-8 text-center">
  <h2 className="text-base font-semibold text-foreground">{copy.pages.myNft.emptyTitle}</h2>
  <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted">{copy.pages.myNft.emptyBody}</p>
  <Link to="/mint" className={buttonStyles('primary', 'md', 'w-full sm:w-auto')}>
    {copy.pages.myNft.emptyMint}
  </Link>
```

错态（重试是一个真按钮，带图标与 `aria-hidden`）：

```tsx
// ✅ src/features/select-identity/ui/identity-list.tsx:218-224
<Button variant="secondary" leadingIcon={<RefreshCw className="h-4 w-4" aria-hidden="true" />} onClick={onRetry}>
  {copy.common.retry}
</Button>
```

**反例 / 正例（骨架）**：

```tsx
// ❌ 用一段中文占位、或用整页 spinner 顶掉布局（到位时页面跳一下）
<p>加载中...</p>
// ✅ 骨架条 + 布局占位（route-fallback.tsx:15-24）
<Skeleton className="h-5 w-28" />
```

**反例 / 正例（空态与错态）**：

```tsx
// ❌ 空态只有一句话、没有下一步；错态把库的原文贴给用户
<p>暂无数据</p>
<p>{error.message}</p>
```
```tsx
// ✅ 空态 = 标题 + 正文 + 一个 CTA（identity-list.tsx:236-243）
{copy.pages.myNft.emptyTitle} / {copy.pages.myNft.emptyBody} / {copy.pages.myNft.emptyMint}
// ✅ 错态 = 读不到 + 重试（identity-list.tsx:215-223）
{copy.pages.myNft.errorTitle} / {copy.home.errorBody} / {copy.common.retry}
```

细则：**骨架期间不回退到 CTA**——回执刚确认、数据在重取时也必须显示加载卡，不能把「铸造」按钮再放出来（`claim-airdrop-panel.tsx:159-163` 的注释与分支）。

### 6.3 动效：FLIP、减动效、桌面退化

| 规则 | 值 / 做法 | 证据 |
| --- | --- | --- |
| 列表重排用 FLIP | 量 First → 提交重排 → `useLayoutEffect` 量 Last → 播放 | `flip.ts:1-16`；`identity-list.tsx:157-188` |
| 时长与曲线 | `FLIP_DURATION_MS = 300`、`FLIP_EASING = cubic-bezier(0.22, 1, 0.36, 1)` | `flip.ts:61-65`；调用点 `identity-list.tsx:164-167` |
| 不留内联 transform | 动画用 `fill: 'none'`，结束后浏览器丢弃效果；临时 `position/z-index` 显式清理 | `flip.ts:125-131`、`:133-138` |
| 位移阈值 | < 2px 不算移动，跳过（避免亚像素抖动） | `flip.ts:67-68`、`:116-117` |
| 减动效 | `prefers-reduced-motion: reduce` 时不量不播，直接落位 | `flip.ts:100-102`、`:185-186`；`identity-list.tsx:146` |
| 桌面 `<tr>` 不做 transform | 退化为「即时置顶 + 620ms 底色脉冲」 | `identity-list.tsx:168-181`（注释在 `:169-171`）；`flip.ts:65`、`:191-201` |
| 弹层入场 | CSS keyframes：overlay 160ms / popover 140ms / sheet 200ms | `src/index.css:141-190` |
| 整页软过渡 | 180ms 淡出 → 应用变化 → 200ms 淡入 | `src/index.css:203-237`；`m0-ux-spec.md:779` |

**反例**（用 CSS transition 直接改内联 transform 做重排，动画结束后位移会残留并叠加下一次布局）：

```tsx
// ❌ 重排后手动写 translateY，且没有清理
<li style={{ transform: `translateY(${offset}px)`, transition: 'transform .3s' }} />
```

**正例**（`fill: 'none'` + 结束即恢复）：

```ts
// ✅ src/shared/lib/flip.ts:125-130
entry.element.animate(
  [{ transform: `translateY(${delta.toFixed(2)}px)` }, { transform: 'translateY(0)' }],
  { duration: durationMs, easing, fill: 'none' },
)
```

减动效的实现是"两处都要关"：JS 侧跳过测量与播放（`flip.ts:100-102`），CSS 侧关掉同名 keyframes（`index.css:184-190`、`:231-237`）。

### 6.4 颜色只用语义 token

规则：`src/` 里**禁止**出现 `slate/white/black/indigo/red` 等调色板类与 `#rrggbb` 字面量；组件只消费 token 派生的类（`bg-surface`、`text-muted`、`border-line`、`bg-brand`、`text-on-brand`…）。ADR 原文与 token 清单：`docs/adr/0005-color-tokens-and-theme.md:13-15`、`:19-33`；两套取值在 `src/index.css:23-44`（浅色 `@theme`）与 `:78-103`（`[data-theme='dark']`）。

**反例 / 正例**：

```tsx
// ❌ 深色主题下直接穿帮
<div className="bg-white text-slate-900 border-slate-200">
// ✅ token 派生（sheet.tsx:48-52 同形）
<div className="border border-line bg-surface text-foreground">
```

本仓现状（2026-11-17 `grep` 复核）：`src/**.tsx` 里 palette 色类 0 处、`#rrggbb` 字面量 0 处。

唯一受豁免的地方是主题页的两张「配色小样」——它必须同时展示两套调色板，颜色是纯数据：`src/shared/lib/theme.ts:28`、`:63-71`（`THEMES[].preview`）。

验证方式（当前是唯一自动化的那一层）：`e2e/theme-colors.spec.ts:1-20` 用 `getComputedStyle` 断言运行时计算色等于 `docs/product/three-line/theme.md` §1 的理论值，浅深两套都过。新增 token 时要同步四处：`index.css` 两套值、ADR-0005 的表、三线文档、主题页预览数据。

### 6.5 Radix 弹层与焦点约定

| 约定 | 做法 | 证据 |
| --- | --- | --- |
| 一个实现两断点 | `<md` 底部 sheet / `≥md` 居中 dialog，同一份内容 | `sheet.tsx:24-28`、`:49-54` |
| 必有可访问名 | `Title` 必填；没有 description 时放 `sr-only` 的 `Description` | `sheet.tsx:69-80` |
| 关闭按钮 | `DialogPrimitive.Close` + `aria-label={copy.common.close}` + 图标 `aria-hidden` | `sheet.tsx:82-89` |
| 不可关闭态 | `dismissible={false}` 同时挡 `onEscapeKeyDown` 与 `onPointerDownOutside`（版本不一致提示） | `sheet.tsx:13-14`、`:42-44`、`:55-60` |
| 焦点归还 | 统一由弹层的 `onCloseAutoFocus` 负责；无 Radix trigger 的弹层必须 `preventDefault()` 后把焦点还给打开它的按钮 | `sheet.tsx:16-22`；`menu-layer.tsx:33-40`、`:57`、`:67` |
| 打开者不抢焦点 | 触发按钮自己不要 focus，否则会被 focus scope 抢回 `<body>` | `connect-pill.tsx:78-81` |

```tsx
// ✅ src/widgets/connect-pill/menu-layer.tsx:37-40
const restoreAnchorFocus = (event: Event) => {
  event.preventDefault();
  if (anchor !== null && anchor.isConnected) anchor.focus();
};
```

**反例**：在弹层里手写固定定位的 div + 自己实现 Esc/点外关闭 + 不设 Title（焦点丢到 `<body>`，读屏没有名字）。

**正例**：弹层内容只关心"里面放什么"，几何与焦点全交给 `Sheet` / `PopoverContent`（`popover.tsx:17-37`；`sheet.tsx:98-99` 导出 `SheetClose`/`SheetTrigger`）。

配套：弹层里的中文照第 4 章走 `copy-pages.ts`（`copy-pages.ts:19-24` 说明了为什么弹层正文不在首屏模块）。

### 6.6 按钮组顺序与 `ActionStack`

| 规则 | 做法 | 证据 |
| --- | --- | --- |
| 先决条件在前 | `授权 {symbol}` 用 `secondary`，排在主按钮**前面** | `swap-token-panel.tsx:1055-1069` |
| 主按钮在后 | `swap-submit` 用 `primary`，同组相邻、同一行 | `swap-token-panel.tsx:1070-1082` |
| 同组容器 | `ActionStack`：流内纵向栈，无定位、无表面、无预留视口高度 | `action-stack.tsx:20-26` |
| 无 fixed 吸底 | 吸底栏已删除（旧 `StickyAction`）；只有导航是 fixed | `action-stack.tsx:13-18`；`bottom-nav.tsx:22` |
| 授权按钮永远显示 | 不需要授权时只剩主按钮占满宽度；需要时按钮显示状态词而不是消失 | `swap-token-panel.tsx:1052`、`:1069`；`m0-ux-spec.md:704-706` |

**反例**（吸底、且主按钮在左、授权被折到折叠区）：

```tsx
// ❌ 先决条件被藏到首屏之外，主按钮看起来"无缘无故变灰"
<div className="fixed bottom-0 inset-x-0">
  <Button>兑换</Button><Button variant="secondary">授权</Button>
</div>
```

**正例**：

```tsx
// ✅ src/features/swap-token/ui/swap-token-panel.tsx:1047-1053（结构节选）
<ActionStack>
  <div className={cn('flex items-stretch', showApproveStep ? 'gap-2' : 'flex-col')}
       data-testid="swap-actions">
    {showApproveStep ? <Button variant="secondary" …>{approveLabel}</Button> : null}
    <Button variant="primary" …>{swapLabel}</Button>
```

第 6 章这套顺序的产品依据写在 `m0-ux-spec.md:704-705`（owner 2026-11-14：「授权和兑换按钮应放到一起……先决条件按钮在前、主按钮在后」；移动端不再有 fixed 吸底按钮栏）。

### 6.6.1 可点 / 不可点一眼分辨（owner 2026-11-19）

规则：**禁用态的外观必须和可点态明显不同，而且按 variant 分两种禁用外观**——用户不该靠「点一下没反应」才发现按钮不可点。禁用样式只在 `shared/ui/button.tsx#buttonStyles()` 里定义，页面不要自己拼 `disabled:opacity-*` 之类的覆盖。

| 按钮 | 可点 | 不可点（`disabled`） |
| --- | --- | --- |
| `primary`（主操作） | 品牌色实底 + `text-on-brand` + 阴影 | **灰底**（中性面 `bg-elevated`）+ `text-muted`、无阴影、品牌色完全退掉 |
| `secondary`（次要动作 / 先决条件如「授权」） | 实线描边 `border-line` + `bg-surface` | **虚线描边** + `text-muted`（虚线是「这一格现在不能按」的统一视觉，与空态虚线卡同源，§6.2） |
| 鼠标指针 | `cursor-pointer` | `cursor-not-allowed`；**不要用 `pointer-events-none` 把光标也吃掉**——光标连同 hover 反馈一起消失后，用户会以为按钮坏了，而不是知道自己现在不能点 |
| 进行中 | — | 走 `loading`：按钮内文案换「…中…」+ 进度图标、保持看得懂；不是简单 disabled |

三条配套纪律：

1. **禁用必须给原因**：按钮不可点时，旁边或下方要有一句可见原因（「两侧数量都要大于 0。」「{symbol} 不够，还差 {x}」），原因消失才解锁；只灰不解释等于让用户猜。
2. **只读态不是禁用语义**：`已授权` / `已长期授权` / `已铸造` 这类「已经是最终状态」的按钮借用禁用外观，但文案必须是状态词（§4.6），和「这一步还不能做」的禁用要在文案上分得开。
3. **与 §4.2 的单一写操作约束配套**：同一时刻只允许一个写操作在途，在途时其余写按钮禁用；正因为一次性会有多个按钮变灰，禁用外观才必须一眼能认出（否则用户会以为是自己填错了）。同一页多枚代币的授权按钮（流动性质押的社区代币 / 父币）还要做到「只有正在签名的那一行显示进行中」，另一行禁用但文案不变。

**实现状态（2026-11-19）**：`buttonStyles()` 目前统一给 `disabled:border-line disabled:bg-elevated disabled:text-muted disabled:opacity-100 disabled:pointer-events-none`——**primary 的灰底已达成**；`secondary` 的虚线边框与 `cursor-not-allowed` 还需在该函数里按 variant 分开给（不要在各页面覆盖）。

**反例 / 正例**：

```tsx
// ❌ 靠透明度冲淡：可点和不可点只差一点灰度，用户分不清
<Button className="disabled:opacity-60">确认质押</Button>
// ❌ 用 pointer-events-none 把「不可点」的线索也删掉
<Button className="disabled:pointer-events-none disabled:opacity-50">确认质押</Button>
// ✅ 样式收敛在 buttonStyles()：primary 灰底 / secondary 虚线 / cursor-not-allowed，页面只给 disabled 与原因
<Button variant="primary" disabled={!readyToSubmit}>确认质押</Button>
<p className="text-xs text-muted">{reasonText}</p>
```

### 6.7 第 6 章检查清单

- [ ] `data-testid` 是 kebab-case 层级链，第一段是页面/区域；没有复述文案的锚点。
- [ ] 新读取状态走 6.2 三模板；骨架不写文案、不回退 CTA。
- [ ] 动效参数从 `flip.ts` 的常量来；没有新的手写 `transform` 或动画库。
- [ ] 减动效路径已照顾：JS 跳过 + CSS `animation: none`。
- [ ] 没有 palette 色类与 `#rrggbb`；新 token 同步 `index.css` 两套与 ADR/三线文档。
- [ ] 弹层用 `Sheet`/`PopoverContent`，有 Title，焦点归还走 `onCloseAutoFocus`。
- [ ] 按钮组在 `ActionStack` 里，先决条件在前、主按钮在后，没有 fixed 吸底。
- [ ] 按钮禁用态按 §6.6.1：primary 灰底、secondary 虚线边框、`cursor-not-allowed`，旁边或下方有一句禁用原因；没有在页面里用 `disabled:opacity-*` 覆盖。
- [ ] 金额走 §4.5.1 的数量级规则（不写死位数；百分比 / 费率固定 2 位；会移动的金额用 `formatVisibleTokenAmount`；「占比」用 `formatTinyPercent`）。

---

## 7. 测试

### 7.1 三层测试与命令

| 层 | 放哪 | 跑什么（真实脚本） | 证据 |
| --- | --- | --- | --- |
| 单测 | 与被测文件**同目录**的 `*.test.ts` / `*.test.tsx`；脚本类测试放 `tests/` | `pnpm test` = `node scripts/gen-build-id.mjs && vitest run` | `vitest.config.ts:21`（include 仅 `src/**/*.test.{ts,tsx}` 与 `tests/**/*.test.{ts,tsx}`）、`package.json:14` |
| 前端线（e2e） | `e2e/*.spec.ts`，**只读页面渲染出来的文字** | `pnpm e2e`（自举 8555 链 → 构建 → `vite preview` → Playwright） | `e2e/README.md:3`、`e2e/README.md:12-30`、`package.json:22` |
| 合约线 | `scripts/verify/<page>-contract.mjs`，退出码非 0 即失败 | 手工运行，不进 CI | `docs/product/three-line-verification.md:40` |

现状规模（用来判断「这次是不是漏测了」，不是硬预算）：单测文件 116 个（`find src tests -name '*.test.ts*' | wc -l`）；e2e spec 19 个（`ls e2e/*.spec.ts`），STATUS 记录 2026-11-17 全量 **152/152** 全绿（`docs/STATUS.md:22`）；三线文档 7 份（`docs/product/three-line/`：airdrop、approvals、batch-transfer、liquidity、swap-fee、theme、transfer）。

### 7.2 单测写法约定

| 约定 | 做法 | 证据 |
| --- | --- | --- |
| 就近放置 | 测试文件与被测文件同目录、同基名 | `src/shared/lib/format.ts` ↔ `format.test.ts`；`src/shared/lib/flip.ts` ↔ `flip.test.ts`；`src/features/batch-transfer/lib/batch-parse.ts` ↔ `batch-parse.test.ts` |
| 纯逻辑先行 | 能抽成纯函数的先抽到 `lib/`，再对纯函数写单测，组件只做拼装 | `src/features/batch-transfer/lib/` 下 7 个 `*.test.ts`（parse / gas / errors / audit / receipt / record / read-state） |
| hook 测试 | `renderHook` + `vi.mock('wagmi')`，用 mock 的读 hook 钉住「读了几次」 | `src/entities/member-identity/model/use-member-identity.test.tsx:1-34`（`act`/`renderHook`、三处 `vi.mock`） |
| 组件测试 | Testing Library 按 role/name/exact 文本查询，断言分支渲染 | `src/features/batch-transfer/ui/batch-transfer-panel.test.tsx`、`src/pages/my-nft/my-nft-page.test.tsx` |
| 环境与别名 | `environment: 'jsdom'`、`setupFiles: ['./src/test/setup.ts']`、`@` → `src` | `vitest.config.ts:7-26` |
| 脚本测试 | `scripts/` 下的生成器/校验器在 `tests/` 里测 | `tests/check-abis-manifest.test.ts`、`tests/sync-network.test.ts` |
| 架构规则即测试 | 分层依赖方向、`localStorage` 只允许 `shared/lib/cache.ts` 一处，都由测试强制 | `src/architecture.test.ts:92`（`describe('dependency direction')`）、`src/architecture.test.ts:139` |

### 7.3 先写红测试，再改实现

固定四步：

1. 在**能复现的最小层**写一条会红的断言：纯函数 > hook > 组件 > e2e。
2. 跑一次，确认它因为「这个 bug」红，而不是因为环境红。
3. 改实现，让该断言变绿；**这条用例永久保留**做回归。
4. 提交信息里写清是回归（本仓历史即如此：`git log --oneline` 有 `fix(tx): 交易恢复加固（…）`、`fix(review): 按独立评审收口…`）。

两个本仓真实例子：

| 例子 | 红测试长什么样 | 为什么先写 | 证据 |
| --- | --- | --- | --- |
| 铸造回跳后「身份 NFT 列表暂时读不到。」（2026-11-17） | 单测断言「未选择身份时 `refetch()` 不得重读 `ownerOf`」「禁用态的 `ownerOf` 错误不得把列表打成 error」 | 现象只在「铸造后 1~2 s」出现，靠手点很难复现；把读次数钉死后 bug 变成确定性失败 | `src/entities/member-identity/model/use-member-identity.test.tsx:8-15`（回归说明）、`:81-96`（`expect(ownerRefetch).not.toHaveBeenCalled()`）、`:122-141`（status 派生）；STATUS 记录「修前 4 例红」`docs/STATUS.md:25`；测试与修在同一提交 `9ec3e57`（`git show --stat 9ec3e57`） |
| 同一 bug 的 e2e 回归 | 铸造 → 点「好的」→ 落到 `/my-nft` → **等 5 s** 再断言没有错误卡 | 列表先渲染成功、1~2 s 后才翻成错误卡，短断言会假绿；必须活过 handoff refetch 与 React Query 的重试 | `e2e/mint-identity.spec.ts:385-431`，等待与理由见 `:424-426`，断言见 `:427-430` |

反例（本规范要禁止的）：只改实现、不补断言。症状是同一个 bug 第二次出现时没人拦得住，而 e2e 里那条「等 5 s」的用例正是防止这种回退。

### 7.4 判据表 A：什么改动必须补单测

| 改动 | 必须补 | 判据 | 证据/先例 |
| --- | --- | --- | --- |
| `domain/`、`shared/lib/`、`features/*/lib/` 的纯逻辑（新增分支、边界、舍入/截断、解析） | 是 | 纯函数可穷举，成本最低、回归价值最高 | `src/domain/airdrop-share.test.ts`、`src/shared/lib/format.test.ts`、`src/features/batch-transfer/lib/batch-parse.test.ts` |
| hook 的状态派生（loading / error / empty / needs-selection 这类分支） | 是 | 分支由多个异步读拼出来，手测覆盖不到 | `use-member-identity.test.tsx`、`src/entities/member-identity/model/use-member-identities.test.tsx` |
| 组件的条件渲染分支（按钮禁用、错误卡、空态、回执） | 是 | e2e 只覆盖主路径 | `src/features/swap-token/ui/swap-token-panel.test.tsx`、`src/pages/home/home-page.test.tsx` |
| 错误码 → 中文文案映射 | 是 | 映射错了用户看到的就是十六进制 | `src/shared/lib/errors.registry.test.ts`、`src/features/mint-identity/lib/mint-errors.test.ts` |
| 生成器、校验器、同步脚本（`scripts/*.mjs`） | 是 | 这类脚本没有页面可点 | `tests/check-abis-manifest.test.ts`、`tests/sync-network.test.ts` |
| 只改样式类名 / 只改中文文案 | 否（跑既有测试即可） | 不改行为；中文只允许出现在两份 copy 文件里，由架构测试强制 | `src/architecture.test.ts:158-161`（`CJK_ALLOWED` = `shared/config/copy.ts`、`shared/config/copy-pages.ts`）、`:199-200`（`keeps every CJK string literal inside copy.ts or the generated error copy`） |

### 7.5 判据表 B：什么改动必须做三线校验

三线校验的适用范围由规范正文定义：**所有会读写链上数值的页面**（转账、批量转账、流动性池、代币授权，以及后续任何交易页）(`docs/product/three-line-verification.md:5`)。

| 触发条件 | 必须做三线 | 说明 | 证据 |
| --- | --- | --- | --- |
| 新增/修改一个读写链上数值的页面 | 是，**四件交付物缺一不可** | ①`docs/product/three-line/<page>.md`（§0 环境、§1 理论线、§2 合约线、§3 前端线、§4 对照表）②`scripts/verify/<page>-contract.mjs` ③`e2e/<page>-numbers.spec.ts` ④四档截图 | `three-line-verification.md:32-42` |
| 页面上出现**新的数值口径**（合计/到账/授权额度/份额/舍入/截断/预留） | 是 | 新口径 = 新公式，理论线要重算 | `three-line-verification.md:44-49`；实例 `docs/product/three-line/batch-transfer.md:42-44`（基线口径、可花余额、gasLimit 默认值） |
| 页面行为变了、但数值不变（交互/文案/刷新按钮） | 不作废理论线 | 只更新 §3/§4 并在头部注明「非反向修改」 | `three-line/batch-transfer.md:7`（2026-11-14 修订）、`:9`（2026-11-17 改版「理论值不变」） |
| 只改配色/主题 | 走**配色三线**（WCAG 手算 → `getComputedStyle` → 截图像素） | 主题页没有链上数值，按同一精神另立三线 | `docs/product/three-line/theme.md:3-6,9-16` |
| 纯工具页（关于、应用目录、我的） | 否 | 不读写链上数值 | `three-line-verification.md:5` 的适用范围反向推出 |

三条不可协商的硬约束：

- **理论线先于实现完成**，并在文档里留下时间戳/commit（`three-line-verification.md:36`；实例 `batch-transfer.md:5` 写明 §0/§1 写于 2026-11-14 06:34、基线 `c32edd5`，早于 `src/features/batch-transfer/**` 的任何代码）。
- **三线数值必须完全相等**，不相等就是缺陷，先查「谁的公式错了」，禁止改理论线迁就实现（`three-line-verification.md:15,49`）。
- 三线文档与两个断言脚本是页面任务的**验收条件**，不完整不得结案；Lead 复核方式是按文档重跑 §1 算术、§2 脚本、§3 spec（`three-line-verification.md:51-54`）。

固定执行环境（写三线时照抄，不许自创）：

| 项 | 规定 | 证据 |
| --- | --- | --- |
| 验证链 | 每次任务临时起专用链，规范原文写 **8566**、从 block 0 clean bootstrap；**禁止 8545（人工链）**，也禁止用 8555（e2e 链）做合约线写入（端口口径见 §11.2 D3） | `three-line-verification.md:19-24` |
| 账户 | anvil 固定 mnemonic `test test … junk`，默认只用 #1 `0xf39F…2266`、#5 `0x9965…04dc` | `three-line-verification.md:25-28` |
| 状态隔离 | 每用例前 `anvil_snapshot`、后 `anvil_revert` | `three-line-verification.md:29` |
| 前端线 | 同一端口：`E2E_ANVIL_RPC=http://127.0.0.1:<port> pnpm e2e`（套件不自己起链） | `three-line-verification.md:30`、`e2e/README.md:43-52` |

### 7.6 判据表 C：什么改动必须补 / 必须跑 e2e

| 触发条件 | 要求 | 证据 |
| --- | --- | --- |
| 新增或修改**写链路径**（approve / transfer / mint / claim / swap / 加撤流动性 / 批量转账） | 必须有一条 spec 走到**真实交易 + 回执**（不是 mock 回执） | `e2e/mint-identity.spec.ts:275-383`（approve → mint → 回执 → `cast` 复核 tokenId 的 owner）；`e2e/home-my-nft.spec.ts:550-606` |
| 页面渲染字符串/布局/主题/截图有变 | 补 spec 断言 + 重出四档截图 | `e2e/transfer-numbers.spec.ts:8-13,440-446` |
| 新增 e2e spec 文件 | 文件顶部 `isolateChain()`、`test.describe.configure({ mode: 'serial' })` | `e2e/mint-identity.spec.ts:66-69`；`e2e/chain.ts:153-182` |
| 改了 e2e harness / 链脚本 / 挖矿模式相关代码 | **全量连跑两遍都应全绿**（同链、无二次 bootstrap） | `e2e/README.md:18-20` |
| 改了交易恢复/慢钱包/重放这类时序逻辑 | 必须跑对应 spec（`--repeat-each` 验证不再泄漏） | `e2e/README.md:38`（`--grep "swap" --repeat-each=3`） |
| 只改 `docs/`、台账、ADR、截图、spec 文本 | 不跑 e2e；pre-commit 也会自动跳过 | `.githooks/pre-commit:19-26` |

**e2e 不在 CI 门禁里**：CI 的 `check` job 只有 Typecheck → Lint → Unit tests → Build（`.github/workflows/deploy.yml:149-159`），没有 e2e 步骤；e2e 通过的是本地门禁 + worklog 记录（`ledger/worklog/202611/16-1438-c467-…md:110-112` 记了 `pnpm test 761 passed（111 files）` 与 `pnpm e2e --grep "流动性" 17 passed`）。因此「等 CI 绿」不能代替跑 e2e。

### 7.7 e2e 链隔离硬边界

| 端口 | 角色 | 谁能碰 | 证据 |
| --- | --- | --- | --- |
| `:8545` | **人工链**：开发者浏览器钱包连的链 | 自动化**永不触碰**（只读查询也不行） | `e2e/README.md:5-10`；`docs/STATUS.md:53` |
| `:8555` | **e2e 自动化链**：套件自举、快照、回滚 | 只有 `pnpm e2e` / `scripts/e2e-chain.mjs` | `e2e/README.md:8,28-30`；`scripts/e2e-chain.mjs:46,267` |
| `:8566`+ | 三线校验临时专用链 | 该次任务自己起、自己停 | `three-line-verification.md:19-24` |

`:8545` 有**三层拦截**，不是君子协定：

1. `scripts/e2e-chain.mjs` 在解析端点后先判 8545，直接 `REFUSING TO RUN`（`scripts/e2e-chain.mjs:267-271,587-593`）。
2. `playwright.config.ts` 在**直接跑 `playwright test`** 时兜底（`playwright.config.ts:25-46`，`:37-42` 抛错）。
3. `e2e/chain.ts` 在快照/回滚前再判一次（`e2e/chain.ts:29-49`，`:38-45`）。

两条补充规则：

- `E2E_ANVIL_RPC` 显式指向别人的链时，套件**不管理**那条链（不启动、不 bootstrap），只校验可达且 `eth_chainId == 31337`；指向本机 8545 立即硬失败（`e2e/README.md:43-46`）。
- 每 **spec 文件**一次 `anvil_snapshot` / `anvil_revert`（不是每个 `test`），因为文件内测试共享夹具；`playwright.config.ts` 固定 `workers: 1`、`fullyParallel: false`（`e2e/README.md:54-67`；`playwright.config.ts:281-282`）。同一时刻只允许一个 e2e 进程，靠文件锁 `e2e.lock`，最多等 15 分钟（`e2e/README.md:91-93`；`scripts/e2e-chain.mjs:51-53`）。

### 7.8 Harness guards（套件自己的防假绿）

| 守卫 | 它防的现象 | 行为 | 证据 |
| --- | --- | --- | --- |
| **Stale build id** | `:4173` 上残留旧 `vite preview`，测的是旧 bundle（曾出现「先幽灵失败、杀掉后 49/49 假绿」） | 启动前请求 `/build-id.json` 与本次 `E2E_BUILD_ID` 比对；一致才复用；不一致时只有 `lsof`+`ps` 证明是本端口的 `vite preview` 才重启，否则 `:4173 上是旧构建（A ≠ B），拒绝复用` | `e2e/README.md:36`；`playwright.config.ts:227-265`（`:253` 是报错文案）、`:82-126`（id 如何算） |
| **Wedged chain** | 端口被占但 anvil 不应答，脚本却去 bootstrap，卡到锁超时 | bootstrap 前 3 s 超时探活：有应答就继续校验 chainId / `cast code <memberNFT>` / 地址簿；占用而不应答立即 fatal 并打印 `lsof`，提示 `pnpm e2e:reset-chain` | `e2e/README.md:37`；`scripts/e2e-chain.mjs:62-63,295-340` |
| **Mining-mode restore** | spec 冻结出块后没恢复，后续 spec 全部超时（2026-11-16 两次全量 flake 的根因） | `suspendMining()` / `restoreMining()` 成对；`restoreMining()` 回读 `anvil_getAutomine` + `anvil_getIntervalMining` 不一致就**在泄漏的那个文件**里失败；`isolateChain()` 在取快照前、回滚后各恢复一次 | `e2e/README.md:69-87`；`e2e/chain.ts:97-151`（`SUITE_MINING` 与回读断言）、`e2e/chain.ts:163-182` |
| Known flake fix | 连接后偶发落到 wrong-network pill，恢复流程断言超时 | 提交前断言注入钱包 `eth_chainId` == app chain（31337） | `e2e/README.md:39` |

记住快照**不恢复挖矿模式**（`anvil_snapshot` 不含它），这是上表第三条存在的理由（`e2e/README.md:75-76`）。

### 7.9 截图规范

| 项 | 规定 | 证据 |
| --- | --- | --- |
| 四档组合 | 移动 390×844、桌面 1280×800 × 浅色 + 深色，共 4 张/态 | `three-line-verification.md:42`；实现见 `e2e/transfer-numbers.spec.ts:440-446`（`{key:'mobile',390,844}` / `{key:'desktop',1280,800}` × `THEMES`） |
| 落盘位置 | `docs/product/screenshots/`，幂等覆盖写（不跨运行累积） | `three-line-verification.md:42`；`e2e/README.md:89,116`（2026-11-17 实测 179 张 `.png`，分母见 `docs/STATUS.md:35`） |
| 命名 | `<page>-<state>-<theme>-<viewport>.png` | `e2e/transfer-numbers.spec.ts:484,501,524,544`（`form-light-mobile.png` 等） |
| 主题怎么切 | 写 `love20:theme` 后**真实加载一次**，断言 `html[data-theme]` | `e2e/transfer-numbers.spec.ts:450-459` |
| 用途 | 验收证据，不是装饰：三线文档 §3 与 STATUS 都指向具体文件名 | `docs/STATUS.md:35`（逐前缀计数）、`three-line/batch-transfer.md:206`（「截图 12 张已刷新」） |
| **每次重跑都会改写文件字节** | 同一次改动、同一套 UI，重跑全量 e2e 后仍有 ~65 张 PNG 因渲染噪声字节变化（差几十到几百字节，肉眼无差）。**提交前先看 `git status docs/product/screenshots/`**：UI 没变就把这些 PNG 从暂存区撤掉，别让 65 个二进制混进一个格式/文档提交（见 §10.11） | 2026-11-17 实测：`git diff --stat` 显示 65 个 `Bin N -> M bytes`，`0 insertions` |

### 7.10 断言纪律：禁止宽松匹配

- 规范原文对前端线的要求是：只读页面渲染出来的文字/状态，**不允许在断言里放「差不多」「包含」这类宽松匹配**，也不允许读合约后再拼答案（`three-line-verification.md:13`）。
- 数值断言用精确相等：`expect(...).toBe(<理论值>)`；本仓 e2e 的数值期望来自 §1 理论线，不是链上读数倒推（`three-line-verification.md:12-14`；实例 `e2e/airdrop-numbers.spec.ts:287-289` 用 `toBe` 比对 `amount` / `share` / `remainingShare`）。
- `toContainText` 只用于**非数值**的文案存在性（如按钮上的「授权 TestLOVE20」，`e2e/mint-identity.spec.ts:294`）；一旦是金额/份额/额度，就必须整串精确匹配。
- 「不该出现」用 `toHaveCount(0)`，不用「看不见」：`e2e/mint-identity.spec.ts:427-430` 用 `toHaveCount(0)` 断言错误卡与「重试」按钮都不存在。
- 三线对照表的结论列只允许 ✅ / ❌，❌ 必须写明是缺陷还是「合约不支持，已停页记录」（`three-line-verification.md:39`）；`batch-transfer.md:250` 的收口句也是同一口径：「没有一处数值不一致；页面不展示的量已在 §1 明确排除，不是「差不多」匹配」。

### 7.11 常用命令速查

| 目的 | 命令 | 备注 |
| --- | --- | --- |
| 单测（含 build-id） | `pnpm test` | `package.json:14`；`pnpm test:watch` 不带 build-id（`:15`） |
| 只跑某组 e2e | `pnpm e2e --grep "流动性"` | **不要写 `pnpm e2e -- --grep …`**：`--` 会被透传给 Playwright，过滤失效、跑全量（`ledger/worklog/202611/16-1438-c467-…md:78-79`） |
| 复用/查看 e2e 链 | `pnpm e2e:ensure-chain` / `pnpm e2e:reset-chain` | `package.json:23-24`；`e2e/README.md:22-25` |
| 指定端点与端口 | `E2E_PORT=4178 E2E_ANVIL_RPC=http://127.0.0.1:8569 pnpm e2e` | `e2e/README.md:32,51`；`three-line/batch-transfer.md:200-206` |
| 强制重启本地 preview | `E2E_REUSE_PREVIEW=0` | `e2e/README.md:32`；`playwright.config.ts:234` |

---

## 8. 依赖与包体

结论先行：**首屏 gzip 是本项目唯一会静默劣化的指标**，所以它同时是产品约束（移动优先、非加密原生用户）和架构约束（`base` 烘进产物、无服务端）。

### 8.1 不加新依赖

规则：新增运行时依赖需要 owner 决定，并在同一次改动里给出包体实测；能用现有依赖或原生 API 完成的，不加库。

| 依据 | 内容 |
| --- | --- |
| 依赖白名单现值 | `package.json:33-45`：`@radix-ui/react-dialog`、`@radix-ui/react-popover`、`@tanstack/react-query`、`clsx`、`lucide-react`、`react`、`react-dom`、`react-router-dom`、`tailwind-merge`、`viem`、`wagmi`（11 个运行时依赖） |
| 明确不加的库 | `README.md:15-21`：No Next.js, no MUI, no WalletConnect/RainbowKit, no PWA/service worker；钱包注入式（`window.ethereum`） |
| ADR 决策表 | `docs/adr/0001-stack-and-static-hosting.md:28-37`（每类只留一个选择，理由列在表内） |
| 规则被引用的旁证 | `scripts/install-hooks.mjs:4-5`：「the repo has a no-new-dependencies rule (README «Stack»)」——连 husky 都用 `core.hooksPath` 手写替代 |
| 机器门禁 | 无依赖白名单校验；唯一字节级门禁是 `scripts/check-bundle.mjs:105-121` 的钱包 SDK 扫描 |

### 8.2 无动画库

结论：**动画只用 CSS 与 Web Animations API**，不引入 framer-motion / react-spring / GSAP / anime.js 一类库。

| 场景 | 实现 | 证据 |
| --- | --- | --- |
| 点选身份 NFT 后卡片移到列表首位（FLIP） | 手写 `captureFlipPositions()` + `playFlip()`，基于 `element.animate` | `src/shared/lib/flip.ts:1-16`（文件头，2026-11-17 owner 决定）、`:126-130` 真实调用 |
| 时长/曲线常量 | `FLIP_DURATION_MS = 300`、`FLIP_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'`、`FLIP_HIGHLIGHT_MS = 620` | `src/shared/lib/flip.ts:61-65` |
| 减弱动画偏好 | `prefers-reduced-motion: reduce` 时直接返回空播放（不闪） | `src/shared/lib/flip.ts:100-102,185` |
| 整页软过渡（选身份/切社区/换主题/回执跳转） | 纯 CSS keyframes + `useSoftTransition()` 状态机 | `src/shared/model/soft-transition.tsx:25`（注释「CSS only … no animation dependency」）、`:30-31`（180 / 200 ms 常量）、`src/index.css:192-235` |
| 弹层入场 | CSS keyframes `l20-fade-in` / `l20-pop-in` / `l20-sheet-up` | `src/index.css:141-181` |
| 全局减弱动画 | 媒体查询里把上述 animation 置 `none` | `src/index.css:184-189,231-235` |

依赖清单里没有任何动画库（`package.json:33-45`），且 `vite.config.ts:95` 用 terser 压缩、`:107` 关 sourcemap——体积敏感度与「不引入动画库」是同一个约束的两面。

### 8.3 懒加载判据

判定顺序（越靠前越优先拆）：

| # | 问题 | 结论 | 证据 |
| --- | --- | --- | --- |
| 1 | 首屏（shell + home）渲染前就需要吗？ | 不需要 → 必须进懒 chunk | `docs/adr/0001-stack-and-static-hosting.md:55-57`（首屏 = shell + home；文案三账本） |
| 2 | 是需要用户交互才出现的弹层/对话框吗？ | 是 → `lazy()`，触发按钮留在 eager 图 | `src/widgets/connect-pill/connect-pill.tsx:16-27`（Radix/Floating UI 首次交互才加载） |
| 3 | 是二级路由吗？ | 是 → `lazy-routes.ts` 的 `import()` | `src/app/router/lazy-routes.ts:8-23`；路由表 `src/app/router/app-router.tsx:5,53-72`（只有 `HomePage` eager） |
| 4 | 是页面内可再分的重块（快照 + ABI）吗？ | 是 → 页面内再 `lazy()` | `src/pages/home/home-page.tsx:17-22`（`AirdropReminder` 独立 chunk） |
| 5 | 是文案吗？ | shell/home 文案 → `copy.ts`；页面/弹层文案 → `copy-pages.ts` | `src/shared/config/copy.ts:3-17`、`src/shared/config/copy-pages.ts:4-13` |

文案拆分的口径细节：

- `copy.ts` 只放首屏（`src/shared/config/copy.ts:4`：「First-screen copy: shell, home and everything the identity/connect path renders」）；弹层文案（钱包菜单、无钱包引导、错误对话框、社区菜单）也归 `copy-pages.ts`（`src/shared/config/copy-pages.ts:19-24`）。
- `copy-pages.ts` 以 `...firstScreenCopy` 展开复用首屏对象，保证调用侧始终是 `copy.<section>.*` 一种形状（`src/shared/config/copy-pages.ts:10-18`）。
- 判据只有一条：**字符串会不会在首屏渲染前进入内存**。会 → `copy.ts`；不会 → `copy-pages.ts`。

### 8.4 包体预算与实测

| 口径 | 数值 | 来源 |
| --- | --- | --- |
| 目标线（warn） | 160 kB gzip | `scripts/check-bundle.mjs:12`；`README.md:67-69`；`docs/adr/0001-stack-and-static-hosting.md:50,55` |
| dev 变体 | 161 kB gzip（160 + 1 kB 数据宽限） | `scripts/check-bundle.mjs:14-30`（宽限理由：dev 地址簿是真实 20 字节地址 + HTTP RPC，gzip 更差；dev 1,358 B vs prod 688 B） |
| 硬失败 | 200 kB gzip | `scripts/check-bundle.mjs:11` |
| 当前实测（我复跑现有 `dist/`） | **159.2 kB gzip / 534.5 kB raw / 1 个 entry 文件**，exit 0 | `node scripts/check-bundle.mjs` 输出 |
| 文档记载 | `~157 kB`（`README.md:71-72`）、`158.9 kB`（`docs/adr/0001-stack-and-static-hosting.md:20,62`）、Vite 自带 gzip `~161 kB` 与 `163.0 kB`（依次见这两处） | 三者口径不同且都已过期；本规范只承认 `check-bundle.mjs` 的输出（§8.4、§11.1） |
| 历史劣化与修复 | 195.8 kB（mint/my-nft eager）→ 拆分路由；163.6 → 158.9 kB（页面文案移出首屏） | `src/app/router/lazy-routes.ts:3-7`；提交 `c8b8378` 的 message |

复测方式（唯一权威口径是构建产物 + `check-bundle`）：

```
VITE_ENV=prod pnpm build                  # 构建时变体决定预算口径
VITE_ENV=dev node scripts/check-bundle.mjs  # 只复核预算，不重新构建
```

注意 `pnpm build` 会先跑 `pnpm typecheck`（`package.json:12`），所以包体门禁永远在类型门禁之后。

### 8.5 `scripts/check-bundle.mjs` 的机制

| 步骤 | 做法 | 行号 |
| --- | --- | --- |
| 1. 找入口 | 正则从 `dist/index.html` 抓 `<script src="*.js">` 与 `<link rel="modulepreload" href="*.js">`（两种属性顺序都匹配） | `:41-49` |
| 2. 空名单即失败 | 抓不到任何 JS 时 exit 1，避免「门禁假装通过」 | `:51-54` |
| 3. 逐文件度量 | `gzipSync(..., { level: 9 })` 统计 gzip 与 raw；按 gzip 降序打印 | `:60-83` |
| 4. 双阈值 | > 200 kB → exit 1；> 目标线（160 / dev 161）→ warn | `:92-103` |
| 5. 钱包 SDK 字节扫描 | 扫 `dist/assets/*.js` 全部 chunk（含懒 chunk），命中 `@walletconnect` / `@reown` / `rainbowkit` / `@metamask/sdk` 即 exit 1 | `:105-121` |
| 6. base 处理 | 用 `VITE_BASE` 归一化前缀再从 `dist` 定位文件 | `:60-67` |

设计意图（注释原文要点）：首屏 JS = HTML 外壳在首帧前请求的所有 JS；单位是 gzip，因为手机上的关键是 gzip 后字节；懒 chunk 被 ban 的依赖同样算「仍在发布」，所以扫描不看是否 eager（`:105-107`）。

### 8.6 复核清单（改完包体相关代码后逐条跑）

```
pnpm lint                                  # G1/G2/G3/G6
pnpm test                                  # G1/G2/G3/G4 + 架构 5 条
pnpm typecheck                             # G5
pnpm build                                 # G8：类型 + 产物 + 404.html + 包体
node scripts/check-bundle.mjs              # 单独复核预算与钱包 SDK 字节
```

## 9. 提交与发布

### 9.1 提交前门禁：顺序与脚本清单

必跑门禁是**一条命令** `pnpm check`，内部顺序固定（`package.json:16`）：

| 步 | 命令 | 失败即停 | 证据 |
| --- | --- | --- | --- |
| 1 | `pnpm typecheck` = `gen-build-id` + `tsc --noEmit -p tsconfig.json` + `tsc --noEmit -p tsconfig.node.json` | 是 | `package.json:21` |
| 2 | `pnpm lint` = `eslint . --max-warnings=0` | 是 | `package.json:18` |
| 3 | `pnpm test` = `gen-build-id` + `vitest run` | 是 | `package.json:14` |

CI 走同一条链、多一步构建：Typecheck → Lint → Unit tests → Build（`.github/workflows/deploy.yml:149-159`）。`pnpm build` 自身已含 `typecheck` + `vite build` + `postbuild`（404.html / `.nojekyll` / `build-id.json`）+ 包体门禁（`package.json:12`；门禁阈值见 `README.md:34-38`：>200 kB 失败、>160 kB 警告、包体里出现 WalletConnect/AppKit/MetaMask SDK 字节即失败）。

判据：**提交前只跑 `pnpm check` 是不够的，凡改到会进产物的东西就要跑 `pnpm build`**——包体门禁只在 `pnpm build` 里，`pnpm check` 不含它。

脚本清单（`package.json:10-32`，按用途分组，不要凭记忆敲）：

| 用途 | 脚本 |
| --- | --- |
| 门禁 | `check`（= **format:check** + typecheck + lint + test）、`typecheck`、`lint`、`test`、`format:check`（`prettier --check .`） |
| 构建/预览 | `dev`、`build`、`preview` |
| e2e | `e2e`、`e2e:ensure-chain`、`e2e:reset-chain` |
| 生成/同步 | `gen:errors`、`sync:anvil`、`sync:network`、`abis:check` |
| 发布 | `release-to`、`release-to-interface-test`、`release-to-interface` |
| 钩子 | `hooks:install`（`node scripts/install-hooks.mjs`） |

### 9.2 pre-commit 钩子（本仓实现，[门禁] 的本地延伸）

**做什么**：`git commit` 时先跑 `pnpm check`（typecheck → lint → 单测），全绿才真正生成提交；
任何一项失败，提交**不发生**，报错指向具体文件与行号。不跑 `pnpm build`（包体门禁留在 build/CI），
不跑 `pnpm e2e`（需要 8555 链、约 10 分钟）——把这两样塞进每次提交只会逼人 `--no-verify`。

**为什么不用 husky / lint-staged**：本仓「不加新依赖」（§8.1）。改用 git 原生机制，三个文件：

| 文件 | 作用 |
| --- | --- |
| `package.json` `"check"` | `pnpm typecheck && pnpm lint && pnpm test`——门禁顺序的**唯一真源**，钩子只调它 |
| `package.json` `"hooks:install"` | `node scripts/install-hooks.mjs` |
| `.githooks/pre-commit` | 随代码入库、可 review 的钩子；`#!/bin/sh`，带 `set -eu` |
| `scripts/install-hooks.mjs` | 一次性把本 clone 的 `core.hooksPath` 指到 `.githooks`（git 配置**不入库**，必须每台机器跑） |

**安装与自检**

```bash
pnpm hooks:install                        # 一次；输出 [hooks] core.hooksPath = .githooks
git config --get core.hooksPath           # 应输出 .githooks
```

**行为细节（都已实测）**

| 情况 | 行为 |
| --- | --- |
| 改了源码/测试/脚本/配置 | 跑完整 `pnpm check`，失败即拦下提交 |
| 只改 `docs/`、`ledger/`、截图等 | 自动跳过（不匹配白名单路径），不浪费时间 |
| 机器上没有 `pnpm` | 报错退出，**不静默放行**，并提示装 pnpm 或显式跳过 |
| 紧急情况 | `SKIP_PRE_COMMIT=1 git commit …` 或 `git commit --no-verify`；允许，但必须在提交信息里写明原因 |
| 耗时 | typecheck 11.4s + lint 9.5s + 单测 27.6s ≈ **49s**（并行负载下实测到 70s） |

**必须知道的边界**

- 钩子可以被 `--no-verify` 绕过，所以它是**质量默认值**，不是安全机制。
- 钩子只存在于装过它的机器；CI（typecheck / lint / test / build）才是最终底线。
- e2e 既不在钩子里也不在 CI 里 → **「CI 绿了」不能代替跑 e2e**（§7.6）。
- 钩子拦不住判断类规则（文案、术语、「未知值不显示 0」）——那些靠 §4/§5 与 §7 的测试策略。
### 9.3 三仓发布顺序

| 仓库 | 角色 | 构建变体 | 现状（2026-11-17） | 证据 |
| --- | --- | --- | --- | --- |
| `LOVE20BSC/interface-dev` | 唯一开发地（本仓 `origin`） | dev / 31337 | 存在 | `docs/adr/0002-three-environment-injection.md:75`、`docs/STATUS.md:45` |
| `LOVE20BSC/interface-test` | 测试环境 | test | 存在，已发布两次 | `adr/0002…:76`、`docs/STATUS.md:32,46` |
| `LOVE20BSC/interface` | 生产环境 | prod | **尚不存在**（`git ls-remote` 128 / 根站 404） | `adr/0002…:77`、`docs/STATUS.md:47` |

发布是一条命令、只允许 fast-forward，preflight 顺序固定（`scripts/release-to.mjs:18-29`）：

1. 工作区干净（含未跟踪文件；`.research/`、`dist/` 这类本地产物不阻塞，见 `scripts/release-to.mjs:60,397-421`）。
2. 当前 `HEAD` 的 CI 已绿（同一个 SHA）；`RELEASE_SKIP_CI_CHECK=1` 可跳过但会打醒目警告（`scripts/release-to.mjs:520-528`）。
3. 目标 `main` 是 `HEAD` 的祖先（先 fetch，再 `merge-base --is-ancestor`），否则报「Fast-forward only」（`scripts/release-to.mjs:558-611`）。
4. 打印源 SHA / 解析后的目标 / commit subject，要求确认；`RELEASE_YES=1` 只跳过这一步（`scripts/release-to.mjs:682-696`）。
5. `git push <target> HEAD:main`。

规则与顺序：

- 只能**逐级向上**：`interface-dev` → `interface-test` → `interface`。热修也必须先落 `interface-dev` 再逐级发布，不能在目标仓直接改（`adr/0002…:132`）。
- `pnpm release-to-interface-test` / `pnpm release-to-interface` 只是薄别名，只传裸仓库名，owner 从 `origin` 推导（`package.json:30-31`；`adr/0002…:88`）。
- 发布命令**不写任何文件**：不追加日志、不建 commit、不打 tag、不 amend、不 force（`scripts/release-to.mjs:16-29,192`；`adr/0002…:96`）。
- 发布记录**不在仓内**，由三件仓外证据承担：三仓 `main` 上相同的 commit SHA、Actions run 历史、Pages 原生 `deployments` 记录（`adr/0002…:98-104`）。
- tag 只标里程碑，不是同步前置条件；同步只认 commit SHA（`adr/0002…:106`）。

### 9.4 Pages 变体由仓库名推导

| 规则 | 内容 | 证据 |
| --- | --- | --- |
| 变体判定 | 取 `github.repository` 中最后一个 `/` 之后的部分、转小写，按 `dev` → `test` → `prod` 顺序短路 | `.github/workflows/deploy.yml:69-83`；`adr/0002…:112` |
| base path | dev → `/interface-dev/`、test → `/interface-test/`、prod → `/`；`vars.VITE_BASE` 可覆盖并归一到 `/x/` | `deploy.yml:85-99` |
| site origin | 默认 `https://<owner 小写>.github.io`；`vars.VITE_SITE_ORIGIN` 覆盖（换自定义域名只改变量，不改 workflow） | `deploy.yml:101-108` |
| 显式覆盖 | `vars.VITE_ENV`（dev/test/prod）优先于关键字规则，非法值直接 `::error::` 退出 | `deploy.yml:75-77,92-95` |
| 已接受的代价 | 名字含 `dev` 的 fork 会构建 dev 变体；不含 `dev`/`test` 的仓库（`interface1/2/3`）自动落 prod，因此 prod 页头必须常驻「正式版」徽章（是提示，不是安全边界） | `adr/0002…:112,121,134` |
| 发布顺序无法在 Actions 里强制 | `release-guard` 只是注释；同一性靠三仓分支保护（禁直接 push `main`、禁 merge、禁 force） | `deploy.yml:26-33`；`adr/0002…:133` |

### 9.5 接口测试与线上问题处置

| 场景 | 处置 | 证据 |
| --- | --- | --- |
| 发到 `interface-test` 后页面显示「未配置」 | 预期行为，不是故障：test/prod 地址簿各 24 个零地址槽，入口按「未配置」禁用；**不得把 anvil 地址抄进 test/prod** | `docs/STATUS.md:60,130`、`adr/0002…:135` |
| 判断线上站点到底是哪一次构建 | 直接读该站 `/build-id.json`，与仓库 `src/config/build-id.generated.ts` 的机制对照；不一致时页面会弹「有新版本，请刷新」阻塞提示 | `README.md:197-201`、`docs/STATUS.md:32` |
| 部署卡住（`in progress`） | 已知结构事实：Pages 部署走 `concurrency.group: pages` 且 `cancel-in-progress: false`，即**串行排队、前一次不结束后续不会开始**；触发面只有 `push: main` 与 `workflow_dispatch` | `.github/workflows/deploy.yml:35-38,45-47` |
| 部署卡住的具体手工处置 | 仓内没有记录（grep `in progress` / `queued` / `deployment failed` 0 命中）→ 见 §11.4 B6，不要在规范里编流程 | `docs/`、`ledger/` 全文 grep |

### 9.6 发布禁区

| 禁止 | 后果 | 证据 |
| --- | --- | --- |
| 在目标仓 merge（含网页 Merge pull request） | 产生别的仓没有的 commit，破坏「三仓同一 commit 对象」，下一次发布 FF 检查失败 | `adr/0002…:118` |
| 对目标仓 force-push | 改写历史，源 `HEAD` 不再是目标 `main` 的后续，发布随即失败 | `adr/0002…:119`、`scripts/release-to.mjs:593-597` |
| 目标 `main` 被他人推进后想「绕过」 | 只能查清原因、恢复目标后重跑；不得 merge / force | `adr/0002…:120` |
| 在仓内维护发布日志 / 建 tag 当同步前置 | 会被 fast-forward 原样带到下一个仓，归属歧义 | `adr/0002…:23,106,129` |

---

## 10. 已知坑清单

每条固定四段：**现象 / 根因 / 正确写法 / 证据**。

### 10.1 TanStack Query 的 `refetch()` 无视 `enabled`

- **现象**：铸造成功后点「好的」回 `/my-nft`，列表先渲染成功，1~2 s 后翻成「身份 NFT 列表暂时读不到。」+「重试」；点重试还是错。
- **根因**：`useMemberIdentity().refetch()` 无条件调 `ownerRead.refetch()`。查询虽设了 `query: { enabled: ownerReadEnabled }`，但**手动 `refetch()` 会绕过 `enabled` 直接执行**；未选择身份时 `args` 是 `undefined`，viem 编码 0 个参数给 `ownerOf(uint256)` 时抛 `AbiEncodingLengthMismatchError`，`ownerRead.isError` 变真，而 `status` 派生把「禁用的读失败」也算成了 error。
- **正确写法**：手动 refetch 必须自己守 `enabled`——`if (ownerReadEnabled) void ownerRead.refetch()`；状态派生里也只认启用态的错误（`enumeration.status === 'error' || (ownerReadEnabled && ownerRead.isError)`）。同一模式在 `use-member-identities.ts` 里对 `balanceOf` / `tokenOfOwnerByIndex` / `memberName` 三个读一并补齐。
- **证据**：`src/entities/member-identity/model/use-member-identity.ts:156-162`（修法 + 原因注释）、`:169-172`（只认启用态错误）；回归 `src/entities/member-identity/model/use-member-identity.test.tsx:8-15,81-96`；e2e `e2e/mint-identity.spec.ts:385-431`；根因记录 `docs/STATUS.md:25`。

### 10.2 桌面表格行（`<tr>`）不要做 transform 动画

- **现象**：点「使用此身份 NFT」后，移动端卡片能平滑移到列表首位；桌面端如果照搬同一套 FLIP，行会瞬移/抖一下，或在 Safari/Firefox 上根本不生效。
- **根因**：`<tr>` 属于 table layout，跨浏览器的 `transform` 不可靠（Chromium 支持不代表其它引擎可靠）；而动画结束后残留的内联 `transform` 还会干扰后续布局测量。
- **正确写法**：`mode === 'cards'` 才做 FLIP；桌面表格行退化为「即时置顶 + 620 ms 底色脉冲」（`kind: 'tint'`），表格布局不动、可用性不变；`prefers-reduced-motion: reduce` 直接落位。e2e 反过来断言桌面**没有任何 move 动画**、只有一次 emphasis 且 `frames` 含 `backgroundColor`。
- **证据**：`src/features/select-identity/ui/identity-list.tsx:162-181`（`:169-171` 是原因注释）、`src/shared/lib/flip.ts:1-16`（`fill:'none'`、结束清临时样式）；e2e `e2e/home-my-nft.spec.ts:575-593`；规格 `docs/product/m0-ux-spec.md:791`；`docs/STATUS.md:24`。

### 10.3 自动化跑在 8545 人工链上，改掉了开发者钱包的链上状态

- **现象**：产品负责人在浏览器里手工测 `/mint` 时，页面卡在「确认中…」永远不进块；同期块高从 943 回退到 936、`anvil_getAutomine` 被留成 `false`；账户 #1 的链上 nonce 从 68 变回 3，他签的 `approve(...)`（tx `0x94071607…ec6cb1`）再也进不了块。
- **根因**：e2e 套件原先直接跑在共享的 8545 上，每个 spec 文件做 `anvil_snapshot` / `anvil_revert`——甚至重新 bootstrap。**快照/回滚只保证「同一条链可重复」，不能阻止自动化去动人工链**；而钱包缓存的 nonce 与回退后的链状态不再匹配。
- **正确写法**：套件必须拥有自己的链（8555），人工链（8545）自动化永不触碰，并在三个层面硬拦截（`scripts/e2e-chain.mjs` → `playwright.config.ts` → `e2e/chain.ts`）；只有 `E2E_ANVIL_RPC` 指向别人的链时才去用它，且仍拒绝 8545。
- **证据**：`e2e/README.md:5-10`（事故经过全文）、`:43-46`（覆盖端点时的两条约束）、`:103-113`（隔离验收记录表：两遍运行前后 8545 的 `cast block-number` / `cast nonce` / `anvil_getAutomine` 不变）、`:111`（8545 硬拒绝实测 `exit 1`）；代码 `scripts/e2e-chain.mjs:267-271,587-593`、`playwright.config.ts:37-42`、`e2e/chain.ts:38-45`。

### 10.4 重启 anvil 后 MetaMask 还拿着旧 nonce

- **现象**：链重启后（尤其是 8545），钱包发出的交易永远 pending，页面一直「确认中…」，区块浏览器查不到或显示 nonce 冲突。
- **根因**：浏览器钱包缓存账户的 `nonce` 与 `pending` 交易；链重启后这些历史在新链上不存在，签名交易的 nonce 与链上期望值不匹配。
- **正确写法**：**重启任何 anvil 之后，先在钱包里「重置账户活动」/ 清掉 pending，再重新发交易**；自动化测试则根本不要跑在人工链上（见 10.3）。
- **证据**：`e2e/README.md:100`；`docs/STATUS.md:55`（同一事故的另一半原因：钱包 nonce 68 vs 链上 nonce 3）。

### 10.5 viem `AbiEncodingLengthMismatchError` 的真实成因

- **现象**：控制台/错误卡出现 `AbiEncodingLengthMismatchError`，页面把整块列表或面板判为「读不到」，但链本身正常。
- **根因**：调用某个读/写合约函数时传入的参数个数与 ABI 不符——最常见的是**可选参数被写成 `undefined`**（还没选中对象就发请求），viem 编码时得到 0 个参数而 ABI 需要 1 个；这不是 RPC 故障，`enabled: false` 也挡不住手动 `refetch()` 触发的编码。
- **正确写法**：参数不齐时不要发请求（`args: selectedTokenId !== null ? [selectedTokenId] : undefined` 配合 `enabled`），并且手动 refetch 前自己守 `enabled`；错误分类里不要把「未就绪」当成「链上读失败」。
- **证据**：`src/entities/member-identity/model/use-member-identity.ts:110-113`（args + enabled）、`:158-160`（注释直接点名该错误）；回归说明 `src/entities/member-identity/model/use-member-identity.test.tsx:11-14`。

### 10.6 `.research/` 与 `dist-analysis*` 是本地产物，不入库

- **现象**：`git status` 里看不见它们，`pnpm release-to` 也不因为它们报「工作区不干净」；有人误以为它们已被提交，或反过来把它们删掉想「清理仓库」。
- **根因**：`.gitignore` 明确忽略 `.research/` 与 `dist-*/`（后者覆盖 `dist/`、`dist-analysis/`、`dist-analysis2/`）；`scripts/release-to.mjs` 另有一份 `LOCAL_ONLY_PREFIXES = ['.research/', 'dist/']` 的白名单，保证干净检查不被本地产物阻塞。
- **正确写法**：这些是**研究输入与临时分析产物**，就地放在仓库根目录、永不提交；需要共享的结论要转写成 `docs/` 下的正式文档再提交。
- **证据**：`.gitignore:6-7`（`dist/`、`dist-*/`）、`:23-24`（`.research/`）；实测 `git check-ignore -v .research dist-analysis dist-analysis2` 分别命中 `.gitignore:24` 与 `.gitignore:7`（`dist-analysis` / `dist-analysis2` 就在仓库根目录）；`scripts/release-to.mjs:58-60,397-421`。

### 10.7 `src/config/errors.generated.ts` 是生成物，不要手改

- **现象**：手工把某条自定义错误的中文补进去，页面确实正常了；下一次 `pnpm gen:errors` 或别人重跑生成器后改动消失，且 diff 巨大难以 review。
- **根因**：该文件由 `scripts/gen-errors.mjs` 从错误注册表生成（顶部写着 `AUTO-GENERATED … Do not edit by hand`，带 registry 的 sha256），但**它又是提交进仓的**（`git ls-files` 可查到），所以很容易被当成普通源码改。
- **正确写法**：改**源**不改**产物**——在错误注册表/`scripts/error-messages.zh.json` 侧补条目，然后 `pnpm gen:errors` 重新生成并一起提交；selector → 中文这条链路是协议错误唯一的用户可读出口，不要让原始 revert data 直接上屏。
- **证据**：`src/config/errors.generated.ts:1-3`（生成器、命令、registry sha256）；`package.json:25`（`gen:errors`）；`scripts/gen-errors.mjs`、`scripts/error-messages.zh.json` 存在；用例 `src/shared/lib/errors.registry.test.ts`。

### 10.8 陈旧 build id / 陈旧 preview 造成的假绿与假红

- **现象**：两种翻车——本地 e2e 明明改了代码却全绿（测的是上一次的 bundle）；或杀掉残留 preview 后同一份代码从「一堆幽灵失败」变成 49/49。
- **根因**：`vite preview` 与 Pages 都会缓存 HTML 外壳；`:4173` 上残留的 preview 可能服务旧构建。`build-id` 不比对就无法区分「同一次构建」与「上一次构建」。
- **正确写法**：① e2e 侧：启动前比对 `/build-id.json` 与本次 `E2E_BUILD_ID`（源码 + 构建环境 + 端点的指纹），一致才复用；不一致且无法证明监听者是本端口 `vite preview` 就**直接失败**，绝不静默测旧 bundle；② 线上侧：`src/config/build-id.generated.ts`（gitignore、生成）与 `dist/build-id.json` 在加载/可见性变化时比对，不一致弹阻塞的「有新版本，请刷新」。
- **证据**：`e2e/README.md:36`（stale-build guard 的现象与规则）、`playwright.config.ts:227-265`（判定与报错文案 `:253`）、`:82-126`（id 组成：HEAD + diff + 未跟踪文件 + 环境）、`:58-65`（参与哈希的路径）；`README.md:197-201`（线上机制）；生成器 `scripts/gen-build-id.mjs:2-16`（`E2E_BUILD_ID` 覆写，其余用时间戳+随机）。

### 10.9 挖矿模式泄漏会让「下一批」用例集体超时

- **现象**：某次全量 e2e 出现整片超时，报错都指向「交易发出去但没上链」，而报错的那个 spec 看起来与本改动无关。
- **根因**：套件链默认是 **1 s interval mining、automine 关**；需要「已广播未打包」窗口的 spec 会临时 `anvil_setIntervalMining 0` + `anvil_setAutomine false`。**快照/回滚不恢复挖矿模式**（`anvil_snapshot` 不含它），一旦恢复分支被跳过（worker 被杀、`afterAll` 异常、误恢复成 automine=true），后续所有 spec 的交易都不再打包。
- **正确写法**：冻结出块用 `suspendMining()`；`afterAll` 用 `try/finally` 调 `restoreMining()`，它**回读断言** `automine` 与 `intervalMining`，不一致就在泄漏的那个文件里失败；`isolateChain()` 在取快照前与回滚后各恢复一次兜底。手工抢救：`pnpm e2e:reset-chain`。
- **证据**：`e2e/README.md:69-87`；`e2e/chain.ts:89-97`（`SUITE_MINING`）、`:104-110`（读回）、`:131-151`（恢复 + 断言 + 报错文案）、`:163-182`（`isolateChain` 两端恢复）。

### 10.10 `pnpm e2e -- --grep …` 会把过滤条件喂给 Playwright

- **现象**：想只跑 3 条用例，结果跑了全量 149 条、耗时 8 分钟。
- **根因**：`pnpm run` 的 `--` 会被原样转发到脚本参数里；`scripts/e2e-chain.mjs` 只剥自己的 `--ensure-only` / `--reset-chain`，其余参数原样透传，于是 `--` 也进了 Playwright 的参数数组，过滤失效。
- **正确写法**：直接 `pnpm e2e --grep "流动性"`，不加 `--`。
- **证据**：`ledger/worklog/202611/16-1438-c467-社区流动性查询-按旧库-tkm-布局重做并支持查询任意地址的流动性.md:78-79`（原文记录了这次踩坑与正确写法）。

### 10.11 重跑 e2e 会改写截图字节，容易误带进提交

- **现象**：只跑了一次全量 e2e 做验证，`git status` 里冒出 65 个 `docs/product/screenshots/*.png`；一个本该「只改文档/格式」的提交因此混进 65 个二进制文件。
- **根因**：截图由 e2e 幂等覆盖写，但渲染噪声（子像素抗锯齿、字体 hinting）让同画面的 PNG 每次字节都不同——不是 UI 变化。
- **正确写法**：提交前 `git status docs/product/screenshots/`；**只有 UI 真的变了才暂存这些 PNG**，否则 `git restore --staged docs/product/screenshots`（工作区文件留着无妨，它已被 `.gitignore` 之外的仓库跟踪，下次 e2e 再刷新）。
- **证据**：2026-11-17 全仓格式化验证跑完后，`git diff --stat HEAD~1 HEAD -- docs/product/screenshots` = 65 files changed, **0 insertions**, 全是 `Bin 65897 -> 65816 bytes` 这类字节差。

---

## 11. 未决项、已知缺口与变更记录

本节是这份规范的「诚实尾巴」：**哪些不一致这次修掉了、哪些要 owner 拍板、哪些现状没有门禁保护、哪些是欠下的代码债。**
读规范时如果发现某条规则"看起来应该被自动拦"，先来这里确认它到底是 [门禁] 还是 [必守]。

### 11.1 本次整理（2026-11-17）修掉的不一致

| 问题 | 处理 |
| --- | --- |
| 关键文档没有入口：`AGENTS.md`/`CLAUDE.md`/`.cursorrules` 全不存在，README 只提了 ADR、m0-scope、GLOSSARY 三份，`three-line-verification`/`e2e/README`/`copy-audit`/`m0-ux-spec §4` 在 README 里 0 次提及 | 新增 `AGENTS.md`（入口）+ `CLAUDE.md`/`.github/copilot-instructions.md`/`.cursor/rules/love20.mdc` 三个指针 shim；README 补「开发规范」索引节并把这些文档做成真链接；shim 由 `src/architecture.test.ts` 强制「必须指向 AGENTS.md 且 ≤30 行」，防多处漂移 |
| README 称中文文案「由测试/ESLint 门禁强制」，但 `eslint.config.js` 没有任何 CJK 规则，唯一实现是 `src/architecture.test.ts` | README 改为只认架构测试，并指到本规范 §3 |
| 包体数字四处并存（README ~157 kB、ADR-0001 158.9 kB、`check-bundle` 159.2 kB、dev 变体 160.6 kB） | 本规范 §8.4 统一口径：**只承认 `scripts/check-bundle.mjs` 的输出**，并注明变体与提交；其余历史数字视为旧产物记录 |
| 提交前门禁不存在（无 husky、无 `.githooks/`），所有门禁只在 CI 或"人记得跑"时生效 | 落地 pre-commit（§9.2）：`.githooks/pre-commit` + `scripts/install-hooks.mjs` + `pnpm check`；不引依赖 |
| 任务书曾把 `src/` 说成「九层」，实际是 8 个层目录（`src/test/` 是测试装配、被门禁排除） | 本规范按 8 层写（§2.1），`src/test/` 单列说明 |
| `src/*.ts` 根文件不在架构测试的分层扫描范围内（做钩子联调时踩到：把违规文件放在 `src/` 根目录，门禁不报） | 记录为已知限制（§3.11）。根目录目前只有 `main.tsx`/`index.css`/`vite-env.d.ts`，风险低；新增业务文件**不得**放在 `src/` 根 |
| `docs/product/acceptance/run.mjs` 的 step8 仍在等死组件的旧文案「你参与了销毁活动，获得空投铸造资格」与旧选择器 `aria-labelledby="airdrop-eligibility-title"`（该组件 2026-11-17 已删，现役是 `src/pages/home/airdrop-reminder.tsx`） | 改为现役文案「你有空投资格」与选择器 `home-reminder-airdrop`。这条是「陌生 AI 入职演练」按本规范读完后当场指出的「文档写 A、代码做 B」 |

### 11.2 需要 owner 拍板

| # | 决定 | 现状 | 建议 |
| --- | --- | --- | --- |
| D1 | **Prettier 要不要变成门禁** | **已决 2026-11-17：选 A**。一次性全仓格式化（71 个文件，`ledger/` 加入 `.prettierignore`）→ `format:check` 并入 `pnpm check` → CI 加独立步。现状：`pnpm format:check` 全绿，格式是 [门禁] | — |
| D2 | **format:check / e2e 要不要进 CI** | CI 只有 typecheck / lint / test / build；e2e 需要 anvil 链（约 10 分钟） | e2e 进 CI 的成本是每次 10 分钟 + 起链脚本；当前选择是本地跑、CI 不跑。若 M1 开始并行开发，建议至少给 `main` 加一条 nightly e2e |
| D3 | **三线校验端口是否强制钉死** | 规范钉 8566；实际任务里出现过 8569 / 8574（原因未记录） | 建议强制「换端口必须在三线文档 §0 写明本次端口与原因」，避免复现时对不上环境 |

### 11.3 现状记录（[必守] 或干脆没有门禁，别误以为有保护）

| # | 现状 | 影响 |
| --- | --- | --- |
| S1 | **CJK 门禁只有架构测试**，ESLint 无对应规则 | 只要跑 `pnpm check` 就有效；单跑 `pnpm lint` 拦不住 |
| S2 | **硬编码颜色没有任何自动门禁**（`ADR-0005` 要求只用语义 token） | 唯一兜底是 `e2e/theme-colors.spec.ts` 的计算样式断言；新页面写死色值大概率漏网 |
| S3 | **`refetch()` 的 `enabled` 守卫只补在个别 hook**（§5.2 有正例与踩坑记录，`use-member-identity.ts`、`use-member-recipient.ts`），存量调用点没有逐条核对 | 同类 `AbiEncodingLengthMismatchError` 仍可能在其他读模型上复现（见 11.4） |
| S4 | **测试文件的跨层相对导入无人拦**：ESLint 层规则只匹配 `@/…`，架构测试跳过 `*.test.*` | 测试代码可以越层，属有意放宽，但别把业务逻辑写进测试 |
| S5 | **`vitest` 把 `VITE_ENV` 写死为 `dev`**（`vitest.config.ts` 的 `define`） | 单测通过不代表 test/prod 变体的地址簿可用；包体只能由构建产物测 |
| S6 | **`.research/`、`dist-analysis*/` 不入库**，`docs/` 与 `GLOSSARY.md` 被 Prettier 忽略 | 规范文档本身不受格式检查，别在里面跑格式化 |
| S7 | **e2e 条数口径**：STATUS 记 152（实跑口径），`grep '^\s*test('` 粗数 150（多行声明与条件 skip 造成差异） | 对外只报「实跑条数」，别拿 grep 数当验收数 |

### 11.4 欠下的债（本次不做，登记在案）

| # | 债 | 来源 |
| --- | --- | --- |
| B1 | `three-line/swap-fee.md` 的交付物不齐：`scripts/verify/` 只有 airdrop/approvals/batch-transfer/liquidity/transfer 五个脚本，`e2e/` 没有 `swap-numbers.spec.ts` | 三线规范要求四件套，兑换页费率这条没闭环 |
| B2 | `three-line/theme.md` 是「配色三线」（对比度计算），严格说不属于「读写链上数值」的三线校验 | 两份规范的从属关系需要统一，避免以后有人拿配色三线当数值三线 |
| B3 | `refetch()` 存量调用点的 `enabled` 复检（疑似同类缺陷，例如流动性读取） | §5.2、§10.1 |
| B4 | `dist-analysis/`、`dist-analysis2/` 全仓零引用，来源不明 | 是否删除待定（`.gitignore` 已忽略 `dist-*/`） |
| B5 | e2e 用例数需要用一次全量实跑与 STATUS 对齐（见 S7） | §7.1 |
| B6 | GitHub Pages 卡在 `in progress deployment` 时的处置步骤无仓内依据（只知道 `concurrency.group: pages` + `cancel-in-progress: false` 会让前一次阻塞后一次） | §9.5 |

### 11.5 变更记录

| 日期 | 变更 | 决策 |
| --- | --- | --- |
| 2026-11-17 | 首版：新增入口 `AGENTS.md` + 3 个指针 shim + 本规范（11 章）+ `pnpm check` + pre-commit 钩子 + README 文档索引 | owner 选 A 档（完整规范 + 轻量 pre-commit） |
| 2026-11-17 | **D1 执行**：`ledger/` 加入 `.prettierignore`；全仓一次性格式化（71 文件 / 522+ 556- 行，纯换行与缩进）；`format:check` 并入 `pnpm check` 与 CI `check` job；`pnpm format:check` 从 118 文件失败变为全绿 | owner 选 A（一次性付清 + 纳入门禁） |
| 2026-11-19 | 新增 §4.5.1 数字显示规范：小数位按数量级自适应（按显示值整数部分的绝对值：小于 1 → 6 位 / 1–999 → 4 位 / 1e3–1e6 → 2 位 / 大于等于 1e6 → 0 位，千分位 + 截断；百分比固定 2 位；未知「—」；非零被截断成 0 用 `< 最小可见单位`）。`formatTokenAmount` 默认改用 `fractionDigitsForMagnitude`；显式位数只保留价格（6 位）与输入框无损原文两个已登记例外 | owner 2026-11-19 拍板 |
| 2026-11-19 | 新增 §4.7「同一内容不在同一页面出现两次」（原 §4.7 检查清单改为 §4.8；`4-6` 铁律新增）：状态只在摘要卡出现一次、动作区不重复；页面级帮助 / 提示除外 | owner 2026-11-19 拍板（取消质押页重复状态） |
