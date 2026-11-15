# 20261114-1256-a9b6-同步-periphery-anvil-到-core-新接口并重建链-重导-abi: 同步 periphery/anvil 到 core 新接口并重建链/重导 ABI/全量回归（等 owner 确认 core 稳定）

- **Tags**: core, periphery, anvil, ABI
- **Status**: doing · 2026-11-14 12:57:23 · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d
- **Created**: 2026-11-14 12:56:43 · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d

<!-- Header lines are maintained by the script, fixed order: Tags → Status → Created → Sealed.
     The `- **Tags**: …` line is inserted at the top by new --tags; omitted when there are no tags
     (category goes to the ledger and history only, never into this document).
     The `- **Sealed**: …` line is appended on close. -->

## Background

**状态：阻塞中，等 owner 确认 core 稳定后再开工。** owner 2026-11-14 20:53 说「我现在正在处理合约代码库的一些问题修复，等修复完之后我再告诉你」。

已核实的断点（2026-11-14 20:54 快照，core HEAD `4060816`）：
- `IStake.stakeLiquidity(...)` 现在 6 参：`(tokenAddress, tokenAmount, parentTokenAmount, promisedWaitingPhases, memberId, deadline)`（core `7b76609`/`c904473` 一带引入 deadline 与承诺期）；
- `IStake.withdraw(tokenAddress, memberId, deadline)` 也加了 deadline；
- 新增 `increasePromisedWaitingPhases` / `lastMajorStakeRound` / 若干 error 与 event。
- 但 `../periphery/src/LOVE20Hub.sol` 仍按 5 参调 `stakeLiquidity`，`../anvil/script/SeedFlow.s.sol` 也按 5 参 → **任何端口的 `make bootstrap` 编译失败**，e2e 与真链验证全部停摆（前端 `pnpm dev` 还能用旧的 8545 链）。

本任务负责「协议侧同步 + 重导 + 全量回归」，**只改 `../anvil`，`../periphery` 等 owner 允许后再改或由 owner 改**（改动前先确认写权限）。

通用纪律：PATH 带 foundry+node24+pnpm；不碰 8545（验证链用 8580 等专用端口，做完 stop）；不 `git reset/checkout/stash/clean`；中文 commit；前端提交前先跑 `pnpm abis:check`。

## To Do

1. **等 owner 信号**：收到「core 稳定」后先 `git -C ../core log --oneline -3` 记录基线，并全仓 `forge build`（core/action/group-chat/periphery/anvil）看还有哪些仓被新接口打断——**其它仓的破坏不在本任务修改范围，列给 owner**。
2. **同步调用面**（periphery/anvil）：
   - `../periphery/src/LOVE20Hub.sol`：`stakeLiquidity` 加 deadline（用它自己入口的 `params.deadline`，不要新造一个）；`withdraw` 若被调用则加 deadline；核对 Hub 里其它 IStake 调用（`stakeBoost`/`memberStake`/`totalStake`）签名是否也变了。
   - `../anvil/script/SeedFlow.s.sol`：`stakeLiquidity` 加 deadline（建议 `block.timestamp + 20 minutes`，写常量与注释）。
   - 若有其它 siblings（action/group-chat）被新接口打断，**只记录不修**，交 owner。
3. **重建与确定性**：`PORT=8580` clean bootstrap 两次 → 导出 `deployments/*.json` sha256 两次一致；把新导出与当前提交版本逐键对比，**地址/块号是否漂移要写清楚**（core 改了 Stake 构造参数就会漂移，这时前端地址簿必须整体重导）。
4. **前端重导**：`pnpm sync:anvil`（ABI + manifest + 地址簿 + 快照），`pnpm abis:check` 绿；核对前端消费面是否被接口变更影响（`src/config/abis/stake.ts` 的 `withdraw/stakeLiquidity` 等；当前页面只用读接口与 approve spender，若 M1 未开工影响面小 —— 逐处写明）。
5. **全量回归**：`pnpm e2e`（当前约 100+ 条，含新增 swap-slow-wallet / transfer-recovery / community-switch / approvals 等）；`pnpm typecheck/lint/test/build`；`docs/product/screenshots` 受影响页重拍。
6. **8545 人工链**：重建（`make stop && make clean && make bootstrap`），并 `make verify` 重新生成 `../anvil/export/VERIFIED.md`；提交 anvil 仓。
7. 台账里所有标注「待 Lead 在合约侧稳定后统一跑」的任务（fix-batch/approvals/global/liquidity/transfer、swap-fix、精度统一等）在本任务完成后逐条补跑门禁。

