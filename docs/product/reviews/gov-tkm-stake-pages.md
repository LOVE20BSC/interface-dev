# 旧前端 `LOVE20TKM/interface-test` —「质押」相关页面 布局与交互蓝图

> 只读分析产物。源码：`/Users/BigPolarBear/Documents/github/LOVE20TKM/interface-test`，HEAD `ec5e2f00c`（2026-09-10）。
> 本文所有 `文件:行号` 均指该仓库（相对 `interface-test/`）。「逐字」= 源码原样，含标点、空格、编号与全半角。
> 布局一律用「块列表」描述；不贴 JSX。

---

## 0. 四页共用的前置事实（先读，否则会照抄错）

### 0.1 应用外壳（`src/pages/_app.tsx:272-334`）

每页渲染顺序 = `AppSidebar`（桌面侧栏）→ `SidebarInset` → 内层滚动容器（`min-h-screen pb-[--bottom-navigation-height]`）→
`ErrorAlert`（顶部全局错误横幅，`px-4 pt-4`）→ `GasBalanceNotifier` → `ActionRewardNotifier` →
`AppErrorBoundary` 包住页面 → `Footer` → `BottomNavigation`。
toast 由 `Toaster position="top-center"`、黑底白字（`_app.tsx:308-315`）。

副作用（新协议若沿用可省）：`SidebarProvider` 桌面侧栏、`BottomNavigation` 移动底栏、Sentry、VConsole（`?debug=true`）、
启动期「加载中...」全屏遮罩、路由切换时 `LoadingOverlay text="网络加载中..."`。

### 0.2 `Header` 组件有个**必踩的坑**：`title` 不上屏（`src/components/Header.tsx:20-83`）

- `Header` 只渲染两样东西：左侧「返回」按钮（仅当 `showBackButton || backUrl !== ''` 时出现，文案逐字 `‹ 返回`，实际是 `&lt;&nbsp;返回`，`Header.tsx:64-74`）+ 右侧 `WalletButton`（`Header.tsx:76`）。
- 传进去的 `title` **只写进 `<head><title>` 与 `<meta name>`**（`Header.tsx:52-60`），页面上看不到。
- 因此四个页面的**可见大标题全部来自 body 里的 `LeftTitle` 或卡片标题**，不是 Header。
- 四页 Header 参数：
  | 页面 | 调用 | 是否有「返回」按钮 |
  | --- | --- | --- |
  | stakelp | `<Header title="质押LP" />`（`stakelp.tsx:23`） | 无 |
  | staketoken | `<Header title="质押代币" />`（`staketoken.tsx:36`） | 无 |
  | unstake | `<Header title="取消质押" />`（`unstake.tsx:19`） | 无 |
  | liquid | `<Header title="流动性质押数据" showBackButton={true} />`（`liquid.tsx:14`） | **有** |

- 另：Header 还兼做钱包网络检查——`status === 'connected'` 且 `!chainId` 时 `setError({name:'钱包网络错误', message:'请切换到 ${chainName} 网络'})`（`Header.tsx:29-36`）。

### 0.3 路由与 query

- Next.js `trailingSlash: true`（`next.config.js:16`）、静态导出（`output:'export'`）、`basePath = BASE_PATH`。
- 四页都是「按 `?symbol=` 定位代币」：`TokenContext` 读 `router.query.symbol` 拉代币详情（`src/contexts/TokenContext.tsx:13-24, 41-...`）。
  四页路径已登记进「切币时保留当前路由」白名单 `src/config/tokenSwitchRoutes.ts:43-46`：
  `/stake/liquid`、`/stake/stakelp`、`/stake/staketoken`、`/stake/unstake`。
- 额外 query：`?first=true` —— 仅 `stakelp` 消费（`StakeLiquidityPanel.tsx:110`），见 §1.3。
- **跳转一律写 `?symbol=`（无尾斜杠）**，如 `/stake/stakelp/?symbol=xxx`、`/stake/unstake?symbol=xxx` —— 两种写法在仓库里并存（`MyGovernanceAssetsPanel.tsx:349,384,533` vs `MyLiquidDataPanel.tsx:166`），照抄时统一即可。

### 0.4 全局工具组件（四页与面板反复使用）

| 组件 | 行为（关键点） |
| --- | --- |
| `Common/LeftTitle`（`LeftTitle.tsx:8-14`） | 单行 `h1 text-lg font-bold`，纯标题，无右侧插槽。 |
| `Common/LoadingIcon`（`LoadingIcon.tsx`） | **行内** spinner `Loader2 h-4 w-4`，没有文案。静态值未知时用它，不写 `0`。 |
| `Common/LoadingOverlay`（`LoadingOverlay.tsx:9-40`） | **全屏固定**遮罩 `rgba(17,24,39,0.5)` + 白色 spinner + 一行文案；`isLoading=false` 返回 `null`。四页交易中统一用它。 |
| `Common/AddressWithCopyButton`（`AddressWithCopyButton.tsx`） | 缩写地址 `0x1234...abcdef`（`abbreviateAddress`）+ 复制按钮（复制成功变 Check 2 秒）；`showAddress={false}` 时只留复制按钮。 |
| `Common/AddToMetamask`（`AddToMetamask.tsx`） | `wallet_watchAsset` 加代币；**symbol 长度 > 11 直接不渲染**；Tuke 钱包不渲染；未连接时 `alert('请先连接你的钱包')`；成功 `代币已成功添加到 MetaMask 钱包`；失败 `添加代币失败，请检查控制台以获取更多信息`；用户拒绝 `用户拒绝添加代币`。 |
| `Common/InfoTooltip`（`InfoTooltip.tsx`） | 桌面 `Dialog` / 移动 `Drawer`（断点 `min-width:768px`），trigger 为 `Info` 图标按钮，`aria-label=查看${title}`。 |
| `Common/ErrorAlert`（`ErrorAlert.tsx:8-19`） | 全局 `Alert variant="destructive"`，展示 `error.name` + `error.message`；四页里被 `setError()` 用作「提示/余额不足」横幅。 |
| 格式化（`src/lib/format.ts`） | `formatTokenAmount(wei, maxFracDigits=4, rounding='floor')`：**少于 10 wei 直接显示 `0`**；千分位；默认向下取整；精度丢失时走字符串分支（`format.ts:34-140`）。`formatUnits/parseUnits` 用 `NEXT_PUBLIC_TOKEN_DECIMALS || 18`（`format.ts:325-340`）。`formatPercentage` 向下取整、非法值给 `-%`（`format.ts:430+`）。`formatRoundForDisplay(round, token)` 现在**直接返回 round**（`format.ts:368-376`，不再减 `initialStakeRound`）。 |
| 阶段文案（`src/lib/domainUtils.ts:67-99`） | `formatPhaseText(phases, onlyBlockTime=false)` → `「{phases}个阶段（{totalBlocks}区块，约{天/小时/分钟}）」`，`onlyBlockTime=true` 时去掉「N个阶段」外壳。由 `NEXT_PUBLIC_PHASE_BLOCKS`、`NEXT_PUBLIC_BLOCK_TIME_MS` 决定。 |
| 凭证缺口（`domainUtils.ts:10-22`） | `getMissingStakeReceiptAmount(required, walletBalance, requestedUnstakeRound)`：已申请解锁或余额 ≥ 需求时返回 `0`。 |

### 0.5 关键环境变量（旧协议口径，照抄前判断是否还需要）

`.env.production:41-48`：`PROMISED_WAITING_PHASES_MIN=30`、`MAX=120`、`SUBMIT_MIN_PER_THOUSAND=3`（0.3%）、`ACTION_REWARD_MIN_VOTE_PER_THOUSAND=30`（3%）、`PHASE_BLOCKS=30126`。
`.env.anvil:48-55` / `.env.public_test`：`MIN=1`、`MAX=4`（联调用）。

### 0.6 数据源总表（面板里所有数值的来源）

| 面板里的数 | hook | 合约调用 |
| --- | --- | --- |
| 我的质押记录（slAmount / stAmount / govVotes / promisedWaitingPhases / requestedUnstakeRound） | `useAccountStakeStatus`（`hooks/contracts/useLOVE20Stake.ts:19-43`） | `LOVE20Stake.accountStakeStatus(token, account)`（读不到/为 0 时 `slAmount` 返回 `undefined`，因为 `data?.slAmount ? ... : undefined`，`0n` 是 falsy） |
| 我的有效治理票 | `useValidGovVotes`（同文件 `:130-152`） | `LOVE20Stake.validGovVotes(token, account)` |
| 首次质押轮 | `useInitialStakeRound`（`:78-93`） | `LOVE20Stake.initialStakeRound(token)` |
| 当前轮 | `useCurrentRound`（`:60-75`） | `LOVE20Stake.currentRound()` |
| 全局治理数据（总治理票 slAmount / stAmount / tokenAmountForSl / parentTokenAmountForSl） | `useGovData`（`useLOVE20RoundViewer.ts:340-352`） | `RoundViewer.govData(token)` |
| SL 池子金额（tokenAmount / parentTokenAmount / 待分配手续费 2 项） | `useTokenAmounts`（`useLOVE20SLToken.ts:138-159`） | `SLToken.tokenAmounts()`，返回 `[token, parent, feeToken, feeParent]` |
| 按 SL 数量折算可换回 | `useTokenAmountsBySlAmount`（`useLOVE20SLToken.ts:162-190`） | `SLToken.tokenAmountsBySlAmount(slAmount)` |
| 交易对余额与储备（双向计价、自动联动、门槛判断） | `useStakeLpPageData` → `tokenPairInfoWithAccount`（`hooks/composite/useStakeLpPageData.ts:24-71`） | `TokenViewer.tokenPairInfoWithAccount(account, token)` → `PairInfo{pairAddress, balanceOfToken, balanceOfParentToken, pairReserveToken, pairReserveParentToken}`（`types/love20types.ts:150-156`） |
| 授权状态 | `useTokenApproval`（`useTokenApproval.ts:46-132`） | `LOVE20Token.allowance` + `approve`；`approvalActionText` 由本地偏好决定：**无限授权偏好开启 = `长期授权`，否则 `授权`**（`:21-35`） |
| 治理激励倍数 | `useMaxGovBoostRewardMultiplier`（`useLOVE20Mint.ts:55-68`） | `LOVE20Mint.MAX_GOV_BOOST_REWARD_MULTIPLIER()` |
| 写操作 | `Hub.stakeLiquidity`（`useLOVE20Hub.ts:56-111`，**7 参**：token, tokenAmount, parentTokenAmount, tokenAmountMin, parentTokenAmountMin, phases, to）；`Stake.stakeToken(token, amount, phases, to)`；`Stake.unstake(token)`；`Stake.withdraw(token)`（`useLOVE20Stake.ts:156-320`） | — |

