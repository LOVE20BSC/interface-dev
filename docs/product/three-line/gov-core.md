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
| 地址簿 | `../anvil/export/deployments/anvil31337_dev.json`（前端副本 `src/config/network/anvil31337_dev/network.json` 同源；端口不影响地址） |
| ABI | `../anvil/export/abis/{Vote,Submit,Mint,Phase,Stake}.json`（前端副本 `src/config/abis/{vote,submit,mint,phase,stake}.ts` 由 `pnpm sync:anvil` 生成） |
| 核心参数（dev） | `PRECISION = 1e18`、`SUBMIT_MIN_RATIO = 5e15`（0.5%）、`PROPOSAL_REWARD_MIN_VOTE_RATIO = 5e16`（5%）、`ROUND_REWARD_GOV_RATIO = ROUND_REWARD_PROPOSAL_RATIO = 5e14`（各 0.05%）、`VOTE_POOL_DIVISOR = 2`、`MAX_TITLE_LENGTH = MAX_DETAILS_LENGTH = 1024`、`MAX_TARGET_DATA_COUNT = 16`、`SUBMIT_ROUND_LIMIT = 1000`（私有常量，界面不显示） |
| 合约基线 | core `f5707ce`（`feat(core): add target-filtered proposal pagination`）——本轮开发用的就是最新 core，`anvil/export/abis` 里已含该提交新增的 `votedProposalIdsByTarget` / `submitInfosByTarget` 等函数 |
| 地址 | `Vote 0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82`、`Submit 0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0`、`Mint 0x9A676e781A523b5d0C0e43731313A708CB607508`、`Phase 0xa513E6E4b8f2a923D98304ec87F64353C4D5C853`、`Stake 0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e`、`MemberNFT 0x610178dA211FEF7D417bC0e6FeD39F05609AD788`、`TestLOVE20 0x8aCd85898458400f7Db866d53FCFF6f0D49741FF` |
| 操作账户 | anvil #0 `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`（= 身份 NFT #1、种子把**全部**流动性质押记在 memberId #1） |

## §1 理论线（先手算，再看链）

### §1.1 推举（`Submit`）

| 量 | 公式（合约行号） | 期望 |
| --- | --- | --- |
| 推举门槛 | `requiredVotes = ceil(totalGovVotes × SUBMIT_MIN_RATIO / PRECISION)`（`Submit.sol:84`） | `ceil(4472135954999579391818 × 5e15 / 1e18)` = **`22360679774997896960`**（页面 `22.3606`） |
| 能否推举 | `totalGovVotes ≠ 0 且 govVotes(member1) ≥ requiredVotes`（`Submit.sol:91-99`） | `4472135954999579391818 ≥ 22360679774997896960` → **可以** |
| 正文上限 | `bytes(title) ≤ 1024`、`bytes(details) ≤ 1024`（`Submit.sol:264-281`） | 一个中文字 = 3 字节；页面按 UTF-8 字节计数 |
| 每轮名额 | 每个身份每轮 1 个（`MemberAlreadySubmitted`，`Submit.sol:329-341`） | 第二次推举必 revert |

### §1.2 投票（`Vote`）

| 量 | 公式（合约行号） | 期望 |
| --- | --- | --- |
| 本轮可投 | `maxVoteAmount = Stake.govVotes(token, currentPhase, member1)`（`Vote.sol:117-119`、`317-319`） | `4472135954999579391818`（页面 `4,472.13`） |
| 累计上限 | `Σ 本轮已投 + 本次 ≤ maxVoteAmount`，超出 revert `VoteLimitExceeded`（`Vote.sol:282-286`） | 用例投 100 票：`100e18 ≤ 4472.14e18` → 通过；投 `max+1` → revert |
| 单提案票数 | 同一提案可累加（`Vote.sol:291`） | 投 100 → `voteAmountByProposalId = 100e18` |
| 激励预留触发 | **本轮第一票**时 `Mint.reserveRoundReward`（`Vote.sol:304-307`） | 投完后 `Mint.govReward(round) > 0` |
| 加速份额 | 首次投票记录 `Stake.validBoostShares`；本次种子无加速质押 → 0（`Vote.sol:264-277`） | `voterBoost = 0`、`totalVoterBoost = 0` |

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

## §2 合约线

> 脚本：`scripts/verify/gov-core-contract.mjs`（**1527 行**，只打 8566；启动时按端口拒绝 8545/8555，实测两条都退出 1 且不发任何 RPC）。
> 运行：`make -C ../anvil bootstrap PORT=8566` 后 `node scripts/verify/gov-core-contract.mjs`（或 `VERIFY_RPC=…`）。

