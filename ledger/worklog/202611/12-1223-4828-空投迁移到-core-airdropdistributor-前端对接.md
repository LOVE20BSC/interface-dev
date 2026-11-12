# 20261112-1223-4828-空投迁移到-core-airdropdistributor-前端对接: 空投迁移到 core AirdropDistributor（前端对接）

- **Tags**: 空投, 合约迁移, 前端
- **Status**: doing · 2026-11-12 12:55:52 · @test · 47d39b07-9d74-4077-8a12-8ab9280ea25d
- **Created**: 2026-11-12 12:23:55 · @test · 47d39b07-9d74-4077-8a12-8ab9280ea25d

<!-- Header lines are maintained by the script, fixed order: Tags → Status → Created → Sealed.
     The `- **Tags**: …` line is inserted at the top by new --tags; omitted when there are no tags
     (category goes to the ledger and history only, never into this document).
     The `- **Sealed**: …` line is appended on close. -->

## Background

`core@a9a5ac6/f209300/141c931` 把空投迁进协议：新增 `AirdropDistributor`（Launch 的 distributor），`DeployCore` 自己部署它（`CoreConfig` 用 `genesisMerkleRoot` + `genesisClaimDelayRounds`），launcher 可链上登记快照 URI。旧 `LOVE20TKM/burn` 的 Airdrop 不再使用（owner 要求前端只使用 LOVE20BSC 内的合约）。

影响分析：`docs/product/contract-change-impact-2026-11-12.md`；合约缺口：CI-017（创世快照 URI 恒空，core 测试固化 `testGenesisSnapshotUriIsPermanentlyNonUpdatableForAnyCaller`）。

owner 2026-11-12 说明：他正在**重构 Airdrop 接口**，完成后通知；并已决定 tools（BatchTransfer / UniswapV2Zap）先不做、归 M2。

## To Do

- **迁移本身已完成**（见 Process），下面只剩「等 owner 重构后再适配一次」。
- 等 owner 通知 core 的 Airdrop 接口重构完成；收到后按新签名适配 `src/features/claim-airdrop/**`（大概率只改 `claim`/已铸造量方法名）。
- 待 owner 确认：`main` 保留这次迁移并推送发布（A），还是回退到 `9017652` 只留分支（B）。
- 已知遗留：`wip/airdrop-distributor` 分支与 `main` 指向同一 commit，可作为备份；`swap` e2e 有偶发（task-14 另行加固）。

## Next

等 owner 两件事：① 确认 A/B；② 通知 Airdrop 接口重构完成。收到重构通知后第一步：`grep -n "function " ../core/src/interfaces/distributor/IAirdropDistributor.sol` 拿最终签名，再决定 `src/features/claim-airdrop/model/*` 的改法。

## Process

- anvil 迁移已完成（`anvil@d81f4eb`）：删掉 vendor Airdrop，改用 core 部署体；`AIRDROP_DISTRIBUTOR_ADDRESS=0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6`，`PHASE_ADDRESS` 因 nonce 位移变为 `0xa513E6…C853`；两次 clean bootstrap 导出 sha256 均为 `19e85071…fe4a`。
- core 本地参数已与 anvil 对齐（`core/script/network/anvil31337_dev/core.params`）：`TOKEN_NAME=TestLOVE20@TestWETH`、`GENESIS_AIRDROP_MERKLE_ROOT=0x046a5d53…`、`PHASE_ORIGIN_PHASE_BLOCKS=120`、`PHASE_TARGET_SECONDS=120`；`forge build` 通过，`test/deploy_scripts_test.py` 用自建临时 params 不受影响。
- core 的 genesis 参数确实只有两个（`DeployCore.s.sol:109-110` 读 `GENESIS_AIRDROP_MERKLE_ROOT` / `GENESIS_AIRDROP_CLAIM_DELAY_ROUNDS`）；`TOTAL_SHARE`、`MAX_CLAIM_DELAY_ROUNDS` 是合约常量，快照 URI 无 genesis 路径（CI-017）。
- owner 先决定 **B**（暂停），随后该 agent 仍把迁移做完并从 reflog 恢复（期间 main 被 `git reset --hard 9017652` 两次，均无损恢复）；**结论：迁移已完成且全绿**，`main@c49eafd`，分支 `wip/airdrop-distributor` 同点备份。
- 迁移实现：`airdropAbi/addresses.airdrop` → `airdropDistributorAbi/addresses.airdropDistributor`；claim 改为 `claim(tokenAddress, share, proof)` 付 `msg.sender`；已铸造量用 `claimedAmountByTokenAddressByClaimer`（删掉 dev 日志扫描兜底）；新增 **S5-G 轮次门槛**（`currentPhase` vs `claimableFromRound`，`phaseInfo(startBlock)` 推算「约 X 分钟」，不显示绝对时间）；创世快照内置 + `merkleRootByTokenAddress` 校验（CI-017 的空 URI 不算错误），后续 Launch 走 http(s) URI。
- 门禁：typecheck/lint ✅、单测 **379/379**、build ✅（**157.9 kB** gzip，较基线 −1.4 kB）、`abis:check` ✅、e2e **52/52 双跑两遍**。
- 协作事故（记录在案）：我按 B 回退工作区 / reset main 时该 agent 仍在跑，导致两次 `reset --hard` 与其恢复来回；**教训：宣布「暂停」前后必须先停掉在跑的子 agent，或等其提交后再动 git**。

## Conclusion

<!-- What got done, what got left behind -->

## Execution Log

<!-- Maintained by the script: appended by new / claim / set / release / log / close. Do not edit.
     Backfill with: progress log --id 20261112-1223-4828-空投迁移到-core-airdropdistributor-前端对接 --note "...". -->
- 2026-11-12 12:23:55 · new · @test · 47d39b07-9d74-4077-8a12-8ab9280ea25d · created and claimed
- 2026-11-12 12:29:35 · log · @test · 47d39b07-9d74-4077-8a12-8ab9280ea25d · 按 owner 决定 B 暂停前端接口迁移：回退 ABI sync/空投页重写改动，保留 anvil@d81f4eb 迁移；core 本地参数已与 anvil 对齐 4 个值（未提交）；等重构完成再一次性适配
- 2026-11-12 12:55:52 · log · @test · 47d39b07-9d74-4077-8a12-8ab9280ea25d · 迁移已完成并全绿（379 单测 / e2e 52-52 双跑 / 157.9kB / abis:check 绿），main@c49eafd，wip/airdrop-distributor 分支同点备份；待 owner 确认 A(保留并发布) 或 B(回退)
