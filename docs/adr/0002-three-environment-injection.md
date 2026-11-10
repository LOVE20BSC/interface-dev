# 0002 三环境注入：一个代码库，零环境分支

同一份代码按 dev / test / prod 构建三次，产出分别部署到 `LOVE20BSC/interface-dev`、`LOVE20BSC/interface-test`、`LOVE20BSC/interface`。三仓各只有一条长期 `main`，且共享**同一个 commit 对象**：开发只在 `interface-dev` 进行，发布用 `pnpm release-to <target>` 做 fast-forward 推送（preflight：干净工作区 → CI 绿 → 目标 `main` 是 `HEAD` 的祖先），tag 只标里程碑、从不是同步的前置条件；环境变体在 CI 按仓库名关键字选择（名字含 `dev` → dev，否则含 `test` → test，否则 prod），仓库变量 `VITE_ENV` 可显式覆盖。所有环境差异只通过一个**构建期环境包**注入（chainId、RPC、合约地址簿、ABI 产物清单、品牌串、dev 开关），组件与数据层**不得出现任何按环境分支的代码**；地址来源按环境分开——`anvil/` 只拥有本地链部署，testnet/mainnet 地址只来自合约仓的 `script/network/<chain>_<type>/addresses.*.params`。ABI 采用“生成后提交 + 修订号清单 + CI 漂移门禁”，而不是手抄或运行时拉取。发布命令**不写任何文件**：审计痕迹由三仓 `main` 上相同的 commit SHA、GitHub Actions 的 run 历史与 GitHub Pages 的原生部署历史构成，仓内不维护第二份日志。

- **Status**: Accepted
- **Date**: 2026-11-11

## Context

三个变体是同一产品、同一人群、同一交互，差别应只有“连哪条链、哪些地址、叫什么名字”。研究结论里有两组事实决定了这件事怎么做：

| 事实 | 后果 |
| --- | --- |
| `base`、`og:url`、`og:image`、canonical、chainId、合约地址全都是构建产物；Pages 对 `config.json` 也会缓存最多 600 s | 运行时配置会让“新外壳 + 旧地址文件”成为最坏故障（交易打到旧合约）。差异必须**编译进产物** |
| 所有 `VITE_*` 都是公开的 | 环境包里不能放任何密钥；能放的只有公开标识（如 WalletConnect `projectId`）与地址 |
| 四个源仓库（core/action/group-chat/libs）**都不提交 `out/`**，全部 gitignore；没有任何 tag（仅 `dex` 有 1 个），也没有 CI 产物发布 | ABI 只能由本地 `forge build` 生成后**提交进前端仓**；版本只能按**提交 SHA**固定，不能按 tag 或包版本 |
| 已存在的三个兄弟前端都采用“生成后提交”，但清单里记录的 revision 已落后于 HEAD（`Mint` 记录 42 条、实际 43 条） | 只提交不校验 = 静默腐烂。必须有漂移门禁 |
| `libs` 的 10 个库全是 `internal`，ABI 为空数组；只有 1 个自定义错误 | 生成器必须跳过空 ABI，且**不要**从 `libs/out` 取 ABI |
| 协议自定义错误（如 `0xc7a2002f InvalidKeyOrder(uint256,uint256)`）在 4byte 上查不到 | 前端必须自带 selector → 签名的错误映射表 |

评审中 owner 否决了用 tag 门控 + 镜像 Action 的同步方案：它把发布拆成两段人工等待，并且靠“重写一份提交”来区分环境，难以证明三仓真的同源。现在按 §4 的单命令 fast-forward 模型执行，环境选择整体移到 CI（§5）。

owner 同时否决了在仓内追加发布日志（`docs/release-log.md`）：三仓共享同一条历史，日志一旦提交就会随 fast-forward 被推到下一个仓，届时“这到底是下一个代码库的 release log，还是前面几个代码库的 release log”没有答案。发布记录因此不落在版本控制里，改由仓外证据承担（§4）。

## Decision

### 1. 唯一差异入口：环境包

环境包是一个构建期常量模块，内容是数据，不是逻辑：