> ⚠️ 同一个名字有两个 `useStakeLiquidity`：`useLOVE20Stake.ts:156`（**5 参**，无滑点）与 `useLOVE20Hub.ts:56`（**7 参**，带最小接收量）。`stakelp` 页用的是 **Hub 那个**（`StakeLiquidityPanel.tsx:32` 的 import）。照抄时别拿错。

---

## 1. 质押LP（`src/pages/stake/stakelp.tsx`）

### 1.1 页面骨架（JSX 自上而下）

```
<Header title="质押LP" />                                  // stakelp.tsx:23 —— 无返回按钮，title 不上屏
<main class="flex-grow bg-card">                            // :24
  ├─ 容器 px-4 pt-4 pb-3 → <GovernorIntroCard class="mt-0" />   // :25-27
  ├─ <MyLiquidityStakePanel />                              // :28 —— 条件块，见 §1.2.2
  ├─ <StakeLiquidityPanel />                                // :29 —— 主体，见 §1.2.3
  └─ 容器 p-4 →「提示」信息框（:31-55）                      // 见 §1.2.4
```

可见区块 **10 个**（另含 1 个对话框 + 1 个全屏遮罩）：Header / 治理票作用卡 / 我的质押条 / 标题「质押获取治理票」/ 第1步卡 / 比例行 / 滑点行 / 第2步卡 / 第3步卡 / 底部提示框。

### 1.2 逐块说明

#### 块 1｜`GovernorIntroCard`「治理票的作用」（`Governance/GovernorIntroCard.tsx:14-27`）

- 结构：`Card`（`border-greyscale-200 shadow-sm`）→ `CardHeader` → `CardTitle text-lg font-bold` 逐字 **`治理票的作用`**（`:17`）→ `CardContent` 内 3 个 `li`（注意：`li` 直接挂在 `CardContent` 下，**没有 `ul`**，`GovernorIntroCard.tsx:20-24`，DOM 不合法但浏览器仍渲染圆点）。
- 3 条文案逐字：
  1. `持有治理票的成为社区的真正主人，决定社区未来的发展方向。`（`:20`）
  2. `每轮获得{voteThreshold}% 以上投票支持的行动，有行动铸币激励。`（`:21`；`voteThreshold = NEXT_PUBLIC_ACTION_REWARD_MIN_VOTE_PER_THOUSAND / 10` = **3**，故实际显示 `每轮获得3% 以上…`，注意 `%` 前无空格、后有空格）
  3. `有 {submitThreshold}%的治理票，每轮可推举一个新/老行动到本轮的投票列表。`（`:22-24`；`submitThreshold = NEXT_PUBLIC_SUBMIT_MIN_PER_THOUSAND / 10` = **0.3**，实际显示 `有 0.3%的治理票…`，注意 `有` 后一个空格、`%` 后无空格）
- `symbol` prop 传了但**组件体内未使用**（`:10-12` 只用了 env）——死参数。
- 数据：无链上读取，纯 env 常量。**加载态/错态：无**。

#### 块 2｜`MyLiquidityStakePanel`「我的质押条」（`My/MyLiquidityStakePanel.tsx:20-74`）——条件块

4 个分支按顺序短路（顺序很关键）：

| 分支 | 条件 | 渲染 | 行 |
| --- | --- | --- | --- |
| 未连接 | `!account` | `div.text-sm.mt-4.text-greyscale-500.text-center` 逐字 **`请先连接钱包`** | `:36-38` |
| 加载中 / 无 token | `!token \|\| isPendingAccountStakeStatus` | `<LoadingIcon />` 行内 spinner（无文案） | `:40-42` |
| 无质押 | `!isPending && !slAmount`（`0n` 被 hook 归一成 `undefined`，所以 0 也走这里） | **`<></>` 什么都不渲染**（连标题都没有） | `:44-46` |
| 正常 | 其它 | 2 列统计条（下） | `:48-73` |

正常态布局：外层 `div.flex-col.items-center.px-4.py-2.mb-4` → `div.stats.bg-greyscale-100.w-full.grid.grid-cols-[1fr_2fr]`（**左 1 份 / 右 2 份**不对称两列）。

- 左格：`stat` → `stat-title text-sm` 逐字 **`我的治理票数`** → `stat-value text-xl text-data-personal` = `formatTokenAmount(govVotes || 0n)`（`AccountStakeStatus.govVotes`）。
- 右格：`stat`（`pl-1`）→ `stat-title text-sm flex items-center` 逐字 **`流动性质押凭证SL代币`** + `AddressWithCopyButton{address: slTokenAddress, showAddress:false}`（只显示复制图标）+ `AddToMetamask{tokenAddress: slTokenAddress, tokenSymbol: 'sl'+symbol, decimals}` → `stat-value` = `formatTokenAmount(slAmount || 0n)`。
- 精度：默认 4 位小数、floor、千分位（见 §0.4）。
- **读失败不下传**：`errorAccountStakeStatus` 被解构却**从未使用**（`:29-34`），读失败时 `slAmount` 为 `undefined` → 走「无质押」分支，**静默空白**，不显示「读不到」。⚠️ 照抄时这是必须修的点。

#### 块 3｜标题「质押获取治理票」（`Stake/StakeLiquidityPanel.tsx:417-421`）

- `StakeLiquidityPanel` 的整块前置守卫：`!token || isPendingAccountStakeStatus || isPendingInitialStakeRound` 时**整面板**只渲染一个 `<LoadingIcon />`（`:411-413`）——即加载中不显示任何卡片骨架，只有一行 spinner。注意它**不**等 `pairInfo`（`isPendingStakeLpData`），所以 pair 未到时余额先显 `0`。
- 布局：`div.bg-card.px-4` → `div.w-full.max-w-md.sm:max-w-lg.md:max-w-2xl.lg:max-w-full.mx-auto.space-y-4`（`lg` 起全宽，移动端窄）→ 顶部行 `flex justify-between` + `LeftTitle title="质押获取治理票"`（`:419-421`）。
- 整页是一个 `<Form>`（react-hook-form + zod，`mode: 'onChange'`），`form.handleSubmit` 分别挂在 3 个按钮上。

#### 块 4｜Card「第1步: 填写质押数量」（`:426-712`）

- Card 头：`h2 text-xl font-semibold` 逐字 **`第1步: 填写质押数量`**（`:430`；冒号是**半角** `:`，后面跟一个空格）；右上角链接逐字 **`获取代币`**（`Link href="/dex/swap"`，`:431-436`）。
- 内部 `grid grid-cols-1 lg:grid-cols-2 gap-4`：左 = 父币输入卡，右 = 子币输入卡（lg 以下上下堆叠）。
- **父币输入卡**（`:441-508`）：
  - `Card.bg-greyscale-50.border-none` → `CardContent py-4 px-2`
  - 行 1：`Input type="number" placeholder="0"`（`:449-459`，`className` 去掉边框、`text-xl`）+ 右侧「币种药丸」显示 `{token.parentTokenSymbol}`（`:460-464`）。
  - 行 2 左：快捷按钮组 `25%`、`50%`、`最高`（`:468-499`；`25%`/`50%` 由 `[25,50].map` 生成，**没有 100%（用「最高」代替）**；`最高` = 全部余额）。父币三个按钮 `disabled = hadStartedApprove || parentTokenBalance <= 0n`（`:479`）+ `最高` 仅 `parentTokenBalance <= 0n`（`:495`）。
  - 行 2 右：余额 `formatTokenAmount(parentTokenBalance)`（`text-sm text-data-personal`，`:501`）。
  - 输入框 `disabled={hadStartedApprove}`（`:453`）——**一旦开始授权，父币输入就锁死**。
  - 校验错误显示在 `Card` 下方的 `<FormMessage />`（`:505`）。
- **子币输入卡**（`:511-578`）：结构同上，币种 `{token.symbol}`；`Input disabled={tokenBalance <= 0n}`（`:523`，注意与父币的禁用条件**不对称**）；25%/50%/最高 `disabled = tokenBalance <= 0n`（`:549,565`）。
- 自动联动（`:241-274`）：`pairExists`（`pairReserveToken > 0 && pairReserveParentToken > 0`，`:128-129`）时——
  - 用户改父币 → `stakeToken = parentAmt * pairReserveToken / pairReserveParentToken`，用 `Number(...).toFixed(12).replace(/\.?0+$/,'')` 回填；
  - 用户改子币 → 反向同式回填父币；
  - 两侧都用 `form.setValue(..., {shouldValidate:true})`；用 `isParentTokenChangedByUser / isTokenChangedByUser` 两个 flag 防循环。
