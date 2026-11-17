# 旧库 `interface-test` 治理 / 质押页面参考摘要（供 `/gov` 设计）

> **定位**：旧代码库 LOVE20TKM `interface-test` 的治理与质押页面整理成可执行的参考摘要，供本轮 `/gov`（流动性质押 + 加速质押）设计使用。**不是**规格、**不是**验收清单；规则以本仓 `AGENTS.md`、`GLOSSARY.md`、`m0-ux-spec.md` 与现役合约为准。
> **只读边界**：本文件是唯一交付物，未改任何其它文件、未碰 `src/`、未跑构建、未读链（部署参数取自 `anvil/export/deployments/anvil31337_dev.json`，不是自己 `eth_call` 得到的）。
> **本次范围**：只覆盖 `/gov` 的两块能力——流动性质押、加速质押。投票、推举、激励铸造、链群行动不在本轮范围。

## 0. 结论摘要

| 分类 | 内容 |
| --- | --- |
| **值得照搬（结构与交互）** | ①「我的治理权 + 我承诺的解锁期」双栏摘要；②解锁两步状态机（`正在解锁中` → `解锁完成，可取回`）与「还要再等 N 个阶段」的显式提示；③无治理资格时的引导空态（旧库：「立即成为治理者」）；④两侧金额按池子比例联动 + `25% / 50% / 最高` 快捷值 + 比例双向切换；⑤把「规则」收在折叠区、不在表单里长篇解释；⑥读失败给「读不到」+ 重试，不渲染 0 |
| **必须改造（术语与计量）** | 「治理票」→**治理权**；「解锁期」→**承诺解锁期**，且以**阶段**计量、主界面只给「约 X 分钟」；「取消质押」→**申请解锁**；「取回代币」→**撤出**；「轮」不得用于解锁进度；「SL/ST 代币」→**流动性质押份额 / 加速质押份额**（内部记账，不是可添加钱包的 ERC20） |
| **必须丢弃（旧协议产物）** | SL 代币 / ST 代币对象与余额、「验证激励」与 50/50 的三句公式、「溢出：超过验证激励 2 倍自动销毁」、APY / 年化 / 预估年化收益率、以钱包地址为维度的治理票（`validGovVotes(token, account)`）、`accountStakeStatus` 五元组、全屏 `LoadingIcon`/`LoadingOverlay`、toast + 2 秒跳转、`1. 授权 / 2. 授权 / 3. 提交` 编号按钮、「滑点上限 2.5%」 |
| **需要新造（旧库没有）** | 身份 NFT 门禁阶梯（连接 → 有无身份 NFT → 是否已选中）；「本阶段还能加速 X」剩余额度（直接读 `boostStakeCap`，不做旧库的公式推导展示）；「申请解锁的前置：本阶段不能已投票 / 已推举」；「本轮有人投票、但无人有加速份额 → 加速池整体销毁」 |

## 1. 来源与版本

| 项 | 值 |
| --- | --- |
| 旧库（只读） | `/Users/BigPolarBear/Documents/github/LOVE20TKM/interface-test`，HEAD `ec5e2f00c`（2026-09-10，Next.js + wagmi + shadcn/ui） |
| 本仓工作区 | `interface-dev-dsh/.agents/worktrees/dsh-4e9f8d96-e6f8`，HEAD `ace6042` |
| 现役合约口径 | `core` HEAD `93d3fcd`（与 `src/config/abis/manifest.json` 一致）；`core/src/Stake.sol`、`core/src/Mint.sol`、`core/src/Vote.sol`、`libs/src/RoundHistoryUint256.sol` |
| 部署参数口径 | `anvil/export/deployments/anvil31337_dev.json` 的 `coreParams`：`BOOST_STAKE_MULTIPLIER=5`、`BOOST_STAKE_SUPPLY_FACTOR=2`、`PROMISED_WAITING_PHASES_MIN=1`、`MAX=100`、`FEE_SETTLEMENT_RATIO=2500000000000000`（0.25%）、`ROUND_REWARD_GOV_RATIO=500000000000000`。**页面一律读 view，不写死这些数字** |
| 本轮并行产物（写本摘要时均未提交） | 文案：`src/shared/config/copy-pages.ts` 的 `gov` 块（1394–1596 行）+ `copy.ts` + `navigation.ts`；算术：`src/domain/gov-stake.ts`；读模型：`src/entities/stake/model/*`、`src/entities/phase/model/use-phase-clock.ts`；页面：`src/pages/gov/gov-page.tsx` + `src/features/governance-stake/**`。本摘要按这些产物的口径对齐；若它们后续改动，以最终代码为准 |

**旧库页面清单**

| 文件 | 标题 | 行数 | 它回答的问题 |
| --- | --- | --- | --- |
| `src/pages/gov/index.tsx` | 治理首页 | 136 | 我现在有没有治理票？没有的话怎么获得？社区盘子多大？别人的治理票怎么查？ |
| `src/pages/stake/stakelp.tsx` | 质押LP | 73 | 我该怎么用「LP/流动性」换治理票？规则是什么？ |
| `src/pages/stake/staketoken.tsx` | 质押代币 | 79 | 我该怎么用代币换「加速激励」？上限是多少？ |
| `src/pages/stake/unstake.tsx` | 取消质押 | 29 | 我质押的资产怎么退回？现在走到哪一步了？ |
| `src/pages/stake/liquid.tsx` | 流动性质押数据 | 28 | 社区流动性质押的盘子、两侧数量、待分配手续费是多少？ |

**阅读到的组件（相对 `interface-test/`）**

| 组件 | 行数 | 用途 |
| --- | --- | --- |
| `src/components/Stake/StakeLiquidityPanel.tsx` | 854 | 流动性质押表单：两侧金额、比例联动、滑点、解锁期、3 个编号按钮 |
| `src/components/Stake/StakeTokenPanel.tsx` | 496 | 加速质押表单：金额、解锁期、推荐质押估算、授权 + 质押两按钮 |
| `src/components/My/MyGovInfoPanel.tsx` | 218 | 治理首页「我的」摘要：有效治理票、承诺解锁期、票占比、加速占比 |
| `src/components/My/MyGovernanceAssetsPanel.tsx` | 567 | 取消质押 / 取回：授权 SL、授权 ST、取消质押、取回，解锁状态文案 |
| `src/components/My/MyLiquidityStakePanel.tsx` | 76 | 质押页顶部摘要：我的治理票数、SL 代币余额 |
| `src/components/My/MyVotingPanel.tsx` | 104 | 我的已投 / 未投票数、去投票按钮 |
| `src/components/My/GovQueryPanel.tsx` | 285 | 按地址 / 按 NFT 持有人查询治理票数与占比 |
| `src/components/DataPanel/GovernanceDataPanel.tsx` | 130 | 社区面板：APY、预计新增铸币、总治理票、SL/ST 总量 |
| `src/components/DataPanel/StakedLiquidDataPanel.tsx` | 82 | 流动性质押数据：SL 总数、对应两侧质押数、待分配手续费 |
| `src/components/Governance/GovPublicCard.tsx` | 33 | 治理公示：投票中的行动 / 验证中的行动入口 |
| `src/components/Governance/GovernorIntroCard.tsx` | 30 | 「治理票的作用」三条（门槛来自环境变量） |
| `src/hooks/contracts/useLOVE20Stake.ts` | 324 | 旧 stake 读：`accountStakeStatus` / `caculateGovVotes` / `currentRound` / `initialStakeRound` / `govVotesNum` / `validGovVotes` |

