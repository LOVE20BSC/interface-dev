# 治理域 core 四页 三线校验（理论线 → 合约线 → 前端线）

> 任务来源：owner 2026-11-21 要求「完成治理激励铸币、提案、投票、提案铸币相关页面，先只覆盖 core 合约代码库；页面设计与交互参考旧库 LOVE20TKM，但不照搬，按新 core 的差异调整」。
>
> 覆盖页面（`src/pages/gov/`）：`/vote` 投票、`/submit` 提案（推举）、`/gov/rewards` 治理激励铸造、`/gov/proposal-rewards` 提案激励结算。合约范围：`Vote` / `Submit` / `Mint` / `Phase` / `Stake`（core）；**Action（行动 / 链群）域不在本轮范围**。
>
> 三条线相互独立：§1 只用「§0 初始状态 + 页面输入 + core 合约的整数公式」手算；§2 只用 viem 直接打链（脚本不读前端任何计算结果）；§3 只读页面渲染出来的文字。同一用例的数值必须逐 wei 相等。
>
> **理论线的口径修正说明（如实记录）**：既有的治理·质押三线是「理论线写在前、实现按理论线写」；本轮是 owner 一个晚上的整体交付，理论线的公式与期望值**从 core 合约源码推导**（`Mint.sol:311-318 / 359-360 / 416-419`、`Submit.sol:76-99`、`Vote.sol:242-315`），**没有从实现反推**；但落盘时间与实现同批，不具备「先于实现」的时间戳证据。数值一致性由 §2（脚本独立打链）与 §3（spec 直读链、独立实现格式化规则）双向保证。

## §0 环境

| 项 | 值 |
| --- | --- |
| 验证链 | **专用链 `http://127.0.0.1:8566`**（`chainId = 31337`），由 `make -C ../anvil bootstrap PORT=8566` 起 clean bootstrap |
| 禁止 | **8545 人工链**（自动化永不触碰）、8555（e2e 套件自有链，跑前端线用） |
| 地址簿 | `../anvil/.anvil/8566/export/deployments/anvil31337_dev.json` |
| ABI | `../anvil/.anvil/8566/export/abis/{Vote,Submit,Mint,Phase,Stake}.json` |
| 核心参数（dev） | `PRECISION = 1e18`、`SUBMIT_MIN_RATIO = 5e15`（0.5%）、`PROPOSAL_REWARD_MIN_VOTE_RATIO = 5e16`（5%）、`ROUND_REWARD_GOV_RATIO = ROUND_REWARD_PROPOSAL_RATIO = 5e14`（各 0.05%）、`VOTE_POOL_DIVISOR = 2`、`MAX_TITLE_LENGTH = MAX_DETAILS_LENGTH = 1024`、`MAX_CREATION_DATA_BYTES = 16384`、`SUBMIT_ROUND_LIMIT = 1000`（私有常量，界面不显示） |
| 历史合约基线 | core `f5707ce` 加上当时工作区的回调参数改动 |
| 历史部署地址 | `Vote 0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82`、`Submit 0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0`、`Mint 0x9A676e781A523b5d0C0e43731313A708CB607508`、`Phase 0xa513E6E4b8f2a923D98304ec87F64353C4D5C853`、`Stake 0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e`、`MemberNFT 0x610178dA211FEF7D417bC0e6FeD39F05609AD788`、`TestLOVE20 0x8aCd85898458400f7Db866d53FCFF6f0D49741FF` |
| 操作账户 | anvil #0 `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`（= 身份 NFT #1、种子把**全部**流动性质押记在 memberId #1） |

2026-11-28 在从区块 0 部署的专用 8566 链复验，合约线 191/191。本轮合约地址和来源查部署 JSON 的 `addresses`、`provenance`。当前脚本使用 `Stake.govPower`、`Stake.totalGovPower`。先前术语复验的临时链是 8567，回调参数复验的临时链是 8574，历史记录保留当时的接口名、块高和轮次。

## §1 理论线（先手算，再看链）

### §1.1 推举（`Submit`）