- 校验规则（zod，`buildFormSchema`，`:46-95`）——**逐字错误文案**：

  | 触发 | 文案 | 行 |
  | --- | --- | --- |
  | 父/子币非法数值（正则 `^\d+(\.\d{1,18})?$`） | `请输入合法数值，最多支持18位小数` | `:59, :81` |
  | 父币解析后 ≤ 0 | `质押父币数不能为 0` | `:63` |
  | 父币 > 持有 | `质押父币数不能超过当前持有` | `:67` |
  | 子币解析后 ≤ 0 | `质押 token 数不能为 0` | `:85` |
  | 子币 > 持有 | `质押 token 数不能超过当前持有` | `:89` |
  | 解锁期未选 | `请选择解锁期` | `:93` |

  - 预处理：中文句号 `。` 自动替换为 `.`；以 `.` 开头自动补 `0`（`:48-56, :70-78`）。
  - 注意「质押 token 数…」里 `token` 是**英文字面量**（不是变量），照抄时换成新术语前先确认。

#### 块 5｜「质押比例」行（`:581-621`，仅 `pairExists` 时出现）

- 行 1：`HelpCircle` 图标 + 逐字 **`质押比例按当前价格计算：`**（`:583-586`）。
- 行 2：一行文字 + 一个 `ArrowUpDown` 切换按钮（`variant="ghost" size="sm"`，`title="切换比例显示"`，`:609-618`）。
  - 默认态逐字：`1 {parentTokenSymbol} = {X} {token.symbol}`（`:598-607`，`X = pairReserveToken * 10^18 / pairReserveParentToken` 再 `formatTokenAmount`）。
  - 切换后逐字：`1 {token.symbol} = {Y} {parentTokenSymbol}`（`:589-597`）。
  - ⚠️ 引擎里硬编码 `BigInt(10**18)` 缩放，与 `token.decimals` 无关。
- 状态：无 loading（`pairInfo` 未到时不渲染本行）。

#### 块 6｜「滑点」行 + 对话框（`:622-709`）

- 行：`Zap` 图标 + 逐字 **`滑点上限：{slippage}%`**（默认 `2.5`，`:407, :626`）+ `Settings` 图标按钮逐字 **`设置`**（`title="设置滑点"`，`:629-639`）。
- 点击「设置」→ `Dialog` 标题逐字 **`滑点设置`**（`:643`），内容三段：
  1. `label` **`选择滑点`** + 3 个预设按钮 `0.5%`、`1.0%`、`2.5%`（选中态 `variant="default"`），点选即生效并关窗（`:646-665`）。
  2. `label` **`自定义滑点`** + `Input type="number" placeholder="输入滑点百分比" min=0 max=50 step=0.1` + 后缀 `%`（`:667-681`）；仅当有输入时出现按钮 **`应用自定义滑点`**（`:682-699`），越界 `toast.error('滑点应在 0-50% 之间')`（`:692`）。
  3. 说明 3 条（`text-xs text-greyscale-500`）：`• 滑点是指实际执行价格与预期价格之间的差异`、`• 较低的滑点可能导致交易失败，较高的滑点可能导致不利的价格`、`• 建议设置在 0.5% - 5% 之间`（`:701-705`；圆点是文案里的 `•`，不是 CSS）。
- 滑点用途（`:308-311`）：`slippageBigInt = round(slippage*10)`（千分比）、`tokenAmountMin = amt*(1000-s)/1000`，同样算 `parentTokenAmountMin`，一起传给 `Hub.stakeLiquidity`。**不显示最小接收量数值**，只在提交时生效。

#### 块 7｜Card「第2步: 选择解锁期」（`:714-755`）

- 标题逐字 **`第2步: 选择解锁期`**（`:719`）。
- 控件：`Select`，`SelectTrigger className="w-full !ring-secondary-foreground"`，`SelectValue placeholder="选择解锁期"`（`:730`）。
- 选项生成：`PROMISED_WAITING_PHASES_MIN..MAX` 全量区间（`stakelp` 上默认 4..12，但 env 会覆盖成 30..120 / 1..4，`:142-143`）**再按 `item >= promisedWaitingPhases`（我当前承诺的解锁期）过滤**（`:733-742`），选项文本 = `formatPhaseText(item)` → 例如 `30个阶段（903,780区块，约30天）`。
  - ⇒ **只能加长、不能缩短**；`promisedWaitingPhases` 为 `0n` 时全量可选。
- 说明文案（`FormDescription`，`:746-748`）逐字：`"解锁期" 是指，取消质押后多久才能取回代币 (注意：是从取消质押的阶段结束时开始计算)`（含中文引号 `"..."`、括号前有空格）。
- 错误：`请选择解锁期`（`:93`）。

#### 块 8｜Card「第3步: 授权并存入」（`:757-834`）

- 标题逐字 **`第3步: 授权并存入`**（`:762`）。
- 3 个按钮，`grid grid-cols-1 md:grid-cols-3 gap-2`（移动端竖排 3 个全宽按钮，`whitespace-normal` 允许换行）——**这是「双币授权阶梯」**：

  | # | 位置 | 禁用条件 | 文案状态机（逐字） | 点击后 |
  | --- | --- | --- | --- | --- |
  | 1 | 子币授权（`sl` 无关，是 token 自身） | `isCheckingTokenApproval \|\| isPendingApproveToken \|\| isConfirmingApproveToken \|\| isTokenApproved` | `1.读取授权...` → `1.提交中...` → `1.确认中...` → `1.{symbol}已授权` → 默认 `1.{approvalActionText}{symbol}`（=`1.授权TKM` 或 `1.长期授权TKM`） | `approveToken()`（spender = `NEXT_PUBLIC_CONTRACT_ADDRESS_PERIPHERAL_HUB`，`:177`） |
  | 2 | 父币授权 | `!isTokenApproved \|\| isCheckingParentTokenApproval \|\| isPendingApproveParentToken \|\| isConfirmingApproveParentToken \|\| isParentTokenApproved`（**必须先完成 #1**） | 同上，前缀 `2.`，币种换成 `parentTokenSymbol` | `approveParentToken()`，成功 toast `授权{parentTokenSymbol}成功`（`:210`） |
  | 3 | 提交质押（`type="submit"`） | `!isTokenApproved \|\| !isParentTokenApproved \|\| isPendingStakeLiquidity \|\| isConfirmingStakeLiquidity \|\| isConfirmedStakeLiquidity` | `3.提交中...` → `3.确认中...` → `3.已提交` → 默认 `3.提交` | `onStake`：未双授权时 `toast.error('请先完成授权')`；滑点算 min 值后调 Hub `stakeLiquidity` |

- `approveFlowStarted` 细节（`:176, :213-235, :276-281`）：点任一授权即置 true → 父币输入框锁死；若随后任一授权状态变回「不足」，自动复位 false。
- 授权按钮 `blur()` hack：子币授权交易结束后手动 `blur()`（`:393-401`），防移动端键盘/焦点残留。
- 成功后：`isConfirmedStakeLiquidity` → toast **`质押成功`**，`setTimeout 2000` 后 `window.location.href = BASE_PATH + /gov?symbol={symbol}`（`:329-344`）。**跳到治理首页，不是留在原页**。
- 首次质押特例（决定要不要 `initialStakeRound` 刷新）：若 `token.initialStakeRound` 已 > 0 直接跳；否则置 `updatedInitialStakeRound`，等 `useInitialStakeRound` 返回后 `clearToken()` 再跳（`:336-360`）。
- 全屏遮罩（`:839-848`）：`isLoading = isApproving || isApproveConfirming || isPendingStakeLiquidity || isConfirmingStakeLiquidity || (isPendingInitialStakeRound && updatedInitialStakeRound)`；`text = (isApproving || isPendingStakeLiquidity) ? '提交交易...' : '确认交易...'`。

#### 块 9｜底部「提示」信息框（`stakelp.tsx:30-56`）

- 容器：`div.flex.flex-col.w-full.p-4` → `div.bg-status-info-soft.border-l-4.border-l-status-info-border.rounded-r-lg.p-4.mb-8.text-sm`（**左侧 4px 竖条 + 右侧圆角**是个可复用样式）。
- 头部行：`HelpCircle w-4 h-4` + `text-base font-bold text-status-info` 逐字 **`提示`**。
- 4 个小标题（`text-base font-bold text-status-info pt-2 pb-1`）+ 正文（`text-sm`）逐字：

  | 小标题 | 正文 |
  | --- | --- |
  | `SL代币：` | `代币对儿由质押合约注入 Uniswap V2 流动性池，并铸造SL代币作为流动性质押凭证` |
  | `治理票：` | `所得治理票数 = SL代币数量 * 解锁期阶段数` |
  | `治理激励：` | `1、当轮所得治理激励 = 验证激励 + 加速激励`（`:44`）<br>`2、单个地址的验证激励：当轮治理总激励 * 50% * 当轮该地址参与验证的治理票数 / 当轮参与验证的治理票总数`（`:45-47`）<br>`3、单个地址的加速激励：当轮治理总激励 * 50% * 该地址加速质押代币数量 / 当轮所有参与验证地址的加速质押代币总数`（`:48-51`）<br>`4、溢出：单个地址的加速激励 超过验证激励 2 倍以上的部分，为溢出激励，自动销毁，归入未来总激励`（`:52-54`） |

- 状态：静态，无数据。

### 1.3 全局横幅（`setError`，本页特有）

| 触发条件 | 标题 | 正文逐字 | 行 |
| --- | --- | --- | --- |
| `?first=true` 且 `initialStakeRound` 为空且不 pending | `提示：` | `新部署的代币，需先质押获取治理票，才能后续操作` | `StakeLiquidityPanel.tsx:369-376` |
| 子币余额为 0 且**未开始过授权** | `余额不足` | `您当前{symbol}数量为0，请先获取{symbol}` | `:378-384` |
| 父币余额为 0 且**未开始过授权** | `余额不足` | `您当前{parentTokenSymbol}数量为0，请先获取{parentTokenSymbol}` | `:385-390` |

（渲染位置：`_app.tsx` 顶部 `ErrorAlert`，全站最上方；`setError(null)` 由 Header 网络检查等逻辑清理。）

### 1.4 状态矩阵（stakelp）