## 2. 信息架构对照表

判定列：**照搬** / **改造** / **丢弃**。

| # | 旧库页面 / 组件 | 它回答的用户问题 | 旧库做法 | 处置 | 理由 |
| --- | --- | --- | --- | --- | --- |
| 1 | `src/pages/gov/index.tsx:79-128` 两个 tab「我的 / 社区」 | 我的治理状态 vs 社区盘子 | 首 tab「我的」= 摘要 + 投票 + 验证 + 链群 + 部署；次 tab「社区」= 数据面板 + 查询 | **改造** | 保持「先我、后社区」的顺序；但本轮只做质押，tab 改「质押 / 我的质押」（与 `copy-pages.ts:1395` 一致），验证/链群/投票入口全部丢弃 |
| 2 | `src/pages/gov/index.tsx:106-119` 无治理票引导 | 我没有治理票怎么办 | 一句话「想为自己喜欢的行动投票？想发起好玩有趣的行动？」+ 按钮「立即成为治理者」→ `/stake/stakelp` | **改造并加强** | 保留「先解释再给出路」的形状；理由换成「治理权记在身份 NFT 上」并改成身份 NFT 阶梯（未连接 → 无身份 NFT → 未选中），否则会把「没治理权」误答成「没质押」 |
| 3 | `src/pages/gov/index.tsx:59-63` 未连接 | 没连钱包能看什么 | 一行字「没有链接钱包，请先连接钱包」 | **改造** | 我们的规范要求空态带一个下一步按钮（§0 原则 7）；文案按 `copy-pages.ts:1402` 写「治理权记在身份 NFT 上。先连接钱包，再选择一个身份 NFT。」 |
| 4 | `src/pages/gov/index.tsx:66-76` 公平发射未结束 | 现在能不能参与治理 | 「公平发射未结束，还不能参与治理」+「查看公平发射」 | **丢弃（本轮）** | 现役 `Stake.stakeLiquidity` 的前置是 `token` 已注册（`_checkToken` → `TokenNotRegistered`）与阶段已开始（`StakeNotStarted`），没有「发射未结束」这个门槛；不要照搬一个合约里不存在的状态 |
| 5 | `MyGovInfoPanel.tsx` 摘要 | 我的治理权 / 解锁期 / 占比 | 两行 2×2 统计卡 + 失效补充提示 + 「铸造 治理激励」按钮 | **改造** | 保留「治理权 / 承诺解锁期」双栏；「我的治理票占比」保留（= `govVotes / totalGovVotes`，两次 view 相除）；「加速激励质押占比」改为「本阶段有效加速份额 / 社区有效加速份额」；「失效请补充 SL/ST」整块丢弃（现役没有可补充的凭证对象）；「铸造 治理激励」不在本轮范围 |
| 6 | `MyVotingPanel.tsx` | 我投过多少、还剩多少、去不去投票 | 已投 / 未投两栏 + 去投票 / 已投票 / 无治理票按钮 | **丢弃（本轮）** | 投票页与 Vote ABI 都不在本轮；保留「未投票数 = 治理权 − 已投」这个概念即可，留给投票任务 |
| 7 | `GovernanceDataPanel.tsx` | 社区盘子多大、我能分多少 | APY 巨字 + 预计新增铸币 + 总治理票 + SL/ST 总量 + 两条「质押 获取治理票 / 增加治理收益」入口 | **改造** | 只保留现役有 view 的指标（见 §4）；APY、SL/ST、预计新增铸币三块丢弃；入口文字「质押 获取治理票」改成不带「>>」的次级文字链，且不再跨页（同页两个 tab 就是入口） |
| 8 | `GovQueryPanel.tsx` | 别人的治理票是多少 | 按地址 / 按 NFT 持有人两种模式 → 治理票数 + 占比 | **改造或延后** | 现役是 `govVotes(token, round, memberId)`：**按身份 NFT 编号**可查，**按钱包地址查不到**（没有 address→memberId 的反向索引，见 CI-001）。若要做，只能做「输入身份 NFT 编号查治理权」，且必须写清「按编号，不按地址」；否则丢弃 |
| 9 | `GovPublicCard.tsx` | 有哪些行动在投票 / 验证 | 「投票中的行动 >>」「验证中的行动 >>」两个按钮 | **丢弃** | 本仓没有 `/vote`、`/verify` 页面，也没有行动列表读模型；留着就是死链 |
| 10 | `GovernorIntroCard.tsx` | 治理票有什么作用 | 三条（社区主人 / 每轮 X% 支持才有行动铸币 / 有 Y% 可推举），X、Y 来自环境变量 | **丢弃（本轮）** | 三条都是**旧协议**的行动/推举门槛口径，且阈值来自环境变量而不是链上；现役有没有对应参数不在本轮范围。规则只说本页会发生的四件事（见 §5.5） |
| 11 | `src/pages/stake/stakelp.tsx` + `StakeLiquidityPanel.tsx` | 怎么用流动性换治理权 | 独立页 + 三步表单（数量 / 解锁期 / 授权并存入）+ 底部大段「提示」 | **改造并折叠** | 本轮不再开独立页：表单直接放 `/gov` 的「质押」tab 第一张卡；三步改成「两侧金额 + 承诺解锁期」一张卡 + 按钮组（授权在流内）；底部「提示」改成折叠「规则」 |
| 12 | `src/pages/stake/staketoken.tsx` + `StakeTokenPanel.tsx` | 怎么加速、上限多少 | 独立页 + 金额 + 解锁期 + 「推荐质押（估算）」+ 公式推导 | **改造** | 保留「先做流动性质押才能加速」的前置（现役 `_checkStakedLiquidity` 强制）；「推荐质押」整块公式推导**丢弃**，改读 `boostStakeCap(token, memberId)` 给「本阶段还能加速 X」（合约已经算好，前端不要再算一遍，避免与链上不一致） |
| 13 | `src/pages/stake/unstake.tsx` + `MyGovernanceAssetsPanel.tsx` | 我的质押怎么退回、到哪一步 | 授权 SL → 授权 ST → 取消质押；已申请则显示「已取消,第 N 轮才可取回」→「取回质押代币」 | **改造（这是最值得搬的一块）** | 两步状态机、倒计时提示、可撤出才解锁按钮——全部保留；但去掉两笔凭证授权（现役 `unstake`/`withdraw` 只校验身份 NFT owner，不需要 approve），轮次改阶段，「取回」改「撤出」 |
| 14 | `src/pages/stake/liquid.tsx` + `StakedLiquidDataPanel.tsx` | 社区质押盘子和手续费 | SL 总数、对应两侧质押数、待分配两侧手续费 | **改造** | 前 3 项现役有对应（`totalStake` 元组 + `pairAddress`）；「待分配手续费」现役是 LP 口径（`feeLp`/`withdrawableLp`），不是「待分配 X 枚社区代币」，换成「累计销毁」与「手续费结算比例」表达 |
| 15 | `MyLiquidityStakePanel.tsx` | 质押页顶部摘要 | 我的治理票数 + 流动性质押凭证 SL 代币（含添加到钱包） | **改造** | 「添加代币到钱包」丢弃（份额不是 ERC20）；摘要本身与 `stats` 卡合并 |
| 16 | `useLOVE20Stake.ts` | 读什么 | `accountStakeStatus(token, **account**)` / `validGovVotes(token, **account**)` / `initialStakeRound` / `govVotesNum` | **丢弃（读法）** | 现役全部按 **memberId**：`memberStake` / `govVotes(token, round, memberId)` / `totalGovVotes` / `boostStakeCap` / `validBoostShares` / `canWithdraw`。这不是「改个参数」，是**主体从钱包地址变成身份 NFT** |