## Next

先等 owner 信号；开工第一件事是 `forge build` 全仓摸清断点范围（core/action/group-chat/periphery/anvil），把「不在我可改范围」的仓列给 owner，再动 periphery/anvil。

## Process

### 0. 基线与复现（2026-11-15 08:10，live 模式 PINNED=0）

- 实读 HEAD：core `3f71379`、periphery `172190a`、action `ae781fa`（比台账基线的 `c4df760` 多一个纯文档 commit `ae781fa docs(action): explain whitepaper rules in plain language`，无代码/ABI 差异）、group-chat `c2cf4f3`、tools `44d7f54`、dex `31464c0`、libs `65b1106`；anvil 起点 `fe923b8`。
- 钉版 `.siblings-pinned/` 与 `siblings.lock` 未动（第二阶段才 bump）；本任务只改 `../anvil`。
- `make build` 首轮复现（与台账一致）：`Compiling 155 files with Solc 0.8.37` →
  `Error (6160) script/DeployLocal.s.sol:276:48`（`new GroupActionExecutor(actionTarget, params.splits)` 2 参 vs 1 参）、
  `Error (9582) script/DeployLocal.s.sol:607:35`（`IGroupActionExecutor.SPLITS()` 不存在）。

### 1. 断点 1+2+3：GROUP_ACTION_SPLITS 概念在 action 侧被**整体移除**（不是搬家）

依据：
- `../action/src/GroupActionExecutor.sol:42` → `constructor(address actionTargetAddress) ExecutorBase(actionTargetAddress)`，只有 1 参；
- `../action/script/deploy/DeployAction.s.sol:129` → `new GroupActionExecutor(addrs.actionTarget)`，官方部署脚本也不再传数组；
- `grep -rn "SPLITS|splits" ../action/src ../action/script` 只命中无关注释（"caller splits by block gas"）→ 没有替代 getter/参数，验证开放时间表随 action `652c270 feat(action): simplify verifier elections and collateral settlement` 从合约里删掉了；
- `../action/src/interfaces/IGroupActionExecutor.sol` 的 view 列表里已无 `SPLITS()`。

改法（全部在 `../anvil`，owner 的仓零改动）：
- `script/DeployLocal.s.sol`：构造函数改 1 参；删除 `Params.splits` 字段、`_loadParams` 里的 `params.splits = _envUintArray("GROUP_ACTION_SPLITS")`、`_envUintArray()`、`_validateSplits()`、部署后对 `groupAction.SPLITS()` 的长度/逐项校验；`_validateAction` 去掉已无用的 `params` 形参，并删除未使用的 `IGroupActionExecutor` import（否则余 warned unused parameter；改完 `make build` 零 warning）。
- `params/anvil31337_dev/action.params`：删除 `GROUP_ACTION_SPLITS=1e17,4e17,7e17` 及其说明，保留“链接库是编译期目标、不在此文件”的注记，并写明该键为何消失。
- `script/export.py`：删除 `GROUP_ACTION_SPLITS` 的解析/十进制校验与 `params.groupActionSplits` 输出。
- `script/verify.sh`：删除 `export.params.groupActionSplits` 断言与 `SPLITS` 相关注释（改写为“合约已无该 getter”）。
- `README.md`：导出示例的 `params` 键、export.py 的 split 描述、目录树里的 `action.params` 说明，共 3 处。
- `script/lib/params.sh` 无需改：它只是通用 `1e17 → decimal` 词法展开，没有 split 专用逻辑。
- 消费者核查：`interface-dev-dsh/src/` 无 `groupActionSplits` / `SPLITS` 消费者（仅 `docs/contract-issues/`、`.research/` 提到），因此前端影响仅为“导出的 `params` 少一个键”。

### 2. 断点 4：`IStake.stakeLiquidity` 5 参 → 6 参（第 6 参 `deadline`）