| 量 | 公式（合约行号） | 期望 |
| --- | --- | --- |
| 推举门槛 | `requiredGovPower = ceil(totalGovPower × SUBMIT_MIN_RATIO / PRECISION)`（`core/src/Submit.sol:83`） | `ceil(4472135954999579391818 × 5e15 / 1e18)` = **`22360679774997896960`**（页面 `22.3606`） |
| 能否推举 | `totalGovPower ≠ 0 且 govPower(member1) ≥ requiredGovPower`（`core/src/Submit.sol:67,90`） | `4472135954999579391818 ≥ 22360679774997896960` → **可以** |
| 正文上限 | `bytes(title) ≤ 1024`、`bytes(details) ≤ 1024`（`Submit.sol:278-284`） | 一个中文字 = 3 字节；页面按 UTF-8 字节计数 |
| 每轮名额 | 每个身份每轮 1 个（`MemberAlreadySubmitted`，`Submit.sol:334-344`） | 第二次推举必 revert |

### §1.2 投票（`Vote`）

| 量 | 公式（合约行号） | 期望 |
| --- | --- | --- |
| 当轮累计票数上限 | `maxVoteAmount = Stake.govPower(token, currentPhase, member1)`（`core/src/Vote.sol:115,315`） | `4472135954999579391818`（当轮已投为 0 时，「还能投」为 `4,472.13`） |
| 累计检查 | `本轮已投 + 本次 ≤ 本次调用读取的 maxVoteAmount`，超出 revert `VoteLimitExceeded`（`core/src/Vote.sol:280-284`） | 用例投 100 票：`100e18 ≤ 4472135954999579391818` → 通过；投 `max+1` → revert |
| 单提案票数 | 同一提案可累加（`Vote.sol:286-289`） | 投 100 → `voteAmountByProposalId = 100e18` |
| 激励预留触发 | **本轮第一票**时 `Mint.reserveRoundReward`（`Vote.sol:302-305`） | 投完后 `Mint.govReward(round) > 0` |
| 加速份额 | 首次投票记录 `Stake.validBoostShares`；本次种子无加速质押 → 0（`Vote.sol:262-275`） | `voterBoost = 0`、`totalVoterBoost = 0` |

### §1.2b 治理首页「我的投票」卡

| 量 | 公式（合约行号） | 期望 |
| --- | --- | --- |
| 本轮已投 | `voteAmountByMemberId(token, round, member1)` | 投票后 `100e18`（卡片显示 `100`）。投票页用 `maxVoteAmount − 本轮已投` 计算「还能投」，本例为 `4372135954999579391818`（`4,372.13`）。 |
| 记录页 `/vote/records` | 同一组读数（`votedProposalIdsByMemberId` + `voteAmountByProposalId` + 标题），一页 10 轮 + 加载更多 | `治理第 R 轮`、`我的投票 100`、`占该提案票数 100%` |
| 按轮记录 | `votedProposalIdsByMemberId(token, round, member1, 0, 50, false)` → (提案 id 列表, 我在每个提案的票数, 总数)（`Vote.sol:183-197`） | 投票那一轮返回 `[1]`、`[100e18]`、`1` |
| 占该提案票数 | `myVoteSharePercent(我的票数, Vote.voteAmountByProposalId(round, 提案))` —— **分母是该提案的总票数**（owner 2026-11-21 更正；不是该轮总票数） | 本用例只有我投票 → `100e18 / 100e18` → `100%`；单测 `my-votes-share.test.ts` 用 100/400 证明分母不是轮总票数 |
| 标题 | `Submit.proposalInfosByProposalIds(token, [ids])` 的 `body.title`（`ISubmit.sol:157-160`） | 与提案标题逐字相同 |

### §1.3 治理激励（`Mint`）

设预留时刻 `available = MAX_SUPPLY − totalSupply − reservedAvailable`（`Mint.sol:421-428`；种子态 `available = 9000004500000900000090000003`）：

