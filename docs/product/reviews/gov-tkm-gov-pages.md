# 旧前端 `LOVE20TKM/interface-test` —— 治理 / 治理激励 / 投票 / 验证 / 推举 / 行动 页面蓝图

> **用途**：给新前端（`interface-dev-dsh`，React 19 + Vite + 浅`app → pages → widgets → features → entities → shared`）的「治理」IA 与页面骨架提供可照抄的布局与交互清单。
> **源码（只读）**：`/Users/BigPolarBear/Documents/github/LOVE20TKM/interface-test`（Next.js Pages Router + wagmi + shadcn/ui + tailwind）。
> **证据格式**：`文件:行号`，中文文案逐字抄（含标点、`>>`、全角空格）。
> **状态**：本轮只写 `/tmp/tkm-gov-pages.md`，未修改任何仓库文件。

---

## 0. 全局骨架（所有页面共用，先读这节再读各页）

### 0.1 `Header` 组件真相（重要，和"页头标题"直觉不符）

`src/components/Header.tsx:13-81`

- Props：`title`、`showBackButton`、`backUrl`、`replaceBack`。
- **`title` 不渲染成可见文字**：只写进 `<meta name={`${title} - ${token.symbol}`}>`（`Header.tsx:52-60`）；浏览器 `<title>` 恒为 **token symbol**（`Header.tsx:52` `pageTitle = token.symbol`，无 token 时为 `LOVE20`）。
- 可见页头只有两件东西，单行 flex 两端对齐（`Header.tsx:62-77`）：
  - 左：返回按钮，文案 `&lt;&nbsp;返回`（`Header.tsx:72`），`title="返回上一页"`；仅当 `showBackButton` 或 `backUrl !== ''` 时出现。点击逻辑：有 `backUrl` → `router.push(backUrl)`（`replaceBack` 时 `replace`），否则 `router.back()`（`Header.tsx:39-49`）。
  - 右：`WalletButton`（连接钱包按钮）。
- 副作用：`Header` 内含网络错误检测，`address && !chainId` 时 `setError({ name: '钱包网络错误', message: '请切换到 ${chainName} 网络' })`（`Header.tsx:29-36`）。
- **落新前端时的结论**：旧页面「标题」不是视觉元素，只是 `<meta>`/文档标题。页面内真正的一级标题一律由 `LeftTitle`（`text-lg font-bold` 左对齐 `h1`，`src/components/Common/LeftTitle.tsx:8-14`）承担。新前端若要有可见页头标题，属于**新增设计**，不是照抄。

### 0.2 页面容器与外壳

- `src/pages/_app.tsx:276-308`：`SidebarProvider` → `SidebarInset` → `div.bg-background.flex.flex-col.min-h-screen`（`pb-[var(--bottom-navigation-height)]`，`md:pb-0`）。
- 页面内部结构统一为：`<Header …/>` + `<main className="flex-grow">…</main>`；`gov/index`、`my/govrewards`、`vote/*`、`verify/*`、`submit/*`、`acting/*`、`action/*` 无一例外（见各节骨架）。
- 全局还挂了 `ErrorAlert`、`GasBalanceNotifier`、`ActionRewardNotifier`、`Toaster(position: 'top-center')`、`Footer`、`BottomNavigation`（`_app.tsx:287-307`）。**注意**：`Footer` + `BottomNavigation` 的 `pb` 只在外壳层算一次，页面自身不再处理安全区。

### 0.3 IA 真相：谁把用户带到治理

- 底部导航（移动端，`md:hidden`），`src/components/Common/BottomNavigation.tsx:22-69`，5 项，顺序即视觉顺序：

| 序号 | 文案（逐字） | 目标 | 高亮条件 | 备注 |
| --- | --- | --- | --- | --- |
| 1 | `聊天` | `/chat/` | `pathname.startsWith('/chat')` | 未读角标 |
| 2 | `应用` | `/apps` | `pathname.startsWith('/apps')` | 红点/角标：新链发射销毁活动 |
| 3 | `社区行动` | `/acting/?symbol=${token.symbol}` | `startsWith('/acting')` | **主按钮**：凸起、蓝色渐变圆、`-translate-y-1`（`BottomNavigation.tsx:43-50, 107, 120-129`） |
| 4 | `治理` | `/gov/?symbol=${token.symbol}` | `startsWith('/gov')` | 图标 `Vote` |
| 5 | `我的` | `/my/?symbol=${token.symbol}` | `startsWith('/my')` | 图标 `User` |

- 桌面侧边栏 `src/components/Common/AppSidebar.tsx:97-213`：分组「代币 / 社区 / 发射 / 交易 / 我的」；治理入口文案为 **`社区治理`**，`url: /gov/?symbol=${token.symbol}`（`AppSidebar.tsx:137-138`）；「社区行动」文案为 `社区行动`（`AppSidebar.tsx:131-132`）。`推举行动` 已被注释掉（`AppSidebar.tsx:143-144`）。

### 0.4 通用展示块（复用到各页）

| 块 | 定义位置 | 渲染内容（逐字） |
| --- | --- | --- |
| `LeftTitle` | `src/components/Common/LeftTitle.tsx:8-14` | 左对齐 `h1.text-lg.font-bold`，无副标题、无右侧插槽（右侧按钮由调用处另起 flex） |
| `RoundLite` | `src/components/Common/RoundLite.tsx:16-109` | `(第{n}轮{阶段名}阶段，剩余{m}块, 约{t}` 时间 `)`；`roundType` → 名称 `投票`/`验证`/`行动`（`:55`）；`showCountdown={false}` 时只渲染 `(第{n}轮{阶段名}阶段)`（`:73-81`）；`currentRound <= 0` 时渲染空（`:60-62`） |
| `LoadingIcon` | `src/components/Common/LoadingIcon.tsx` | 转圈图标，无文案 |
| `LoadingOverlay` | `src/components/Common/LoadingOverlay.tsx` | 全屏遮罩；调用方传 `text`，常见 `提交交易...` / `确认交易...` |
| `AlertBox` | `src/components/Common/AlertBox.tsx` | `type: error` / `warning`；`message` 支持 ReactNode |
| `ChangeRound` | `src/components/Common/ChangeRound.tsx:74-168` | "跳轮"按钮（`variant="link"`），抽屉内 `跳到 [n] 轮 [确定]`，列表项 `第 {round} 轮`，底部 `关闭` |
| 数字格式 | `src/lib/format.ts:34-38, 430-436, 368-375` | `formatTokenAmount(v, 默认4位小数, 'floor')`：`< 10 wei` 直接显示 `0`；`formatPercentage(n)`：`0` → `0%`、`NaN` → `-%`；`formatRoundForDisplay(round, token)` 当前**原样返回 round**（子币偏移已注释，`:372-374`） |
| 错误 → 数值 | `src/lib/clientUtils.ts:14-17` | `safeToBigInt(undefined/null)` → `BigInt(0)`（**这是旧代码"读失败渲染成 0"的根源**） |

### 0.5 页面用到的读 hook → 合约函数对照（写"数据来源"时按此标注）

| hook | 合约（地址来源 env） | 函数签名 | 用在 |
| --- | --- | --- | --- |
| `useValidGovVotes` | LOVE20Stake `NEXT_PUBLIC_CONTRACT_ADDRESS_STAKE` | `validGovVotes(tokenAddress, account)`（`useLOVE20Stake.ts:130-147`） | gov 首页、投票、推举、查询面板 |
| `useCurrentRound`（Stake 版） | LOVE20Stake | `currentRound()`（`useLOVE20Stake.ts:60-72`） | `/gov` |
| `useCurrentRound`（Verify 版） | LOVE20Verify | `currentRound()`（`useLOVE20Verify.ts:21-29`） | `/my/govrewards`、`/verify*` |
| `useCurrentRound`（Vote 版） | LOVE20Vote | `currentRound()` | `/vote/actions`、`/vote/batch`、`/vote/records` |
| `useAccountStakeStatus` | LOVE20Stake | `accountStakeStatus(token, account)` → `{slAmount,stAmount,promisedWaitingPhases,requestedUnstakeRound,govVotes}`（`useLOVE20Stake.ts:19-39`） | `MyGovInfoPanel` |
| `useGovData` | LOVE20RoundViewer `…_PERIPHERAL_ROUNDVIEWER` | `govData(tokenAddress)` → `{govVotes,slAmount,stAmount,tokenAmountForSl,parentTokenAmountForSl,rewardAvailable}`（`useLOVE20RoundViewer.ts:340-352`、`types/love20types.ts:113-120`） | 社区 tab、查询面板、投票列表 |
| `useEstimatedGovRewardOfCurrentRound` | LOVE20MintViewer | `estimatedGovRewardOfCurrentRound(tokenAddress)`（`useLOVE20MintViewer.ts:189-200`） | APY 卡、"预计新增铸币" |
| `useGovRewardsByAccountByRounds` | LOVE20MintViewer | `govRewardsByAccountByRounds(token, account, startRound, endRound)` → `GovReward[]`（`useLOVE20MintViewer.ts:74-91`；`types:97-104` = `{actionId,round,reward,verifyReward,boostReward,isMinted}`） | 治理激励表 |
| `useMintGovReward` | LOVE20Mint（写） | `mintGovReward(tokenAddress, round)` | 治理激励"铸造" |
| `useNumOfMintGovRewardByAccount` | LOVE20Mint | `numOfMintGovRewardByAccount(token, account)`（`useLOVE20Mint.ts:74-87`） | `Todeploy` |
| `useVotesNumByAccount` | LOVE20Vote | `votesNumByAccount(token, round, account)`（`useLOVE20Vote.ts:164-180`） | 我的投票 / 我的验证 |
| `useScoreByVerifier` | LOVE20Verify | `scoreByVerifier(token, round, verifier)`（`useLOVE20Verify.ts:116-127`） | 我的验证 |
| `useAccountVotingHistory` | LOVE20RoundViewer | `accountVotingHistory(token, account, startRound, endRound)` | `/vote/records` |
| `useLaunchInfo` / `useRemainingLaunchCount` | LOVE20Launch | `launchInfo(token)` / `remainingLaunchCount(parentToken, account)`（`useLOVE20Launch.ts:154-165, 236-252`） | `Todeploy` |
| `useBalanceOf` | LOVE20Token（SL/ST 各自的 ERC20） | `balanceOf(account)`（`useLOVE20Token.ts`） | SL/ST 凭证"需补充数量" |