## 3. 关键中文措辞原文摘录与判定

判定三类：**仍成立** / **术语已变（写出新说法）** / **旧协议产物不可用**。出处均为相对 `interface-test/` 的路径。

### 3.1 空态与引导

| # | 原文（逐字） | 出处 | 判定 | 说明 / 新说法 |
| --- | --- | --- | --- | --- |
| 1 | 「没有链接钱包，请先连接钱包」 | `src/pages/gov/index.tsx:62` | **术语已变（措辞）** | 保留「先连接钱包」的动作顺序；本仓空态必须带下一步按钮，按 `copy-pages.ts:1402` 写「治理权记在身份 NFT 上。先连接钱包，再选择一个身份 NFT。」 |
| 2 | 「想为自己喜欢的行动投票？想发起好玩有趣的行动？」 | `src/pages/gov/index.tsx:111` | **改造可用** | 句式对（先问「你想干什么」再给出路），但内容指向投票/发行动，不在本轮；换成「想参与治理，先质押流动性」类的一句，且只保留一个按钮 |
| 3 | 「立即成为治理者」 | `src/pages/gov/index.tsx:114` | **术语已变** | 「治理者」不是本仓术语；按钮按来源写「去质押流动性」「去铸造身份 NFT」「去我的 NFT」（与 `copy-pages.ts:1409/1412` 同口径） |
| 4 | 「公平发射未结束，还不能参与治理」 | `src/pages/gov/index.tsx:71` | **旧协议产物不可用** | 现役没有这个门槛；不要造不存在的状态 |
| 5 | 「需要先质押流动性LP，才可以质押代币」 | `src/pages/stake/staketoken.tsx:40` | **仍成立（前置为真）** | 现役 `_stakeBoost` 有 `_checkStakedLiquidity`（`core/src/Stake.sol:273,717-723`），前置确实存在；新说法：「加速质押要挂在流动性质押上：先质押流动性，再回来加速。」（`copy-pages.ts:1463-1465`） |
| 6 | 「您没有质押」 | `src/components/My/MyGovernanceAssetsPanel.tsx:265` | **改造** | 太干、无出路；改成「这个身份 NFT 还没有质押。」+「去质押流动性」（`copy-pages.ts:1485-1487`） |

### 3.2 数据与计量

| # | 原文（逐字） | 出处 | 判定 | 说明 / 新说法 |
| --- | --- | --- | --- | --- |
| 7 | 「我的有效治理票数」 | `src/components/My/MyGovInfoPanel.tsx:116` | **术语已变** | 「票」→「权」：**我的治理权**。依据 `GLOSSARY.md:113`（用户可见叫法「投票权」/权威术语「治理权」，禁用「票数（指资格时）」）、`src/config/errors.generated.ts:181`（「当前身份 NFT 没有治理权」）、本轮 copy 草案 `copy-pages.ts:1418`（`votes: '我的治理权'`）。**「治理票」只作为旧库原文出现，不进新界面** |
| 8 | 「我承诺的解锁期」 | `src/components/My/MyGovInfoPanel.tsx:131` | **仍成立（术语正确）** | 与本仓术语一致（`GLOSSARY.md:115`：**承诺解锁期** = `promisedWaitingPhases`，以阶段计）。注意旧库同栏小字用 `formatPhaseText` 拼「N个阶段（X区块，约Y天）」，见 #12 |
| 9 | 「我的治理票占比」 | `src/components/My/MyGovInfoPanel.tsx:146` | **术语已变** | **我的治理权占比** = 我的治理权 / 社区总治理权；两个 view 相除，页面标注「占社区」 |
| 10 | 「加速激励质押占比」 | `src/components/My/MyGovInfoPanel.tsx:163` | **术语已变** | 旧算法是「我的 ST 量 / 社区 ST 量」；现役应读「本阶段我的有效加速份额 / 本阶段社区有效加速份额」（`validBoostShares` / `totalValidBoostShares`，`core/src/Stake.sol:612,621`）。名称建议「加速份额占比」 |
| 11 | 「注意：已申请解锁，治理票数为0」 | `src/components/My/MyGovInfoPanel.tsx:127`、`MyGovernanceAssetsPanel.tsx:296` | **仍成立（事实为真）** | 现役 `unstake` 立即把本成员治理权记 0（`core/src/Stake.sol:343-348`）；新说法：「申请解锁后，这份质押的治理权会先清零。」（`copy-pages.ts:1494`） |
| 12 | 「4个阶段（1,000区块，约7天）」 | `src/lib/domainUtils.ts:67-103`（`formatPhaseText`） | **旧写法不可用** | 区块与绝对时长是技术信息，且时长由协议动态调整。本仓规则：主界面只写「还要再等 N 个阶段（约 X 分钟）」，阶段号与区块留高级视图（`docs/product/m0-ux-spec.md` §4.5/§4.9） |
| 13 | 「治理票已失效，请补充：」+ 下一行「SL 凭证 {数量}」/「ST 凭证 {数量}」（原文分三行） | `src/components/My/MyGovernanceAssetsPanel.tsx:403-414` | **旧协议产物不可用** | 旧协议的治理票靠「钱包里持有的 SL/ST 凭证余额」维持，转出就失效；现役没有这两个凭证，治理权记在身份 NFT 的 `liquidityShares` 上，不存在「补充凭证」动作 |
| 14 | 「预估年化收益率」/「APY」 | `src/components/DataPanel/GovernanceDataPanel.tsx:36,40` | **旧协议产物不可用** | 现役没有固定收益率对象：治理激励按轮次由投票量与实际加速份额分配，金额随全局变化；且本仓未导出 `Mint` ABI。**界面不出现 APY / 年化 / 收益率** |
| 15 | 「预计新增铸币」 | `src/components/DataPanel/GovernanceDataPanel.tsx:78` | **旧协议产物（本轮不可用）** | 旧库读 `estimatedGovRewardOfCurrentRound()`（RoundViewer/MintViewer 聚合合约）。现役要算需 `Mint` 的 view + 轮次入参，本仓未导出 `Mint` ABI，且金额是现算会变（CI-006）。本轮不显示 |
| 16 | 「总治理票数」 | `src/components/DataPanel/GovernanceDataPanel.tsx:84` | **术语已变** | **社区总治理权** = `totalGovVotes(token, currentPhase)`（`core/src/Stake.sol:506`）；注意必须传「当前阶段」，阶段未知时该读会回滚 `RoundNotStarted` |

### 3.3 操作与状态