| 场景 | 渲染 |
| --- | --- |
| 未连接钱包 | 页面其余部分照常；块 2 显示 `请先连接钱包`；`useStakeLpPageData` 不启用（`enabled` 需 account），余额显 `0`；授权按钮全 disabled（`isApproved=false` 且 `amount<=0`）。 |
| 加载中（质押状态/首押轮） | `StakeLiquidityPanel` **整块**只有一个行内 spinner（`:411-413`）；块 2 也是 spinner。无骨架屏。 |
| 无质押（首次） | 块 2 完全空白（不渲染）；表单默认空，`3.提交` 不可用；`?first=true` 时顶部有「提示：新部署的代币…」横幅。 |
| 余额为 0 | 顶部 `余额不足` 横幅（授权开始后消失）；对应输入卡的 25/50/最高 disabled。 |
| 无资格（未做成 LP / pair 不存在） | **没有任何「无资格」UI**。`pairExists=false` → 比例行消失；两个输入框仍可手填；提交由合约 revert 兜底。 |
| 读失败（`errorStakeLpData` / `errInitialStakeRound` / `errAccountStakeStatus`） | 三个 error 变量全部**未渲染**（`:113-121, :135-139, :166-171`）。表现：余额 `0`、解锁期选项按 `promisedWaitingPhases=0n` 全量列出、可能永久 spinner（若 pending 卡住）。⚠️ 必须补「读不到 + 下一步按钮」。 |
| 交易进行中（授权/质押） | 全屏 `LoadingOverlay` + `提交交易...` / `确认交易...`；按钮文案变 `N.提交中...`/`N.确认中...`；遮罩期间输入仍可见但按钮 disabled。 |
| 成功 | toast `质押成功` → 2 秒后跳 `/gov?symbol=`。 |

### 1.5 跳转关系（stakelp 出/入）

- 出：`获取代币` → `/dex/swap`（`:432`）；成功后 → `/gov?symbol=`（`:332`）。
- 入：`/gov`「我的」tab 无治理票时按钮 `立即成为治理者` → `/stake/stakelp/?symbol=`（`pages/gov/index.tsx:114`）；`GovernanceDataPanel` 的 `质押 获取治理票 >>`（`DataPanel/GovernanceDataPanel.tsx:109`）；`MyGovInfoPanel:158`；`MyGovernanceAssetsPanel:349`；`MyStakingPanel:55`（死代码）；`MyLiquidDataPanel:166`；`StakedLiquidDataPanel:75`；`/submit/actions` 提交后 `router.push('/stake/stakelp/?symbol=...&first=true')`（`pages/submit/actions.tsx:33`）；`/dex/Deposit` 成功后 `window.location.href = /stake/stakelp/?symbol=`（`Dex/Deposit.tsx:133`）；`Vote/RemainingVotesDisplay:38`；`BanListPanel:687`；`LiquidityStakeOverflowHint:133`。

---

## 2. 质押代币（`src/pages/stake/staketoken.tsx`）

### 2.1 页面骨架

```
<Header title="质押代币" />                                  // staketoken.tsx:36 —— 无返回按钮，title 不上屏
<main class="flex-grow">                                     // :37
  ├─ [三态互斥]
  │   ├─ isPendingStakedSLTokenAmount        → <LoadingIcon />                  // :38
  │   ├─ !pending && !stakedSLTokenAmount    → 门槛文案（居中，mt-10）           // :39-41
  │   └─ stakedSLTokenAmount                 → <StTokenTab /> + <StakeTokenPanel tokenBalance={tokenBalance||0n} />  // :42-47
  └─ 容器 p-4 →「提示」信息框                                  // :49-69
```

可见区块 **8 个**：Header / 门槛三态 / ST 凭证条 / 标题「质押增加治理收益」/ 质押数输入块 / 解锁期块 / 按钮组 / 底部提示框（另含 1 个推荐说明弹层 + 1 个全屏遮罩）。

### 2.2 逐块说明

#### 块 1｜门槛三态（`:38-41`）

- 加载：`<LoadingIcon />`。
- **未质押过 LP**：`div.flex.justify-center.items-center.mt-10` 逐字 **`需要先质押流动性LP，才可以质押代币`**（`:40`）。
- 正常：渲染 StTokenTab + StakeTokenPanel。
- ⚠️ 判断依据是 `useTokenAmounts(token.slTokenAddress)` 的**第 0 个返回值 `tokenAmount`（全局 SL 池子里的 token 数量）是否为 0**（`staketoken.tsx:28-32` → `useLOVE20SLToken.ts:138-159`），**不是**当前账户是否质押过。也就是说：只要全协议有人质押过 LP，任何地址都能进；反之所有地址都看到门槛文案。属「待核实」语义（见 §8）。

#### 块 2｜`StTokenTab`（`Token/StTokenTab.tsx:16-58`）

- 外层 `div.px-4.pt-0.pb-6` → `div.bg-greyscale-100.rounded-lg.p-4.text-sm.mt-4`。
- 行 1：`st{symbol}` 大字（`font-bold text-2xl font-mono`）+ `AddressWithCopyButton{address: stTokenAddress}`（**显示缩写地址 + 复制**）+ `AddToMetamask{tokenAddress: stTokenAddress, tokenSymbol: token.symbol}`。
  - ⚠️ `tokenSymbol` 传的是 **`token.symbol`**（不是 `'st'+symbol`，`:43`），疑似笔误——加钱包后符号会是 `TKM` 而不是 `stTKM`。
- 行 2：`我持有:` （`text-sm text-greyscale-500 mr-1`）+ `formatTokenAmount(balance)`（`text-data-personal`）；loading 时 spinner。
- 守卫：`!token?.stTokenAddress` → 只渲染 spinner（`:29-31`）。
- `balanceError` 解构后**未使用**（`:20-27`）→ 读失败显 `0`。

#### 块 3｜标题「质押增加治理收益」（`Stake/StakeTokenPanel.tsx:340-343`）

- 外层 `div.w-full.flex.flex-col.items-center.pt-0.p-6`（`p-6` 覆盖 `pt-0`，左右 24px）→ `div.w-full.text-left.mb-4` → `LeftTitle title="质押增加治理收益"`。
- 前置守卫：`isPendingAccountStakeStatus` 时整块只渲染居中 spinner（`:331-337`）。
- 表单 `form onSubmit={e => e.preventDefault()}`（`:348`，**阻止回车提交**，两个按钮各自 `form.handleSubmit(...)()`）。

#### 块 4｜质押数输入（`:350-413`）

- `FormLabel text-sm` 逐字 **`质押数：`**（全角冒号，`:355`）。
- `Input type="number" placeholder="输入 {symbol} 数量" className="!ring-secondary-foreground"`（`:357-362`）。
- 输入下方两行（`text-sm text-muted-foreground`）：
  - 行 A 左：`持有 {formatTokenAmount(tokenBalance)} {symbol}`（余额数字 `text-data-personal mr-2`）；行 A 右：`Button variant="link" size="sm"` 逐字 **`全部`**，点击 `form.setValue('stakeTokenAmount', formatUnits(tokenBalance))`（**注意：没带 `shouldValidate`**），`tokenBalance<=0` 时 disabled。
  - 行 B 左：`推荐质押（估算） {recommendedStakeTokenText} {symbol}` + `InfoTooltip title="推荐质押（估算）数量说明"`；行 B 右：`Button variant="link"` 逐字 **`推荐`**，点击填入 `recommendedAmount`（带 `shouldValidate+shouldDirty`），无有效推荐值 disabled。
- `recommendedStakeTokenText` 四态（`:233-239`）：`计算中...` / `-`（无数据）/ **`不限`**（`govCapRatio >= 100%`，无有限上限）/ `formatTokenAmount(x, 4)`。
- 校验（`stakeSchemaFactory`，`:45-61`）逐字：

  | 触发 | 文案 |
  | --- | --- |
  | 空串 | `请输入质押数量` |
  | `Number(val) <= 0` | `质押代币数不能为0` |
  | `parseUnits(val) > tokenBalance` | `质押代币数不能大于持有代币数` |
  | 解锁期未选 | `请选择解锁期` |

  （注意与 §1 的 stakelp 文案**不一致**：这里 `不能为0`（无空格）、`不能大于持有代币数`，stakelp 是 `不能为 0`、`不能超过当前持有`。）
- 推荐值算法（`:182-229`）：`r = 我的有效治理票 × 倍数 / 总治理票`；`x = (r×T - A)/(1-r)`，`T = govData.stAmount`（全局 ST），`A = 我的 stAmount`，倍数 = `MAX_GOV_BOOST_REWARD_MULTIPLIER`。`r≥1` 时无有限解 → `不限`。
- InfoTooltip 内容（`:243-329`）逐字要点：
  - `推荐（估算）值是本次可提交的追加质押数量，目标是降低加速激励溢出。`
  - `简化假设：所有治理者都会投票并参与验证，因此用全局 ST 质押量估算加速激励占比。`
  - `估算上限占比 r = 我的有效治理票 / 总治理票 × 加速激励倍数。`
  - `理论追加量 x = (r × 当前总加速质押 - 我已加速质押) / (1 - r)。`
  - 明细行（label → value）：`我的有效治理票` / `总治理票` / `加速激励倍数` / `上限占比 r` / `当前总加速质押 T` / `我已加速质押 A`，然后分隔线 `公式：x = (r × T - A) / (1 - r)`，再 `r × T - A` / `1 - r` / `理论追加 x`（仅有限解时），最后 `本次推荐（估算）`。
  - `r≥1` 时替代文案：`我的治理票上限占比已大于等于 100%，理论上没有有限推荐上限。`
  - 末尾 `这是按当前全局治理票和 ST 质押量的简化估算。`
  - 无数据时：`正在读取治理票和质押数据。`

#### 块 5｜解锁期（`:415-444`）