---

## 1. 治理首页（`src/pages/gov/index.tsx`，136 行）

### 1.1 页面骨架（JSX 自上而下）

```
<Header title="治理首页" />                     ← :57，无返回按钮
<main className="flex-grow">
  ├─ 未连接钱包分支：居中提示                       :59-63
  ├─ token 未就绪：<LoadingIcon />                :64-65
  ├─ 发射未结束分支：<TokenTab /> + 居中提示 + 按钮  :66-76
  └─ 主分支：
     <Tabs defaultValue="my-assets" className="w-full px-4">   :79
       <TabsList className="grid w-full grid-cols-2">
         [我的]  value="my-assets"        :81
         [社区]  value="community-assets" :82
       </TabsList>
       ├─ TabsContent "my-assets"        :84-120
       └─ TabsContent "community-assets" :121-127
```

- 全页进入前有一道**全屏** loading 闸门：`isConnected && (isPendingCurrentRound || isPendingValidGovVotes)` → `<div className="flex justify-center items-center h-screen"><LoadingIcon /></div>`（`:47-53`）。**注意它写在 `return` 之前、`<Header>` 之外**，所以此时连页头都不渲染。
- 治理票门槛：`shouldShowGovComponents = validGovVotes > BigInt(0)`（`:45`），决定「我的」tab 内部走**有票**还是**无票**分支。
- 轮次口径：`currentVoteRound` 来自 **Stake** 的 `currentRound()`（`:31-35`）；传给验证类面板时做了 `currentRound - 2`（`:100, 102`），即"投票轮 - 2 = 可验证轮"。

### 1.2 「我的」tab 区块顺序（value = `my-assets`）

| # | 区块 | 容器/样式 | 文案 / 数据 | 证据 |
| --- | --- | --- | --- | --- |
| 1 | 我的治理概览（`MyGovInfoPanel`） | `<div className="border rounded-lg px-0 py-4 mt-2">` 包一层圆角边框 | 见 §7.1 | `gov/index.tsx:85-87` |
| 2a | 门槛判断中的局部 loading | 居中 `LoadingIcon` | 无文案 | `:88-91` |
| 2b | **有治理票**：我的投票（`MyVotingPanel`） | 无外框 | 见 §7.2 | `:95-99` |
| 3 | 我的验证（`MyVerifingPanel`） | 无外框，`currentRound = vote-2` | 见 §7.3 | `:100` |
| 4 | 我的链群（`MyGroupsPanel`） | 无外框，`currentRound = vote-2` | 见 §7.4 | `:101-103` |
| 5 | 子币发射（`Todeploy`） | 无外框 | 见 §7.8 | `:104` |
| 2c | **无治理票**：引导块 | 居中 | 说明：`想为自己喜欢的行动投票？想发起好玩有趣的行动？`；按钮：`立即成为治理者` → `/stake/stakelp/?symbol=<symbol>` | `:109-116` |
| 2d | **无治理票**：治理公示卡（`GovPublicCard`，`mt-4 pb-4`） | Card | 见 §7.6 | `:117` |

> **IA 要点**：无治理票时，「投票 / 验证 / 链群 / 子币发射」四个面板**整体不出现**，只留「去质押 + 治理公示」。这是刻意的漏斗：先当治理者，才给治理工具。

### 1.3 「社区」tab 区块顺序（value = `community-assets`）

| # | 区块 | 说明 | 证据 |
| --- | --- | --- | --- |
| 1 | 治理数据面板（`GovernanceDataPanel`），并把 `GovPublicCard` 作为 `afterApy` 插到 APY 卡**下面** | `<GovPublicCard symbol className="mx-3 mb-4" />` | `:122-124` |
| 2 | 治理票查询（`GovQueryPanel`），注释原文 `查询组件放在社区tab的最下面` | `:125-126` |

### 1.4 状态矩阵（顺序即优先级）

| 状态 | 判定 | 渲染（逐字） | 证据 |
| --- | --- | --- | --- |
| 未连接钱包 | `!isConnected` | 居中 `没有链接钱包，请先连接钱包`（`text-greyscale-500`），**不显示任何按钮** | `:59-63` |
| token 未就绪 | `!currentToken` | 仅 `LoadingIcon` | `:64-65` |
| 发射未结束 | `currentToken && !currentToken.hasEnded` | `<TokenTab />` + 居中 `公平发射未结束，还不能参与治理` + 按钮 `查看公平发射` → `/launch?symbol=<symbol>` | `:66-76` |
| 加载中（连接后） | `isConnected && (isPendingCurrentRound \|\| isPendingValidGovVotes)` | 全屏居中 `LoadingIcon`（无页头） | `:47-53` |
| 治理票加载中（tab 内） | `isPendingValidGovVotes` | 居中 `LoadingIcon`，此时**概览面板已渲染、下面 4 个面板都不渲染** | `:88-91` |
| 有治理票 | `validGovVotes > 0` | 投票 / 验证 / 链群 / 子币发射 | `:92-105` |
| 无治理票 | `validGovVotes === 0` | `想为自己喜欢的行动投票？想发起好玩有趣的行动？` + `立即成为治理者` + `治理公示` | `:106-119` |
| **读失败** | `errorCurrentRound` / `errorValidGovVotes` | ⚠️ **没有任何错误分支**：`safeToBigInt` 把 undefined 变 0 → 直接落进"无治理票"分支，用户看到的是「想为自己喜欢的行动投票？…」而不是「读不到」 | `:31-45` + `clientUtils.ts:14-17` |
| 无数据（社区 tab） | — | 面板各自处理，见 §7.5/§7.7 | — |

> **给新前端的批准结论**：旧页"读失败 = 当成 0 票"违反了新仓库 AGENTS.md 规则 4（未知值绝不渲染 `0`）。新前端做治理首页时必须补 `读不到 + 下一步按钮` 分支，不可照抄此处。

### 1.5 跳转关系

| 触发 | 目标 | 参数 |
| --- | --- | --- |
| `查看公平发射` | `/launch` | `?symbol=${currentToken.symbol}` |
| `立即成为治理者` | `/stake/stakelp/` | `?symbol=${currentToken?.symbol}` |
| `MyGovInfoPanel` → `铸造 治理激励 >>` | `/my/govrewards` | `?symbol=` |
| `MyGovInfoPanel` → `质押 获取治理票 >>` / `质押 增加治理收益 >>` | `/stake/stakelp/` / `/stake/staketoken` | `?symbol=` |
| `MyVotingPanel` → `我的投票记录 >>` / `去投票` | `/vote/records/` / `/vote/batch/` | `?symbol=` |
| `MyVerifingPanel` → `验证中的行动 >>` / `去验证` | `/verify/actions/` / `/verify` | `?symbol=` |
| `MyGroupsPanel` → `查看链群 >>` / `去验证` | `/extension/my_groups` | `?symbol=` |
| `MyGroupsPanel` 不信任票告警 | `/action/info/` | `?symbol=&id=&tab=public&tab2=distrust&round=` |
| `GovernanceDataPanel` → SL 数字 / 两个质押按钮 | `/stake/liquid` / `/stake/stakelp/` / `/stake/staketoken` | `?symbol=` |
| `GovPublicCard` | `/vote/actions/` 与 `/verify/actions/` | `?symbol=` |
| `Todeploy` → `子币列表` / `开启子币公平发射` | `/tokens/children/` / `/launch/deploy` | `?symbol=` |
| 底部导航 `治理` | `/gov/` | `?symbol=` |

### 1.6 旧协议专属（新协议没有 / ABI 未导出）

| # | 条目 | 在页面哪个位置 | 旧数据源 | 新仓库现状（`interface-dev-dsh/src/config/abis/`，本次查阅） |
| --- | --- | --- | --- | --- |
| G1 | **`validGovVotes(token, account)` 旧口径**（按钱包地址算票） | 进门闸门 `shouldShowGovComponents`、`MyVotingPanel`、`GovQueryPanel`、投票/推举页 `useCanSubmit` | LOVE20Stake | 新 `stake.ts` 只有 `govVotes(tokenAddress, round, memberId)`、`memberStake(tokenAddress, memberId)`、`totalGovVotes(tokenAddress, round)`——**票按 memberId + 按轮**，不按地址 |
| G2 | **SL / ST 双凭证模型**（`slTokenAddress` / `stTokenAddress` + `accountStakeStatus.slAmount/stAmount`） | `MyGovInfoPanel` 四宫格 + 「治理票已失效，请补充：SL 凭证 / ST 凭证」；`GovernanceDataPanel` 两行 SL/ST | LOVE20Stake + 两个 ERC20 | 新协议是 `liquidityShares` / `boostShares` + `boostStake`，**没有 SL/ST 代币** |
| G3 | **APY（预估年化收益率）** | `GovernanceApyCard`（`预估年化收益率` + `APY`）、`ActDataPanel`（`预估年化收益率（APY）：`）、`JoiningActionList` 卡内 `APY` | `useEstimatedGovRewardOfCurrentRound` + `calculateAPY()`（`domainUtils.ts:28-43`，公式：`(tokenAmountForSl*2 + stAmount)` 为质押总量，单利折算日化） | 无 MintViewer / 无轮次收益视图 |
| G4 | **`govData` 轮次视图**（`govVotes/slAmount/stAmount/tokenAmountForSl/rewardAvailable`） | 社区 tab 整块、查询面板占比分母 | LOVE20RoundViewer | 新协议无 RoundViewer ABI 文件 |
| G5 | **验证激励 / 加速激励双列** | 治理激励表格第 3、4 列（`verifyReward` / `boostReward`） | LOVE20MintViewer `govRewardsByAccountByRounds` | 新协议无 MintViewer；新 gov 占位文案（`copy-pages.ts:87`）为「用身份 NFT 对提案投票，按治理轮结算」 |
| G6 | **票数门槛环境变量族**：`NEXT_PUBLIC_SUBMIT_MIN_PER_THOUSAND`、`NEXT_PUBLIC_ACTION_REWARD_MIN_VOTE_PER_THOUSAND`、`NEXT_PUBLIC_MIN_GOV_REWARD_MINTS_TO_LAUNCH`、`NEXT_PUBLIC_PARENT_TOKEN_FUNDRAISING_GOAL` | 无票引导、`Todeploy` 说明、推举门槛、投票列表红框阈值 | `process.env` | 新仓库无这些变量（待核实是否有等价常量） |
| G7 | **`hasEnded` 门**（公平发射未结束 → 治理不可用） | `/gov` 第二个分支 | LOVE20Launch `launchInfo` 派生（`TokenContext` 的 `hasEnded`，`contexts/TokenContext.tsx:13,149`） | 新仓库有 `launch.ts`，但「发射未结束 → 治理页锁死」的 IA 需重新确认 |
| G8 | **验证轮 = 投票轮 − 2** 的硬编码偏移 | `MyVerifingPanel` / `MyGroupsPanel` 入参（`gov/index.tsx:100-102`） | 客户端减法 | 新协议 `phase.ts` 用 `currentPhase()` / `phaseInfo()`，无此 "-2" 约定 |