| # | 原文（逐字） | 出处 | 判定 | 说明 / 新说法 |
| --- | --- | --- | --- | --- |
| 17 | 「取消质押」 | `src/pages/stake/unstake.tsx:18`、`MyGovernanceAssetsPanel.tsx:470` | **术语已变** | 现役动作是「申请解锁」（`unstake`）：申请后进入等待，不立刻退资产。按钮写**申请解锁**，二次确认标题「确认申请解锁？」（`copy-pages.ts:1510-1512`） |
| 18 | 「取回质押代币」 | `src/components/My/MyGovernanceAssetsPanel.tsx:512,542` | **术语已变** | 写**撤出**（`withdraw`），回执「已撤出」（`copy-pages.ts:1513,1577`）。注：`GLOSSARY.md:146` 的「撤出」原本专指 LP 撤出，本轮 copy 草案把它扩展到质押撤出，见 §6 待确认项 |
| 19 | 「已取消,第N轮才可取回」 | `src/components/My/MyGovernanceAssetsPanel.tsx:501-505` | **术语已变 + 计量口径已变** | ①取消→申请解锁；②「第 N 轮」→「还要再等 N 个阶段（约 X 分钟）」。现役判据是严格的 `round > unlockRequestPhase + promisedWaitingPhases`（`core/src/Stake.sol:387,609`），**不是「≥」**，文案必须表达「走完这一整个阶段之后」 |
| 20 | 「解锁完成，可取回」/「正在解锁中」 | `src/components/My/MyGovernanceAssetsPanel.tsx:285` | **仍成立（改词）** | 状态机可照搬，词改「可以撤出了」/「已申请解锁」（`copy-pages.ts:1496-1502`），并补第三态「解锁状态暂时读不到」（读失败不猜） |
| 21 | 「解锁期，是从取消质押的阶段结束时开始计算（现在取消质押后，投票轮第 N 轮才能取回代币）」 | `src/components/My/MyGovernanceAssetsPanel.tsx:473-487` | **半成立** | 「从申请所在阶段结束起算」在现役里等价成立（`unlockRequestPhase` 就是申请时的 `currentPhase`）；但「投票轮」「第 N 轮」「取回」三处都要改：阶段、约 X 分钟、撤出。且不要展示具体轮号 |
| 22 | 「余额不足，还差 {x}」 | `src/components/My/MyGovernanceAssetsPanel.tsx:343,378` | **仍成立** | 本仓写法：`{symbol} 不够，还差 {shortfall}`（`copy-pages.ts:1450,1478`），不带「余额」二字以外的技术细节 |
| 23 | 「质押成功」（toast）+ 2 秒后跳 `/gov` | `src/components/Stake/StakeLiquidityPanel.tsx:329-334`、`StakeTokenPanel.tsx:170-180` | **旧交互不可用** | 本仓禁止 toast + 自动跳转：改为页面内回执（标题 + 你得到什么 + 哈希 + 唯一按钮「好的」，`m0-ux-spec §4.3`），回执后留在本页并刷新质押状态 |
| 24 | 「1.授权{token}」→「2.授权{parent}」→「3.提交」 | `src/components/Stake/StakeLiquidityPanel.tsx:766-830` | **旧交互不可用** | 本仓规定：授权文案固定「授权 {symbol}」/「已授权 {symbol}」/「长期授权 {symbol}」，**不加序号**；授权与主按钮同一组、前置在前主按钮在后（`m0-ux-spec §4.1`）。两枚代币 → 两个授权按钮 + 一个主按钮，同组三列 |
| 25 | 「滑点上限：2.5%」/「滑点设置」 | `src/components/Stake/StakeLiquidityPanel.tsx:626,643` | **旧协议产物不可用** | 现役 `stakeLiquidity` **没有最小数量参数**（签名只有两侧数量 + 承诺解锁期 + memberId + deadline，见 `src/config/abis/stake.ts`），合约用 `_optimalAmounts` 自己配平、只划走所需数量（`core/src/Stake.sol:1091-1108`）。所以质押页既没有滑点，也不该出现「滑点」二字；只能说「按池子比例实际存入 X + Y，多余的留在钱包」 |
| 26 | （要点摘录）「推荐质押（估算）」+「上限占比 r」+「理论追加量 x = (r × 当前总加速质押 − 我已加速质押) / (1 − r)」 | `src/components/Stake/StakeTokenPanel.tsx:386,261-264` | **改造（思路可用，公式丢弃）** | 思路对：告诉用户「还能加多少」而不是让他自己猜。但现役合约已给 `boostStakeCap(token, memberId)`（返回 `memberCap` / `memberUsed`，`core/src/Stake.sol:597-604`），**直接显示「本阶段还能加速 = cap − used」**，不要在前端重算上限公式，也不要展示推导过程 |
| 27 | 「1、当轮所得治理激励 = 验证激励 + 加速激励」 | `src/pages/stake/staketoken.tsx:56`、`stakelp.tsx:44` | **旧协议产物不可用** | 现役把治理激励拆成**投票池 / 加速池**各一半（`core/src/Mint.sol:15,433-434`），没有「验证激励」这个对象（治理轮的投票没有验证环节）。新说法见 §5.5 |
| 28 | 「4、溢出：单个地址的加速激励 超过验证激励 2 倍以上的部分，为溢出激励，自动销毁，归入未来总激励」 | `src/pages/stake/stakelp.tsx:53`、`staketoken.tsx:66` | **旧协议产物不可用** | 现役用**加速上限**（`BOOST_STAKE_MULTIPLIER`，`core/src/Stake.sol:675,678-690`）在入口处挡住过量加速，没有「超出 2 倍再销毁」的溢出机制。新的销毁只有一处与加速相关：**本轮有人投过票、但无人有加速份额 → 整个加速池被销毁**（`core/src/Mint.sol:171-176`，`BoostPoolCancelled`） |
| 29 | 「所得治理票数 = SL代币数量 × 解锁期阶段数」 | `src/pages/stake/stakelp.tsx:42` | **结构仍成立，对象已变** | 现役公式同形：**治理权 = 流动性质押份额 × 承诺解锁期**（`core/src/Stake.sol:1277-1279`），只是「SL 代币数量」换成内部记账的 `liquidityShares`。可直接沿用这个句式，把两个名词换掉 |
| 30 | 「SL代币：代币对儿由质押合约注入 Uniswap V2 流动性池，并铸造SL代币作为流动性质押凭证」 | `src/pages/stake/stakelp.tsx:36-38` | **半成立，对象不可用** | 「质押合约自己把两侧代币注进 Uniswap V2 池」这半句与现役完全一致（`core/src/Stake.sol:946-980`）；但**不铸造任何 SL ERC20**，改记 `liquidityShares`。新说法：「存入社区代币和父币，按承诺解锁期换成治理权」（`copy-pages.ts:1433`） |
| 31 | 「流动性质押凭证SL代币」/「代币质押凭证ST代币」 | `GovernanceDataPanel.tsx:93,114`、`MyLiquidityStakePanel.tsx:113` | **旧协议产物不可用** | 两个 ERC20 都不存在；换成**流动性质押份额** / **加速质押份额**（内部记账，不可转让、不能添加到钱包）。见 `GLOSSARY.md:144,217`（流动性凭证 ≠ 流动性质押份额） |
| 32 | 「质押数不能超过当前持有」等表单校验 | `src/components/Stake/StakeLiquidityPanel.tsx:59-94` | **仍成立** | 保留「超过持有就拦住 + 说明差多少」；但本仓要求「未知值不渲染 0」，余额未知时按钮不可用并写「读取余额中…」而不是当 0 处理 |
| 33 | 「获取代币」（去兑换） | `src/components/Stake/StakeLiquidityPanel.tsx:431-436` | **仍成立（降级为文字链）** | 保留「币不够 → 去兑换」的出路，作为次级文字链，不做主按钮（一页一主 CTA） |
| 34 | 「加速激励倍数」 | `src/components/Stake/StakeTokenPanel.tsx:278` | **旧口径不进主界面** | 现役对应 `BOOST_STAKE_MULTIPLIER()`（部署参数，本链 5）。它是参数不是「倍数收益率」，主界面不展示；需要解释规则时只说「上限由合约按社区盘子与你的治理权占比算」 |

### 3.4 旧库「提示」小标题（不照搬结构，但可参考措辞）

