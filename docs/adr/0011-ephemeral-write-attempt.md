# ADR-0011 · 不落盘是写尝试的一种标准形态

- 状态：Accepted
- 日期：2026-11-26
- 关联：候选 C（第二轮架构评审 L1126-3）；[ADR-0007](0007-write-attempt-module.md)（补完它的 adapter 侧）

## Context

ADR-0007 把一次写尝试的生命周期收成一个核，flow 只做 adapter。但 adapter 的接口把「策略」与「端口」同时暴露：`persist` 与 `approve` 是策略，三个记录端口与 `ownerChanged` 是只有落盘形态才需要的成员——它们都是必填。

治理域五条写链（投票 / 推举 / 推举历史提案 / 治理激励 / 提案激励）与授权页都是 `persist:'none'`。于是这六份 adapter 各自写了逐字相同的三行 no-op（`readRecord: () => null` / `writeRecord: () => undefined` / `clearRecord: () => undefined`）、一行语义不成立的 `ownerChanged: options.reverted`（名字说「身份换了」、值却是「上链失败」）、以及固定的 `translate: toUserMessage`。五份治理 adapter 合计 278 行，其中真正属于该 flow 的只有 `send` 与 `parseReceipt` 约 8–10 行。13 份 adapter 此前没有任何单测。

## Decision

1. **接口按落盘形态分成联合类型**：`WriteAttemptAdapter = base & (PersistedAttemptPorts | EphemeralAttemptPorts)`。
   - `PersistedAttemptPorts`（`persist:'afterHash'`）：`ownerChanged` 与三个记录端口必填——落盘形态确实需要它们。
   - `EphemeralAttemptPorts`（`persist:'none'`）：这四项声明为 `never`——**填了就是类型错误**。它们在不落盘形态下永远不会被读取（core 直接跳过 hydration），所以不该出现在接口里。
2. **默认值由 core 补齐**：新增纯函数 `resolveWriteAttemptAdapter(adapter)`，为两种形态补 `approve: 'none'`、`translate: toUserMessage`、不落盘形态补 no-op 端口与中性 `ownerChanged`。hook 内部只认补齐后的形状。
3. **纯函数导出以便测试**：`resolveWriteAttemptAdapter` 是「接口即测试面」的落点——两档默认行为可以表驱动断言，不需要造 wagmi 上下文。
4. **六份 adapter 收窄**：五份治理 adapter 只留 `persist` / `reverted` / `send` / `parseReceipt` / `onConfirmed`；授权页 adapter 同步删掉 no-op 端口，保留自己的 `translate`（它的错误提示要按授权模式生成，不是通用文案）。

## Consequences

- 五份治理 adapter 278 → 238 行，每份少 8 行逐字重复；新写一个不落盘 flow 的接口成本从 13 个成员降到 5 个（且不可能填错落盘端口）。
- 「不落盘长什么样」只有一处定义（`resolveWriteAttemptAdapter`），今天分散在五份 adapter 的注释里。
- `ownerChanged` 不再是每个 adapter 都必须编一个值：它只属于落盘形态。
- 新增 6 条 `use-write-attempt.test.ts` 单测；13 份 adapter 从「零直接覆盖」变成「底座有覆盖 + 各 flow 的 send/parseReceipt 仍由 hook 测试与 e2e 覆盖」。
- 首屏包体不变（全在懒侧）。