依据：
- `../core/src/interfaces/IStake.sol:208-215`：`stakeLiquidity(address,uint256,uint256,uint256,uint256,uint256 deadline)`（6 参）；
- `../core/src/Stake.sol:206-209`：`modifier beforeDeadline(uint256 deadline) { ... if (block.timestamp > deadline) revert DeadlineExpired(deadline); }`；
- `../core/src/Stake.sol:213-222`：入口带 `beforeDeadline(deadline)`，内部 `_stakeLiquidity` 逻辑未变；
- 该 deadline 随 core `d878a29 fix(stake): add deadlines to staking and withdrawals` 引入，`3f71379` 仍是 6 参。

改法 `script/SeedFlow.s.sol`：新增命名常量 `SEED_STAKE_DEADLINE = 20 minutes`（注释记录上面三处依据 + automine 下只需活过一笔交易），调用改为 `block.timestamp + SEED_STAKE_DEADLINE`。

同轮核对（不改，只记录）：
- `IStake.withdraw(tokenAddress, memberId, deadline)` 3 参 —— SeedFlow 不调用 withdraw（种子链刻意不制造 unstake 请求），不改。
- 新增 `increasePromisedWaitingPhases` / `lastMajorStakeRound` / `mergeStake` —— seed 的目标状态不需要它们（单次流动性 stake、无合并/提升承诺期），不改。
- `totalStake(...)` 返回元组结构未变：`_assertSeedState` 的 8 项解构仍成立（编译+运行均通过）。

### 3. build / bootstrap / verify（PORT=8580，PINNED=0）

| 步骤 | 结果 |
|---|---|
| `make build` | 首轮 155 files 编译通过；清理 warning 后 `Compiler run successful!`（0 warning） |
| `make stop PORT=8580 && make clean PORT=8580 && make bootstrap PORT=8580`（#1） | `ALL CHECKS PASSED`，导出 sha256 见下 |
| 同上（#2，clean） | `ALL CHECKS PASSED`，导出 sha256 与 #1 完全一致，`diff -r` 两份 `export/abis` 无差异 |
| 同上（#3，用于提交前的最终树：删 import 后再 clean） | `ALL CHECKS PASSED`，sha256 仍一致 |
| `make verify PORT=8580` | 86 项断言全部 PASS，`ALL CHECKS PASSED — report written to export/VERIFIED.md` |
| `make stop PORT=8580` | 8580 已释放（`lsof` 无监听）；8545 的 anvil（pid 10454）全程未读写、未 stop |

### 4. 导出 sha256（确定性证据）

| run | `export/deployments/anvil31337_dev.json` | `export/abis/*.json` 聚合（`shasum -a 256` 后再 hash） |
|---|---|---|
| clean bootstrap #1 | `222b2c8d2a781b1e81d21c12b79ee47c2cde8b0a0c7c60c81b45c7d8973d0aa2` | — |
| clean bootstrap #2 | `222b2c8d2a781b1e81d21c12b79ee47c2cde8b0a0c7c60c81b45c7d8973d0aa2` | — |
| clean bootstrap #3（最终树） | `222b2c8d2a781b1e81d21c12b79ee47c2cde8b0a0c7c60c81b45c7d8973d0aa2` | `42ee0d5e10a51add04d0dfadeea956da5b256756b785e1c9f0a4e511d64f24f4` |

`make verify` 跑完后 `export/VERIFIED.md` 记录的 rpc 为 `http://127.0.0.1:8580`、block 140、phase 2（8580 专用端口产物，非 8545 人工链）。

### 5. 地址漂移报告（新导出 vs `git show HEAD:export/deployments/anvil31337_dev.json`）

**结论：地址零漂移。递归逐键 diff 全文件只有 1 处差异（一个 params 键被删），地址簿/块号/库地址/部署块/依赖关系全部不变。**