- `FormLabel` 逐字 **`解锁期：`**（全角冒号）。
- `Select` placeholder 逐字 **`选择解锁期长度`**（与 stakelp 的 `选择解锁期` 不同）。
- 选项同 stakelp：区间 `MIN..MAX` 再 `>= promisedWaitingPhases` 过滤，文本 `formatPhaseText(item)`。
- `FormDescription` 逐字：`提示：取消质押后，需等待解锁期过后才能取回代币`。
- 错误：`请选择解锁期`。

#### 块 6｜按钮组（`:446-483`）

`div.flex.justify-center.space-x-4`，两个 `w-1/2` 按钮（**无** `md:grid-cols-3`，只有 2 个）：

| # | 禁用条件 | 文案状态机（逐字） | 点击 |
| --- | --- | --- | --- |
| 1 授权 | `isPendingAllowanceToken \|\| isPendingApproveToken \|\| isConfirmingApproveToken \|\| isTokenApproved` | `Loader2`（读数阶段只有转圈，**无文字**）→ `1.授权中...` → `1.确认中...` → `1.{symbol}已授权` → `1.{approvalActionText}{symbol}` | `approveToken()`（spender = `NEXT_PUBLIC_CONTRACT_ADDRESS_STAKE`，`:125`） |
| 2 质押 | `!isTokenApproved \|\| isPendingStakeToken \|\| isConfirmingStakeToken \|\| isConfirmedStakeToken` | `2.质押中...` → `2.确认中...` → `2.已质押` → `2.质押` | `stakeToken(token, amount, phases, account)` |

- 源码里留了一段被注释掉的 CT 期占位按钮：`第1次内测体验, 暂时关闭加速质押`（`:448-450`）——**不要照抄**。
- 成功（`:170-180`）：toast `质押成功` → `form.reset()` → 2 秒后 `window.location.href = BASE_PATH + /gov?symbol=`。
- 全屏遮罩（`:488-491`）：`isLoading = 授权 pending/confirming || 质押 pending/confirming`；`text = (isPendingApproveToken || isPendingStakeToken) ? '提交交易...' : '确认交易...'`。

#### 块 7｜底部「提示」信息框（`staketoken.tsx:49-69`）

- 样式与 stakelp 完全相同（`bg-status-info-soft` + 左 4px 竖条 + `mb-8`），头部 `HelpCircle` + **`提示`**。
- 只含一个小标题 **`治理激励：`**，5 条正文逐字：
  1. `1、当轮所得治理激励 = 验证激励 + 加速激励`
  2. `2、质押代币可获得 加速激励`（注意 `可获得` 后有空格）
  3. `3、单个地址的验证激励：当轮治理总激励 * 50% * 当轮该地址参与验证的治理票数 / 当轮参与验证的治理票总数`
  4. `4、单个地址的加速激励：当轮治理总激励 * 50% * 该地址加速质押代币数量 / 当轮所有参与验证地址的加速质押代币总数`
  5. `5、溢出：单个地址的加速激励 超过验证激励 2 倍以上的部分，为溢出激励，自动销毁，归入未来总激励`
- 与 stakelp 的 1-4 条**几乎逐字重复**（stakelp 少了第 2 条、编号整体前移 1）→ 可合并（见 §7）。

### 2.3 状态矩阵（staketoken）

| 场景 | 渲染 |
| --- | --- |
| 未连接钱包 | 页面不拦；`tokenBalance=0`（hook 需 account）→ `全部`/`推荐` disabled；`1.授权` 因 `amount<=0` 不可点（`useTokenApproval.enabled` 需 account）。**没有**「请先连接钱包」文案（与 stakelp 不一致）。 |
| 加载中 | `LoadingIcon` 整行（仅 SL 池子读取阶段）；StakeTokenPanel 内部 `isPendingAccountStakeStatus` → 居中 spinner。 |
| 无人质押过 LP（全局判据） | 居中逐字 `需要先质押流动性LP，才可以质押代币`，**没有**「去质押LP」按钮/链接（新协议建议补）。 |
| 已质押 LP，但本账户 ST=0 | 正常显示表单；推荐值可能 >0；无「无资格」文案（合约会拒），错误靠 toast/全局横幅。 |
| 读失败 | `errorStakedSLTokenAmount`、`errAccountStakeStatus`、`errApproveToken`、`errStakeToken`、`return` 的 `error` 全部**未渲染** → 表现可能是永久 spinner 或 `0`。 |
| 交易进行中 | 全屏遮罩 `提交交易...`/`确认交易...`；按钮文案见块 6。 |
| 成功 | toast `质押成功` → 清表单 → 2 秒跳 `/gov?symbol=`。 |

### 2.4 跳转关系（staketoken）

- 出：成功后 → `/gov?symbol=`（`:177`）。
- 入：`/gov` 社区 tab `GovernanceDataPanel` 的 `质押 增加治理收益 >>`（`GovernanceDataPanel.tsx:120`）；`MyGovInfoPanel:175`；`MyGovernanceAssetsPanel:384`；`MyStakingPanel:66`（死代码）；`/my/govrewards:201`。

---

## 3. 取消质押（`src/pages/stake/unstake.tsx`）

### 3.1 页面骨架

```
<Header title="取消质押" />                                   // unstake.tsx:19 —— 无返回按钮，title 不上屏
<main class="flex-grow">                                      // :20
  └─ div.flex-col.items-center.px-6.pt-6.pb-2                 // :21
       ├─ div.mb-4 → <LeftTitle title="取消质押" />            // :22-24  ← 页面可见大标题
       └─ <MyGovernanceAssetsPanel token={token} enableWithdraw={true} />   // :25
```

可见区块 **7 个**：Header / 标题 / 治理票+解锁期双列 / SL·ST 双列 / 失效补足警告（条件）/ 操作区（三按钮阶梯 或 取回按钮，互斥）/ 解锁期说明行（另含全屏遮罩）。
**本页没有自己的提示信息框**，也**没有输入框**——全部操作是按钮。

### 3.2 面板 `My/MyGovernanceAssetsPanel.tsx`（`enableWithdraw=true` 模式）

#### 前置分支（顺序即优先级，`:248-266`）

| # | 条件 | 渲染（逐字） |
| --- | --- | --- |
| 1 | `!account` | `请先连接钱包`（`text-sm mt-4 text-greyscale-500 text-center`） |
| 2 | `errorAccountStakeStatus` | `质押状态读取失败，暂时无法判断质押情况`（`text-status-error text-center`） |
| 3 | `!token \|\| isPendingCurrentRound \|\| isPendingAccountStakeStatus \|\| isPendingSlBalance \|\| isPendingStBalance \|\| (hasStake && isPendingValidGovVotes)` | `<LoadingIcon />`（整块只有 spinner） |
| 4 | `enableWithdraw && !isPending && !slAmount` | `您没有质押`（`text-greyscale-500 text-center`） |
| 5 | 其它 | 正常内容（下） |

#### 块 A｜双列统计：我的有效治理票数 / 我承诺的解锁期（`:289-312`）

`div.stats.w-full.grid.grid-cols-2.divide-x-0`：

- 左：`stat-title text-sm` **`我的有效治理票数`** → `stat-value text-xl text-data-personal` = `errorValidGovVotes ? '读取失败' : formatTokenAmount(validGovVotes)` → `stat-desc text-xs mb-2 mt-1` = 仅 `isUnstaking` 时逐字 **`注意：已申请解锁，治理票数为0`**（否则空占位）。
- 右：`stat-title` **`我承诺的解锁期`** → `stat-value text-lg`：数字部分 `text-data-personal`（loading 时 spinner）+ 后缀 ` 阶段`（`text-sm text-greyscale-600`，注意前导空格）→ `stat-desc` = `formatPhaseText(Number(promisedWaitingPhases||0n), true)`，即 **`onlyBlockTime=true`**，显示 `903,780区块，约30天`（去掉「N个阶段」外壳）。

#### 块 B｜双列统计：SL 代币 / ST 代币（`:313-389`）

`div.stats.w-full.grid.grid-cols-2.divide-x-0`：

| 列 | 标题（`enableWithdraw` 分支逐字） | 值 | 描述行 |
| --- | --- | --- | --- |
| 左（SL） | `已归还的SL代币`（`isUnstaking`）／`需归还的SL代币`（未申请）／非本页模式：`钱包SL余额` | `formatTokenAmount(displayedSlAmount \|\| 0n)`；非本页模式 = `error \|\| undefined ? '读取失败' : <Link to=/my/liquid>{amount}<Info/></Link>` | `isUnstaking` → 解锁状态文字（见下）；否则 `当前钱包余额：{...或'读取失败'}` + 条件 `余额不足，还差 {formatTokenAmount(missing,4,'ceil')}`（`text-status-error`）；非本页模式 → `质押 获取治理票 >>` 链接 |
| 右（ST） | `已归还的ST代币`／`需归还的ST代币`／`钱包ST余额` | 同上（ST）。**非本页模式下 ST 列不可点**（没有 /my/liquid 链接） | 同上；非本页模式链接 `质押 增加治理收益 >>` |

- 两列标题右侧都挂 `AddToMetamask`：SL 传 `'sl'+symbol`，ST 传 **`'st'+symbol`**（`MyGovernanceAssetsPanel.tsx:319,359` —— 与 `StTokenTab` 的 `token.symbol` 不一致，见 §8）。
- `displayedSlAmount = enableWithdraw ? slAmount : slBalance`；`displayedStAmount = enableWithdraw ? stAmount : stBalance`（`:274-275`）——**本页显示的是「质押记录里的数量」，不是钱包余额**；钱包余额只出现在 desc 行。
- `unlockStatusText`（`:285`）：`errorCurrentRound ? '解锁状态读取失败' : canWithdraw ? '解锁完成，可取回' : '正在解锁中'`。
- `canWithdraw`（`:280-284`）：`requestedUnstakeRound && !errorCurrentRound && currentRound > requestedUnstakeRound + promisedWaitingPhases`（**严格大于**）。

#### 块 C｜治理票失效 → 补足凭证警告（`:390-418`，条件块，`enableWithdraw=false` 才显示）