| 量 | 公式（合约行号） | 期望（wei） |
| --- | --- | --- |
| 本轮治理激励池 | `gov = floor(available × ROUND_REWARD_GOV_RATIO / PRECISION)`（`Mint.sol:114`） | `4500002250000450000045000` |
| 投票池 / 加速池 | `votePool = gov / 2`、`boostPool = gov − votePool`（`Mint.sol:359-360`） | `2250001125000225000022500` / `2250001125000225000022500` |
| 我的投票激励 | `floor(votePool × memberVotes / totalVotes)`（`Mint.sol:363`） | 只有 member1 投 100 票 → `2250001125000225000022500`（页面 `2,250,001`） |
| 我的加速激励 | `totalVoterBoost == 0 → 0`（`Mint.sol:365-367`） | `0` |
| 铸造条件 | 轮次已结束（`currentPhase > round`）、未铸、金额 > 0（`Mint.sol:468-510`） | 推一轮后可铸；重复铸 revert `MemberRewardAlreadyMinted` |
| 批量 | `mintGovRewards(rounds[])` 逐轮，任一失败整笔回滚（`Mint.sol:291-309`） | 只传确认可铸的轮次 |

### §1.4 提案激励（`Mint` 的提案侧）

| 量 | 公式（合约行号） | 期望 |
| --- | --- | --- |
| 本轮提案激励池 | `proposal = floor(available × ROUND_REWARD_PROPOSAL_RATIO / PRECISION)`（`Mint.sol:115`） | `4500002250000450000045000`（页面 `4,500,002`） |
| 门槛 | `minVoteAmount = ceil(totalVoteAmount × PROPOSAL_REWARD_MIN_VOTE_RATIO / PRECISION)`（`Mint.sol:416-419`） | 总票数 `100e18` → `ceil(100e18 × 5e16 / 1e18)` = `5e18`（页面 `5`） |
| 单个提案份额 | `floor(pool × proposalVotes / totalVotes)`（`Mint.sol:311-318`） | `100e18/100e18 = 1` → `4500002250000450000045000`（页面 `4,500,002`） |
| 是否达标 | `voteAmount > 0 且 ≥ minVoteAmount`（`Mint.sol:395-404`） | 100 ≥ 5 → **达标** |
| 谁能铸 | 只有**提案目标合约**（`onlyProposalTarget`，`Mint.sol:207-224`） | 前端不给铸造按钮 |
| 不达标怎么办 | 任何人可 `burnProposalReward`；票数为 0 时是空操作（`Mint.sol:152-191`） | 未达门槛且票数 > 0 才给「销毁这部分」 |

每一轮从零累计已投票数。治理权变化后，已经投出的票照原数计入结果。

## §2 合约线

> 脚本 `scripts/verify/gov-core-contract.mjs` 默认连接 8566，支持通过 `--rpc` 指定临时链，拒绝 8545 和 8555。
> 运行：`make -C ../anvil bootstrap PORT=8566` 后执行 `node scripts/verify/gov-core-contract.mjs`。地址、ABI 和 `coreParams` 取自同一份 Anvil 导出。为临时 Anvil 副本设置 `ANVIL_EXPORT_DIR`。

跑法：viem test client + `anvil_mine`；每组 `snapshot`/`revert`，跑完链状态逐 wei 回到跑前；先关 interval mining 再开 automine（顺序反了 anvil 会忽略 `setAutomine`），`finally` 恢复原值。

| 项 | 结果 |
| --- | --- |
| 本轮 8566 | 起始区块 247、治理第 3 轮，**191/191 PASS**，各用例回滚后回到起始区块 |
| 历史 8574 | **191 PASS / 0 FAIL**。新增 `ProposalCreated.creationData` 读回断言，期望 `0x`，实际 `0x`。阶段依次推进 3→4→5→6，最后回到起始区块 296、治理第 3 轮 |

历史 8574 运行的分节记录如下。当时的接口名保留。