| 字段 | 内容 | 约束 |
| --- | --- | --- |
| `chainId` | 31337（dev，本地 anvil）；97 或 56 上的公开测试合约（test，待定）；56（prod） | 每个变体**只暴露一条链**；不渲染网络选择器 |
| RPC | 主 + 备 + fallback 顺序、`batchSize ≤ 100`、`retryCount`、`timeout` | 不用 viem 的链默认 RPC |
| `contracts` | 地址簿：`tokenAddress`、`memberNFT`、`stake`、`submit`、`vote`、`mint`、`launch`、`actionTarget`、三个 executor、`groupChat` 系列、`weth`、`factory`、`router`、`multicall3`、`airdrop` | 字段名沿用跨仓唯一写法（`tokenAddress`、`memberId`、`groupId`、`actionId`、`proposalId`、`verifierId`、`providerId`） |
| `deployment` | 部署块高、Phase 参数摘要、`firstTokenAddress` | 供分页与“合同已上线”判断使用 |
| `abis` | 产物清单：文件名、ABI 条目数、**来源仓库 + 提交 SHA** | 生成物提交进仓，见 §3 |
| `brand` | 站点名、`VITE_SITE_ORIGIN`、测试网横幅文案、生产「正式版」徽章 | test / dev 必须在页头常驻“测试网，无真实价值”；prod 必须常驻可见的「正式版」徽章（名字不含 `dev` / `test` 的 fork 也会按 prod 构建，见 §5） |
| `flags` | 仅 dev/test：高级视图默认展开、显示 anvil 地址、E2E 断言开关 | 严禁“生产功能靠 flag 关掉” |

**形态**：构建期静态导入，`vite build` 时通过 alias 解析到唯一一份环境包；三份环境包同时存在于仓内，但打进产物的只有被选中的那一份。**不允许**运行时 `fetch` 配置，**不允许** `config.json` 后备路径（陈旧地址的代价高于一次构建）。

**地址来源按环境固定（两类来源不共用）**：

- **`anvil/` 只拥有本地链部署**：dev 变体只从 `anvil/export/deployments/anvil31337_dev.json` 与 `anvil/export/abis/*.json` 取值。本地链会被反复重建，因此这些是“当前这一次”的地址，不是协议地址；`anvil/` 不拥有、也不生成 testnet/mainnet 地址（见 ADR-0004）。
- **test / prod 只从合约仓自己的 `script/network/<chain>_<type>/addresses.*.params` 取值**：testnet/mainnet 部署是一次性的，地址在部署后固定，之后只由新的部署改写。
- 两类来源**不得交叉**：把 anvil 的地址表用于 test/prod，或把 test/prod 的参数文件（包括 `anvil31337_dev` 参数）用于 anvil，都是错误。地址在构建期写进环境包，运行时不再读任何地址文件。

### 2. 零环境分支

在组件、hook、数据层里出现下列任一形态即视为违规，review 直接打回：

- `if (import.meta.env.VITE_APP_ENV === 'prod')`、`mode === 'test' ? ... : ...`；
- 为某个环境复制一份组件 / 页面 / hook（`MintButton.dev.tsx` 这类）；
- 在环境包之外硬编码任何地址、chainId、域名、品牌字符串；
- 用环境判断去**启用或禁用**业务能力（能力差异只能是数据差异，例如某地址在该环境不存在 → 该入口不渲染，且由环境包表达“不存在”）。

允许出现的环境差异只有两种：环境包里的数据；以及 `dev` 专有的调试面板（由环境包的 `flags` 声明，且不承载任何业务流程）。环境选择只发生在构建配置层（CI 决定 alias / 变体，见 §5），不得下沉成组件里的条件。

### 3. ABI 流水线

1. **来源**：`core/out/<File>.sol/<Contract>.json` 的 `.abi`、`action/out/**`、`group-chat/out/**`。**从不**读 `libs/out`（只会得到空数组与测试合约垃圾）。生成前先在对侧仓 `forge build --deny warnings`（子模块需 `recursive`，`group-chat` 是三层嵌套）。
2. **生成**：一个小脚本读产物 → 跳过 `abi` 为空的条目 → 输出 `export const <name>Abi = [...] as const`，并写一份 `manifest.json`：每份 ABI 的来源仓、`git rev-parse HEAD`、产物路径、条目数、生成时间。
3. **提交**：生成物随源码提交。理由：干净的前端 checkout 与前端 CI 里没有 `forge`、也没有兄弟仓，产物必须已经在仓里。
4. **漂移门禁**：在**有 `forge` 和兄弟仓**的 job 里重新生成并 `git diff --exit-code`，有差异即失败并提示重跑。这条门禁是本研究里唯一被证明“本来能拦住”的检查（`Mint` 42 → 43 的漂移正是它该拦的）。
5. **不用** `@wagmi/cli` / viem typegen：同样的输入（`forge build` + `out/`），多一层工具链，且没有任何现成先例；`as const` 已经给出字面量类型。
6. **错误映射**：从 ABI 的 `type: "error"` 条目导出 selector → 签名 → 中文文案三层映射；协议错误不在公共签名库中，缺了这张表就只能把十六进制抛给用户。