条件：`!isPendingValidGovVotes && !enableWithdraw && !isPending && !errorValidGovVotes && validGovVotes<=0 && govVotes>0`。
- 若 `balanceReadFailed`：单行 `SL/ST 凭证余额读取失败，暂时无法计算需补充数量。`
- 否则三条逐字：`治理票已失效，请补充：` → `SL 凭证 {n}`（`title="精确数量：{formatUnits(n, decimals)}"`，数字 `ceil 4 位`）→ `ST 凭证 {n}` → `补足后可恢复治理票，继续参与治理或取消质押。`
- ⚠️ **本页 `enableWithdraw=true` 时这块不会出现**（条件写死 `!enableWithdraw`）；但 `requestedUnstakeRound` 存在时缺失量会被 `getMissingStakeReceiptAmount` 归零，逻辑上不影响按钮。

#### 块 D｜操作区 A：未申请解锁时的「三步按钮阶梯」（`:420-489`）

容器 `div.grid.w-full.grid-cols-1.gap-2.mt-2.sm:grid-cols-3`（移动端竖排 3 个全宽，`!whitespace-normal text-center leading-tight`）：

| # | 按钮文案状态机（逐字） | 禁用条件 |
| --- | --- | --- |
| 1 | `1.提交中...` → `1.确认中...` → `1.sl{symbol} 已授权`（注意 `已授权` 前有**空格**）→ 默认 `1.{approvalActionText} sl{symbol}` | `isApprovingSL \|\| isSlTokenApproved` |
| 2 | `2.提交中...` → `2.确认中...` → `2.st{symbol} 已授权` → 默认 `2.{approvalActionText} st{symbol}` | `!isSlTokenApproved \|\| isApprovingST \|\| isStTokenApproved`（**必须先授权 SL**） |
| 3 | `3.提交中` / `3.确认中` / `3.已取消质押` / 默认 `3.取消质押`（**注意这三个没有省略号**，与 1/2 不一致） | `!allApproved \|\| missingSlAmount > 0 \|\| missingStAmount > 0 \|\| isPendingUnstake \|\| isConfirmingUnstake \|\| isConfirmedUnstake` |

- 授权额度 = **质押记录里的 `slAmount` / `stAmount`**（不是钱包余额，`:147,158`）；spender = `NEXT_PUBLIC_CONTRACT_ADDRESS_STAKE`。
- `checkInput()` 前置守卫（`:80-86`）：`slAmount` 为空或 ≤0 时 `toast.error('流动性质押数量为0，不用取消质押')`。
- 点击「3.取消质押」→ `Stake.unstake(token)`（`:198-204`）。
- 按钮组下方说明（`:473-487`，`text-center mt-4 text-sm text-greyscale-600`）：
  - `errorCurrentRound` 时逐字：`当前轮次读取失败，暂时无法预计取回轮次`
  - 否则逐字：`解锁期，是从取消质押的阶段结束时开始计算` + `<br/>` + `（现在取消质押后，投票轮第 {N} 轮才能取回代币）`，其中 `N = formatRoundForDisplay(currentRound, token) + promisedWaitingPhases + 1`（数字用 `text-data-personal mx-1` 高亮，**注意括号是全角 `（）`**）。
- 成功（`:207-214`）：toast **`取消质押成功`** → 2 秒后 `window.location.href = BASE_PATH + /my?symbol=`（**跳个人中心**）。

#### 块 E｜操作区 B：已申请解锁时的「取回」单按钮（`:490-516`）

`div.flex.w-full.justify-center.mt-2` → 一个 `Button.w-1/2`：

| 状态 | 文案逐字 |
| --- | --- |
| 当前轮读取失败 | `解锁状态读取失败` |
| 未到轮 | `已取消,第{N}轮才可取回`（**半角逗号、无空格**；`N = formatRoundForDisplay(requestedUnstakeRound) + promisedWaitingPhases + 1`） |
| 提交中 | `提交中` |
| 确认中 | `确认中` |
| 已取回 | `已取回` |
| 可点 | `取回质押代币` |

`disabled = !canWithdraw || isPendingWithdraw || isConfirmingWithdraw || isConfirmedWithdraw`。
成功（`:231-238`）：toast **`取回代币成功`** → 2 秒后 `/my?symbol=`。

#### 块 F｜全屏遮罩（`:548-562`）

`isLoading = isApprovingSL || isApprovingST || isPendingWithdraw || isPendingUnstake || isConfirmingWithdraw || isConfirmingUnstake`；
`text = (isPendingApproveSL || isPendingApproveST || isPendingWithdraw || isPendingUnstake) ? '提交交易...' : '确认交易...'`。

### 3.3 状态矩阵（unstake）

| 场景 | 渲染（逐字） |
| --- | --- |
| 未连接钱包 | `请先连接钱包` |
| 加载中 | 行内 spinner（整块） |
| 无质押 | `您没有质押`（仅 `enableWithdraw` 模式；非本页模式不会出现，改为渲染 0/空行） |
| 无资格 | **没有**「无资格」概念；未申请解锁时永远给三步按钮（不可用时 disabled） |
| 读失败（质押记录） | `质押状态读取失败，暂时无法判断质押情况`（整块替换） |
| 读失败（当前轮） | 保留数据行；解锁状态行 `解锁状态读取失败`；取回按钮文案 `解锁状态读取失败` 且 disabled；三按钮模式下方 `当前轮次读取失败，暂时无法预计取回轮次` |
| 读失败（有效治理票） | 该单元格 `读取失败` |
| 读失败（SL/ST 钱包余额） | desc 行 `当前钱包余额：读取失败`；若同时需要计算缺口则 `SL/ST 凭证余额读取失败，暂时无法计算需补充数量。`（但本页模式不显示该块） |
| 已申请解锁 | 操作区从「三按钮」整体切换为「单按钮取回 + 两个数字单元格描述变 `正在解锁中`/`解锁完成，可取回`」；治理票数 description 出现 `注意：已申请解锁，治理票数为0` |
| 交易进行中 | 全屏遮罩 + 上述按钮文案态 |
| 成功 | toast `取消质押成功` / `取回代币成功` → 2 秒后 `/my?symbol=` |

### 3.4 跳转关系（unstake）

- 出：成功后 → `/my?symbol=`（`:211,235`）。
- 入：`/my`「我的治理资产」标题右侧 `取消质押` 链接 → `/stake/unstake?symbol=`（`pages/my/index.tsx:67,81`，仅 `hasStake` 时显示）；面板自身在非 `enableWithdraw` 模式下的「取回质押代币」按钮 → `/stake/unstake/?symbol=`（`MyGovernanceAssetsPanel.tsx:533`）；`MyLiquidDataPanel:166` 的 `查看解锁进度 >>`。

---

## 4. 流动性质押数据（`src/pages/stake/liquid.tsx`）

### 4.1 页面骨架

```
<Header title="流动性质押数据" showBackButton={true} />        // liquid.tsx:14 —— 唯一带「‹ 返回」的质押页
<main class="flex-grow">                                      // :15
  └─ <StakedLiquidDataPanel />                                // :16 —— 整页只有这一个面板
```

可见区块 **6 个**：Header（带返回）/ 标题 / 汇总块（SL 总数 + 两列折算）/ 标题「待分配手续费」/ 两列手续费 / 跳转按钮。
**本页只读，没有交易、没有输入、没有授权、不读账户数据**（不依赖连接钱包）。

### 4.2 面板 `DataPanel/StakedLiquidDataPanel.tsx`

#### 前置（`:34-36`）
`isPendingTokenAmount || isPendingGovData` → `<LoadingIcon />`（整块只有 spinner）。**无未连接钱包分支**（不需要）。

#### 块 A｜标题 + 汇总（`:39-60`）

- 外层 `div.flex-col.items-center.px-6` → `LeftTitle title="流动性质押数据"`（`:40`）。
- 汇总容器 `div.border.rounded-lg.my-4`：
  - 上半 `div.stats.w-full` 单列：`stat-title`（无 `text-sm`，默认字号）逐字 **`流动性质押凭证 sl{symbol} 总数`** → `stat-value text-data-public text-2xl` = `formatTokenAmount(govData?.slAmount || 0n)`（来源：`RoundViewer.govData`，**全局**）。
  - 下半 `div.stats.rounded-lg.w-full.grid.grid-cols-2.divide-x-0.mt-2` 两列：
    - 左：`stat-title text-sm` **`对应 {symbol} 质押数`** → `text-xl text-data-public` = `formatTokenAmount(tokenAmount)`（来源：`SLToken.tokenAmounts()[0]`）
    - 右：`stat-title text-sm` **`对应 {parentTokenSymbol} 质押数`** → `formatTokenAmount(parentTokenAmount)`（`tokenAmounts()[1]`）

#### 块 B｜标题「待分配手续费」+ 两列（`:62-72`）

- `LeftTitle title="待分配手续费"`（`:62`）。
- `div.stats.border.rounded-lg.w-full.grid.grid-cols-2.divide-x-0.mt-2.mb-6`：
  - 左：**`待分配 {symbol} 总数`** → `formatTokenAmount(feeTokenAmount)`（`tokenAmounts()[2]`）
  - 右：**`待分配 {parentTokenSymbol} 总数`** → `formatTokenAmount(feeParentTokenAmount)`（`tokenAmounts()[3]`）

#### 块 C｜底部跳转按钮（`:73-77`）

- `div.flex.justify-center` → `Button variant="outline" className="w-1/2 text-secondary border-secondary" asChild` → `Link href="/stake/stakelp/?symbol={symbol}"`，文案逐字 **`质押获取治理票 >>`**（`&gt;&gt;`，**注意没有 `&nbsp;`，与其它页面 `质押 获取治理票&nbsp;&gt;&gt;` 的空格写法不同**）。

### 4.3 状态矩阵（liquid）