跑法：viem test client + `anvil_mine`；每组 `snapshot`/`revert`，跑完链状态逐 wei 回到跑前；先关 interval mining 再开 automine（顺序反了 anvil 会忽略 `setAutomine`），`finally` 恢复原值。

| 项 | 结果 |
| --- | --- |
| 权威跑 | `[§0] block=357 phase=3 phaseBlocks=120` → **190 PASS / 0 FAIL**，**EXIT=0** |
| 复现性 | 干净链连跑 3 次均 190/190 EXIT=0；在阶段末尾（只剩 3–4 块）起跑，守卫触发后仍 190/190 |
| 阶段推进实测 | 3→4（+4 块，剩块守卫前置）、4→5（+118）、5→6（+114）、6→7（+741，`Phase.sync` 把下一阶段拉长到 744） |
| 跑后状态 | block 357 / phase 3；`proposalIds=0`、`totalRewardReserved/Minted/Burned=0`、memberStake(1) 回到种子、memberStake(5) 全 0 |
| 8545 / 8555 | 全程未触碰（8545 只在本地读过一次 `eth_blockNumber`；8555 属于 e2e 套件） |

按节覆盖（每条都是「链上读回 ↔ 手算」成对断言，不抄常量）：

| 节 | PASS | 验证内容 |
| --- | --- | --- |
| §0 | 4 | `ownerOf(1)`、`ownerOf(5)`、无治理权成员 `canSubmit=false`、无 NFT 账户余额 0 |
| §1 | 7 | `SUBMIT_MIN_RATIO=5000000000000000`；`totalGovVotes=govVotes(1)=4472135954999579391818`；`required=ceil(total×ratio/1e18)=22360679774997896960`；`canSubmit(1)=true` |
| §2 | 15 | `proposalIds` 0→1、`ProposalCreated.proposalId=旧 count+1`、`authorId=1`、`isSubmitted=true`、`proposalIdBySubmitterId=1`；同轮再推举回滚 `MemberAlreadySubmitted(0xc3487d0d)` 且三个参数逐个相等 |
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

> spec：`e2e/gov-core-numbers.spec.ts`（`pnpm e2e --grep "治理核心"`，跑在 8555 自动化链，账户 = anvil #1 + 身份 NFT #1）。

| 用例 | 覆盖 | 断言口径 |
| --- | --- | --- |
| G1 | `/vote` 空态 → `/submit` 填表推举（真实交易）→ 回执 → `/vote` 投 100 票（真实交易）→ 回执 | 55 处 `toHaveText` 整串精确；期望值由 spec **直连 RPC 读回**再派生，`expectedAmount()` 独立实现格式化规则（不 import `src/`，避免页面格式化写错时静默通过） |
| G2 | 推举 / 投票两态四档截图（`suspendMining` 冻结当轮再拍） | 20 张 `gov-core-*`（390×844 / 1280×800 × 浅/深） |
| G3 | `anvil_mine` 推一轮 → `/gov/rewards` 出现可铸造行 → 铸造（真实交易）→ 行变「已铸造」 | `1 轮可铸造` → `2,250,001` → `已铸造` / `0 轮可铸造` |
| G4 | `/gov/proposal-rewards` 默认上一轮 → 池 / 总票数 / 门槛 / 行金额 / 达标说明 → `prev` 到空轮 → `next` 回 | `4,500,002` / `100` / `5` / `100 / 5` / `待结算` |

实跑（2026-11-21 07:30 前后，8555，复用链与 preview）：

```
Running 4 tests using 1 worker
  ✓ 1 用例 G1 · /submit 推举提案 → /vote 投 100 票（同一轮真实写链） (7.7s)
  ✓ 2 用例 G2 · 治理核心：推举 / 投票两态的验收截图 (7.5s)
  ✓ 3 用例 G3 · 推进阶段后 /gov/rewards 铸造治理激励 (10.4s)
  ✓ 4 用例 G4 · /gov/proposal-rewards 提案激励结算（上一轮） (4.2s)
  4 passed (48.9s)   EXIT=0
```

同一条 8555 链第二遍：`4 passed (49.1s) EXIT=0`；跑后回读 `automine=false`、`intervalMining=1`（挖矿模式未泄漏）。**8545 全程未被自动化触碰。**

## §4 三线对照表