### 4. 同步模型：单命令、fast-forward、同一 commit、零写入

三个仓库各只有一个长期 `main`，**不设按环境分的分支**：

| 仓库 | 角色 | 构建变体 |
| --- | --- | --- |
| `LOVE20BSC/interface-dev` | 唯一开发地 | dev |
| `LOVE20BSC/interface-test` | 测试环境 | test |
| `LOVE20BSC/interface` | 生产环境 | prod |

同步不是 tag 事件，而是一条命令：`pnpm release-to <target>`。`target` 只回答**推到哪里**，接受三种写法：

| `target` 写法 | 解析为 |
| --- | --- |
| `owner/repo`（如 `LOVE20BSC/interface-test`） | `https://github.com/<target>.git` |
| 完整 git URL（`https://…` 或 `git@…`） | 原样使用 |
| 本地路径（绝对或相对） | 原样使用（离线演练、镜像仓、第二条工作树） |

脚本里**没有 test / prod 词汇，也不做任何环境分类**：环境变体只由 CI 按仓库名关键字决定（§5），发布命令只负责把一个已绿的 commit fast-forward 推出去。命令按固定顺序执行，任一步失败即中止：

1. 工作区干净（含未跟踪文件）。
2. 当前 `HEAD` 的 CI 已绿（同一个 SHA）。
3. 目标 `main` 是 `HEAD` 的祖先（先 fetch，再 `git merge-base --is-ancestor`），即只允许 fast-forward。
4. 在终端打印**源 commit SHA**、**解析后的目标**与**commit subject**，要求操作者确认；拒绝确认或非交互环境即中止，`RELEASE_YES=1` 只跳过这一步确认。
5. 推送 `HEAD:main` 到目标。

命令**只读本仓与远端状态（CI、目标仓 `main`），只推目标仓，不写任何文件**：不追加日志、不建 commit、不打 tag、不 amend、不 force-push；发布前后本仓的 `HEAD` 与工作区都不变（变化只发生在目标仓的 `main`）。不提供 `--force`；目标只来自位置参数，脚本不按名字解释它（`interface-test` 与 `someone/interface-dev` 都只是 URL 的一部分，不改变构建变体）。

发布记录**不放在任何仓里**。三仓共享同一条历史，任何仓内文件都会被原样推到下一个仓，无法说明它记的是哪个仓的发布——这正是 owner 否决 `docs/release-log.md` 的原因（Context）。审计痕迹由三件仓外证据构成：

- **三仓 `main` 上相同的 commit SHA**：同一个 commit 对象就是同源的证明；
- **GitHub Actions 的 run 历史**：哪个 SHA、哪个 job、成功还是失败；
- **GitHub Pages 的原生 `deployments` 记录**：谁触发、部署的是哪个 commit、成功还是失败、站点 URL。

共享的 commit SHA 本身就是证据，后两者由 GitHub 生成并保留；都不需要我们再维护第二份事实，也不会随代码库被复制而漂移。

Git tag 只用于标记里程碑，**不是同步的前置条件**；同步只认 commit SHA。

### 5. 环境选择与不变量

环境变体在 CI 里选择，不在仓里分叉：

- CI 从**仓库名关键字**选择变体：仓库名（`github.repository` 中 `/` 之后的部分，转小写后）含 `dev` → `dev`；否则含 `test` → `test`；否则 `prod`。判定按 `dev` → `test` → `prod` 顺序短路，同一仓库名永远得到同一结果。**已接受的代价**：名字含 `dev` 的 fork（如 `someone/interface-dev`）会构建 dev 变体；owner 明确接受这一点，换取 `interface1` / `interface2` / `interface3` 这类用于拆分带宽的仓库（名字不含 `dev` 或 `test`）自动落 `prod`。
- 仓库变量 `VITE_ENV`（`dev|test|prod`）可显式覆盖上述规则；它只影响构建，不改变代码。
- 选择结果只决定 `vite build` 用哪份环境包；组件、hook、数据层仍然零环境分支（§2）。