| # | 原文（逐字） | 出处 | 判定 | 说明 |
| --- | --- | --- | --- | --- |
| 35 | 「提示」 | `src/pages/stake/stakelp.tsx:34`、`staketoken.tsx:53` | **改造** | 本仓 copy 草案用「规则」（`copy-pages.ts:1530`），默认折叠、一次性读完，不在表单里常驻 200 字 |

## 4. 旧库数据面板 / 统计项清单 × 现役 view 对照

判定只写两种：**有**（给出 view）与 **没有**（不许编）。

### 4.1 旧库显示的指标逐项对照

| # | 指标（旧库原文） | 旧库来源 | 现役 | 对应 view / 算式 | 口径差 / 注意 |
| --- | --- | --- | --- | --- | --- |
| 1 | 「我的有效治理票数」 | `accountStakeStatus().govVotes` + `validGovVotes(token, account)` | **有** | `Stake.govVotes(token, round, memberId)`（`core/src/Stake.sol:497`），取 `round = Phase.currentPhase()` | 主体从 addr 变 memberId；round 必须 ≤ 当前阶段，否则回滚 `RoundNotStarted` |
| 2 | 「我承诺的解锁期」 | `accountStakeStatus().promisedWaitingPhases` | **有** | `Stake.memberStake(...).promisedWaitingPhases`（`:521-557` 第 3 项） | 一致 |
| 3 | 「我的治理票占比」 | 前端除法 | **有（派生）** | `govVotes / totalGovVotes` | 社区总治理权为 0 时不能除：显示「—」，不显示 0% |
| 4 | 「加速激励质押占比」 | 我的 ST 余额 / 社区 ST 总量 | **有（换口径）** | `validBoostShares(token, phase, memberId) / totalValidBoostShares(token, phase)`（`:612,621`） | 加速份额是本阶段口径，不是累计余额 |
| 5 | 「总治理票数」 | RoundViewer `govData().govVotes` | **有** | `Stake.totalGovVotes(token, round)`（`:506`） | 必须传阶段 |
| 6 | 「流动性质押凭证SL代币」总量 | `govData().slAmount` | **有（换对象）** | `Stake.totalStake(token).totalLiquidityShares`（`:559-591` 第 1 项） | 是内部份额，不是 ERC20 总量；不可能「添加到钱包」 |
| 7 | 「代币质押凭证ST代币」总量 | `govData().stAmount` | **有（换对象）** | `Stake.totalStake(token).totalBoostShares`（第 5 项） | 累计加速份额；与「本阶段有效」不同，两者都要标注清楚 |
| 8 | 「对应 {symbol} 质押数」 | SLToken `tokenAmounts().tokenAmount` | **有** | `Stake.totalStake(token).tokenAmountForLiquidity`（第 6 项） | 由池子储备折算的**当前可取回**数量，会随池子价格变；页面标「预计」 |
| 9 | 「对应 {parentSymbol} 质押数」 | 同上 `parentTokenAmount` | **有** | `totalStake().parentTokenAmountForLiquidity`（第 7 项） | 同上 |
| 10 | 「待分配 {symbol} 总数」 | SLToken `tokenAmounts().feeTokenAmount` | **没有（口径不存在）** | — | 现役手续费结算是 LP 口径（`totalStake().feeLp` / `withdrawableLp`），结算后回购销毁（`FeesSettled` 事件、`totalBurnedToken`）。没有「待分配的若干枚社区代币」这种 view |
| 11 | 「待分配 {parentSymbol} 总数」 | `feeParentTokenAmount` | **没有（口径不存在）** | — | 同上；父币一侧只有 `totalParentTokenBurned` |
| 12 | 「预计新增铸币」 | MintViewer `estimatedGovRewardOfCurrentRound()` | **没有（本仓未导出 ABI，且金额现算会变）** | 理论上对应 `Mint.govReward` / `govRewardByMemberId(token, round, memberId)`（`core/src/Mint.sol:454-467`） | 需先补 `Mint` ABI（见 §5.8）；且金额基于 `rewardAvailable()` 现算、会随其它轮次 prepare/铸造变化（CI-006），只能标「预计」。本轮不建议上首屏 |
| 13 | 「预估年化收益率 / APY」 | 前端 `calculateAPY()` | **没有** | — | 现役没有收益率对象；不造 |
| 14 | 「验证激励」「加速激励」金额拆分 | 前端按 50% 估算 | **没有（本仓未导出 Mint ABI）** | 份额口径有：投票池 = `govReward/2`，加速池 = 余数（`core/src/Mint.sol:15,433-434`） | 展示金额需要 `Mint` view + round；展示「份额/占比」用 Stake 就能算 |
| 15 | 「我的已投票数 / 未投票数」 | Vote `votesNumByAccount` | **没有（本仓未导出 Vote ABI）** | 理论上 `Vote.voteAmountByMemberId(token, round, memberId)`；我的上限 = 治理权（`Vote._maxVoteAmount` → `Stake.govVotes`，`core/src/Vote.sol:278-280`） | 投票任务再补；本轮不显示 |
| 16 | 「治理票查询（任意地址）」 | `validGovVotes(token, account)` | **没有（无 address→memberId 索引）** | 只能按 memberId 查 `govVotes` | CI-001 Blocker；见 §6 |
| 17 | 解锁状态 / 何时可取回 | 前端 `currentRound > requestedUnstakeRound + promisedWaitingPhases` | **有** | `Stake.canWithdraw(token, memberId)`（`:606`）+ `memberStake().unlockRequestPhase` + `Phase.currentPhase()` | 余量 = `unlockRequestPhase + promisedWaitingPhases − currentPhase`，严格大于才可撤出 |
| 18 | 可取回的两侧数量 | 旧库没有直接读（用 SL 余额折算） | **有** | `memberStake().tokenAmountForLiquidity` / `.parentTokenAmountForLiquidity`（`:521-557` 第 5、6 项） | ⚠️ CI-011：前置不满足（如没质押）时这两项返回 0 但份额可能非 0 —— 必须先看 `liquidityShares > 0` 再解读「0」 |
| 19 | 加速上限 / 已用量 | MintViewer `maxGovBoostRewardMultiplier` + 前端重算 | **有** | `Stake.boostStakeCap(token, memberId)` → `(memberCap, memberUsed)`（`:597-604`） | 直接展示 `cap − used`；上限公式（`baseCap = 本金 × 发行进度 × 2 × SUPPLY_FACTOR`，再乘 `治理权占比 × MULTIPLIER`，`:655-676`）不在界面展开 |
| 20 | 本阶段有效加速份额 | 无（旧库按 ST 余额） | **有** | `Stake.validBoostShares(token, round, memberId)`（`:612`） | 投票时被抄进本轮计票账本（`core/src/Vote.sol:227-240`）；之后若继续增加，会补差、不回退 |
| 21 | 已销毁总量 | 无 | **有** | `Stake.totalBurnedToken` / `totalParentTokenBurned`（`:489-495`） | 累计值，只增不减 |
| 22 | 累计流动性质押本金 | 无 | **有** | `Stake.liquidityTokenAmount(token)`（`:593`） | **口径易混**：这是「质押期间累计投入的社区代币本金」（加速上限的基数），不是当前可取回数量；别和 #8 混用 |
| 23 | 承诺解锁期可选范围 | 环境变量 `PROMISED_WAITING_PHASES_MIN/MAX` | **有** | `Stake.PROMISED_WAITING_PHASES_MIN/MAX`（本链 1 / 100） | 读不到就不要给选择器（或写「读取中…」），不要回退到写死默认值 |
| 24 | 池子比例 / 1 token = ? parent | `useStakeLpPageData()`（pair reserves） | **有** | `Stake.pairAddress(token)` → pair `getReserves()` / `token0()` / `totalSupply()` | `memberStake`/`totalStake` 内部还含 pending protocol fee LP，页面估算只需 reserves + totalSupply |
| 25 | 手续费结算比例 | 无（前端不显示） | **有（可选用）** | `Stake.FEE_SETTLEMENT_RATIO()`（本链 0.25%） | 只用于解释「手续费的一部分用于回购销毁」，不写成收益 |