| 节 | PASS | 验证内容 |
| --- | --- | --- |
| §0 | 4 | `ownerOf(1)`、`ownerOf(5)`、无治理权成员 `canSubmit=false`、无 NFT 账户余额 0 |
| §1 | 7 | `SUBMIT_MIN_RATIO=5000000000000000`；`totalGovVotes=govVotes(1)=4472135954999579391818`；`required=ceil(total×ratio/1e18)=22360679774997896960`；`canSubmit(1)=true` |
| §2 | 16 | `proposalIds` 0→1、`ProposalCreated.proposalId=旧 count+1`、`authorId=1`、`creationData=0x`、`isSubmitted=true`、`proposalIdBySubmitterId=1`；同轮再推举回滚 `MemberAlreadySubmitted(0xc3487d0d)` 且三个参数逐个相等 |
| §3 | 23 | 投 `1e21` 后三个票数读数相等；`maxVoteAmount ≥ 累计`；`max+1` 回滚 `VoteLimitExceeded(0xb60c38d3)` 且参数逐字相等；`VoteCast` 4 项；`voterBoost=totalVoterBoost=1e21` |
| §4 | 30 | 投票前 `rewardAvailable=9000004500000900000090000003`、`govReward=0`；第一票后 `gov=proposal=4500002250000450000045000`（= `floor(available×5e14/1e18)`）；`totalRewardReserved` 增量 = `9000004500000900000090000`；`RoundRewardReserved` 逐字相等；预留后 `rewardAvailable` 恰好减少 `gov+proposal` |
| §5 | 11 | 按 `phaseInfo(next).startBlock − 当前块` 推进；`currentPhase` 恰 +1；`isRoundEnded(旧轮)=true`、`isRoundEnded(新轮)=false`（三轮各验） |
| §6 | 67 | 三轮 + 多投票人：`votePool+boostPool=gov`、`voteReward=floor(votePool×memberVotes/totalVotes)`、`boostReward=floor(boostPool×voterBoost/totalVoterBoost)` 与 `govRewardByMemberId` 三项逐一相等；`mintGovReward` 返回值/`balanceOf` 增量/`totalRewardMinted`/事件 4 项全等；重复铸回滚 `MemberRewardAlreadyMinted(0xc157061f)`；批量 `mintGovRewards` 返回数组与到账金额相等 |
| §7 | 28 | 双投票人：`totalVote=4695742752749558361458`、`minVoteAmount=ceil(total×5e16/1e18)=234787137637477918073`；达标提案 `settlement.amount=floor(pool×票/总票)=4285716428571857142855187`、未达标为 0/Unsettled；对未达标 `burnProposalReward` → `status=2`、金额 `214285821428592857189812`、事件逐字相等；**重复销毁不 revert 且不重复扣减** |
| §8 | 5 | `totalVoterBoost=0` 的轮次 `burnUnusedBoostReward` 销毁 `gov−gov/2 = 2250001125000225000022500`；重复调用不重复销毁 |

合约线发现的**口径注意事项**（写进规范/文档，不改变本轮页面）：

1. **`Phase.sync()` 会把下一阶段拉长**：automine 下出块远快于 1 秒/块，实测 620 / 744 / 756 块。任何跨阶段验证都不能按 `120×n` 算目标块，必须用 `phaseInfo(next).startBlock` 现算。前端页面不依赖固定阶段长度（只写「约 X 分钟」），无影响。
2. **两个池子各自 floor**：`gov+proposal == floor(available×(0.05%+0.05%))` 只在 `available mod 2000 < 1000` 时成立（本链 3 个抽样点恰好成立）；一般情形可能差 1 wei。页面不展示这个恒等式，无影响。
3. **奇数 `govReward`**：`votePool=floor(gov/2)`、`boostPool=gov−votePool`（多 1 wei 进加速池）——`domain/gov-core#govRewardPools` 与之一致。
4. **`validateProposalDraft` 没有建模 `CallbackTargetNotContract`**：`targetMode=Callback` 时目标地址必须有代码。本轮只发 `targetMode=0`，无实际影响；接回调提案时要补（已在 §「本轮明确不做」里登记）。

## §3 前端线

> 复现命令为 `E2E_ANVIL_RPC=http://127.0.0.1:8566 pnpm e2e e2e/gov-core-numbers.spec.ts`。账户为种子身份 NFT #1 的持有人。