---

## 2. 治理激励（`src/pages/my/govrewards.tsx`，272 行）

### 2.1 页面骨架

```
<Header title="治理激励" showBackButton={true} />        ← :151
<main className="flex-grow">
  ├─ [条件] 销毁活动横幅（isBurnEnabled）                 :153-168
  ├─ !token → <LoadingIcon />                            :169-170
  └─ <div className="flex flex-col space-y-2 p-4">
       <LeftTitle title="铸造治理激励" />                 :173
       ├─ 不可铸造提示（endRound===0）                    :175-177
       └─ <table className="table w-full table-auto">     :179-252
            + 底部 sentinel（无限滚动）                    :253-261
  <LoadingOverlay text={提交交易... / 确认交易...} />      :266
```

- 进入前整页 loading 闸门：`isLoadingCurrentRound` → 只渲染 `<LoadingIcon />`（`:145-147`，**无页头**）。轮次来自 **LOVE20Verify** 的 `currentRound()`（`:19, 40`）。
- 页头有返回按钮（`showBackButton`），`backUrl` 未指定 → `router.back()`。

### 2.2 区块明细

**① 销毁活动横幅（可选，`isBurnEnabled` 才渲染）** `:153-168`
- 容器 `px-4 pt-3`；`Button variant="outline" className="w-full border-red-200 text-red-700"`。
- 文案 1（逐字）：`进入新链发射销毁活动`
- 文案 2（阶段胶囊，仅 `burnActivityPhase` 有值时）：`未开始` / `进行中` / `已结束`（`lib/burnStats.ts:22-28`）
- 跳转：`/apps/burn`

**② 标题**：`LeftTitle title="铸造治理激励"`（`:173`）

**③ 不可铸造态**（`:175-177`）：居中 `当前还不能铸造激励，请耐心等待`
- 触发：`endRound === BigInt(0) && currentRound !== undefined`；`endRound` 初值 0，当 `currentRound <= token.initialStakeRound` 时保持 0（`:48-56`）。

**④ 激励表格**（`:179-252`）

列（左→右，逐字，共 5 列）：

| # | 列名 | 对齐/样式 | 数据 | 单位/格式 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 1 | `轮次` | 左 | `item.round` | `formatRoundForDisplay(round, token).toString()`（当前原样输出）；无 token 时 `-` | `:182, 223` |
| 2 | `总激励` | `text-center px-1` | `item.reward` | `formatTokenAmount()`（token 单位，≤4 位小数，向下取整）；`undefined` → `0` | `:183, 224` |
| 3 | `验证激励` + `<Info size={16}/>` | `text-center px-2`；单元格底 `bg-greyscale-100` | `item.verifyReward` | 同上 | 表头 `:184-196`，单元格 `:225-227`；**Info 图标链到 `/stake/stakelp/?symbol=`，`title="验证激励说明"`、`aria-label="验证激励说明"`** |
| 4 | `加速激励` + `<Info size={16}/>` | 同上 | `item.boostReward` | 同上 | 表头 `:197-209`，单元格 `:228-230`；Info 链到 `/stake/staketoken/?symbol=`，`title="加速激励说明"` |
| 5 | `结果` | `text-center px-2` | 三态 | — | `:210, 231-247` |

"结果"列三态（`:232-246`）：
- `item.reward > 0 && !item.isMinted` → `Button variant="outline" size="sm"` 文案 `铸造`，`onClick={handleClaim(round)}`，`disabled={isPending || isConfirming}`
- `item.isMinted` → 灰字 `已铸造`
- 否则 → 灰字 `-`

空态（`:214-219`）：`rewardList.length === 0 && !isLoadingRewards` → 单行 `<td colSpan={3}>` 居中 `暂无数据`。
> ⚠️ 已知瑕疵：表有 5 列但 `colSpan={3}`。照抄时按 5 列修正。

**⑤ 无限滚动 footer**（`:253-261`，`ref={loadMoreRef}`，`h-12`）三态：
- 加载中 → `LoadingIcon`
- 还有更多 → `加载更多...`
- 到底 → `没有更多激励`

**分页逻辑（照抄要点）**：
- 常量 `REWARDS_PER_PAGE = BigInt(20)`（`:33`）。
- `endRound = currentRound - 1`（`currentRound <= initialStakeRound` 时 0）（`:48-56`）。
- 首屏 `startRound = endRound - 20 >= initialStakeRound ? endRound - 20 : initialStakeRound`（`:58-67`）。
- 列表**按 round 倒序**（`:79`）。
- 触底加载：`IntersectionObserver` + `rootMargin: '200px'`，`isIntersecting && !isLoadingRewards && hasMoreRewards` → `startRound -= 20`（下限 `initialStakeRound`）（`:85-143`）。
- 铸造成功：本地把该行 `isMinted = true` + `toast.success('铸造成功')`（`:94-99`）。

### 2.3 状态矩阵

| 状态 | 判定 | 渲染（逐字） | 证据 |
| --- | --- | --- | --- |
| 加载中（页级） | `isLoadingCurrentRound` | 只有 `LoadingIcon`（无页头） | `:145-147` |
| token 未就绪 | `!token` | 页头 + `LoadingIcon` | `:169-170` |
| 本轮不可铸造 | `endRound === 0` | `当前还不能铸造激励，请耐心等待` | `:175-177` |
| 无数据 | 列表空且不在加载 | `暂无数据` | `:214-219` |
| 加载更多中 | `isLoadingRewards` | footer `LoadingIcon` | `:254-255` |
| 还有更多 | `hasMoreRewards` | footer `加载更多...` | `:256-257` |
| 到底 | `!hasMoreRewards` | footer `没有更多激励` | `:258-259` |
| 每行未铸造 | `reward>0 && !isMinted` | 按钮 `铸造` | `:232-241` |
| 每行已铸造 | `isMinted` | `已铸造` | `:242-243` |
| 每行无激励 | `reward === 0` | `-` | `:244-245` |
| 交易 pending / confirming | hook 状态 | 全屏 `LoadingOverlay`：`提交交易...` / `确认交易...` | `:266` |
| **读失败** | `errorLoadingRewards` / `errorCurrentRound` | ⚠️ **无错误 UI**：`error` 取了但从没用（`:40, 74`），失败表现为空表 `暂无数据` 或永久 `加载更多...` | `:70-74` |

### 2.4 跳转关系

| 触发 | 目标 | 参数 |
| --- | --- | --- |
| 返回按钮 | 上一页（`router.back()`） | — |
| 横幅 | `/apps/burn` | — |
| `验证激励` Info | `/stake/stakelp/` | `?symbol=${token?.symbol}` |
| `加速激励` Info | `/stake/staketoken/` | `?symbol=${token?.symbol}` |
| `铸造` | 无跳转，链上 `mintGovReward(token, round)` | — |

### 2.5 旧协议专属

| # | 条目 | 位置 | 说明 |
| --- | --- | --- | --- |
| R1 | **治理激励按轮可铸造（`isMinted` 逐轮）** | 表格第 5 列 | 新协议无 `mintGovReward` / `govRewardsByAccountByRounds`（`abis/` 无 mint 文件） |
| R2 | **验证激励列（`verifyReward`）** | 第 3 列 | 旧协议"验证者按打分分奖励"的产物；新协议无 verify 概念 |
| R3 | **加速激励列（`boostReward`）+ ST 质押入口** | 第 4 列 | 旧协议 `stakeToken`（代币质押凭证）→ 新协议对应 `boostStake`（`stake.ts: boostStake(tokenAddress, boostAmount, promisedWaitingPhases, memberId, deadline)`），语义不同 |
| R4 | **销毁活动横幅 + 阶段胶囊** | 页首 | 旧链迁移活动的运营位，新仓库无对应路由 `/apps/burn`（待核实） |
| R5 | **`initialStakeRound` 作为分页下界** | 分页算法 | `Token.initialStakeRound` 字段（`contexts/TokenContext.tsx:20`）在新 `TokenInfo` 中是否存在待核实 |

---

## 3. 投票（本轮建议：**空占位**，但要照抄页头文案与互相跳转）

### 3.0 路由与标题总览

| 路由 | 组件 | `Header title` | 可见一级标题（LeftTitle） | 返回按钮 |
| --- | --- | --- | --- | --- |
| `/vote` | 重新导出 `batch`（`vote/index.tsx:1-2`） | 第 1 步 `投票首页` / 第 2 步 `投票`（`vote/batch.tsx:46-51`） | `投票中的行动` | 仅第 1 步显示（`batch.tsx:55`） |
| `/vote/actions` | `vote/actions.tsx` | `投票中的行动`（`:18`） | `投票中的行动`（`VotingActionList.tsx:68`） | 是 |
| `/vote/single` | `vote/single.tsx` | `行动详情`（`:47`） | 无（直接上面板） | 是 |
| `/vote/batch` | `vote/batch.tsx` | 同 `/vote` | 同 `/vote` | 仅第 1 步 |
| `/vote/records` | `vote/records.tsx` | `投票历史`（`:312`） | `我的投票记录` 或 `' 投票记录（0x1234…abcd）'`（`:326-328`） | 是 |