**不变量**：三仓 `main` 上出现过的发布提交是**同一个 commit 对象**（SHA 相同），历史是一条 fast-forward 直线。代价与失败模式：

- 任一仓上做 merge（包括网页上的 “Merge pull request”）都会产生别的仓没有的 commit，破坏同一性；目标仓不接受 merge。
- 目标仓禁止 force-push：它改写历史，使源 `HEAD` 不再是目标 `main` 的后续，发布随即失败。
- 目标 `main` 若被他人推进，fast-forward 检查失败；处理方式是查清原因、恢复目标后重跑，**不得用 merge / force 绕过**。
- 名字不含 `dev` / `test` 的 fork 按 prod 构建；因此 prod 变体的页头必须常驻可见的**「正式版」徽章**，让用户能区分官方站点与 fork（名字含 `dev` 的 fork 走 dev 变体，显示测试网横幅而不是「正式版」）。徽章是提示，不是安全边界。

## Consequences

**正面**：三仓同 commit，同源关系用一个 SHA 就能证明；发布记录由 GitHub 侧的 Actions run 与 Pages `deployments` 承担，仓内没有需要同步维护的第二份日志，也不会把上一个仓的发布记录带进下一个仓；环境差异只剩构建时的 alias 选择，不再靠镜像改写提交；组件与测试只写一遍；前端 checkout 无需 `forge` 即可 typecheck/build/测试；ABI 漂移从“季度后发现”变成“当次 CI 失败”。

**代价与遗留**：

- **仓内没有发布历史**：查“某个 commit 什么时候进了 test/prod”要去 GitHub 的 Actions run 列表与 Pages `deployments` 页，不能在仓库里 `git log docs/…`。这是刻意取舍：仓内日志会被推到下一个仓并产生归属歧义（Context），而共享 SHA + GitHub 记录不需要额外维护。
- 每次上游合约变更都要重跑生成器并提交产物，否则门禁红；这是刻意的摩擦。
- 漂移门禁不能跑在前端仓自己的 CI 里（没有 `forge`、没有兄弟仓），必须挂在能检出源码的 job 上；前端仓只能校验 manifest 格式与来源 SHA 的存在性。这个分工要写进 workflow 注释，否则下一个人会以为门禁不存在。
- 发布只能 fast-forward：任何热修都必须先落 `interface-dev`，再逐级 `pnpm release-to LOVE20BSC/interface-test`、`pnpm release-to LOVE20BSC/interface`；不能在目标仓直接改，也不能靠 merge 把目标仓的提交带回。
- 不变量依赖分支保护：三仓都要禁止 force-push、禁止在 `main` 上 merge / 直接提交；任一仓的网页 merge 都会让下一次发布失败。
- 名字不含 `dev` / `test` 的 fork 按 prod 构建并显示「正式版」徽章；名字含 `dev` 的 fork 构建 dev 变体（§5 的已接受代价）。徽章只是提示，不能阻止 fork 复制代码或地址。
- 地址来源分离：dev 依赖 anvil 的 export（会随重建变化），test/prod 依赖合约仓的一次性 `addresses.*.params`；当前合约仓只有 `anvil31337_dev` 目录，test/prod 地址文件尚未生成，发布前必须补齐。
- 环境包全部公开：地址、chainId、WalletConnect `projectId` 都是公开标识，但每个变体要用自己的 `projectId` 并把 origin 精确加进 allowlist（生效约 15 分钟）；且**只有一个域名能被钱包标记为已验证**，多域名（项目路径 + 自定义域名）里只能选一个。
- 本地 dev 变体（31337）无法可靠地给手机用：钱包按规范须拒绝 `http:` RPC，且同一 `chainId` 不能被添加两次——地址/端口一改，用户只能手动删网络。
- 运行时配置被否决，意味着**换地址必须重新构建发布**；应急场景（合约迁移）只能靠重新发版，不能靠改一个 JSON。