| 用例 | 覆盖 | 断言口径 |
| --- | --- | --- |
| G1 | `/vote` 空态 → `/submit/new` 填表推举 → `/vote/:id` 投 100 票 → 回执 → 返回 `/vote` | 回执是 `本次合计投出 100 票`。返回列表时显示 `我已投 100 票`、`该提案本轮共 100 票` 与本轮剩余额度，无需重载页面。`expectedAmount()` 独立实现格式化规则 |
| G2 | 推举和投票四档截图（`suspendMining` 冻结当轮再拍） | `gov-core-submit-submitted-*`、`gov-core-submit-history-*`、`gov-core-vote-voted-*`、`gov-core-vote-detail-*` 各四张（390×844 / 1280×800 × 浅/深） |
| G3 | `anvil_mine` 推一轮 → `/gov/rewards` 出现可铸造行 → 铸造（真实交易）→ 行变「已铸造」 | `1 轮可铸造` → `2,250,001` → `已铸造` / `0 轮可铸造` |
| G4 | `/gov/proposal-rewards` 默认上一轮 → 池 / 总票数 / 门槛 / 行金额 / 达标说明 → `prev` 到空轮 → `next` 回 | `4,500,002` / `100` / `5` / `100 / 5` / `待结算` |
| G5 | `/gov` 「我的投票」卡显示本轮已投、记录预览和完整记录入口 | 已投按当轮读回值校验，记录只预览两轮 |
| G6 | `/vote/records` 独立记录页：标题 + 「去投票」+ 按轮分组（轮次行 / 编号标题 / 我的投票 / 占该提案票数） | `治理第 R 轮`、`#1 …`、`我的投票 100`、`占该提案票数 100%` |
| G7 | 本轮分给两个提案 100 与 50 票 → 承诺解锁期从 1 提到 2 → 给第二个提案再加 50 票 → 切轮并重新推举 | 上限翻倍，已投仍为 150 票，加票回执为 `本次合计投出 50 票`。切轮后旧轮共 200 票，新轮已投 `0 票`、还能投 `8,944.27 票`。留在原详情页时，表单在新一轮重新推举成功后恢复，分别显示创建人和当轮推举人 |
| G8 | `/gov/proposal-rewards` 销毁未达门槛的提案激励 | 两个提案分别得 100 票、1 票，门槛为 5.05 票。为后者确认销毁后，页面收起销毁入口，链上销毁增量等于按 1 票分得的提案激励 |
| G9 | 加速质押并投票，下一轮在 `/gov/rewards` 查看治理激励 | 投票激励和加速激励分别按各自的池与占比核对，加速激励大于零，页面有铸造入口 |
| G12 | 资格不足、历史提案推举状态读取失败与恢复、同轮推举及切轮 | 两页资格不足时给质押入口。读失败时不给行内推举按钮。推举后显示 `本轮已推举`，留在原页切轮后恢复推举按钮 |
| G13 | `/vote` 和 `/vote/:id` 的阶段读取失败与恢复 | 两页给出「重试」，恢复后分别显示额度和提案 |
| G14 | `/vote` 和 `/vote/:id` 单独读不到提案总票数 | 额度和「我已投」仍可读，总票数显示 `—`，详情仍有投票入口。点对应「重试」后，列表恢复显示 `该提案本轮共 0 票`，详情显示 `0 票` |

本轮 8566 浏览器回归中，`gov-core-numbers.spec.ts` **12/12 通过**。验收截图覆盖投票列表和详情的浅色、深色、手机与桌面。 [投票列表](../screenshots/gov-core-vote-voted-dark-mobile.png) · [投票详情](../screenshots/gov-core-vote-detail-light-desktop.png)

实跑（2026-11-21 07:30 前后，8555，复用链与 preview）：

```
Running 4 tests using 1 worker
  ✓ 1 用例 G1 · /submit 推举提案 → /vote 投 100 票（同一轮真实写链） (7.7s)
  ✓ 2 用例 G2 · 治理核心：推举 / 投票两态的验收截图 (7.5s)
  ✓ 3 用例 G3 · 推进阶段后 /gov/rewards 铸造治理激励 (10.4s)
  ✓ 4 用例 G4 · /gov/proposal-rewards 提案激励结算（上一轮） (4.2s)
  6 passed (1.5m)   EXIT=0     # 2026-11-21 增补 G5（我的投票卡）+ G6（/vote/records）
```

同一条 8555 链第二遍：`4 passed (49.1s) EXIT=0`；跑后回读 `automine=false`、`intervalMining=1`（挖矿模式未泄漏）。**8545 全程未被自动化触碰。**

历史回调参数复验使用 8574 临时链。G1–G6 均通过，G2 重拍了推举和投票成功状态的八张截图。

## §4 三线对照表