| 用例 | 理论值（wei） | 合约值（wei） | 前端值（页面字符串） | 结论 |
| --- | --- | --- | --- | --- |
| 推举门槛 | `22360679774997896960` | 同左（§1，ceil 定义式独立复算） | `22.3606`（`gov-submit-eligibility-threshold`） | ✅ |
| 推举成功 | `proposalId = 旧 count + 1`、`isSubmitted = true` | 同左（§2，15 条） | 回执 `提案 #1「…」已经推举进本轮。`；`gov-submit-submitted` | ✅ |
| 同轮再推举 | revert `MemberAlreadySubmitted` | `0xc3487d0d`，参数 `(token, round, 1)` | 不覆盖（页面只渲染一次表单；合约兜底） | ✅ |
| 投票 | `voteAmountByProposalId = voteAmountByMemberId = totalVoteAmount = 100e18` | 同左（§3，23 条） | 回执 `提案 #1：100 票` / `本轮合计投出 100 票`；页面 `我已投 100 票`、`本轮共 100 票` | ✅ |
| 超额投票 | revert `VoteLimitExceeded` | `0xb60c38d3`，参数与手算逐字相等 | 前端本地拦截（`validateVoteAllocation`），不发交易 | ✅ |
| 本轮治理权 | `4472135954999579391818` | 同左 | `4,472.13`（`gov-vote-power-max`） | ✅ |
| 激励预留 | `gov = proposal = floor(9000004500000900000090000003 × 5e14/1e18) = 4500002250000450000045000` | 同左（§4，30 条；`RoundRewardReserved` 逐字相等） | 页面不展示池子（只在提案激励页展示提案池） | ✅ |
| 我的投票激励 | `2250001125000225000022500` | 同左（§6） | `2,250,001`（`gov-rewards-vote-<round>`） | ✅ |
| 我的加速激励 | `0`（种子无加速质押） | 同左 | `0` | ✅ |
| 铸造治理激励 | `voteReward+boostReward = 2250001125000225000022500` | 同左（`balanceOf` 增量、`totalRewardMinted`、事件全等） | 回执 `治理第 R 轮：2,250,001 TestLOVE20`，行变「已铸造」 | ✅ |
| 重复铸造 | revert `MemberRewardAlreadyMinted` | `0xc157061f` | 行按钮已消失（不可再点） | ✅ |
| 提案激励池 | `4500002250000450000045000` | 同左 | `4,500,002`（`gov-proposal-rewards-pool`） | ✅ |
| 提案门槛 | `ceil(100e18 × 5e16/1e18) = 5e18` | 同左（多投票人场景为 `234787137637477918073`） | `5`（`gov-proposal-rewards-threshold`）；行 `100 / 5` | ✅ |
| 达标提案份额 | `4500002250000450000045000` | 同左（§7：`floor(pool×票/总票)`） | `4,500,002` + 说明「票数已过门槛，由提案目标合约铸造。」 | ✅ |
| 未达标提案销毁 | `ceil` 门槛不足的份额 | 同左（`status=2`、`totalRewardBurned` 增量、事件逐字相等；重复销毁不 revert） | 前端线未覆盖（需同轮第二个被投票的提案 + 第二个有治理权的身份，见 §3 说明） | ✅（合约线覆盖） |
| `burnUnusedBoostReward` | `gov − gov/2` | 同左（§8） | 前端线不覆盖（页面没有入口） | ✅（合约线覆盖） |

**结论**：

1. **§1 理论线与 §2 合约线逐 wei 相等**：190 条断言里所有数值用例都成对通过（推举门槛、票数累计、两池拆分、成员份额、提案份额、销毁金额）。§1 的公式与 `domain/gov-core.ts` 的实现一一对应（合约线复核过，无偏差）。
2. **§3 前端线与 §2 的页面可见数值逐字相等**：`4,472.13` / `22.3606` / `100` / `2,250,001` / `4,500,002` / `5`。前端线用 55 处 `toHaveText` 整串精确断言，且期望值由 spec 直连 RPC 读回、独立实现格式化规则（不 import `src/` 的格式化函数）。
3. **未覆盖**（如实记录）：达标提案的 `mintProposalReward`（只有提案目标合约能调，本地链没有已注册的目标合约）、未达标销毁的**前端**路径（需要同轮第二个被投票的提案，e2e 夹具成本高；合约线已覆盖）、错误路径（`RoundNotEnded`、`ProposalBelowThreshold` 等）与批量混入不可铸轮次。
4. **验证命令**：`node scripts/verify/gov-core-contract.mjs --rpc http://127.0.0.1:8566`（190/190，EXIT 0，连跑 3 次一致）；`pnpm e2e --grep "治理核心"`（4/4，连跑 2 次全绿）；全量 `pnpm e2e` **164/164（11.0m，EXIT 0）**；`pnpm check`（format+typecheck+lint+单测 **924 passed**）；首屏包体 prod **159.4 kB** gzip（预算 160，无 WARN）。