| 场景 | 渲染 |
| --- | --- |
| 未连接钱包 | **完全不拦**，正常显示全局数据（唯一不需要钱包的质押页）。 |
| 加载中 | 行内 spinner（整块）。 |
| 无数据（无人质押） | 所有数字 `0`，无空态文案。 |
| 读失败（`errorTokenAmount` / `errorGovData`） | **两个 error 均未渲染**（`:24-32`），直接落到 `govData?.slAmount \|\| 0n` 等 → **读失败显示 `0`**。⚠️ 这是最该修的一处（违反「未知值绝不渲染 0」）。 |
| 无资格 | 不存在此概念。 |
| 交易进行中 | 无交易。 |

### 4.4 跳转关系（liquid）

- 出：`质押获取治理票 >>` → `/stake/stakelp/?symbol=`。
- 入：**唯一入口**在 `/gov` → 「社区」tab → `GovernanceDataPanel` → 「流动性质押凭证SL代币」数值右侧的 `Info` 图标链接 → `/stake/liquid?symbol=`（`DataPanel/GovernanceDataPanel.tsx:98-104`）。
- 另：`tokenSwitchRoutes.ts:43` 登记了本路由（切币时保留）。

---

## 5. 附录｜`MyLiquidDataPanel`（`/my/liquid`，四页之外的「同族」面板）

> 不在本次 4 个路径里，但它和 §1 的 `MyLiquidityStakePanel`、§3 的取消质押是同一套 SL/ST 语义，且被 §3 的 SL 单元格链接进去（`/my/liquid?symbol=`）。若新协议只保留一处「我的流动性质押」，这里是最完整的参照。

页面：`pages/my/liquid.tsx` → `Header title="我的流动性质押" showBackButton` + `MyLiquidDataPanel`（只读，无交易）。

块列表（`DataPanel/MyLiquidDataPanel.tsx`）：
1. 标题 **`我的流动性质押`**（`LeftTitle`，`:78/:99`）。
2. 未连接 → `请先连接钱包`（`:75-82`）。
3. 加载（stakeStatus / SL 余额 / ST 余额 / 有 SL 时折算中）→ 行内 spinner（`:87-95`）。
4. 汇总块 `border rounded-lg`：单列 `stat-title` **`钱包流动性质押凭证 sl{symbol} 余额`** → `text-2xl text-data-personal`，读失败 **`读取失败`**（`:103-106`）；两列 → **`可换回 {symbol} 数量`** / **`可换回 {parentTokenSymbol} 数量`**（`useTokenAmountsBySlAmount`，读失败 `读取失败`，`:110-126`）。
5. 已申请解锁提示（`isUnstaking`）：`已申请解锁，可查看进度或取回质押资产。`（`text-status-info`，`:129-133`）。
6. 凭证缺口警告块（条件：未申请解锁 且（质押状态读失败 或 有质押但余额读失败 或 缺口>0），`:135-162`）：
   - `质押状态读取失败，暂时无法计算需补充数量。` / `SL/ST 凭证余额读取失败，暂时无法计算需补充数量。` / 否则 `治理票已失效，请补充：` + `SL 凭证 {n}` + `ST 凭证 {n}`（均带 `title="精确数量：…"`，`ceil 4 位`）+ `补足后可恢复治理票，继续参与治理或取消质押。`
7. 底部按钮 `w-1/2` 二态（`:164-170`）：`isUnstaking ? '查看解锁进度 >>' → /stake/unstake?symbol=` ： `'质押获取治理票 >>' → /stake/stakelp/?symbol=`。
- 精度/口径：这里显式用**钱包余额** `useBalanceOf(slTokenAddress, account)` 作为展示值（`:38-55`），质押记录仅用于判断缺口（`getMissingStakeReceiptAmount`）。

---

## 6. 页面之间重复的部分（合并/复用候选）

### 6.1 完全相同的「提示」信息框（强烈建议抽成一个组件）

| 来源 | 内容 |
| --- | --- |
| `pages/stake/stakelp.tsx:30-56` | 头部 `HelpCircle + 提示`；小标题 `SL代币：`、`治理票：`、`治理激励：` + 4 条编号 |
| `pages/stake/staketoken.tsx:49-69` | 头部 `HelpCircle + 提示`；小标题 `治理激励：` + 5 条编号 |

- 两者的容器 class **完全一致**：`bg-status-info-soft border-l-4 border-l-status-info-border rounded-r-lg p-4 mb-8 text-sm`；头部 `flex items-center gap-2 text-base font-bold text-status-info pb-2`；小标题 `text-base font-bold text-status-info pt-2 pb-1`；正文 `text-sm text-status-info`。
- 文案重叠：`1、当轮所得治理激励 = 验证激励 + 加速激励`、`单个地址的验证激励：…`、`单个地址的加速激励：…`、`溢出：…超过验证激励 2 倍以上的部分…` 两份几乎逐字相同（staketoken 多一条「质押代币可获得 加速激励」，编号整体后移 1）。
- ⇒ 抽 1 个 `HelpBox{title, items[]}` + 1 份文案常量即可覆盖两页。

### 6.2 统计行模式（`stats / stat / stat-title / stat-value / stat-desc`）

出现在：`MyLiquidityStakePanel:50-71`（`grid-cols-[1fr_2fr]`）、`MyGovernanceAssetsPanel:289-312,313-389`（`grid-cols-2`）、`StakedLiquidDataPanel:42-49,50-59,63-72`（单列 + `grid-cols-2`）、`MyLiquidDataPanel:100-127`、`MyStakingPanel:47-70`（死代码）。
⇒ 统一「双列指标卡」原子组件：`{label, value, unit?, desc?, actions?}`，value 三态（值/spinner/`读取失败`）内置。

### 6.3 三态与文案（跨页重复，应统一）

| 类别 | 逐字文案 | 出现位置 |
| --- | --- | --- |
| 未连接 | `请先连接钱包` | `MyLiquidityStakePanel:37`、`MyGovernanceAssetsPanel:249`、`MyLiquidDataPanel:79`、`MyStakingPanel:38` |
| 加载 | 行内 spinner（`LoadingIcon`），**无文案** | 上述所有面板 |
| 读失败（质押记录） | `质押状态读取失败，暂时无法判断质押情况` | `MyGovernanceAssetsPanel:252` |
| 读失败（单元格） | `读取失败` | `MyGovernanceAssetsPanel:293,326-327,340,367,375`、`MyLiquidDataPanel:105,114,122` |
| 无质押 | `您没有质押` | `MyGovernanceAssetsPanel:265` |
| 门槛 | `需要先质押流动性LP，才可以质押代币` | `staketoken.tsx:40` |
| 缺口 | `治理票已失效，请补充：` + `SL 凭证 {n}` / `ST 凭证 {n}` + `补足后可恢复治理票，继续参与治理或取消质押。` | `MyGovernanceAssetsPanel:398-417`、`MyLiquidDataPanel:140-159` |
| 缺口读失败 | `SL/ST 凭证余额读取失败，暂时无法计算需补充数量。` | `MyGovernanceAssetsPanel:400`、`MyLiquidDataPanel:144` |
| 解锁口径 | `解锁期，是从取消质押的阶段结束时开始计算` | `MyGovernanceAssetsPanel:478`、`StakeLiquidityPanel:747`（措辞略不同） |
| 解锁状态 | `正在解锁中` / `解锁完成，可取回` / `解锁状态读取失败` | `MyGovernanceAssetsPanel:285` |

### 6.4 授权按钮阶梯（`1. / 2. / 3.` 编号 + 提交中/确认中/已授权）

出现在：
- `StakeLiquidityPanel.tsx:766-830`（3 按钮，`md:grid-cols-3`，第 1 步是子币、第 2 步父币）
- `StakeTokenPanel.tsx:451-482`（2 按钮，`w-1/2` 各半）
- `MyGovernanceAssetsPanel.tsx:425-472`（3 按钮，`sm:grid-cols-3`，SL → ST → 取消质押）

⇒ 三份实现几乎同构（禁用条件都是「前一步未完成 / 本步进行中 / 本步已完成」），文案状态机一致（`N.读取授权...` 只有 stakelp 有；`N.提交中...`、`N.确认中...`、`N.已授权/已质押/已取消质押`、默认 `N.{approvalActionText}…`）。抽 1 个 `StepButton{index, state}` 即可。

### 6.5 全屏交易遮罩

四处配置几乎一样：`LoadingOverlay` + `text = 提交阶段 ? '提交交易...' : '确认交易...'`（`StakeLiquidityPanel:839-848`、`StakeTokenPanel:488-491`、`MyGovernanceAssetsPanel:548-562`）。
⇒ 抽 `TxOverlay{isSubmitting, isConfirming}`。

### 6.6 其它重复元素

- `AddToMetamask` + `AddressWithCopyButton` 挂在 SL/ST 行：`MyLiquidityStakePanel:60-65`、`SlTokenTab:41-46`、`StTokenTab:40-45`、`MyGovernanceAssetsPanel:317-321,357-361`。
- 「去质押」类文字链：`质押 获取治理票&nbsp;&gt;&gt;`（`MyGovernanceAssetsPanel:349`、`GovernanceDataPanel:109`、`MyGovInfoPanel:158`）、`质押 增加治理收益&nbsp;&gt;&gt;`（`MyGovernanceAssetsPanel:384`、`GovernanceDataPanel:120`、`MyGovInfoPanel:175`）、无空格的 `质押获取治理票 >>`（`StakedLiquidDataPanel:75`）。
- 跳转前后 toast 集合：`质押成功`、`取消质押成功`、`取回代币成功`、`授权{symbol}成功`、`授权{parentTokenSymbol}成功`、`请先完成授权`、`转换金额时出错，请检查输入格式`、`token 授权失败，请检查输入格式`、`父币授权失败，请检查输入格式`、`滑点应在 0-50% 之间`、`流动性质押数量为0，不用取消质押`。
- 成功后统一「toast + 2 秒 + `window.location.href` 整页跳转」（`StakeLiquidityPanel:329-334`、`StakeTokenPanel:170-180`、`MyGovernanceAssetsPanel:207-214,231-238`）——**四页零例外**，新协议若是 SPA 应改为 `router.push` + query 重取，不能照抄 `location.href`。