| 用例 | 理论值（wei） | 合约值（wei） | 前端值（页面字符串） | 结论 |
| --- | --- | --- | --- | --- |
| 推举门槛 | `22360679774997896960` | 同左（§1，ceil 定义式独立复算） | `22.3606`（`gov-submit-eligibility-threshold`） | ✅ |
| 推举成功 | `proposalId = 旧 count + 1`、`isSubmitted = true` | 同左（§2，15 条） | 回执 `提案 #1「…」已经推举进本轮。`；`gov-submit-submitted` | ✅ |
| 同轮再推举 | revert `MemberAlreadySubmitted` | `0xc3487d0d`，参数 `(token, round, 1)` | 不覆盖（页面只渲染一次表单；合约兜底） | ✅ |
| 投票（前端线） | `voteAmountByProposalId = voteAmountByMemberId = totalVoteAmount = 100e18` | 前端线场景的链上读数与理论值相等 | 回执 `提案 #1：100 票` / `本次合计投出 100 票`；页面 `我已投 100 票`、`该提案本轮共 100 票` | ✅ |
| 投票（合约线独立场景） | 该脚本独立使用 `1000e18` 输入并按同一公式核对三笔读数 | 三笔读数均等于 `1000e18` | 前端线不复用该场景 | ✅ |
| 超额投票 | revert `VoteLimitExceeded` | `0xb60c38d3`，参数与手算逐字相等 | 前端本地拦截（`validateVoteAllocation`），不发交易 | ✅ |
| 投票额度 | 未投票时，`maxVoteAmount = 4472135954999579391818` | 同左 | 「本轮已投」`0 票`，「还能投」`4,472.13 票`（`gov-vote-quota-used` / `gov-vote-quota-remaining`） | ✅ |
| 激励预留 | `gov = proposal = floor(9000004500000900000090000003 × 5e14/1e18) = 4500002250000450000045000` | 同左（§4，30 条；`RoundRewardReserved` 逐字相等） | 页面不展示池子（只在提案激励页展示提案池） | ✅ |
| 我的投票激励 | `2250001125000225000022500` | 同左（§6） | `2,250,001`（`gov-rewards-vote-<round>`） | ✅ |
| 我的加速激励 | `0`（种子无加速质押） | 同左 | `0` | ✅ |
| 铸造治理激励 | `voteReward+boostReward = 2250001125000225000022500` | 同左（`balanceOf` 增量、`totalRewardMinted`、事件全等） | 回执 `治理第 R 轮：2,250,001 TestLOVE20`，行变「已铸造」 | ✅ |
| 重复铸造 | revert `MemberRewardAlreadyMinted` | `0xc157061f` | 行按钮已消失（不可再点） | ✅ |
| 提案激励池 | `4500002250000450000045000` | 同左 | `4,500,002`（`gov-proposal-rewards-pool`） | ✅ |
| 提案门槛 | `ceil(100e18 × 5e16/1e18) = 5e18` | 同左（多投票人场景为 `234787137637477918073`） | `5`（`gov-proposal-rewards-threshold`）；行 `100 / 5` | ✅ |
| 达标提案份额 | `4500002250000450000045000` | 同左（§7：`floor(pool×票/总票)`） | `4,500,002` + 说明「票数已过门槛，由提案目标合约铸造。」 | ✅ |
| 未达标提案销毁 | `ceil` 门槛不足的份额 | 同左（`status=2`、`totalRewardBurned` 增量、事件逐字相等；重复销毁不 revert） | G8 覆盖从页面销毁低票提案激励 | ✅ |
| `burnUnusedBoostReward` | `gov − gov/2` | 同左（§8） | 前端线不覆盖（页面没有入口） | ✅（合约线覆盖） |
| 我的投票卡 · 本轮已投 | `voteAmountByMemberId` | 同左（§1.2b / §3 G5） | `100`（`gov-my-votes-used`，若当前轮已切换则为 `0`） | ✅ |
| 记录（卡片预览两轮 / `/vote/records` 全量） | `votedProposalIdsByMemberId` + `voteAmountByProposalId`（分母=提案总票数） | 同左（§3 G5/G6） | 卡片 `查看全部投票记录 >>`。记录页 `治理第 R 轮`、`#1 …`、`我的投票 100`、`占该提案票数 100%` | ✅ |

前端线按预期字符串精确校验，并独立实现格式化规则。部分旧用例用直连链的读数作为输入，§1 保留独立手算的数值基线。达标提案的 `mintProposalReward` 只能由目标合约调用，当前页面只展示状态。