| 区块 | 旧 → 新 | 是否漂移 |
|---|---|---|
| `addresses`（36 键，含 Multicall3/4 库/WETH/DEX/core 8/action 4/group-chat 12/periphery+tools 2） | 36 键逐个字符串相等 | **否** |
| `contracts`（36 项，每项 address/blockNumber/group） | 完全相等，每合约 blockNumber 相同 | **否** |
| `deployBlock` | `34` → `34` | 否 |
| `deployer` | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` → 同 | 否 |
| `libraries` | GroupActionJoin/Manager/Verify/GroupRecipients 四个地址相同 | 否 |
| `chainId` / `rpcUrl` / `network` / `uniswapV2` / `airdropDistributor` | 完全相等 | 否 |
| `params` | 仅删除 `groupActionSplits`（旧值 `["100000000000000000","400000000000000000","700000000000000000"]`）；`tokenName/tokenSymbol/phaseOriginBlocks/phaseOriginPhaseBlocks/phaseTargetSeconds/seedAccountCount/seedMemberCount` 不变 | **是（唯一变化）** |

原因：core 这批改动（deadline/承诺期/收据校验/mint 奖励预留等）没有增删 CREATE 或改变非数；action 只是构造函数参数变少，不影响部署顺序。**因此前端地址簿与 e2e 中的硬编码地址本阶段不需要跟着改**；需要跟的是导出 `params` 少一个 `groupActionSplits` 键 + ABI 重导。

### 6. ABI 漂移（`HEAD:export/abis` vs 新导出；21 个文件中 5 个变化，16 个逐字节相同）

| ABI | 变化 |
|---|---|
| `GroupActionExecutor.json` | 构造 `(address,uint256[])` → `(address)`；删 `SPLITS()`、`activationStakeAmount(address,uint256)`、`lockedVerifierId`、`staked`、`stakedByMemberId`、`topVerifiers`、`totalStaked`、`verifierStakeAmount`、事件 `VerifierLocked`/`GroupActionCreated` 旧签名、错误 `RoundVerifierLocked`/`VerifierNotOpen`/`VerifierNotRanked`；增 `requiredActivationStake`、`requiredVerifierStake`、`verifierPunishmentRatio`、`activationStakeByActionId/ByGroupId/ByGroupIdByRound`、`totalActivationStake(ByRound)`、`verifier`、`verifierApplicationsByRound`、`verifierElectedRounds`、`verifierApplications`、`stopVerifierApplication`、新事件 `GroupActionCreated`（多一个 uint256）/`VerifierApplicationDescriptionUpdated`/`VerifierApplicationPunished`/`VerifierApplicationStopped`、错误 `ApplicationOverdue`/`ApplicationStillResponsible`/`ApplicationStopped`/`InexactJoinTokenTransfer`/`InvalidVerifierPunishmentRatio`/`ReapplicationInStoppedRound`/`VerifierNotElected`；**同签名但返回结构变大**：`verifierApplication` / `verifierApplications` 的返回 tuple 增加 `stoppedRound/withdrawnRound/pendingRound/punishmentAmount/failedRounds` |
| `Stake.json` | `stakeLiquidity` 5→6 参、`stakeBoost` 4→5 参、`withdraw` 2→3 参（均加 `deadline`）；`validGovVotes/totalValidGovVotes/…Added/…Removed` → `govVotes/totalGovVotes/…`（改名）；新增 `increasePromisedWaitingPhases`、`lastMajorStakeRound`、事件 `PromisedWaitingPhasesIncreased`、错误 `DeadlineExpired`/`InexactTokenTransfer`/`MergeWaitingPeriodNotElapsed`；事件 `LiquidityStaked`/`BoostStaked`/`Unstaked`/`StakesMerged` 的字段名 `totalValidGovVotes` → `totalGovVotes`（签名不变） |
| `LOVE20Hub.json` | 错误集换血：删 `InsufficientAmountA/B`、`InsufficientParentTokenAmount`、`InsufficientTokenAmount`，增 `InexactTokenTransfer`、`InsufficientLiquidity`、`InsufficientLiquidityShares`、`PromisedWaitingPhasesMismatch`；两个 `*Liquidity` 入参 tuple 的 `tokenAmountMin/parentTokenAmountMin` 合并为 `minLiquidityShares`、`addLiquidity*` 的 `amountAMin/amountBMin` 合并为 `minLiquidity`；`quoteLp*`/`quoteStakeLiquidity*` 输出删掉 `suggestedAmountAMin/suggestedAmountBMin`（或 token/parent 版 `suggested*Min`） |
| `Mint.json` | 新增 `reserveRoundReward(address,uint256)`、事件 `RoundRewardReserved`、错误 `NotVoteContract`/`RoundNotCurrent` |
| `Vote.json` | 删除未使用的 `canVote(address,uint256)` |

映射到 owner 的仓：GroupActionExecutor ← action `66e2d65..c4df760`（`4524d71`、`dd59ebe`、`70fbec3`、`902fbd4`、`652c270` 等）；Stake/Mint/Vote ← core `8d604a2..3f71379`（`d878a29`、`1eef81f`、`9311946`、`e864d67`、`cb91a41` 等）；LOVE20Hub ← periphery `3b825a5..172190a`。

### 7. 遗留 / 风险

- **periphery 不需要改**：其 `lib/core` 已到 core `66de360`（= live `3f71379` 的前一个提交，仅 docs 差异），`src/LOVE20Hub.sol:711` 已是 6 参 `stakeLiquidity`；anvil 通过 `.siblings/periphery` 编译 LOVE20Hub 成功。未在 periphery 仓内跑独立 `forge build`（会在 owner 仓写 `out/`），只做源码级核对。
- **前端第二阶段需要**：`pnpm sync:anvil` 重导 ABI（5 个文件变化，含 Stake/Hub 结构变化）+ `manifest.sources.*.head` 更新 + 导出 `params` 少 `groupActionSplits`；地址簿无需改（零漂移）。`src/config/abis/stake.ts`、`love20-hub.ts` 是“由 sync:anvil 生成、勿手改”文件；`src/features/liquidity-pool/{ui/add-liquidity-panel.tsx,model/use-hub-quote.ts}` 用到 Hub 的 `addLiquidityWithNative`/`quoteLp`，ABI 结构变化后需 typecheck 复核。
- **AirdropDistributor.snapshotUri 仍是空**：verify 里把“genesis 不可注册”标为已知状态（core@4200d35 起），本次未变。
- 本阶段提交 `../anvil` 只含代码/参数/文档（`89937a3`），`export/` 产物（deployments/abis/VERIFIED.md）保持工作树未提交，等 Lead 决定；钉版与 `siblings.lock` 未动。

### 8. 第二阶段：前端重导 ABI + Hub 最少额适配 + 三线/全量 e2e（2026-11-15 08:17–09:05）

**重导（不手改生成物）**
- `pnpm sync:anvil`：13 个 ABI 模块只 2 个变化 —— `stake.ts`（69→75 entries，`stakeLiquidity`/`stakeBoost`/`withdraw` 加 deadline、`validGovVotes*`→`govVotes*`、新增 `increasePromisedWaitingPhases`/`lastMajorStakeRound`）与 `love20-hub.ts`（1320→1265 行，`addLiquidity*` 的 `amountAMin/BMin`→`minLiquidity`、`quoteLp*` 删 `suggested*Min`、错误集换血）；`manifest.json` 更新 `sources.*.head`（core `3f71379` / action `ae781fa` / group-chat `c2cf4f3` / anvil `89937a3` / periphery `172190a`）与条目数；地址簿 `src/config/deployments/anvil31337_dev.json`、`public/airdrop/anvil31337_dev.json` **unchanged**。
- `pnpm abis:check`：`ABIs, manifest, address book and airdrop snapshot match ../anvil/export.`；bootstrap 之后复跑仍绿。
- 核对导出 `params`：已无 `groupActionSplits`（只剩 token 名/符号、phase 参数、seed 数量）；前端地址簿文件本身没有 `params` 键（`deployment` 只有 `blockNumber`），地址与导出逐项相同。`../anvil@89937a3` 的导出 sha256 仍是 `222b2c8d…d0aa2`。
- 说明：导出里另有 `GroupActionExecutor`/`Mint`/`Vote` 三个 ABI 变化，但前端 `ABI_MODULES` 白名单不生成这三个模块，typecheck 无新增依赖（不是漏适配，是前端不消费）。

**代码适配（typecheck 没报错也能编译过，因此逐处按语义改）**
- `src/features/liquidity-pool/model/use-hub-quote.ts:36`：删 `suggestedAmountAMin/suggestedAmountBMin` 两个字段与注释；新 `LpQuote` 是 11 字段。
- `src/features/liquidity-pool/ui/add-liquidity-panel.tsx:190-200`：新增 `minLiquidity = applySlippageDown(expectedLiquidity, bps)`（`expectedLiquidity` 来自 quote；Router 路径用 `plan.liquidity` 时该值只用于展示）；Router 的 `minToken/minNative` 保留。
- 同文件 `:401-438`：Hub 两个入口换新 tuple —— `addLiquidityWithNative({tokenAddress, amountTokenDesired, minLiquidity, to, deadline})`、`addLiquidityWithToken({tokenA, tokenB, amountADesired, amountBDesired, minLiquidity, to, deadline})`；四条路径（Hub 原生单边/两侧、Hub 代币单边、Router 双币/首次建池）逐条核对，没有为过编译删功能。
- 同文件 `:730-745` + `copy-pages.ts:1083`：详情「最少进池 A/B」在 Hub 路径改为「至少获得 X 流动性凭证」（新 `quoteMinLiquidity`），Router 路径保留「最少进池」（`addLiquidityETH` 仍收两侧最少额）。
- `use-swap-fee.ts` 只读 `Stake.SWAP_FEE_FOR_LP_RATIO/SWAP_FEE_FOR_PROTOCOL_RATIO`，重导后 getter 仍在，不改。
- 全仓 grep：没有消费 `InsufficientAmountA/B`、`validGovVotes*`、`suggested*Min` 的代码；`e2e/swap.spec.ts` 的 Router `addLiquidity` 签名与 Stake 无关。

**三线同步（理论线重算、脚本与 e2e 断言）**
- `docs/product/three-line/liquidity.md`：顶部加「2026-11-15 协议升级」说明；§0 页面规则、§1 用例 A/B、§2 合约线、§3 前端线、§4 对照表统一改口径。
  - 用例 A：`minLiquidity = 1003579928576458381352 × 9950/10000 = 998562028933576089445` → 页面「至少获得 998.562028 流动性凭证」。
  - 用例 B：`minLiquidity = 217951904694344577682 × 9950/10000 = 216862145170872854793` → 「至少获得 216.862145 流动性凭证」。
  - 用例 C（按 LP 撤出）与 D/E（Router 路径）的 `minToken/minNative` 口径不变。
- `scripts/verify/liquidity-contract.mjs:60-62`：Hub ABI 片段换新 tuple；`:86-100` 的 A/B 期望值加 `minLiquidity`；A/C 的 `addLiquidityWithToken`、B 的 `addLiquidityWithNative`、E 的空池 `eth_call` 全部换新字段。
- `e2e/liquidity-numbers.spec.ts:268,331` 换「至少获得 …」断言；用例 D 仍是「最少进池 995 TestLOVE20 + 0.4975 ETH」。
- `docs/product/m0-ux-spec.md` §3.10（报价行 + 验收）、`docs/product/three-line-verification.md`、`docs/STATUS.md`、`docs/product/delivery-2026-11-14.md` 附录三同步。

**live 链重建 + 两遍全量 e2e（8555，不碰 8545）**
- `cd ../anvil && make stop PORT=8555 && make clean PORT=8555 && make bootstrap PORT=8555` → `ALL CHECKS PASSED`（86 项断言），导出 sha256 仍 `222b2c8d…d0aa2`。
- 合约线在新链重跑：`VERIFY_RPC=http://127.0.0.1:8555 node scripts/verify/liquidity-contract.mjs` → **45/45 PASS**，退出码 0；A/B/C/D/E 的 tx hash 与升级前逐字相同。
- 针对性前端线：`pnpm e2e --grep "流动性"` → **14 passed (1.8m)**，退出码 0，16 张流动性截图同轮覆盖。
- 全量第 1 遍：`E2E_ANVIL_RPC=http://127.0.0.1:8555 pnpm e2e` → **130 passed (7.8m)，0 failed / 0 did not run，退出码 0**。
- 全量第 2 遍（同链）：**130 passed (7.8m)，0 failed / 0 did not run，退出码 0**。