### 3.1 `/vote`（= `/vote/batch`，两步向导）

骨架（`vote/batch.tsx:53-71`）：`Header(title=getTitle(), showBackButton={currentStep===1})` + `<main>`：
1. `isPendingCurrentRound` → `LoadingIcon`
2. 第 1 步 → `StepSelectActions(currentRound, onNext)`
3. 第 2 步 → `StepVoteSubmit(selectedIds, currentRound, onBack, onSuccess)`

**第 1 步首屏区块顺序**（`StepSelectActions.tsx:86-196`）：
1. 标题行（左 `LeftTitle title="投票中的行动"`；右侧两枚 `variant="outline" size="sm"` 按钮）：`发起新行动` → `/extension/factories/`；`推举历史行动` → `/submit/actions?symbol=`（`:88-100`）
2. 行动卡列表（按 `votesNum` 倒序，`Card` + 左侧 checkbox；卡内第一行 `No.` + id + title；数据行 `投票数` / `占已投票` / `占总治理票`；低于 `NEXT_PUBLIC_ACTION_REWARD_MIN_VOTE_PER_THOUSAND` 阈值的卡加 `border-red-500 border-2`）（`:101-179`）
3. 主按钮：`给选中的行动投票`（`variant="outline" className="w-1/2"`，`:180-184`）
4. 提示：`提示: 每轮最大可投票数，等于您的治理票数`（`:185`）
5. 空态块：`还没有推举行动，请先推举！` + 主按钮 `去推举行动` → `/submit/actions?symbol=`（`:188-193`）

**第 2 步首屏区块顺序**（`StepVoteSubmit.tsx:166-249`）：
1. `RemainingVotesDisplay`：`我的剩余票数` +（`如需更多票数，请先 获取治理票`，链到 `/stake/stakelp/?symbol=`）（`RemainingVotesDisplay.tsx:28-41`）
2. 每行动一行：`No.{id} {title}`（链到 `/vote/single?id=&symbol=`）+ `[n] %` 数字输入（多选时最后一行为自动补足、禁用）（`:178-213`）
3. 按钮组：`返回`（`variant="outline"`，`w-1/4`）+ `提交投票`（主按钮，`w-1/2`）；pending 文案 `提交中...` / `确认中...` / `已提交`（`:216-233`）
4. 注意事项块（`注意：`）：`1、每轮最大可投票数，等于您的治理票数；` / `2、前端会帮您自动计算并提交100%票数；` / `3、投票时需持有完整数量的质押资产凭证：SL 类(流动性质押)、ST 类(代币质押)。`（`:237-246`）
5. `LoadingOverlay`（`提交交易...` / `确认交易...`）

校验 / toast（`:70-73, 106-116, 142`）：`投票百分比之和不能超过100%`、`剩余票数不足，不能投票`、`百分比之和必须为100`、`提交成功`。
成功 → `onSuccess()` → `router.push('/vote/actions/?symbol=')`（`batch.tsx:40-44`）。

### 3.2 `/vote/actions`（投票中的行动列表）

骨架（`vote/actions.tsx:16-23`）：`Header title="投票中的行动" showBackButton` + `<main>`（`isPendingCurrentRound` → `LoadingIcon`，否则 `VotingActionList`）。
`VotingActionList` 首屏（`VotingActionList.tsx:65-170`）：
1. 标题行：`LeftTitle title="投票中的行动"` + 两按钮 `推举其他行动` → `/submit/actions?symbol=`、`返回治理` → `/gov?symbol=`（`:67-79`）
2. 卡片列表（按票数倒序；卡内 `No.`+id+title、提交者地址、票数、占比）；整卡链接 → `/action/info/?id={id}&symbol={symbol}&tab=vote`（`:106`）
3. 空态：`去推举行动` 按钮（`:162-165`）

### 3.3 `/vote/single?id=`（单行动投票）

骨架（`vote/single.tsx:45-59`）：`Header title="行动详情" showBackButton` + `<main>`：
1. `ActionPanelForVoting`：两格 stats `我已投本行动票数` / `我的剩余票数`；主按钮 `将100%票投给此行动`（`myLeftVotes > 10` 时可用），否则禁用按钮 `没有剩余票数`；提示 `提示: 每轮最大可投票数，等于您的治理票数 ({validGovVotes})`（`ActionPanelForVoting.tsx:91-121`）
2. `ActionDetail`（通用行动详情长组件）
成功 toast `提交成功` → 2s 后 `/vote/actions/?symbol=`

### 3.4 `/vote/records`（投票历史）

骨架（`vote/records.tsx:310-434`）：`Header title="投票历史" showBackButton` + 带 `WebkitOverflowScrolling/overscrollBehaviorY` 的 `<main>`：
1. 标题行：`LeftTitle` 动态文案（自己 → `我的投票记录`；看他人 → `' 投票记录（0x123456…abcd）'`）+ 按钮 `投票中的行动 >>` → `/vote/actions/?symbol=`（`:325-334`）
2. 按轮分组卡片：轮次行 `轮次:` + 轮号；每行动 `No.` / id / title，数据 `我的投票:`、`占比:`（`:348-384`）
3. 轮内无投票：`该轮次没有投票`（`:387`）
4. 空态：居中 `没有投票记录`（`:338`）
5. 无限滚动 footer 三态：`正在加载更多轮次...` / `下滑自动加载更多轮次` + `或点击此处手动加载` / `已加载所有轮次`（`:403-426`）
- 查询参数：`account`（可看他人记录，`:56-59`）；分页 `ROUNDS_PER_PAGE = 20`（`:29`）。

### 3.5 投票页之间的跳转与参数（本轮占位只需这层）

```
/vote ──1步──> /vote ──2步成功──> /vote/actions?symbol=
/vote(1步) 卡片 ──> /vote/single?id={actionId}&symbol=
/vote(2步) 行 ──> /vote/single?id={actionId}&symbol=
/vote/actions 卡片 ──> /action/info?id={actionId}&symbol={symbol}&tab=vote
/vote/actions 按钮 ──> /submit/actions?symbol=  |  /gov?symbol=
/vote(1步) 按钮 ──> /extension/factories/  |  /submit/actions?symbol=
/vote(2步) 提示链 ──> /stake/stakelp/?symbol=
/vote/records 按钮 ──> /vote/actions?symbol=
/vote/records 明细 ──> /vote/records?account={voter}   （来自 VotingDetails.tsx:177）
```

### 3.6 投票页旧协议专属

- 全部依赖 `validGovVotes(token, account)` / `votesNumByAccount(token, round, account)` / `vote(token, actionIds[], votes[])` —— 新协议 ABI（`abis/` 下无 vote 文件）完全没有对应函数。
- `SL 类(流动性质押)、ST 类(代币质押)` 注意事项文案：旧协议术语，新前端若保留必须改词（GLOSSARY 无 SL/ST）。
- 第 1 步卡片的红框阈值 `NEXT_PUBLIC_ACTION_REWARD_MIN_VOTE_PER_THOUSAND`：旧协议行动激励门槛。

---

## 4. 验证（本轮建议：**空占位**）

### 4.0 路由与标题

| 路由 | 组件 | `Header title` | 可见一级标题 | 返回 |
| --- | --- | --- | --- | --- |
| `/verify` | `verify/index.tsx` | `验证`（`:15`） | `我需验证的行动`（`ActionListToVerify.tsx:63`） | 是 |
| `/verify/actions` | `verify/actions.tsx` | `验证中的行动`（`:15`） | `所有验证中行动`（`VerifyingActionList.tsx:51`） | 是 |
| `/verify/action` | `verify/action.tsx` | `验证`（`:61`），`backUrl=/verify/?symbol=` | `请选择验证结果：` 或 `请分配您的验证票：`（`:66`） | 是（显式 backUrl） |
| `/verify/detail` | `verify/detail.tsx` | `验证详情`（`:154, 552`） | `第 {round} 轮验证明细`（`:221`） | 是 |

### 4.1 `/verify`（我需验证的行动）

骨架：`Header title="验证"` + `<main>` → `ActionListToVerify`（`useCurrentRound` from Verify）。
首屏（`ActionListToVerify.tsx:61-102`）：
1. `LeftTitle title="我需验证的行动"`（无右侧按钮）
2. 行动卡列表（按 id 升序）：`No.{id}` + `{title}`；三列 `总票数:` / `我的票数:` / `我的占比:`；右侧 `ChevronRight`
3. 空态：居中 `没有待验证行动`（`:64`）
- 卡片链接 → `/verify/action?id={actionId}&symbol={symbol}`（`:71`）

### 4.2 `/verify/actions`（验证中的行动）

`VerifyingActionList.tsx:48-108`：
1. 标题行：`LeftTitle title="所有验证中行动"` + 按钮 `返回治理首页` → `/gov?symbol=`（`:51-55`）
2. 卡片列表（按 id 升序）：`No.` + id + title；数据 `投票数` / `已验证票数` / `进度`（`x%`，`:85-99`）
3. 空态：居中 `本轮没有行动要验证`（`:57`）
- 卡片链接 → `/action/info/?id={id}&symbol={symbol}&tab=verify`（`:72`）

### 4.3 `/verify/action?id=`（逐行动验证打分）

骨架（`verify/action.tsx:59-116`）：`Header title="验证" backUrl=/verify/?symbol=` + `<main>`：
1. 条件块（`remainingVotes > 0`）：标题行 `LeftTitle title={isExtensionAction ? '请选择验证结果：' : '请分配您的验证票：'}` + 右侧链接 `验证结果>>`（`text-status-info underline`）→ `/action/info/?id=&symbol=&tab=verify&tab2=current`；下面 `RoundLite(roundType="verify", showCountdown={false})`（`:63-76`）
2. `MyActionVerifingPanel`：灰底块 `我的剩余验证票数：{n}` + 提示 `提示: 您的验证票，将按“打分比例”分配给行动参与者`（非扩展行动才显示提示）（`:78-83`；`MyActionVerifingPanel.tsx:75-93`）
3. 三选一渲染（`:85-103`）：
   - 有剩余票 → `AddressesForVerifying`（地址打分表：表头 `分配`、每行地址+提示键值+`[n] 分`、弃权行 `弃权票数：`、底部提交按钮 `提交`/`提交中...`、还有 `原始验证` Tab、`粘贴` 批量导入、`选择他验证者` 弹窗）
   - 票已分配完 → `AddressesStatus`
   - `remainingVotes < 0` 或该行动还在加载 → `LoadingIcon`
