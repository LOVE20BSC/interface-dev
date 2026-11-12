# 20261112-1419-45e8-按-core-重构后的-airdropdistributor-接口重导-anvi: 按 core 重构后的 AirdropDistributor 接口重导 anvil 并适配前端

- **Tags**: 空投, 合约迁移, anvil, 前端
- **Status**: doing · 2026-11-12 14:30:57 · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d
- **Created**: 2026-11-12 14:19:53 · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d

<!-- Header lines are maintained by the script, fixed order: Tags → Status → Created → Sealed.
     The `- **Tags**: …` line is inserted at the top by new --tags; omitted when there are no tags
     (category goes to the ledger and history only, never into this document).
     The `- **Sealed**: …` line is appended on close. -->

## Background

`core@0cdbe44/4200d35` 重构了 `AirdropDistributor`：六个按 token 的 getter 合并为 `airdropInfo(token) → AirdropInfo{tokenAddress, merkleRoot, claimableFromRound, totalClaimedShare, totalRemainingShare, totalClaimedAmount, remainingAmount, snapshotUri}`；`isClaimedByTokenAddressByClaimer`/`claimedAmountByTokenAddressByClaimer` 改名为 `isClaimed`/`claimedAmount`；`claim(token, share, proof)` 不变。owner 2026-11-12 要求开启任务处理。

<!-- What this is for: the words that triggered it / the symptom / a link -->

## To Do

- 前端适配（进行中）：`pnpm sync:anvil` → 用一次 `airdropInfo` 取代六次读 → 改名两处 getter → 轮次门槛/快照 URI/已铸造量切到新方法 → e2e 的 `cast call` 断言与轮次门槛 storage pin 重新推导 → 文档/截图。

<!-- Not done yet, not verified, waiting on somebody -->

## Next

等前端适配 agent 交付：先核 `src/features/claim-airdrop/**` 是否只剩 `airdropInfo` + `claimedAmount`/`isClaimed`（`grep -rn "ByTokenAddress" src/` 必须为空），再跑双跑 e2e，最后一起发布两个站点。

<!-- The next concrete action (file:line level), never "keep going" -->

## Process

- anvil 重导完成（`anvil@eb83b29`/`1a5c998`/`2b5182a`）：`verify.sh` 用一次 `cast call --json airdropInfo(token)` 读全部字段；`export.py` 新增 `cast_call_tuple()`；`SeedFlow` 的 `_registerSnapshotUri` 改为创世只读断言（快照 URI 恒空，CI-017）；导出确定性：deployment JSON sha256 `1cc1a2a5…6484a1`，除 VERIFIED.md 外全部导出文件聚合 sha256 `a717f5e9…f0b4445f`，三次 bootstrap（8545×2、8555×1）一致。
- 新导出块（8545）：`airdropDistributor = { address 0x2279B7A0…2eBe6, token 0x8aCd…41FF, merkleRoot 0x046a5d53…c404, claimableFromRound 2, totalClaimedShare 5e17, totalRemainingShare 5e17, totalClaimedAmount 5e26, remainingAmount 5e26, snapshotUri "" }`。
- 两条链已重建并保持运行（8545 / 8555），`ALL CHECKS PASSED`。

<!-- Pitfalls and evidence: with revision + file:line or symbol names -->

## Conclusion

<!-- What got done, what got left behind -->

## Execution Log

<!-- Maintained by the script: appended by new / claim / set / release / log / close. Do not edit.
     Backfill with: progress log --id 20261112-1419-45e8-按-core-重构后的-airdropdistributor-接口重导-anvi --note "...". -->
- 2026-11-12 14:19:53 · new · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d · created and claimed
- 2026-11-12 14:30:57 · log · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d · anvil 重导完成（eb83b29/1a5c998/2b5182a）：airdropInfo 单次读取、导出新字段、两链重建且确定性三跑一致；前端适配 agent 已开工