---

## 7. 旧协议专属（新协议没有 → 不能照抄）

| # | 旧协议专属物 | 出现位置（文件:行号） | 为什么不能照抄 |
| --- | --- | --- | --- |
| 1 | **SL 凭证代币**（`sl{symbol}`，流动性/治理票凭证，可加钱包、可复制地址） | `MyLiquidityStakePanel:57-70`、`SlTokenTab`、`MyGovernanceAssetsPanel:315-353` | 新协议若不再用「质押 LP→铸造 SL」模型，整块概念消失 |
| 2 | **ST 凭证代币**（`st{symbol}`，加速激励凭证） | `StTokenTab`、`MyGovernanceAssetsPanel:354-388`、`staketoken.tsx:44` | 同上；且 ST 只影响「加速激励」，属旧激励模型 |
| 3 | **解锁期选择（30–120 阶段）** | `StakeLiquidityPanel:714-755`、`StakeTokenPanel:415-444`、`MyGovernanceAssetsPanel:300-311` | 新协议若改为固定/无锁定，整块删除；env `PROMISED_WAITING_PHASES_*` 也随之废 |
| 4 | **两段式退出：取消质押 → 等解锁 → 取回**（`requestedUnstakeRound` / `currentRound > requested + phases` / `Stake.withdraw`） | `MyGovernanceAssetsPanel:280-285,420-516`、`MyLiquidDataPanel:129-133` | 旧协议特有的轮次锁定状态机 |
| 5 | **治理票 = SL 数量 × 解锁期阶段数** | `stakelp.tsx:42` 提示文案 | 旧协议治理票公式 |
| 6 | **验证激励 / 加速激励 / 50%+50% / 溢出销毁** 全套文案 | `stakelp.tsx:43-54`、`staketoken.tsx:55-67` | 旧激励模型，新协议若不同则这些公式是错误信息 |
| 7 | **`MAX_GOV_BOOST_REWARD_MULTIPLIER` 与「推荐质押（估算）」算式**（`x=(rT-A)/(1-r)`、上限占比 r、「不限」） | `StakeTokenPanel:182-329` | 完全绑定旧「加速激励溢出」模型，**不要照抄公式**；但「推荐值 + InfoTooltip 给公式分解」这个交互模式可借鉴 |
| 8 | **Uniswap V2 pair 储备双向计价 + 滑点/最小接收量**（`tokenPairInfoWithAccount`、`pairReserve`、`slippage` 千分比、`tokenAmountMin`） | `StakeLiquidityPanel:238-274, 308-311, 406-409, 581-709`；`useStakeLpPageData` | 旧协议 LP 是 Uniswap V2 双币注入；新协议无此交易路径就不要带「滑点」概念 |
| 9 | **`Hub.stakeLiquidity` 7 参（含两个 min 值）** | `useLOVE20Hub.ts:56-111` | 合约签名不同 |
| 10 | **治理激励铸造入口**（`铸造 治理激励 >>` → `/my/govrewards`） | `MyGovernanceAssetsPanel:519-523` | 旧协议「铸造」术语与流程 |
| 11 | **`initialStakeRound` / `?first=true` 引导** | `StakeLiquidityPanel:110, 132-360, 369-376`；`submit/actions.tsx:33` | 旧协议「首押轮」与轮次显示口径（`formatRoundForDisplay` 已退化为原值） |
| 12 | **多代币 `?symbol=` + 切币白名单** | 四页全部；`tokenSwitchRoutes.ts:43-46` | 新协议若单代币，整套 query/切币逻辑要去掉 |
| 13 | **`AddToMetamask`（`wallet_watchAsset`）** | 上述 SL/ST 行 | 移动端/新钱包未必支持；旧代码还有 Tuke 钱包分支与「symbol>11 不渲染」规则 |
| 14 | **APY / 预估年化**（本 4 页不含，但同族 `GovernanceDataPanel` 有 `APY`、`预估年化收益率`；`calculateAPY`） | `GovernanceDataPanel.tsx:28-43`；`domainUtils.ts:25-47` | 旧激励模型衍生指标，四页里没有，**别误以为质押页要显示 APY** |
| 15 | **`LiquidityStakeOverflowHint`（预计激励会溢出）** | `Common/LiquidityStakeOverflowHint.tsx`（仅 LP 扩展插件用，**不在这 4 页**） | 同上，旧溢出模型 |
| 16 | **侧栏/底栏导航、Sentry、VConsole、`网络加载中...` 路由遮罩** | `_app.tsx` | 旧前端外壳，不属于质押页本身 |

> 反向提示：**下面这些是「产品级」而非「旧协议专属」，可以照抄**——三步式表单分区（填写数量 / 选参数 / 授权并提交）、按钮编号阶梯、`LoadingOverlay` 二态文案、`读取失败`/`请先连接钱包`/`您没有质押` 的措辞、`stats` 指标卡、`提示` 侧条信息框、成功后 toast+跳转、解锁期说明句式。

---

## 8. 待核实清单（不编，代码里读不出来）

1. **staketoken 门槛语义**：`useTokenAmounts(slTokenAddress).tokenAmount` 是**全局** SL 池子里的 token 数量（`useLOVE20SLToken.ts:138-159`），用它判「我没质押过 LP」在逻辑上不成立。是不是「全协议没人质押过」就整页拦住？需产品确认。
2. **`StTokenTab` 的 `AddToMetamask tokenSymbol={token.symbol}`**（`StTokenTab.tsx:43`）：加进钱包后符号是 `TKM` 而非 `stTKM`，与 `MyGovernanceAssetsPanel:359` 的 `'st'+symbol` 不一致——是笔误还是有意？
3. **`GovernorIntroCard` 的 `<li>` 无 `<ul>`**（`GovernorIntroCard.tsx:20-24`）：React 会渲染，但 DOM 不合法；且 `symbol` prop 未使用。是否原样照抄视觉？
4. **Header 的 `title` 不上屏**（`Header.tsx:52-76`）：旧站是否靠浏览器标签页标题 + 页内 `LeftTitle` 表达「页面名」？四页里只有 `liquid` 有返回按钮，另外三页靠侧栏/底栏返回——新协议若做移动端返回键，需要重新定。
5. **`formatRoundForDisplay` 返回值恒等于 `round`**（`format.ts:368-376`，原减 `initialStakeRound` 的逻辑被注释）：所以所有「第 N 轮」都是链上绝对轮次。新协议的轮次口径待定。
6. **`MyStakingPanel`**（`My/MyStakingPanel.tsx`）在仓库内**无任何引用**（全文搜索只有自身定义与 export）——死代码，仅作为「我的质押」另一种呈现（含 `去获取`/`去质押` 两个 link 按钮）参考。
7. **`useStakeLiquidity` 双版本**（5 参 `useLOVE20Stake.ts:156` vs 7 参 `useLOVE20Hub.ts:56`）：stakelp 用后者，但 `useLOVE20Stake` 里那个 5 参版本是否还被别处用到，需再查（本次未展开）。
8. **`MyLiquidityStakePanel` 读失败静默**（`errorAccountStakeStatus` 未使用）：旧站读失败时到底表现为空白还是 spinner，取决于 RPC 行为，无法从代码断言——按「空白」记录。
9. **`StakedLiquidDataPanel` 读失败渲染 `0`**（`errorTokenAmount/errorGovData` 未使用）：确认旧站是否实际出现过错误的 0。
10. **`GovernorIntroCard` 两个百分比**：`0.3%` / `3%` 来自 env 除以 10（`NEXT_PUBLIC_*_PER_THOUSAND / 10`），语义是「千分比 → 百分比」。新协议若改阈值，要连文案插值位置（空格/百分号位置）一起改。
11. **`stakelp` 提交后置为空的分支**：`token.initialStakeRound > 0` 直接跳 `/gov`，否则先 `clearToken()` 再跳——首押成功后新站点是否需要刷新 token 缓存，取决于新数据层。

---

## 9. 一页速查：四页 block 数与关键交互

| 页面 | 可见区块数 | 有输入 | 有交易 | 有返回按钮 |
| --- | --- | --- | --- | --- |
| `/stake/stakelp/` 质押LP | 10 | 2 个金额 + 1 个 Select（解锁期）+ 滑点对话框 | 授权×2 + 质押 | 否 |
| `/stake/staketoken/` 质押代币 | 8 | 1 个金额 + 1 个 Select（解锁期） | 授权×1 + 质押 | 否 |
| `/stake/unstake/` 取消质押 | 7 | 0 | 授权×2 + 取消质押 / 取回 | 否 |
| `/stake/liquid/` 流动性质押数据 | 6 | 0 | 0（纯只读） | **是** |

**最关键 3 个交互**
1. **双币联合授权阶梯 + 比例自动联动**（stakelp）：`1.授权子币 → 2.授权父币 → 3.提交`，每步按钮自带 读授权/提交中/确认中/已授权 四态；输入任一侧按 `pairReserve` 自动算另一侧；滑点（默认 2.5%）只在提交时折算成两个 min 值。
2. **退出状态机**（unstake）：`授权 sl → 授权 st → 3.取消质押` → 按钮整体切换为单按钮 `已取消,第N轮才可取回`（disabled）→ 到轮后 `取回质押代币`；两个「第 N 轮」都按 `round + phases + 1` 计算并配全角括号说明。
3. **推荐质押（估算）一键填入**（staketoken）：`推荐质押（估算）{值|计算中...|-|不限}` + InfoTooltip 给出 `r`、`T`、`A`、`x` 的完整算式分解 + `推荐` 按钮直接填值（旧模型专属，公式不可照抄，**交互形态可照抄**）。
