# 社区流动性查询（`/liquidity` 第三个页签）对齐旧库 LOVE20TKM · 逐项对照表

> 任务：`ledger/worklog/202611/16-1438-c467-社区流动性查询-按旧库-tkm-布局重做并支持查询任意地址的流动性.md`
> owner 2026-11-16 决策 A：**「社区流动性里页面布局保持和 LOVE20TKM 旧代码库一致，也支持查任意地址的流动性数据」**；B（撤出拆独立路由）、C（滑点默认）**不做**。
> 旧库只读参考：`../LOVE20TKM/interface/src/components/Dex/LiquidityQuery.tsx`（529 行）+ `src/hooks/composite/useLiquidityQuery.ts`、`usePairStats.ts`。
> 我们读的合约仍是 Uniswap V2 pair：`getReserves()` / `totalSupply()` / `balanceOf(address)`；旧库的 Zap 字段（`zap`、`quote` 两币拆解、`suggestedAmount*`）在本环境不存在，一律不搬。
> 本表口径：**对齐** = 结构与交互改成与旧库一致（样式除外）；**必要差异** = 本环境只有 WETH 一个基币、合约面不同、或全局文案纪律要求，逐条写原因；**不做** = owner 已排除。

## 一、四块结构对照

| # | 区块 | 旧库 LOVE20TKM | 本轮 `/liquidity` → 社区流动性 | 结论 |
| --- | --- | --- | --- | --- |
| 1 | 卡 1 标题与排列 | `选择交易对：`，两列 grid：左「基础代币」`Select`、右「目标代币」只读灰块 | 同结构：左「社区代币」选择器、右「WETH」只读块 | **对齐**（差异见 2/3） |
| 2 | 左侧下拉的可选项 | `TUSDT`（若配置）+「父代币」，来自 `useTokenContext` | **社区代币**：Launch 目录（与兑换页同一份链上注册表，支持按 symbol 搜索 / 精确查找 / 加载更多）；选中即切换整页的池子（添加 / 我的 / 查询共用 `token`） | **必要差异**：本环境没有 USDT/父币可选，只有 WETH 一个基币；社区代币是唯一变量 |
| 3 | 右侧只读 | 当前 token symbol（TKM 的「目标代币」= 社区代币） | 只读显示 **WETH**（`Router.WETH()` 读出的包装原生币，本地 `TestWETH`；金额文案里的原生币一侧仍写 `ETH`） | **必要差异**：方向反过来——我们是「社区代币 / WETH」 |
| 4 | LP 代币地址 | `LP代币地址：` + 地址复制 + `AddToMetamask`（加入钱包） | `LP 代币地址：` + 整段地址可点击复制（`shared/ui/copyable-address`，`title` = 完整地址，「已复制」反馈）；**没有「加入钱包」按钮** | **对齐**（复制走全局组件）；**必要差异**：本站没有 `AddToMetamask`，不新增 |
| 5 | 自定义代币入口 | 无（TKM 只有 TUSDT/父币） | 页面抬头行的**紧凑次级入口**「换个代币地址」保留（读 bytecode + `symbol()`/`decimals()`，非合约/读不到给人话原因；零地址也给原因）。查询页签里这一行只显示这个紧凑入口，选社区代币走卡 1 的下拉 | **必要差异**：`e2e` 的 TestX 空池用例依赖这个入口；自定义代币是「不在目录里的池子」的唯一入口 |
| 6 | 卡 2 标题 | 居中标题 `交易对统计` | 同：居中 `交易对统计` | **对齐** |
| 7 | 卡 2 loading | 居中 `LoadingIcon` + `加载中...` | 居中骨架 + `加载中...`（不渲染 0） | **对齐**（QA D3：慢 RPC 不能断言空池） |
| 8 | 卡 2 无池 | 居中 `交易对不存在` | 同：`交易对不存在` | **对齐** |
| 9 | 卡 2 字段 | `LP总数量：` / `{base} 总数量：` / `{target} 总数量：`，每行左标签右数值 | `LP 总数量` / `{社区代币} 总数量` / `{WETH} 总数量` | **对齐** |
| 10 | 卡 2 价格行 | `1 {target} = X {base}`（`formatTokenAmount(…,5)`）；右侧 ghost 按钮 `ArrowUpDown` 切换成 `1 {base} = X {target}` | 默认 `1 {WETH} = X {社区代币}`，ghost 箭头按钮切到 `1 {社区代币} = X {WETH}`；两边都是 6 位小数截断（`formatRate`） | **对齐**（方向随第 3 条的基币/目标币互换；小数位沿用本页 6 位口径，避免反向价格被截成 0） |
| 11 | 卡 3 标题/输入 | `查询地址：`；输入框 placeholder `请输入要查询的地址 (0x...)`；右侧提交按钮 + 有结果时 `重置` | 同标题、同 placeholder、同按钮排布（输入 + 提交 + 重置） | **对齐** |
| 12 | 卡 3 提交按钮三态 | 未查询 / 手动输入 `查询`；已查询 `重新查询`；查询中 `查询中...` | 同三态：输入与已查询地址不同 → `查询`；已查询 → `重新查询`；读取中 → `查询中...` | **对齐** |
| 13 | 卡 3 未连接提示 | `⚠️ 未连接钱包，请手动输入要查询的地址` | 同文案；**未连接钱包也能查任意地址**（纯 view，不签任何交易） | **对齐** |
| 14 | 卡 3 默认地址 | 连接后填当前钱包地址，并自动发起第一次查询 | 连接后填当前钱包地址并自动查一次（只读，不弹钱包）；切池子后仍按同一地址重算；`重置` 清空输入并收起结果卡 | **对齐** |
| 15 | 卡 3 地址校验 | `zod` `^0x[a-fA-F0-9]{40}$`，非法时按钮禁用 + 表单错误 | 同一正则；非法立即给「这不是一个有效的地址，需要 0x 开头的 40 位地址。」并禁用提交（不发读链） | **对齐** |
| 16 | 卡 4 loading | 居中 `LoadingIcon` + `查询中...` | 同文案（无 spinner 图标时用骨架，文案不变） | **对齐** |
| 17 | 卡 4 无池 | `未找到流动性池` / `{base}-{target} 交易对不存在` | 同结构：`未找到流动性池` / `{社区代币}-{WETH} 交易对不存在` | **对齐** |
| 18 | 卡 4 无 LP | `该地址在此交易对中，没有LP代币` | `该地址在此交易对中，没有 LP 代币`（中文与英文/数字之间留空格，本页既有排版规则） | **对齐** |
| 19 | 卡 4 有 LP · 第一段 | `该地址LP情况：` → `LP代币数量` / `所占份额` | `该地址 LP 情况：` → `LP 代币数量` / `所占份额`（`formatPercent`，最多 2 位、向下截断） | **对齐** |
| 20 | 卡 4 有 LP · 第二段 | 分割线 + `可兑换代币数量：` → 两币各自数量（= 该地址 LP 按储备比例折算） | 同：分割线 + `可兑换代币数量：` → `{社区代币}` / `{WETH}` 两行 | **对齐** |
| 21 | 卡 4 数据来源 | Zap `getUserLiquidityInfo` 一类聚合 view | `pair.balanceOf(addr)` + `pair.totalSupply()` + `getReserves()` 三个标准 view，本地整数算术折算 | **必要差异**（合约面）：无 Zap；公式见下 |
| 22 | 页面级抬头 | 无（每个 tab 自带选择器） | 添加/我的页签保留「当前社区代币」抬头 + 紧凑「换个代币地址」；**查询页签收起抬头文字**，只留紧凑自定义入口（选代币归卡 1 的下拉），避免同屏两份选择器 | **必要差异**（结构整合）：三个页签共用同一份 `token` 状态，查询页签的选择会同步到另外两个页签 |

