# 0001 技术栈与静态托管

界面是纯静态站点（GitHub Pages），移动优先、面向非加密原生用户，同一套代码要按 dev / test / prod 三种环境各自构建。我们选定 React 19 + TypeScript + Vite + Tailwind + wagmi v2/viem + TanStack Query + Radix primitives，用 pnpm 管理，Vitest + Playwright 测试，**不采用 Next.js**；并把 GitHub Pages 的六条硬约束（base 烘进产物、无自定义响应头、无 rewrite、无客户端日志索引、公开 RPC 批量上限、钱包层体积）逐条写进架构，而不是等踩到再补。

- **Status**: Accepted
- **Date**: 2026-11-11

## Context

部署面是固定的：三个环境各一个仓库，各自一个 GitHub Pages 站点（dev 只对应本地 anvil 31337，test 对应公开测试合约，prod 对应生产；测试网属于 test 变体，不属于 dev）。没有后端，没有服务端渲染，没有自己的 HTTP 服务器。评测依据是 `.research/static-hosting-and-ux.md` 的实测结果（2026-11-11，Node 24.12.0 / pnpm 11.5.1 / anvil 1.8.1 / vite 6.4.5），关键几条：

| 事实 | 数值 / 表现 |
| --- | --- |
| `base` 在构建期烘进产物 | 一个产物不能同时服务 `https://user.github.io/repo/` 与自定义域名的 `/` |
| Pages 不提供任何自定义响应头 | 实测 `cache-control: max-age=600`，`index.html` 无法设 `no-cache`，无法设 COOP/COEP/CSP |
| Pages 没有 rewrite，只有 `404.html` | 深链接必须靠 `404.html` → `?/path` → `history.replaceState` |
| Google 自 2019 年起不再跟随该 404 跳转 | SPA 路由本就不会被索引，SEO 不是可争取的目标 |
| 公开 RPC 批量上限 | BSC 官方 dataseed 上限 **100**；viem 的 `batch.batchSize` 默认 **1000** |
| `eth_getLogs` 不可客户端化 | 1RPC 限 50 块、PublicNode 限 50 000 块、dataseed 直接拒绝；BSC 约 0.75 s 出块，50 000 块 ≈ 10 小时 |
| 钱包层就是体积 | 仅 injected 首屏 **123 kB gzip**（研究基线）；当前骨架实测 **151.7 kB gzip**（Vite 报 155.55 kB）；+WalletConnect 总计 **449 kB gzip**；+AppKit 总计 **1 507 kB gzip**，其中 526 kB 是首屏 |

用户是移动端为主、非加密原生人群：首屏越轻越好，任何“先下载 1.5 MB 再连接钱包”的路径都要避免。

## Decision

### 1. 技术栈

| 决定 | 选择 | 理由 |
| --- | --- | --- |
| UI 框架 | React 19 + TypeScript | 生态与 wagmi/viem 的示例密度最高；类型化合约调用是刚需 |
| 构建 | Vite（不用 Next.js） | 产物是纯静态 SPA；Next 的 SSR / ISR / Route Handler 全部依赖服务端运行时，而 `output: 'export'` 又把这些能力关掉，等于为用不到的能力付复杂度。Pages 也没有 rewrite 可供 Next 的路由使用 |
| 样式 | Tailwind | 移动优先断点、无运行时 CSS-in-JS 开销 |
| 无头组件 | Radix primitives | 弹层/弹窗/切换器的可访问性与焦点管理不自己造；样式仍由 Tailwind 控制 |
| 链交互 | wagmi v2 + viem | 与实测基线一致（见体积结论）；viem 的 `multicall` 聚合是省 RPC 的主手段 |
| 服务端状态 | TanStack Query | 轮询、重试、失效与缓存键都由它统一，避免手写 loading 状态机 |
| 包管理 | pnpm | 单仓、无 workspaces 需求 |
| 测试 | Vitest（单元/组件）+ Playwright（E2E） | E2E 跑构建产物，而不是 dev server |

### 2. 静态托管约束 → 架构决定