4. `ActionDetail`（通用行动详情）

### 4.4 `/verify/detail?id=&round=`（验证矩阵）

骨架（`verify/detail.tsx:550-600`）：`Header title="验证详情"` + `<div className="flex-grow">`：
1. `ActionHeader`（`showActionButtons={false}`）：`No.{id} {title}`、参与地址数、总参与额等
2. 主体三态（`:572-597`）：`加载数据中...`（带 `LoadingIcon`）/ `加载失败：{msg}` / 行动不存在 / 矩阵表
3. 矩阵表（`:212-548`）：标题行 `第 {round} 轮验证明细` + `(` `ChangeRound` `)`；表格列为 `[参与者地址 | 得票总数(占比) | 各验证者列…]`，末行合计；零地址显示 `弃权票`
4. 底部说明（`:541-545`）：`• 手机端请左右滑动表格查看完整内容`（`md:hidden`）
- 矩阵自身状态（`:164-198`）：`正在加载验证矩阵数据...`（+ 进度 `已加载 {n} 个验证者，请稍候...`）/ `加载验证矩阵失败：{msg}` / `无验证数据`
- 参数：`id`、`round`、`symbol`；切轮时 `router.push({query:{...,round}} , shallow)`（`:80-91`）；默认 `round = currentRound - 2`（`:60-63`）

### 4.5 验证页互相跳转

```
/verify（我需验证）卡片 ──> /verify/action?id={id}&symbol=
/verify 页头返回 ──> router.back()
/verify/action 页头返回 ──> /verify/?symbol={symbol}   （显式 backUrl）
/verify/action 标题右侧"验证结果>>" ──> /action/info?id=&symbol=&tab=verify&tab2=current
/verify/actions 卡片 ──> /action/info/?id=&symbol=&tab=verify
/verify/actions 按钮 ──> /gov?symbol=
验证结果明细入口 ──> /verify/detail?symbol=&id={actionId}&round={round}
                     （来源：Mint/VerifiedAddressesByAction.tsx:211、My/ActionRewardScoreCell.tsx:64）
治理首页 MyVerifingPanel ──> /verify/actions/?symbol=  |  /verify?symbol=
```

### 4.6 验证页旧协议专属

- `votesNumByAccount` / `scoreByVerifier` / `scoreByVerifierByActionId` / 验证矩阵 `actionVerificationMatrix`：新协议 ABI 完全无 verify 合约。
- `验证激励`、`已验证票数/未验证票数`、`弃权票`、`打分` 全部为旧协议治理模型概念。
- 新协议治理占位文案是「用身份 NFT 对提案投票，按治理轮结算」（`interface-dev-dsh/src/shared/config/copy-pages.ts:87`），与旧「行动投票 + 打分验证」模型**不是同一套**。

---

## 5. 推举（本轮建议：**空占位**）

### 5.1 `/submit/actions`（未推举的行动列表）

- `Header title="推举" showBackButton`（`submit/actions.tsx:39`）。
- 副作用重定向（`:27-35`）：`!hasEnded` → `/launch?symbol=`；`!initialStakeRound` → `/stake/stakelp/?symbol={symbol}&first=true`（`first=true` 参数只在推举页出现）。
- `SubmitingActionList` 首屏（`SubmitingActionList.tsx:146-204`）：
  1. 标题行：`LeftTitle title="未推举的行动"` + 按钮 `发起新行动` → `/extension/factories/`（`:148-155`）
  2. 卡片列表（id 倒序、过滤掉已推举）：`No.` + id + title、提交者地址、右侧灰字 `未推举`（`:162-190`）
  3. 空态：`暂无行动`（`:159`）
  4. 触底：加载中 `LoadingIcon`；到底 `已加载全部行动`（`:193-202`）
- 卡片链接 → `/submit/submit?id={id}&symbol={symbol}&submitted=false`（`:165`）

### 5.2 `/submit/submit?id=&submitted=`（推举单个行动）

- `Header title="行动详情" showBackButton`（`submit/submit.tsx:45`）。
- `ActionPanelForSubmit` 首屏（`ActionPanelForSubmit.tsx:75-119`）：
  1. 条件告警 `AlertBox type="error"`：`有效治理票，须达到总治理票的{X}%，才能新建、推举行动（您当前有效治理票占比{Y}%）`
  2. 主按钮区：未推举 → `推举本行动`（pending 时 `提交中...` / `确认中...`）；已推举 → 禁用 `已推举` +（`submitted && !isConfirmed` 时）`去投票` → `/vote/batch?symbol=`
  3. 说明块：`说明：` + `1. 有效治理票数 ≥ 总治理票的{X}%，才能推举；` + `2. 每轮次，1个地址最多可 创建/推举 1 个行动；`
- 成功 toast `推举成功` → 2s 后 `/vote/batch?symbol=`（`:60-69`）
- 之后渲染 `ActionDetail`（`showSubmitter={false}`）。

### 5.3 推举跳转

```
治理/投票列表 ──> /submit/actions?symbol=
/vote(1步) "推举历史行动" ──> /submit/actions?symbol=
/vote/actions "推举其他行动" ──> /submit/actions?symbol=
/submit/actions 卡片 ──> /submit/submit?id={id}&symbol={symbol}&submitted=false
/submit/submit 成功 ──> /vote/batch?symbol=
/submit/submit "去投票" ──> /vote/batch?symbol=
/submit/actions 无质押 ──> /stake/stakelp/?symbol=&first=true
```

### 5.4 旧协议专属
- 推举/创建权限依赖 `validGovVotes / govData.govVotes >= NEXT_PUBLIC_SUBMIT_MIN_PER_THOUSAND/10 %`（`useCanSubmit`，`hooks/composite/useCanSubmit.ts:50-95`）——新协议按 `memberId` 计票，需重新定义"谁能提案"。
- 「每轮 1 地址最多 1 个行动」旧协议约束（`submit` 合约 `submit(token, actionId)`）。

---

## 6. 行动（本轮建议：**空占位**）

### 6.1 `/acting`（社区首页）

骨架（`acting/index.tsx:43-87`）：`Header title="社区首页"`（无返回）+ `<main>`：
1. 未连接：居中 `没有链接钱包，请先连接钱包`
2. `!currentToken` → `LoadingIcon`
3. 发射未结束：`<TokenTab />` + `公平发射未结束，还不能参与社区行动` + `查看公平发射` → `/launch?symbol=`
4. 正常：
   - `ActDataPanel`（`px-4` 内 `border rounded-lg`）：两格 stats `参与行动代币总数`、`预计新增铸币`；底部一行 `预估年化收益率（APY）：{值}`（`DataPanel/ActDataPanel.tsx:31-49`）
   - `JoiningActionList`：`LeftTitle title="本轮可参与的行动："` + `RoundLite(roundType="act")`（会渲染 `(第{n}轮行动阶段…)`）+ 空态 `本轮暂无行动` / `请先连接钱包`；每卡：`No.`+id+title、提交者、`投票占`、`APY`（无激励时改为红字 `无铸币激励`）；卡片链接 → `/action/info?id={id}&symbol=`（`ActionList/JoiningActionList.tsx:49-146`）
- 页级 loading：`isPendingCurrentRound` → 全屏 `h-screen` 居中 `LoadingIcon`（`:35-41`）；`useCurrentRound(shouldCall)` 仅 `isConnected && token.hasEnded` 时才发请求（`:26-27`）。

### 6.2 `/acting/join?id=&groupId=&tab=`（加入行动）

- `Header title="加入行动" showBackButton`（`acting/join.tsx:55`）。
- 首屏（`:57-92`）：
  1. 参数缺失/信息加载中 → `LoadingIcon`
  2. 读失败 → `AlertBox type="error"`：`加载失败：{msg}`（兜底 `获取行动信息失败，请稍后重试`）
  3. 行动不存在 → `AlertBox type="warning"`：`行动不存在：找不到指定的行动信息`
  4. 扩展行动 → `ExtensionActionJoinPanel`；普通行动 → `ActionPanelForJoin`（`showJoinButton={false}`）+ `SubmitJoin`
- 关联入口（`ActionPanelForJoin.tsx:197-237`）：`参与行动` / `增加参与代币` → `/acting/join?id=&symbol=`；`我的行动激励` → `/my/rewardsofaction?id=&symbol=`。
- 带 `groupId` / `tab` 的链接来自链群插件（`_GroupJoinSelect.tsx:164`、`GroupMyParticipation.tsx:185,251`、`_GroupHeader.tsx:213`、`extension/group_trial.tsx:85`）。

### 6.3 `/action/new`（创建新行动）

- `Header title="创建新行动" showBackButton`（`action/new.tsx:236`）。
- 首屏区块顺序（`:237-454`）：
  1. 条件告警 `AlertBox`：`有效治理票，须达到总治理票的{X}%，才能新建、推举行动（您当前有效治理票占比{Y}%）`
  2. `LeftTitle title="创建新行动"`
  3. 表单字段（顺序）：`行动名称`（placeholder `一句话说明行动`，maxLength 32）→ `验证规则`（Textarea，placeholder `验证者，会根据这个规则来打分`，rows 6）→ 分组标题 `报名参加行动时，行动者要提供的信息：` + 可增删的 KV 卡（`名称，比如 '微信昵称'` / `提示信息，比如 '张三-8b6c'`）+ 按钮 `添加验证信息` → `最大激励地址数`（placeholder `地址数必须大于0`）→ `最小参与代币数`（placeholder `最小参与代币数必须大于0`）→ `白名单`（placeholder `不填为不限`）
  4. 提交按钮：`提交` / `提交中...` / `确认中...` / `已提交`
  5. 说明块：`说明：` + `1. 每个轮次，1个地址最多可以 创建/推举 1 个行动；` + `2. 创建后，会自动推举该行动；`