## 二、任意地址查询的读数与折算公式

对任意地址 `a`（不需要连接钱包，纯 `eth_call`）：

| 量 | 公式 | 备注 |
| --- | --- | --- |
| 交易对地址 | `factory.getPair(社区代币, WETH)` | `0x0` 视为「交易对不存在」 |
| 储备 | `pair.getReserves()` → 按 `token0/token1` 重排成 `(reserveToken, reserveNative)` | 不假设社区代币是 token0 |
| LP 总量 | `pair.totalSupply()` | 含永久锁在 pair 地址的 `1000` |
| 该地址 LP | `pair.balanceOf(a)` | LP 凭证本身就是 ERC20 |
| 所占份额 | `balanceOf(a) × 1e6 / totalSupply / 1e4`（保留 4 位再交给 `formatPercent` 截 2 位） | 与「我的占比」同一个纯函数 `sharePercent` |
| 可兑换两币数量 | `LP × reserveToken / totalSupply`、`LP × reserveNative / totalSupply`（整数除法向下取整） | 与撤出报价同一个纯函数 `planWithdraw` |

三线文档 `docs/product/three-line/liquidity.md` §3 新增「用例 Q：任意地址查询」按 `LP × reserve / totalSupply` 用 Python 手算页面字符串，并与链上读数、页面文字逐字比对。

