# 20261112-1419-45e8-按-core-重构后的-airdropdistributor-接口重导-anvi: 按 core 重构后的 AirdropDistributor 接口重导 anvil 并适配前端

- **Tags**: 空投, 合约迁移, anvil, 前端
- **Status**: done · 2026-11-12 15:42:45 · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d
- **Created**: 2026-11-12 14:19:53 · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d
- **Sealed**: 2026-11-12 15:42:45 · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d

<!-- Header lines are maintained by the script, fixed order: Tags → Status → Created → Sealed.
     The `- **Tags**: …` line is inserted at the top by new --tags; omitted when there are no tags
     (category goes to the ledger and history only, never into this document).
     The `- **Sealed**: …` line is appended on close. -->

## Background

`core@0cdbe44/4200d35` 重构了 `AirdropDistributor`：六个按 token 的 getter 合并为 `airdropInfo(token) → AirdropInfo{tokenAddress, merkleRoot, claimableFromRound, totalClaimedShare, totalRemainingShare, totalClaimedAmount, remainingAmount, snapshotUri}`；`isClaimedByTokenAddressByClaimer`/`claimedAmountByTokenAddressByClaimer` 改名为 `isClaimed`/`claimedAmount`；`claim(token, share, proof)` 不变。owner 2026-11-12 要求开启任务处理。

<!-- What this is for: the words that triggered it / the symptom / a link -->

## To Do

- 无（适配已完成并发布，见 Conclusion）。后续只等 owner 的下一轮合约/治理变化（M1 激励、快照 URI genesis 路径 CI-017、tools 归 M2）。

<!-- Not done yet, not verified, waiting on somebody -->

## Next

无待办动作。若 owner 决定做「多空投列表」再启新任务（需要压测 `airdropInfos` 分页，见 CI-016）。

<!-- The next concrete action (file:line level), never "keep going" -->

## Conclusion

- 前端适配完成并发布：`main@89d1ccb` → `interface-dev`（CI+Pages 绿）与 `interface-test`（release-to 推送）。
- 调用面收敛为一次 `airdropInfo(token)`（新 `src/domain/airdrop-info.ts` + `use-airdrop-info.ts`，wagmi query key 去重）；`claimedAmount`/`isClaimed` 改名完成，`grep -rn "ByTokenAddress" src/ e2e/` 为空。
- 轮次门槛：新布局把 `totalClaimedAmount` 插在 slot 4，但 `claimableFromRound` 仍在 slot 2，gate key 仍是 `keccak256(abi.encode(token, uint256(2)))`（e2e 注释记录了完整布局）。
- 门禁（Lead 复核）：`typecheck` ✅、单测 **385/385**、`abis:check` ✅、双跑 e2e **52/52 ×2**（Lead 亲自跑，exit 0）、包体 **158.3 kB**。
- 顺手修掉一个隐患：`scripts/lib/anvil-export.mjs` 用精度保留的 JSON 读取，避免 `5e26` 被 `JSON.parse` 变成浮点。

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
- 2026-11-12 15:03:48 · log · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d · 前端适配完成并发布：main@89d1ccb（385 单测 / 双跑 e2e 52-52 / 158.3kB / abis:check 绿），已推送 interface-dev 并 release 到 interface-test；调用收敛为单次 airdropInfo
- 2026-11-12 15:42:45 · close · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d · sealed: 按 core@4200d35 重构后的 AirdropDistributor 重导 anvil（airdropInfo 单次读取、导出新字段、三次 bootstrap 导出哈希一致）并适配前端调用面（六读取合一、claimedAmount/isClaimed 改名、池子用 totalClaimedAmount/remainingAmount、轮次门槛 slot 2 不变）；385 单测、e2e 52/52 双跑、158.3 kB；已推送 interface-dev 并 release interface-test