### 4.2 现役可读 view 速查（只列本轮用得到的）

| view | 返回 | 本轮用途 | 前置 / 注意 |
| --- | --- | --- | --- |
| `memberStake(token, memberId)` | `liquidityShares, boostShares, promisedWaitingPhases, unlockRequestPhase, tokenAmountForLiquidity, parentTokenAmountForLiquidity, firstGovVoteRound` | 我的质押摘要、解锁状态、预计可取回 | 份额为 0 时金额字段也是 0（CI-011） |
| `govVotes(token, round, memberId)` | 治理权 | 我的治理权 | `round > currentPhase` 回滚 `RoundNotStarted` |
| `totalGovVotes(token, round)` | 社区总治理权 | 我的占比分母 | 同上 |
| `totalStake(token)` | `totalLiquidityShares, totalLp, withdrawableLp, feeLp, totalBoostShares, tokenAmountForLiquidity, parentTokenAmountForLiquidity, firstGovVoteRound` | 社区盘子 | 含池子快照折算，值会随价格变 |
| `boostStakeCap(token, memberId)` | `(memberCap, memberUsed)` | 本阶段还能加速 | 依赖「当前阶段治理权/总治理权」，治理权为 0 → 上限 0 |
| `validBoostShares(token, round, memberId)` | 本阶段有效加速份额 | 加速占比分子 | 同上，需阶段 |
| `totalValidBoostShares(token, round)` | 社区本阶段有效加速份额 | 加速占比分母 | 同上 |
| `canWithdraw(token, memberId)` | bool | 撤出闸门 | 没申请解锁时恒 false |
| `totalBurnedToken` / `totalParentTokenBurned` | 累计销毁 | 社区数据 | 只增 |
| `liquidityTokenAmount(token)` | 累计投入本金 | 解释加速上限口径（可选） | ≠ 可取回数量 |
| `PROMISED_WAITING_PHASES_MIN/MAX`、`BOOST_STAKE_MULTIPLIER`、`FEE_SETTLEMENT_RATIO` | 部署参数 | 选择器范围、规则说明 | 只读展示，不写死 |
| `pairAddress(token)` + pair `getReserves/totalSupply/token0` | 池子快照 | 两侧比例联动、预计获得治理权 | 空池时 reserves=0，首次质押由两笔数量定价 |

### 4.3 现役**没有**的对象（界面不许出现、不许估算）

- 年化收益率 / APY / 收益率 / 回本周期
- 「验证激励」及其公式；`验证中的行动` 入口
- 「溢出销毁：加速激励超过验证激励 2 倍的部分」
- SL 代币、ST 代币（余额、总量、合约地址、添加到钱包）
- 「待分配社区代币 / 待分配父币」数量
- 按钱包地址查治理权（无 address → memberId 反查）
- 本轮治理激励金额、加速激励金额、投票池/加速池的绝对金额（需 `Mint` ABI，见 §5.8）
- 我的已投票数 / 未投票数（需 `Vote` ABI）

## 5. 对 `/gov` 页的具体建议

### 5.1 信息层级（自上而下的回答顺序）

用户问题顺序应当是：**能不能参与（门禁）→ 我现在有什么（我的摘要）→ 我要做什么（两张卡）→ 社区盘子多大（参考）→ 规则（折叠）**。

| 顺序 | 层级 | 回答的问题 | 门禁为真才渲染 |
| --- | --- | --- | --- |
| 0 | 页头 `治理` | 我在哪 | 始终 |
| 1 | 门禁阶梯 | 我能不能质押 | 未配置 → 未连接 → 无身份 NFT → 有身份未选中 → 身份读失败（逐级只显示一个） |
| 2 | 我的摘要（2×2） | 我的治理权 / 承诺解锁期 / 加速份额 / 社区总治理权 | 已选中身份 |
| 3 | 流动性质押卡 | 怎么用流动性换治理权 | 已选中身份 |
| 4 | 加速质押卡 | 怎么加速、还能加多少 | 已选中身份（未做流动性质押时卡内显示 locked 态） |
| 5 | 社区治理数据 | 社区的盘子与销毁 | 社区数据读成功（读失败只影响这一块） |
| 6 | 规则（折叠） | 为什么是这样 | 始终 |

### 5.2 首屏放什么（默认 tab = 质押）

```
[页头] 治理
[门禁：未连接 / 无身份 NFT / 未选中 / 身份读失败]   ← 命中即整页只显示这一块 + 一个下一步
[摘要 2×2] 我的治理权 | 承诺解锁期 | 加速质押份额 | 社区总治理权
[卡 1] 流动性质押
        社区代币 输入 + 余额 + 25% / 50% / 最高
        父币     输入 + 余额 + 25% / 50% / 最高
        ↑ 两侧联动（按池子比例），并显示 1 token = ? parent（可切换方向）
        承诺解锁期 选择（min–max 个阶段）
        预计获得治理权 +X（标注「按链上实际份额计算，成交后以回执为准」）
        [授权 {symbol}] [授权 {parent}] [质押流动性]     ← 同一组，前置在前
[卡 2] 加速质押
        本阶段还能加速 X {symbol}（= cap − used；读不到写「读取中…」）
        已加速 Y {symbol}
        数量输入 + 全部
        [授权 {symbol}] [加速质押]
[卡 3] 社区治理数据：社区总治理权 / 我的占比 / 本阶段社区有效加速份额 / 已销毁 {symbol}
[折叠] 规则
```

**首屏不出现**：跨页入口（旧库的 `/stake/*` 四个独立页）、投票/验证/链群入口、`>>` 箭头链、APY、SL/ST、任何「领取/赎回/提现」。

### 5.3 两个 tab 与按钮顺序

| tab | 卡序 | 主按钮 | 次按钮（最多两个、不同色） |
| --- | --- | --- | --- |
| 质押 | 摘要 → 流动性质押 → 加速质押 → 社区数据 → 规则 | 每个卡内**一个**主按钮（`质押流动性` / `加速质押`） | 授权按钮（同组、描边）；「获取代币」文字链 |
| 我的质押 | 状态徽标 → 摘要 → 解锁进度 → 预计可取回两侧 + 加速代币 → 操作 | 状态决定：`申请解锁`（无在途）→ `撤出`（可撤出） | `增加承诺解锁期`（次要，描边）；`取消`（弹层内） |

**操作顺序（重要）**：

1. 正常质押中：`增加承诺解锁期`（次要）→ `申请解锁`（主）
2. 已申请解锁未到期：只有 `还要再等 N 个阶段（约 X 分钟）` 的禁用按钮 + 说明，不放第二个可点按钮
3. 可撤出：`撤出`（主）
4. `申请解锁` / `撤出` 都要二次确认（不可逆、且申请解锁会立刻清治理权）；确认层两个按钮固定 `取消` / `确认申请解锁`（`确认撤出`）