- 校验文案（zod，`:52-120`）：`行动名称不能为空`、`行动名称不能超过20个字`、`验证规则不能为空`、`验证规则不能超过10000字`、`验证规则包含不安全的内容，请检查是否包含HTML标签、脚本代码或不安全的链接`、`验证名称不能为空`、`关键词最多{N}个汉字或{M}个英文数字`、`验证名称包含不安全的内容`、`验证信息提示不能为空`、`验证信息内容（value）不能超过1000字`、`验证地址数不能为空`、`验证地址数必须大于0`、`最小参与代币数不能为空`、`最小参与代币数必须大于0`
- 带 `extension` 查询参数时：自动填 `rewardAddressCount=1`、`minStake=1`、`whiteListAddress=extension` 且这三个字段 `disabled`（`:166-173, 382, 406, 428`）。
- 成功 → `/vote/batch?symbol=`（`:228-232`）。

### 6.4 `/action/info?id=&symbol=&tab=&tab2=&round=`（行动详情，行动页的枢纽）

- `Header title="行动详情" showBackButton`（`action/info.tsx:226`）。
- 骨架（`:224-264`）：`<div className="px-4 pt-0 pb-3">` → `ActionHeader`（`No.`+id+title、`总参与地址:`、总参与额度）→ Tab 条（`flex border-b`，每 tab `flex-1`）→ Tab 内容。
- Tab 列表（`:66-79`）：基础 `行动信息`（key `basic`）、`治理公示`（key `gov`）+ 扩展插件 tab（动态）。`治理公示` 下二级 tab（`ActionTabs/GovPublicTabs.tsx:32-37`）：`投票公示`（`tab2=vote`）、`参与公示`（`tab2=join`）、`验证公示`（`tab2=verify`）；扩展行动隐藏 `参与公示`。
- 状态文案（逐字）：`加载Token信息中...`（`:105`）、`参数错误：缺少行动ID参数`（`:115`）、`加载数据中...`（`:160`）、`加载失败：{msg}`（`:169`）、`行动不存在：找不到指定的行动信息`（`:177`）。
- 参数清理规则（`:126-151`）：切非 gov/非扩展 tab 时 `delete tab2`；切非扩展 tab 时 `delete round`；`symbol !== token.symbol` → `router.push('/tokens')`（`:92-97`）。
- ⚠️ 已知不一致：`MyGroupsPanel` 与链群插件用 `tab=public`（`MyGroupsPanel.tsx:133`、`_GroupHeader.tsx:134`、`extension/group.tsx:258`），而 `action/info` 的基础 tab key 是 `gov`——`public` 会被 `validTabKeys` 过滤掉、回落到 `basic`。照抄时统一成一个 key。

### 6.5 行动页跳转汇总

```
/acting（社区首页）卡片 ──> /action/info?id={id}&symbol=
/acting 发射未结束 ──> /launch?symbol=
/action/info 参与/增加参与 ──> /acting/join?id=&symbol=（含 groupId/tab 变体）
/action/info 我的行动激励 ──> /my/rewardsofaction?id=&symbol=
/acting/join 返回 ──> router.back()
/action/new 提交成功 ──> /vote/batch?symbol=
/action/new 入口 ──> /extension/factories/（/action/new/ 不带参数）；带 extension=/symbol= 来自各插件部署页
```

### 6.6 行动页旧协议专属
- `APY` / `预估年化收益率（APY）`：`calculateActionAPY`（`domainUtils.ts:51-56`，`joinedAmount` 为成本、单利折算）——新协议无轮次行动激励视图。
- `无铸币激励` / `投票占` / `hasReward`：旧协议「行动激励按投票份额分配」的产物。
- `被抽中验证概率`（`ActionPanelForJoin.tsx:183`）：旧协议随机抽验证者机制。

---

## 7. 治理首页直接渲染的面板（逐块拆解，含状态与文案）

### 7.1 `MyGovInfoPanel`（`src/components/My/MyGovInfoPanel.tsx`，218 行）

Props：`token`、`enableWithdraw?`（`gov/index` 传 `false`，形参在组件内未使用，`:28`）。

**结构（自上而下）**

1. **无质押时**只渲染 `GovernanceApyCard`（`预估年化收益率` + 数值 + `APY`）（`:95-106`）。
2. **有质押时**：
   - 行 1（2 列 stats，`:114-143`）：
     | 行标签（逐字） | 值 | 来源 | 说明行 |
     | --- | --- | --- | --- |
     | `我的有效治理票数` | `formatTokenAmount(validGovVotes)`，loading 时 `LoadingIcon`，失败/undefined 时 `读取失败` | `useMyGovData` → `validGovVotes(token, account)` | `注意：已申请解锁，治理票数为0`（仅 `requestedUnstakeRound > 0`） |
     | `我承诺的解锁期` | `${promisedWaitingPhases} ` + ` 阶段`（"阶段"是 `text-sm text-greyscale-600` 后缀） | `accountStakeStatus.promisedWaitingPhases` | `${formatPhaseText(n, true)}`（折算天数/小时） |
   - 行 2（2 列 stats，`:144-179`）：
     | 行标签 | 值 | 来源 | 说明行（链接） |
     | --- | --- | --- | --- |
     | `我的治理票占比` | `formatPercentage(governancePercentage)`，失败 `读取失败` | `useMyGovData` 计算：`validGovVotes/govData.govVotes*100` | `质押 获取治理票 >>` → `/stake/stakelp/?symbol=` |
     | `加速激励质押占比` | `formatPercentage(tokenStakedPercentage)`，失败 `读取失败` | 客户端：`stAmount/govData.stAmount*100`（仅在有治理票且两值存在时非 0，`:78-81`） | `质押 增加治理收益 >>` → `/stake/staketoken?symbol=` |
   - 行 3（条件，`:180-207`）：**治理票失效补充量** 红字块
     - 触发：`validGovVotes <= 0 && govVotes > 0`（旧票还在、有效票归零）
     - 标题：`治理票已失效，请补充：`
     - `SL 凭证 {formatTokenAmount(missingSlAmount, 4, 'ceil')}`（`title="精确数量：{formatUnits(...)}"`）
     - `ST 凭证 {formatTokenAmount(missingStAmount, 4, 'ceil')}`
     - 收尾：`补足后可恢复治理票，继续参与治理或取消质押。`
     - 余额读取失败替代文案：`SL/ST 凭证余额读取失败，暂时无法计算需补充数量。`
   - 行 4（`:209-213`）：单按钮 `铸造 治理激励 >>`（`variant="outline"`，`w-1/2`，居中）→ `/my/govrewards?symbol=`

**状态矩阵**

| 状态 | 渲染 |
| --- | --- |
| token 空 / 质押状态加载中 / SL·ST 余额加载中（有质押时） | 仅 `LoadingIcon`（`:85-91`） |
| 质押状态读失败 | `质押状态读取失败，暂时无法判断治理资产`（`text-status-error`，`:92-94`） |
| 无质押（`slAmount == 0`） | 只显示 APY 卡（`:95-106`） |
| 治理票/占比读失败 | 对应 stat 值 `读取失败`（`:120-121, 150-151, 167-168`） |
| SL/ST 余额读失败（在有失效提示时） | `SL/ST 凭证余额读取失败，暂时无法计算需补充数量。` |
| 已申请解锁 | 值下注 `注意：已申请解锁，治理票数为0` |

### 7.2 `MyVotingPanel`（104 行）

结构（`:56-101`）：
1. 标题行：`LeftTitle title="我的投票"` + 右链接 `我的投票记录 >>`（`variant="link"` 带下划线）→ `/vote/records/?symbol=`
2. 两列 stats：`我的已投票数`（`votesNumByAccount`）/ `我的未投票数`（`validGovVotes - votesNumByAccount`）
3. 主按钮（`w-1/2`）：
   - `validGovVotes > votesNumByAccount + 10` → `去投票` → `/vote/batch/?symbol=`
   - 否则禁用：`validGovVotes > 0 ? '已投票' : '无治理票，不能投票'`
4. `RoundLite(currentRound, roundType="vote")`

状态：`!token` → 返回空字符串（不渲染，`:40-42`）；`!account` → `我的投票` + `请先连接钱包`（`:43-52`）；tiles loading → `LoadingIcon`；**读失败无 UI**（`errorVotesNumByAccount` 未使用，`:37`），且 `我的未投票数` 在 `!validGovVotes` 时渲染 `'0'`（`:76-80`，又一个"未知渲染成 0"）。

### 7.3 `MyVerifingPanel`（125 行）

结构（`:75-120`）：
1. 标题行：`LeftTitle title="我的验证"` +（`showBtn && currentRound >= 1`）右链接 `验证中的行动 >>` → `/verify/actions/?symbol=`
2. 两列 stats（`mt-2`）：`已验证票数`（`scoreByVerifier`）/ `未验证票数`（`max(votesNumByAccount - scoreByVerifier, 0)`，`:45-59`）
3. 主按钮：`remainingVotes > 5 && votesNumByAccount > scoreByVerifier` → `去验证` → `/verify?symbol=`；否则禁用按钮 `scoreByVerifier > 0 ? '已验证' : '未投票，无需验证'`
4. `RoundLite(currentRound, roundType="verify")`

状态：`!token` → `LoadingIcon`；`!account` → **`LeftTitle title="行动验证"`**（注意：与已连接时的 `我的验证` 不一致）+ `请先连接钱包`（`:64-73`）；加载 → `LoadingIcon`；**读失败无 UI**（两个 error 变量都未使用，`:34,41`）。

### 7.4 `MyGroupsPanel`（177 行）

结构（`:112-173`）：
1. 标题行：`LeftTitle title="我的链群"` + 右链接 `查看链群 >>` → `/extension/my_groups?symbol=`
2. **不信任票告警**（`AlertBox type="error"`，`:122-145`），每个超阈值行动一行，整行是链接：
   `你在行动"No.{actionId} {actionTitle}"中被投不信任票，不信任率{distrustRatioPercent}；`
   → `/action/info/?symbol={enc}&id={actionId}&tab=public&tab2=distrust&round={verifyRound}`