**门禁**
| 门禁 | 结果 |
|---|---|
| `pnpm typecheck` | ✅ 0 error |
| `pnpm lint` | ✅ `eslint . --max-warnings=0` 无输出 |
| `pnpm test` | ✅ 97 files / 630 tests passed |
| `VITE_ENV=dev pnpm build` | ✅ 首屏 gzip **160.8 kB ≤ 161 kB**（预算 161，硬上限 200）；钱包 SDK 仅注入式 |

**截图**：流动性池 16 张 `liquidity-{add,mine,withdraw,empty}-{light,dark}-{mobile,desktop}.png` 已重拍（08:25）；两遍全量 e2e 同时重写了其它页面截图（`approvals-*`、`batch-transfer-*`、`transfer-*`、`swap-*`、`mint-*`、`global-actions-*` 等）。

## Conclusion

- **第一阶段完成**：`../anvil` 在 live 模式（PINNED=0）下 `make build` 155 文件编译通过（0 warning），`PORT=8580` 三次 clean bootstrap 全部 `ALL CHECKS PASSED`（86 项断言），`make verify` 同样 86/86 PASS；8545 人工链全程未触碰，8580 已 stop。
- **两处真实断点的性质**：(1) action 彻底删除了 GroupActionExecutor 的 split 时间表 → anvil 侧参数/校验/导出/文档一并下线（`GROUP_ACTION_SPLITS` 与 `params.groupActionSplits` 消失）；(2) core 给 Stake 的 stakeLiquidity/stakeBoost/withdraw 加 deadline → SeedFlow 用 `block.timestamp + 20 minutes` 常量补齐。其余 core/action/periphery 接口变化均已被 owner 在调用侧同步，anvil 只做校验面核对，无需再改。
- **关键决策输入：地址零漂移**（36 个地址、36 个合约/块号、库地址、deployBlock 34、deployer、network/uniswapV2/airdropDistributor 全同），唯一导出差异是 `params.groupActionSplits` 被删。前端地址簿与 e2e 硬编码地址**不需要**跟随；需要跟随的是 ABI 重导（GroupActionExecutor/Stake/LOVE20Hub/Mint/Vote 五个文件）与 params 键减少。
- **确定性**：三次 clean bootstrap 的 `export/deployments/anvil31337_dev.json` sha256 均为 `222b2c8d2a781b1e81d21c12b79ee47c2cde8b0a0c7c60c81b45c7d8973d0aa2`，ABI 聚合 sha256 `42ee0d5e10a51add04d0dfadeea956da5b256756b785e1c9f0a4e511d64f24f4`。
- **本阶段产出**：`../anvil` commit `89937a3 fix(script): 同步 live siblings 到 core/action 新接口并重建链`（仅 README/params/script；export 产物未提交）。
- **第二阶段完成（前端）**：`pnpm sync:anvil` 只改 `stake.ts`/`love20-hub.ts`/`manifest.json`，地址簿与 airdrop 快照 unchanged，`pnpm abis:check` 绿。Hub 加池的最少额按新协议改为 `minLiquidity = expectedLiquidity × (1 − 滑点)`（向下取整）：用例 A `998562028933576089445`（页面「至少获得 998.562028」）、用例 B `216862145170872854793`（「至少获得 216.862145」）；Router 路径仍用两侧最少额。四条提交分支（Hub 原生/代币、Router 双币/首次建池）逐条核对新 tuple，没有为过编译删功能。
- **两遍全量 e2e 全绿**：live 8555 链（本任务 clean bootstrap 新起）上 `pnpm e2e` 连跑两遍 **130 passed / 0 failed / 0 did not run（7.8m、7.8m，退出码均 0）**；针对性 `--grep "流动性"` 14 passed；合约线 `liquidity-contract.mjs` 45/45 PASS，交易哈希与升级前逐字相同（地址零漂移的直接证据）。
- **门禁**：`typecheck` ✅ / `lint` ✅ / `test 630` ✅ / `VITE_ENV=dev build` 160.8 kB ✅。16 张流动性截图重拍，其它页面截图随全量 e2e 重写。
- **遗留（M1）**：Stake 的 `stakeLiquidity` 6 参 / `stakeBoost` 5 参 / `withdraw` deadline / `govVotes*` 改名 / `increasePromisedWaitingPhases` / `lastMajorStakeRound` 与 Hub 的 `stakeLiquidity*`/`quoteStake*` 前端尚未消费，本阶段只保证 ABI 重导后现有页面不回归；`GroupActionExecutor`/`Mint`/`Vote` 的增删仍只在 anvil 导出层（前端白名单未生成模块）。

## Execution Log

<!-- Maintained by the script: appended by new / claim / set / release / log / close. Do not edit.
     Backfill with: progress log --id 20261114-1256-a9b6-同步-periphery-anvil-到-core-新接口并重建链-重导-abi --note "...". -->
- 2026-11-14 12:56:43 · new · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d · created
- 2026-11-14 12:57:23 · claim · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d · claimed → doing
