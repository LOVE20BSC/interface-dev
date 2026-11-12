# 20261112-1223-4828-空投迁移到-core-airdropdistributor-前端对接: 空投迁移到 core AirdropDistributor（前端对接）

- **Tags**: 空投, 合约迁移, 前端
- **Status**: doing · 2026-11-12 12:29:35 · @test · 47d39b07-9d74-4077-8a12-8ab9280ea25d
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

- 等 owner 通知 core 的 Airdrop 接口重构完成。
- 收到后：按新接口重写前端空投页 —— `claim(tokenAddress, share, proof)`（或新签名）、`claimedAmountByTokenAddressByClaimer`、`claimableFromRound` 轮次门槛（未到轮次 → 「还没到可铸造轮次」+ 约 X 分钟）、创世快照内置 + 链上 root 校验（后续 launch 走 URI）。
- 同步 ABI/地址簿（`airdropDistributor` 取代 `airdrop`）、`pnpm sync:anvil`、`abis:check`。
- 更新 e2e `airdrop-claim.spec.ts`、单测、`m0-ux-spec` §3.4、截图。

## Next

等 owner 发话。收到后第一步：`sed -n 1,200p ../core/src/interfaces/distributor/IAirdropDistributor.sol`，用 `grep -n "function "` 列出最终方法签名，再决定 `src/features/claim-airdrop/model/*` 的改法；然后 `pnpm sync:anvil` 生成 `src/config/abis/airdrop-distributor.ts` 与地址簿。

## Process

- anvil 迁移已完成（`anvil@d81f4eb`）：删掉 vendor Airdrop，改用 core 部署体；`AIRDROP_DISTRIBUTOR_ADDRESS=0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6`，`PHASE_ADDRESS` 因 nonce 位移变为 `0xa513E6…C853`；两次 clean bootstrap 导出 sha256 均为 `19e85071…fe4a`。
- core 本地参数已与 anvil 对齐（`core/script/network/anvil31337_dev/core.params`）：`TOKEN_NAME=TestLOVE20@TestWETH`、`GENESIS_AIRDROP_MERKLE_ROOT=0x046a5d53…`、`PHASE_ORIGIN_PHASE_BLOCKS=120`、`PHASE_TARGET_SECONDS=120`；`forge build` 通过，`test/deploy_scripts_test.py` 用自建临时 params 不受影响。
- core 的 genesis 参数确实只有两个（`DeployCore.s.sol:109-110` 读 `GENESIS_AIRDROP_MERKLE_ROOT` / `GENESIS_AIRDROP_CLAIM_DELAY_ROUNDS`）；`TOTAL_SHARE`、`MAX_CLAIM_DELAY_ROUNDS` 是合约常量，快照 URI 无 genesis 路径（CI-017）。
- owner 决定 **B**：暂停前端接口迁移，等 core 重构一次做到位；已回退进行中的工作区改动（ABI sync + 空投页重写 + 轮次门槛），保留 anvil 侧迁移。

## Conclusion

<!-- What got done, what got left behind -->

## Execution Log

<!-- Maintained by the script: appended by new / claim / set / release / log / close. Do not edit.
     Backfill with: progress log --id 20261112-1223-4828-空投迁移到-core-airdropdistributor-前端对接 --note "...". -->
- 2026-11-12 12:23:55 · new · @test · 47d39b07-9d74-4077-8a12-8ab9280ea25d · created and claimed
- 2026-11-12 12:29:35 · log · @test · 47d39b07-9d74-4077-8a12-8ab9280ea25d · 按 owner 决定 B 暂停前端接口迁移：回退 ABI sync/空投页重写改动，保留 anvil@d81f4eb 迁移；core 本地参数已与 anvil 对齐 4 个值（未提交）；等重构完成再一次性适配