3. 两列 stats：`已验证链群`（`groups.filter(isVerified).length`）/ `待验证链群`（`groups.filter(needToVerify).length`）
4. 主按钮（`w-1/2`），四态优先级：
   | 条件 | 文案 | 行为 |
   | --- | --- | --- |
   | `unverifiedCount > 0` | `去验证` | 链接 `/extension/my_groups?symbol=` |
   | `verifiedCount > 0` | `已验证` | 禁用 |
   | `groups.length > 0` | `暂无需验证` | 禁用 |
   | 其他 | `没有需验证的链群` | 禁用 |
5. `RoundLite(currentRound, roundType="verify")`

状态：`!token` → 空；`!account` → `我的链群` + `请先连接钱包`；`isPending` → `LoadingIcon`。

### 7.5 `GovernanceDataPanel` + `GovernanceApyCard`（`src/components/DataPanel/GovernanceDataPanel.tsx`，130 行）

`GovernanceApyCard`（`:28-43`，可单独复用）：
- 居中块（`mx-3 mt-3 mb-2 px-4 py-4 text-center`）
- 行 1：`预估年化收益率`（`text-sm font-medium text-greyscale-500`）
- 行 2：值（`text-3xl font-bold text-data-public`）= `calculateAPY(expectedReward, tokenAmountForSl, stAmount)`
- 行 3：`APY`（`text-xs text-greyscale-400`）

`GovernanceDataPanel`（`:45-128`，`props.afterApy` 插槽）：
1. `GovernanceApyCard`
2. `afterApy`（`/gov` 社区 tab 传 `GovPublicCard`）
3. 两列 stats：`预计新增铸币`（`expectedReward`，来自 `estimatedGovRewardOfCurrentRound`）/ `总治理票数`（`govData.govVotes`）
4. 两列 stats（`mt-2`）：
   - `流动性质押凭证SL代币`（`govData.slAmount`）→ 值整体是可点击链接 `/stake/liquid?symbol=`，带 `Info` 图标；下方链 `质押 获取治理票 >>` → `/stake/stakelp/?symbol=`
   - `代币质押凭证ST代币`（`govData.stAmount`）；下方链 `质押 增加治理收益 >>` → `/stake/staketoken?symbol=`
- 状态：`!token` → `LoadingIcon`（`:60-62`）；各值 loading → `LoadingIcon`；**读失败无 UI**（`error` 未使用），且失败时 `?? BigInt(0)` 渲染 `0`（`:80,86,102,116`）。

### 7.6 `GovPublicCard`（`src/components/Governance/GovPublicCard.tsx`，33 行）

- `Card` → `CardHeader/CardTitle`：`治理公示`（`text-lg`）
- `CardContent` → 横向两枚 `variant="outline"` 按钮（`w-1/2`，居中，`space-x-8`）：
  - `投票中的行动 >>` → `/vote/actions/?symbol={symbol}`
  - `验证中的行动 >>` → `/verify/actions/?symbol={symbol}`
- 无状态、无数据、无 loading。Props 仅 `symbol`、`className`。

### 7.7 `GovQueryPanel`（`src/components/My/GovQueryPanel.tsx`，285 行）

结构（`:133-282`）：`Card` → `CardHeader/CardTitle`：`治理票查询`（`text-lg`）→ `CardContent`：

1. 模式 Tabs（2 列，默认 `address`）：`按钱包地址` / `按NFT持有人地址`（`:141-146`）
2. 输入区：
   - `address` 模式：`Label`：`输入要查询的地址:`；`Input` placeholder `请输入地址（支持 0x、TH 格式）`（回车即查询）；按钮 `查询` / `查询中...`；已查询后出现 `重置`
   - `nftOwner` 模式：`NftOwnerLookup`（`lookupMode: 'name' | 'id'`，placeholder `请输入NFT名称` / `请输入NFT ID`）+ 同样的 `查询` / `重置`
3. 错误块（`hasQueried` 且 error）：`查询出错：{error.message || '请检查地址格式或稍后重试'}`
4. 结果区（`hasQueried && queryAddress`）：
   - `查询目标地址:` + 地址（`font-mono text-xs break-all`）
   - 查询中：`LoadingIcon` + `正在查询中...`
   - 两格结果卡：`治理票数`（`formatTokenAmount(validGovVotes)`）+ 复制按钮（toast `治理票数已复制` / `复制失败`）；`占总治理票比例`（`formatPercentage(governancePercentage)`）+ 复制（toast `占比已复制` / `复制失败`）
   - 备注块：`备注：` + `票数为有效治理票；如果已经申请解除治理质押，则治理票为0`
5. 校验（`alert`，非 toast）：`请输入有效的地址`（空）、`请输入有效的地址格式（支持 0x、TH 格式）`、`请先输入并解析有效NFT`
- 数据：`useValidGovVotes`（未查询时用零地址禁用，`:52-57`）+ `useGovData`。
- **纯只读查询，无写操作、无登录要求**。

### 7.8 `Todeploy`（`src/components/Launch/Todeploy.tsx`，93 行）

- 加载期：`isLaunchInfoPending || !blockNumber || isRemainingLaunchCountPending || isNumOfMintGovRewardByAccountPending` → 返回空片段 `<></>`（**整块消失**，`:39-41`）。
- 结构（`:48-90`）：
  1. 标题行：`LeftTitle title="子币发射"` +（`remainingLaunchCount` 有值时）右链接 `子币列表` → `/tokens/children/?symbol=`
  2. 按钮：`remainingLaunchCount > 0` → `variant="outline" size="sm"` 带 `Plus` 图标、文案 `开启子币公平发射` → `/launch/deploy?symbol=`；否则同文案禁用
  3. 说明段（`text-greyscale-500 text-sm`，居中）逐字：
     `剩余开启次数：{n}次，再完成 {m}次治理激励铸币，可增加1次。（须持有 {symbol}不少于 {x}%的治理票才可开启；公平发射募集目标为{g}个 {symbol}）`
     其中 `m = MIN_GOV_REWARD_MINTS - (numOfMintGovRewardByAccount % MIN_GOV_REWARD_MINTS)`，`MIN_GOV_REWARD_MINTS` 默认 **180**（`:44-46`）；`x = NEXT_PUBLIC_SUBMIT_MIN_PER_THOUSAND/10`；`g = NEXT_PUBLIC_PARENT_TOKEN_FUNDRAISING_GOAL`。
- 状态：加载中 → 不渲染；`remainingLaunchCount` undefined → 说明段显示 `0次`；**读失败无 UI**。

---

## 8. 旧协议专属清单（汇总，供新前端"不做/改写"决策）

> 新仓库证据：`interface-dev-dsh/src/config/abis/` 仅含 `airdrop-distributor / batch-transfer / launch / love20-hub / love20-token / member-nft / multicall3 / phase / stake / uniswap-v2-*`。
> **没有** vote / verify / mint / submit / round-viewer / mint-viewer / group / lp 的 ABI 文件 → 下列条目在新前端"无 ABI 可调"。

| 类别 | 旧协议条目 | 出现位置 | 新协议状况 | 建议 |
| --- | --- | --- | --- | --- |
| 票权口径 | `validGovVotes(token, account)` | 治理首页闸门、我的投票、治理票查询、投票/推举权限 | 新 `stake.ts` 为 `govVotes(tokenAddress, round, memberId)`，票**按轮 + 按 memberId** | 占位页不渲染票数；真做时改用 `govVotes(token, round, memberId)` |
| 凭证模型 | **SL 代币 / ST 代币**（`slTokenAddress`/`stTokenAddress`、`accountStakeStatus.slAmount/stAmount`、SL/ST 余额校验） | `MyGovInfoPanel` 四宫格与失效提示；`GovernanceDataPanel` 两行；投票注意事项第 3 条 | 新协议为 `liquidityShares` + `boostShares`（`stake.ts: memberStake` / `boostStake` / `validBoostShares`） | 术语整体替换；GLOSSARY 中无 SL/ST |
| 收益率 | **APY**（`预估年化收益率`、`APY`、`预估年化收益率（APY）：`） | APY 卡（社区 tab 顶部、我的 tab 无质押时）、行动页 | 无 MintViewer 轮次收益 | 不迁移；新前端如要年化必须自己定义口径（当前仓库无对应数据源） |
| 治理激励 | **治理激励按轮铸造** + `验证激励`/`加速激励` 双列 + `铸造` 按钮 | `/my/govrewards` 整页 | 无 mint ABI | 整页占位，不保留表格骨架 |
| 验证体系 | `验证 `、`打分`、`已验证票数/未验证票数`、`验证矩阵`、`弃权票`、`验证激励`、`验证轮 = 投票轮−2` | `/verify*` 四页 + 首页两个面板 | 无 verify ABI；新 gov 占位文案为「用身份 NFT 对提案投票」 | 全部占位 |
| 推举 | `推举本行动`、`每轮 1 地址最多 1 个行动`、`SUBMIT_MIN_PER_THOUSAND` 门槛 | `/submit/actions`、`/submit/submit`、`/action/new` | 无 submit ABI | 全部占位 |
| 行动激励 | `无铸币激励`、`投票占`、`被抽中验证概率`、`actionRewardsByAccountByActionIdByRounds` | `/acting`、`/action/info`、`/action/new` | 无 mint/extension ABI | 占位或删 |
| 链群插件 | `我的链群`、`不信任率`、`/extension/my_groups`、`不信任票` 告警 | `MyGroupsPanel` | 无 group 插件 ABI | 整块不渲染 |
| 环境变量 | `NEXT_PUBLIC_SUBMIT_MIN_PER_THOUSAND`、`NEXT_PUBLIC_ACTION_REWARD_MIN_VOTE_PER_THOUSAND`、`NEXT_PUBLIC_MIN_GOV_REWARD_MINTS_TO_LAUNCH`、`NEXT_PUBLIC_PARENT_TOKEN_FUNDRAISING_GOAL`、`NEXT_PUBLIC_PHASE_BLOCKS`、`NEXT_PUBLIC_BLOCK_TIME_MS` | 推举门槛、投票列表红框、子币发射说明、`RoundLite` | 新仓库改用 `phase.ts`（`currentPhase`/`phaseBlocks`/`phaseInfo`） | 轮次/倒计时改用 `phase` 合约，不用 env |
| 运营位 | `/apps/burn` 销毁活动横幅 + `未开始/进行中/已结束` 胶囊 | `/my/govrewards` 顶部 | 新仓库无该路由（待核实） | 不迁移 |

