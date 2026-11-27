# ADR-0010 · 一条路由 = 一行登记

- 状态：Accepted
- 日期：2026-11-26
- 关联：C5（T001 架构评审候选）；[ADR-0001](0001-first-screen-budget.md)（首屏预算，附加约束）；C4/C2（同一种「把散落的同一份事实收成一处」）

## Context

一个页面的路由事实原先散在三处：

| 事实 | 位置 |
| --- | --- |
| path → 页面组件 | `app/router/app-router.tsx` 的手写 `<Route>` 列表 |
| path → chunk loader | `app/router/lazy-routes.ts` 的 `loadXPage` 常量 + lane 包装 |
| path → 预取 loader | 同文件的 `ROUTE_LOADERS` 表（**同一批 loader 登记第二次**） |
| path → 标题 | `app/navigation/navigation.ts` 的 `PAGE_TITLES` |

新增一个页面要同步三个文件；漏一处就出现「有路由没标题」（页头回落成「页面不存在」）或「能进入但悬停不预取」。`C2/C4` 之前，`PAGE_TITLES` 是窗口内第 6 热的文件，`navigation.ts` 与 `gov-section.tsx` 合计 16 次改动。

## Decision

1. **新增 `src/app/router/page-routes.ts`**：一个 `PAGE_SPECS` 表，每行登记 `path` / `title` / `load`（动态 import）/ `exportName`；模块加载时派生出 `PAGE_ROUTES`（含 lazy 组件）与 `pageRouteFor(path)`。
2. **`app-router.tsx` 由表驱动**：`PAGE_ROUTES.map(...)` 生成 `<Route>`；治理域的七段前缀由 `GOV_SECTION_ROOTS` 生成；`*` 兜底取 `/not-found` 那一行。
3. **`lazy-routes.ts` 只剩两个职责**：`GovSectionPage` 的懒包装与 `prefetchRoute()`。重复的 `ROUTE_LOADERS` 表删除。（2026-11-27 复核：删掉零引用的 `LAZY_ROUTE_PATHS` 与 `export { GOV_SECTION_RE }`——后者已由 `page-routes.ts` 直接导出。）
4. **`navigation.ts` 只保留查询逻辑**：`PAGE_TITLES` 由 `PAGE_ROUTES` + `GOV_SUBROUTE_TITLES` 拼出，前缀回落规则不变。
5. **治理域子路由标题单独一张表**：它们的页面在 `pages/gov/gov-section.tsx` 的 if 链里（静态 import 都在懒加载分区内），把 if 链搬进 eager 注册表会把十几个页面拉进首屏，**违反 ADR-0001 §3**。所以标题留在 eager 表、页面选择留在懒加载分区。
6. **新增守卫测试** `page-routes.test.ts`：每条登记都有 path / title / loader / 组件；path 不重复、不含 `/` 与 `*`；治理域前缀双向断言（该进的进、不该进的不进）。
   - 2026-11-27 加固：`PAGE_SPECS` 导出给测试，**真的 `load()` 每个 chunk 校验 `exportName` 存在**（`Page` 只是 `lazy()` 壳，truthy 不代表导出名拼对；拼错要到首次导航才白屏）；导出 `NOT_FOUND_ROUTE`，让 `*` 兜底在登记缺失时模块加载即抛错，而不是 `?? (() => null)` 静默渲染空白页。

## Consequences

- 新增页面从「改 3 个文件 + 靠人记」变成「加一行 + 测试查漏」。
- 首屏包体略降（159.8 → 159.7 kB）：同一批标题数据不再维护两份。
- `apps-catalog.ts`（应用目录行）与 `gov-section.tsx`（治理域 if 链）仍是各自独立的事实来源：前者的行还带分类与「即将上线」可用性，后者的页面选择必须留在懒加载分区。**守卫测试只覆盖路由/标题/chunk，不覆盖目录行与 if 链**，这是本轮接受的未收口部分。
- 链接目标仍是硬编码字符串（`/stake/liquidity` 在 9 处出现）；提取路由常量是后续增量，本轮不动以控制风险。
