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

<!-- Pitfalls and evidence: with revision + file:line or symbol names -->

## Conclusion

<!-- What got done, what got left behind -->

## Execution Log

<!-- Maintained by the script: appended by new / claim / set / release / log / close. Do not edit.
     Backfill with: progress log --id 20261114-1256-a9b6-同步-periphery-anvil-到-core-新接口并重建链-重导-abi --note "...". -->
- 2026-11-14 12:56:43 · new · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d · created
- 2026-11-14 12:57:23 · claim · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d · claimed → doing