### 5.4 空态 / 错态矩阵（每个都必须有且仅有一个下一步）

| 情形 | 结论文案（结论 + 下一步） | 禁止 |
| --- | --- | --- |
| 未连接钱包 | 治理权记在身份 NFT 上。先连接钱包，再选择一个身份 NFT。→ `连接钱包` | 只说「请先连接钱包」 |
| 未部署质押合约 | 这个环境还没有部署质押合约，治理功能暂时不可用。→ 回首页 | 渲染空表单 |
| 没有身份 NFT | 先铸造一个身份 NFT（治理权记在身份 NFT 上，没有身份 NFT 不能质押）→ `去铸造身份 NFT` | 让他去质押 |
| 有身份未选中 | 你持有身份 NFT，但还没有选中 → `去我的 NFT` | 自动替他选一个 |
| 身份读失败 | 身份 NFT 暂时读不到，你的身份 NFT 没有变化。→ `重试` | 当成「没有身份 NFT」 |
| 质押状态读失败 | 质押状态暂时读不到（网络可能不稳，你的质押没有变化）→ `重试`；数字位写「—」 | 渲染 0 |
| 池子储备读不到 | 读取池子比例中…（按钮禁用，说明原因）；失败写「暂时读不到池子比例」+ 重试 | 允许提交后由合约回滚 |
| 本阶段已投票/已推举 | 本阶段已经用过治理权，不能申请解锁。→ 等下一个阶段 | 显示可点的申请解锁 |
| 加速质押未做流动性质押 | 先完成流动性质押 → `去质押流动性` | 让用户填了再报错 |
| 超过加速上限 | 超过本阶段还能加速的 X {symbol}。 | 只写「交易失败」 |
| 余额不足 | {symbol} 不够，还差 {x}。→ `获取代币` 文字链 | 把未知余额当 0 直接拦 |

### 5.5 必须写清的 5 条规则（规则折叠区）

1. **治理权 = 流动性质押份额 × 承诺解锁期**；份额来自存入的流动性，承诺解锁期只能增加不能缩短。
2. **加速质押不产生治理权**；本阶段有效加速份额用于「加速激励」这一半，按占比分配；加速有上限（由社区盘子与你的治理权占比决定），上限每个阶段重算。
3. **治理激励一分为二**：投票的那一半按实际投票量占比分配；加速的那一半按加速份额占比分配。**本轮有人投过票、但没有任何人有有效加速份额时，加速这一半会被销毁**（不是发给谁）。
4. **解锁两步**：申请解锁（治理权立刻清零）→ 等承诺解锁期（N 个阶段，约 X 分钟）走完 → 撤出拿回两侧代币与加速代币。申请解锁所在阶段若已经投过票或推举过，就不能申请。
5. **手续费的一部分用于回购并销毁社区代币**；销毁后协议才能再预留新的激励（用 `FEE_SETTLEMENT_RATIO` 表述比例，不写成用户收益）。

### 5.6 必须避免的旧话术

| 旧话术 | 为什么不能用 | 改用什么 |
| --- | --- | --- |
| 治理票 / 治理票数 / SL 凭证 | 本仓术语是**治理权**（`GLOSSARY.md:113`；copy 草案统一 `我的治理权`） | 治理权、我的治理权、社区总治理权、我的占比 |
| 解锁期 / 等待期 | 权威术语是**承诺解锁期**，且以阶段计（`GLOSSARY.md:115`） | 承诺解锁期（N 个阶段） |
| 取消质押 / 解押 | 现役动作是**申请解锁**，资产不会立刻退回 | 申请解锁 / 确认申请解锁 |
| 取回代币 / 赎回 / 提现 | 规范禁用「赎回、提现、解押」；本轮统一「撤出」 | 撤出 / 确认撤出 / 已撤出 |
| 第 N 轮才能取回 | 解锁以阶段计量；轮次必须带类型前缀，主界面不展示轮号 | 还要再等 N 个阶段（约 X 分钟） |
| 验证激励 | 现役没有这个对象（治理轮无验证环节） | 投票那一半（命名待 owner 定，见 §6） |
| 溢出销毁 / 超过 2 倍销毁 | 旧机制；现役用加速上限 + 「无人加速则整池销毁」 | 加速上限；本轮有人投票但无人有加速份额时，加速池被销毁 |
| APY / 年化 / 收益率 / 预估年化 | 现役没有收益率承诺，界面不允许暗示收益 | 删掉；只讲分配规则与占比 |
| SL 代币 / ST 代币 / 凭证 | 两个 ERC20 都不存在 | 流动性质押份额 / 加速质押份额 |
| 领取 / 一键领取 | `GLOSSARY.md:27,52` 全项目禁用（本轮也没有可领取对象） | 本轮不涉及；将来激励写「铸造激励」 |
| 滑点 / 滑点上限 | 现役质押没有最小数量参数，也没有价格保护参数 | 按池子比例实际存入 X + Y，多余的留在钱包 |
| 冻结 / 锁定 / 锁仓 | 会造成「资产被第三方锁住」的误解 | 承诺解锁期、解锁中、可撤出 |
| 质押收益 / 增加治理收益 | 「收益」暗示固定回报 | 加速激励份额、治理激励分配 |
| 1. 授权 / 2. 授权 / 3. 提交 | 编号按钮是旧交互；本仓按钮文案固定 | 授权 {symbol} / 已授权 {symbol} / 质押流动性 |

### 5.7 值得照搬的旧交互细节

| 细节 | 旧库位置 | 怎么搬 |
| --- | --- | --- |
| 两侧金额按池子比例联动（改一侧自动算另一侧） | `StakeLiquidityPanel.tsx:245-274` | 保留；同时显示「按池子比例实际存入 X + Y」，并说明多余的留在钱包（现役合约只划走 optimal 数量） |
| `25% / 50% / 最高` 快捷值 | 同上 `:466-500,536-570` | 保留；`最高` 用真实余额，余额未知时禁用并写「读取余额中…」 |
| 比例双向切换（1 token = ? parent ⇄ 1 parent = ? token） | 同上 `:589-619` | 保留，小图标按钮，不占主视觉 |
| 「我的治理权 + 承诺解锁期」双栏 | `MyGovInfoPanel.tsx:114-143` | 保留为摘要卡；第三、四格给加速份额与社区总治理权 |
| 解锁两步状态机 + 剩余等待 | `MyGovernanceAssetsPanel.tsx:280-285,490-516` | 保留三态（正常质押中 / 已申请解锁 / 可以撤出了）+ 读不到态；剩余等待改「N 个阶段（约 X 分钟）」 |
| 无资格时「先解释一句 + 一个按钮」 | `src/pages/gov/index.tsx:106-118` | 保留形状，内容改成身份 NFT 阶梯 |
| 读失败给「读取失败」而不是 0 | `MyGovInfoPanel.tsx:120-124` | 保留并强化为「读不到 + 重试」（本仓硬规则 4） |
| 规则收在折叠区 | `stakelp.tsx:30-57`（旧库是常驻大块，反而更长） | 改成默认折叠的「规则」，4–5 条短句 |
| 表单校验就地提示（不弹窗） | `StakeLiquidityPanel.tsx:59-94` | 保留就地提示；不要 toast |

### 5.8 落地建议（与现有架构对齐）