---

## 9. 页面清单与路由表（照抄 IA 用）

| 旧路径 | `Header title` | 可见标题（LeftTitle / 卡片标题） | 页面作用 | 被谁链接到 | 关键查询参数 | 本轮新前端 |
| --- | --- | --- | --- | --- | --- | --- |
| `/gov` | `治理首页` | tab `我的` / `社区`；面板标题：`我的有效治理票数`、`我的投票`、`我的验证`、`我的链群`、`子币发射`、`预估年化收益率`、`治理票查询` | 治理总入口：我的治理资产 + 社区治理数据 + 投票/验证/链群/发射入口 | 底部导航「治理」（`BottomNavigation.tsx:51-59`）、侧边栏「社区治理」（`AppSidebar.tsx:137`）、`VotingActionList.tsx:75`、`VerifyingActionList.tsx:53`、`StakeLiquidityPanel.tsx:332`、`StakeTokenPanel.tsx:177`（质押成功后跳转） | `symbol` | **要做**（骨架 + 两条 tab 占位内容） |
| `/my/govrewards` | `治理激励` | `铸造治理激励`；表头 `轮次/总激励/验证激励/加速激励/结果` | 逐轮铸造治理激励 | `MyGovInfoPanel.tsx:211`、`MyGovernanceAssetsPanel.tsx:522`（均在 `/my` 与 `/gov` 系） | `symbol` | **占位**（旧协议 mint 失效） |
| `/vote` | `投票首页` → `投票`（两步） | `投票中的行动` | 批量投票向导（选行动 → 分配百分比） | `MyVotingPanel` 的「去投票」→ 实为 `/vote/batch`；`/vote` 本身仅直接输入 | `symbol` | **占位** |
| `/vote/batch` | 同 `/vote` | 同 `/vote` | 同上（别名） | `MyVotingPanel.tsx:89`、`ActionPanelForSubmit.tsx:66,94`、`action/new.tsx:230` | `symbol` | **占位** |
| `/vote/actions` | `投票中的行动` | `投票中的行动` | 本轮投票中的行动列表 | `GovPublicCard.tsx:21`、`vote/records.tsx:331`（还有 `StepVoteSubmit` 成功后 push） | `symbol` | **占位** |
| `/vote/single` | `行动详情` | 无（stats：`我已投本行动票数`/`我的剩余票数`） | 单行动投票 | `StepSelectActions.tsx:130`、`StepVoteSubmit.tsx:193` | `id`, `symbol` | **占位** |
| `/vote/records` | `投票历史` | `我的投票记录` / ` 投票记录（0x…）` | 我的/他人投票历史 | `MyVotingPanel.tsx:61`、`VotingDetails.tsx:177` | `symbol`, `account` | **占位** |
| `/verify` | `验证` | `我需验证的行动` | 本轮我需验证的行动 | `MyVerifingPanel.tsx:109` | `symbol` | **占位** |
| `/verify/actions` | `验证中的行动` | `所有验证中行动` | 全部验证中行动（进度） | `MyVerifingPanel.tsx:81`、`GovPublicCard.tsx:24` | `symbol` | **占位** |
| `/verify/action` | `验证`（`backUrl=/verify/`） | `请分配您的验证票：` / `请选择验证结果：` | 逐行动给参与者打分 | `ActionListToVerify.tsx:71` | `id`, `symbol` | **占位** |
| `/verify/detail` | `验证详情` | `第 {round} 轮验证明细` | 验证矩阵（验证者×被验证者） | `VerifiedAddressesByAction.tsx:211`、`ActionRewardScoreCell.tsx:64` | `symbol`, `id`, `round` | **占位** |
| `/submit/actions` | `推举` | `未推举的行动` | 推举历史行动列表 | `VotingActionList.tsx:72,163`、`StepSelectActions.tsx:96,191` | `symbol` | **占位** |
| `/submit/submit` | `行动详情` | 无（按钮区 + `说明：`） | 推举单个行动 | `SubmitingActionList.tsx:165` | `id`, `symbol`, `submitted` | **占位** |
| `/acting` | `社区首页` | `本轮可参与的行动：` | 社区行动总入口（参与/APY/列表） | 底部导航「社区行动」（`BottomNavigation.tsx:43`）、`AppSidebar.tsx:131`、`token/index.tsx:404,668` | `symbol` | **占位** |
| `/acting/join` | `加入行动` | 无（直接上参与面板） | 加入/增加参与代币 | `ActionPanelForJoin.tsx:202,236`、`ActionButtons.tsx:31`、链群/LP 插件多处 | `id`, `symbol`, `groupId`, `tab`, `provider` | **占位** |
| `/action/new` | `创建新行动` | `创建新行动` | 创建行动表单（含验证规则/KV/白名单） | `extension/factories.tsx:91`、各插件部署页（`GroupActionDeploy.tsx:430`、`LpDeploy.tsx:388`、`GroupServiceActionDeploy.tsx:335`） | `symbol`, `extension` | **占位** |
| `/action/info` | `行动详情` | tab `行动信息` / `治理公示`（二级 `投票公示`/`参与公示`/`验证公示`） | 行动详情枢纽（所有列表的落地页） | `VotingActionList`、`VerifyingActionList`、`JoiningActionList`、`MyGroupsPanel`、链群/LP 插件 | `id`, `symbol`, `tab`, `tab2`, `round` | **占位** |

> 说明：`/action/info` 在旧代码里出现三种写法（`/action/info/?id=…`、`/action/info?id=…`、`/action/info/?id=…&tab=public`），新前端统一为 `/action/info` + 明确 query。

---

## 10. 本轮建议的占位范围（对齐"只做空占位"）

**必须做骨架（有真实内容）**
1. `/gov` —— 页头（`治理`）+ 2 tab（`我的` / `社区`）+ 每 tab 的区块占位卡，文案可沿用旧文案但**不得渲染任何票数/APY 数字**。
   - 我的 tab 建议只保留：`我的有效治理票数 / 我承诺的解锁期 / 我的治理票占比` 三行骨架（值统一 `—`，读失败 `读不到`）+ 空态引导。
   - 社区 tab 建议只保留：`治理公示`（两枚按钮：`投票中的行动` / `验证中的行动`，均指向占位页）+ `治理票查询` 卡片骨架。
2. 底部导航/侧边栏的「治理」入口 → `/gov`（沿用文案 `治理` / `社区治理`）。

**纯占位（只有标题 + 一句说明 + 返回）**
- `/vote`、`/vote/batch`、`/vote/actions`、`/vote/single`、`/vote/records`
- `/verify`、`/verify/actions`、`/verify/action`、`/verify/detail`
- `/submit/actions`、`/submit/submit`
- `/acting`、`/acting/join`
- `/action/new`、`/action/info`
- `/my/govrewards`（旧协议 mint 已失效，标「旧协议功能，当前不可用」）

**占位页要保留的跳转（否则 IA 断裂）**
- `/gov` 我的 tab ↔ `我的投票记录 / 去投票 / 验证中的行动 / 去验证 / 铸造治理激励 / 质押` 六条出口（指向占位或已有页面）。
- `/gov` 社区 tab 的 `治理公示` 两枚按钮 → `/vote/actions`、`/verify/actions`。
- 所有列表页 → `/action/info`；`/action/info` → `/acting/join`。
- 投票成功 → `/vote/actions`；推举成功 → `/vote/batch`；创建行动成功 → `/vote/batch`。

**不要照抄的实现反模式（旧代码的债）**
1. `safeToBigInt(undefined) → 0` 导致"读失败 = 0 票"（`clientUtils.ts:14-17` + `gov/index.tsx:45`）——违反新仓库规则 4。
2. `error` 变量声明后从不使用：`gov/index.tsx:33,41`、`govrewards.tsx:40,74`、`MyVotingPanel.tsx:37`、`MyVerifingPanel.tsx:34,41`、`GovernanceDataPanel.tsx:53,57`、`Todeploy.tsx:25`。
3. 空表 `colSpan={3}` 与 5 列表头不符（`govrewards.tsx:216`）。
4. `tab=public` 与 `tab=gov` 两套 key 并存（`MyGroupsPanel.tsx:133` vs `action/info.tsx:68`）。
5. 同组件两种标题（`MyVerifingPanel` 已连接 `我的验证` / 未连接 `行动验证`）。
6. 页脚/安全区重复计算：`_app.tsx:284` 已加 `pb-[var(--bottom-navigation-height)]`，页面内再加 `mb-8`（`StepVoteSubmit.tsx:238`）。

---

## 11. 待核实（无法从旧仓库确认）

| # | 事项 | 为什么不确定 |
| --- | --- | --- |
| U1 | 新协议是否保留「轮次」概念用于治理（`phase` vs `round`） | 新仓库只有 `phase.ts`（`currentPhase`/`phaseInfo`），stake 合约 ABI 里 `govVotes` 带 `round` 参数；两者关系未查约 |
| U2 | 新协议「治理」是否仍是"行动投票 + 打分验证"模型 | 新 `copy-pages.ts:87` 占位文案写「用身份 NFT 对提案投票」，与旧模型不同；没有合约文档可佐证 |
| U3 | `/apps/burn`、`/extension/my_groups`、`/tokens/children`、`/launch/deploy`、`/stake/liquid`、`/stake/staketoken` 在新仓库是否存在 | 新仓库 `src/pages` 只有 `about/act/airdrop/approvals/apps/batch-transfer/gov/group/home/liquidity/me/mint/my-nft/swap/theme/transfer` + `not-found` |
| U4 | 旧 `Footer` 与 `BottomNavigation` 的 5 项在新前端是否需要重排 | 新前端 IA 未定（本次任务不含） |
| U5 | `NEXT_PUBLIC_*` 门槛常量在新链上的实际取值 | 旧仓库 `.env` 未读（可能含敏感配置，按只读要求未取） |

---

*文档结束。所有引用行号基于本次只读查看的 `LOVE20TKM/interface-test` 工作区快照。*