| 约束 | 决定 |
| --- | --- |
| `base` 烘进产物 | **每次构建显式传 `--base`**：项目站点 `--base=/<repo>/`，自定义域名 `--base=/`。不提供“一个产物服务两种托管”的方案。所有资源与路由引用一律走 `import.meta.env.BASE_URL`，禁止手写 `/images/...`。 |
| 深链接 | **browser router + 构建期生成的 `404.html`**，`basename = import.meta.env.BASE_URL`；`404.html` 由 Vite 插件从同一模板生成（项目站点 `pathSegmentsToKeep = 1`，自定义域名 `0`），同时产出 `.nojekyll`。hash router 只作逃生舱（演示部署），不作为主路径。 |
| SEO / 分享卡 | 明确放弃 SEO：SPA 路由不被索引，404 跳转还会污染 `og:url`。`og:image`、`og:url`、`canonical` 在**构建期**由 `VITE_SITE_ORIGIN` 注入绝对地址（运行时写 `<head>` 对爬虫无效）。 |
| 无自定义响应头 | **不启用 PWA / Service Worker**。dApp 的离线价值接近零，而缓存外壳的失败模式极重（缓存的 test 外壳连 prod 地址、缓存的旧 ABI 打新部署的合约）。 |
| `index.html` 最多陈旧 600 s + 旧哈希 chunk 被删 | 陈旧外壳按**证据**处理，不作常态骚扰：① 打包时写入 build id；② `visibilitychange` 时 `fetch(BASE_URL, {cache:'no-store'})` 比对 build id；③ 监听 `vite:preloadError` → `location.reload()`；④ 只有 build id 校验不一致时才阻断，提示“有新版本，请刷新”。 |
| 公开 RPC 批量上限 100 | `batch: { batchSize: 50, wait: 16 }`（**硬上限 ≤100**），`multicall` 走 Multicall3（BSC 56 / 97 均已部署于 `0xca11bde05977b3631167028862be2a173976ca11`）；`fallback([...])` + `retryCount`，**从不依赖链的默认 RPC**（viem 的 `bsc` 默认与 `bscTestnet` 默认各有一个坑）。 |
| `eth_getLogs` 不可用 | **不做任何客户端事件索引**。历史、排行榜、按轮统计一律来自合约的 view 函数（分页读取）。需要事件级历史 = 需要托管索引器，本期不做，也不假装能做。 |
| 钱包层体积 | `injected()` **同步引入**；`walletConnect()` 与任何 AppKit/邮件登录**在用户点击后 `await import()`**。首屏 JS 预算按当前 injected-only 骨架（wagmi + viem + react-router）实测设定：**warn 160 kB / 硬失败 200 kB gzip**（当前 151.7 kB）。AppKit 不进入 M0（社交登录还需要 Pages 给不了的 COOP 头）。 |
| 部署产物 | Actions 构建 → `upload-pages-artifact`（`./dist`）→ `deploy-pages`；`permissions: pages: write, id-token: write`；每个变体一个 job，各自传 `--base` 与 `VITE_*`。 |

### 3. CI 门禁（体积是唯一会静默劣化的指标）

1. 构建后统计 **HTML 直接引用**的 JS（module script + modulepreload），gzip 后 > **200 kB** 硬失败、> **160 kB** 打印 warn（`scripts/check-bundle.mjs`）。目标线覆盖 wagmi + viem + react-router 的 injected-only 基线；WalletConnect/AppKit 永不进入首屏（eager）chunk，由第 2 条的字节扫描门禁强制。
2. 用字节扫描门禁（`scripts/check-bundle.mjs`）：任何 shipped chunk（eager 与懒加载）中不得出现 WalletConnect / AppKit / MetaMask SDK 字节（一次 barrel import 就会把整套依赖拉回首屏）。
3. 路由级 `React.lazy` 只用于二级页（历史、详情、排行）；铸造与身份首屏必须在首屏包内。
4. E2E 用 `vite preview --base=/<repo>/` 跑（`http://localhost:4173/<repo>/`）；在 `/` 上测会掩盖所有 base 相关错误。

## Consequences

**正面**：首屏实测 **151.7 kB gzip**（Vite 报 155.55 kB），在 160 kB 目标线内、距 200 kB 硬门禁有余量；没有任何服务端依赖，三个环境只是三次构建；陈旧外壳的故障从“白屏”降级为“刷新一次”；RPC 侧不会被批量上限和日志上限打爆。

**代价与遗留**：

- **一个产物只能服务一种托管形态**。切自定义域名 = 重新构建 + 新 origin；而新 origin 意味着 `localStorage` 清空、WalletConnect 会话丢失（见 ADR-0003 的本地记忆）。
- **陈旧外壳无法根除**，只能检测与提示：Pages 固定 `max-age=600`，Vite 建议的 `no-cache` 头在 Pages 上不存在。
- **首屏不能有事件历史**。任何“我的铸造记录 / 全轮次列表 / 排行榜”都要等合约 view 能力或托管索引器；这一点会直接裁剪 v1 的产品面。
- **社交/邮件登录在 Pages 上不可用**（缺 COOP），而研究建议把这条件作为面向非加密用户的第一入口。若产品坚持邮件优先，托管必须换成能设响应头的静态托管（Cloudflare Pages / Netlify / Vercel），构建侧已按“只差一个配置文件”保持中立。
- **GitHub Pages 的适用条款有风险**：官方说明其不用于“主要面向商业交易”的站点与“敏感交易”。把它当作 test/预览与首发期托管成立；作为长期生产托管，替换为上述任一静态托管是低成本动作。此点作为已知风险记录，本期不改变托管决定。
- **本地 anvil 无法可靠地给手机用**：EIP-3085 要求钱包拒绝 `http:` 的 RPC URL，且同一 `chainId` 不能被添加两次。移动端联调走测试网或 HTTPS 隧道，本地走 `http://localhost:5173`。
- 无 Service Worker 意味着**没有“安装到桌面”**；若日后要 PWA，前置条件是自定义域名 + `promptForUpdate` + 绝不缓存 `index.html`。