| 事项 | 建议 |
| --- | --- |
| 分层 | 路由薄壳 `src/pages/gov/gov-page.tsx` → 视图 `src/features/governance-stake/ui/*`（本轮已在建：`governance-stake-page` / `stake-liquidity-panel` / `stake-boost-panel` / `my-stake-panel` / `stake-rules` / `stake-controls`，写法对齐 `src/pages/liquidity/liquidity-page.tsx`）；读模型 `src/entities/stake/model/*`（已建 4 个）；算术 `src/domain/gov-stake.ts`（纯 TS、无 React/链 SDK）；表单/预览/回执在 `src/features/governance-stake/lib/*` |
| 文案 | 全部进 `src/shared/config/copy-pages.ts` 的 `gov` 块（本轮已有草案，1394–1596 行）；组件内不写中文字面量 |
| 时段与阶段 | 解锁剩余阶段 → 分钟用「阶段长度 × 剩余阶段」估算，写「约」；不展示阶段号与区块（`m0-ux-spec §4.5/§4.9`） |
| 授权 | 复用现有授权阶梯（`src/features/approve-token/*`，`approval-spenders` 已有 `stake` 槽位）与全局长期授权偏好；两枚代币各一个授权按钮，同组、不加序号 |
| **需要补的 ABI** | `Vote` / `Submit` / `Mint` 的 ABI 已在 `anvil/export/abis/`，但 `scripts/lib/anvil-export.mjs:50-76` 的 `ABI_MODULES` 白名单只导出 11 个（含 `Stake`）。若要做「申请解锁前置（已投票/已推举）」或「本轮治理激励金额」，先在白名单加 `Vote`/`Submit`/`Mint` 再 `pnpm sync:anvil`，**不要手写 ABI**。本轮若不做，就按「点了再说」处理：把 `StakeRightsUsed` 映射成「本阶段已经用过治理权，不能申请解锁」，并在按钮上先不禁用（或禁用但说明「可能已用过」） |
| 读不到时的兜底 | `boostStakeCap` 读不到 → 不显示输入框，只显示「可加速额度暂时读不到」+ 重试；`memberStake` 读不到 → 整个「我的质押」显示错误卡，不要显示空白摘要 |
| 解锁与撤出的签名要求 | `unstake` 与 `withdraw` 都是 memberId 维度、只需身份 NFT owner 签名，**没有授权步骤**（旧库的 SL/ST 两笔授权要删） |
| 测试提示 | 动到链上数值 → 需三线校验（`docs/product/three-line-verification.md`）与 e2e；本摘要不含测试设计，交给对应任务 |

## 6. 未解决 / 不确定清单（都要 owner 或实现方明确，不许默认）

| # | 问题 | 现状（截至本摘要） | 建议 |
| --- | --- | --- | --- |
| 1 | 「治理权」还是「治理票」 | `GLOSSARY.md:113` 权威术语 = **治理权**（用户可见叫法写「投票权」，禁用「票数（指资格时）」）；`errors.generated.ts` 与 copy 草案都用「治理权」；**任务书与旧库用「治理票」** | 按仓库口径用**治理权**；本文件已按此判定。若 owner 要「治理票」，需同时改 GLOSSARY、errors、copy，三处不能漂 |
| 2 | 治理激励的**投票那一半**叫什么 | 旧库叫「验证激励」（不可用）；现役 `Mint` 里是 `voteReward`；copy 草案只点了「加速激励」这一半，另一半未命名 | 建议「投票激励」，但需 owner 定名并补进 GLOSSARY |
| 3 | 撤出 vs 取回 | `GLOSSARY.md:146` 的「撤出」原指 LP 撤出；copy 草案把质押 `withdraw` 也叫「撤出」 | 待 owner 确认；若区分，质押侧用「取回质押」而 LP 保持「撤出」，但需要同步 GLOSSARY 易混对 |
| 4 | 本轮是否显示「本轮治理激励金额 / 我的加速激励」 | 需 `Mint` ABI（未导出）+ round 入参 + 金额现算会变（CI-006） | 本轮不显示；等投票/激励任务统一补 ABI 与口径 |
| 5 | 「申请解锁的前置：本阶段不能已投票/已推举」怎么在界面上提前判断 | 需 `Vote.voteAmountByMemberId` + `Submit.proposalIdBySubmitterId`，两者 ABI 未导出 | 短期只在提交失败后映射 `StakeRightsUsed`；中期补 ABI 后改为**提前禁用 + 说明**（体验更好，且避免用户白签一笔） |
| 6 | 首次质押（空池）要不要单独提示 | 旧库有「新部署的代币，需先质押获取治理票，才能后续操作」（`StakeLiquidityPanel.tsx:370-376`）；现役空池时两侧数量**决定初始价格**（`_optimalAmounts` 在零储备时原样返回） | 建议保留一条提示：「这个池子还没有流动性：你存入的两笔数量会决定初始价格」，并标注「预计」。是否做需 owner 定 |
| 7 | 社区数据里放「累计投入本金」还是「可取回数量」 | 两个口径都存在：`liquidityTokenAmount`（本金）vs `totalStake().tokenAmountForLiquidity`（当前可取回） | 建议只放**可取回**（用户能理解）；本金只用于规则解释，不上面板 |
| 8 | 是否要做「按身份 NFT 编号查询治理权」 | 旧库有按地址/按 NFT 查询面板；现役只能按 memberId 查 | 若要，明确写「按编号，不按地址」；否则丢弃（避免用户输入地址得到 0 而误解为「没有治理权」） |
| 9 | 阶段长度换算（「约 X 分钟」）的数据来源 | `Phase` 只有 `currentPhase` / `currentPhaseBlocks` / `TARGET_SECONDS` 等；实际出块速度会被 `sync()` 调整（CI-008） | 用「观测到的每阶段秒数」估算并标「约」；读不到就只说「N 个阶段」不带分钟数（copy 草案已支持 `minutes === null` 分支） |
| 10 | 加速质押是否需要「承诺解锁期」输入 | 现役 `stakeBoost` 签名**带** `promisedWaitingPhases`，且它只能**加大**承诺解锁期、按 `liquidityShares × 增量` 增加治理权（`core/src/Stake.sol:262-304`） | 这是旧库 `StakeTokenPanel` 也有「解锁期」选择的原因。**任务书写「加速质押不产生治理票」在「份额本身」这层成立**，但同一笔交易顺手延长承诺解锁期会增加治理权——若 UI 不给这个输入，就必须固定传**当前值**（不增加），否则行为不可预期。**需实现方明确**：建议本轮加速卡不提供「延长解锁期」，固定传 `memberStake().promisedWaitingPhases`（无流动性质押时该前置已被合约拒绝），并在规则里说明「想加治理权，用『增加承诺解锁期』」 |
| 11 | `memberStake` 金额字段的 0 歧义 | CI-011：前置不满足时金额返回 0 但份额可能非 0 | 读取顺序固定为「先看 `liquidityShares`/`unlockRequestPhase` 判断状态，再解读金额」；界面在该状态下不显示金额，显示状态文案 |
| 12 | 页内是否要留「去兑换 / 去我的 NFT」的跨页链 | 旧库用按钮 + `>>` 箭头 | 本仓 §0 原则 3/7：一个主 CTA，次要入口最多两个且不同色；箭头链不进主界面 |

---

**本摘要的判定边界**：只依据 `interface-test` 源码、本仓 `GLOSSARY.md` / `m0-ux-spec.md` / `docs/contract-issues/*` / copy 草案、以及 `core` 现役合约与 anvil 部署参数。未做链上实测、未跑构建、未跑 e2e；涉及「链上实际读数」的结论一律要求以三线校验的链上读数为准。