## 三、本轮实际改动

1. `src/features/liquidity-pool/model/use-pair-balance.ts`（新）：`pair.balanceOf(任意地址)` 的只读 hook（`isLoading/isError/refetch`）。
2. `src/features/liquidity-pool/lib/liquidity-math.ts`：新增纯函数 `addressLpPosition`（份额 + 两币折算），单测覆盖。
3. `src/features/liquidity-pool/ui/pool-query-panel.tsx`：按「选择交易对 → 交易对统计 → 查询地址 → 查询结果」重写；新增地址输入 / 提交三态 / 重置 / 方向切换 / 未连接提示。
4. `src/features/liquidity-pool/ui/liquidity-page.tsx`：查询页签传入 `catalog` 与「选社区代币」回调；查询页签收起抬头文字（保留紧凑自定义入口）；自定义代币与社区代币选择共用一个覆盖态。
5. `src/features/liquidity-pool/ui/liquidity-token-bar.tsx`：新增 `compact`（查询页签只渲染「换个代币地址」入口）。
6. `src/shared/config/copy-pages.ts`：`liquidity.query.*` 改写成四块文案（中文进 copy）。
7. `e2e/liquidity-numbers.spec.ts`：查询页签断言改成新布局；新增「任意地址 / 默认地址 / 重置 / 价格方向 / 无 LP 地址态 / 未连接也能查」用例（用例 N/O）；截图从 `empty` 换成 `query`（16 张不变；`query` 一态用整页截图，四块一屏放不下）。
8. 文档：`docs/product/m0-ux-spec.md` §3.13 第 9 条与验收、`docs/product/three-line/liquidity.md` §3/§4、`docs/STATUS.md`。

## 四、遗留差异（有意保留）

| 差异 | 原因 |
| --- | --- |
| 没有 `AddToMetamask`（加入钱包） | 本站没有该组件，owner 未要求新增 |
| 价格行小数位 6 位（旧库 5/2 位混用） | 本页统一 `formatRate` 6 位口径：反向价格常常很小（`1 TestLOVE20 = 0.0005 TestWETH`），2 位会截成 0 |
| 查询页签不自动刷新「池子统计」以外的个人数据 | 本站个人数据只属于「我的流动性」；查询卡 4 是任意地址的只读折算，不写本地状态 |
| 卡 1 的下拉是全局 `TokenPicker`（弹层/抽屉 + 搜索），不是旧库的 `Select` | 全局只有这一个选择器实现（兑换 / 转账 / 批量转账 / 授权同一套），移动端有搜索与分页；交互语义（选一个代币 → 换池子）与旧库一致 |
| 查询结果不显示「LP 代币地址」之外的合约字段（Zap 的两种代币拆解） | 合约面不同：V2 pair 只有储备，折算就是按比例，没有 Zap 的路径概念 |
| 撤出仍是单页页签（B 不做） | owner 2026-11-16 已排除 |
| 滑点默认 0.5%（C 不做） | owner 2026-11-16 已排除 |
