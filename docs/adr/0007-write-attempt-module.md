# ADR-0007 · 一次写尝试 = 一个纯核 + 薄 hook，flow 只做 adapter

- 状态：Accepted
- 日期：2026-11-24
- 关联：T005（实现）；[ADR-0006](0006-no-transaction-resend.md)（先移除交易重发，本 ADR 在其之后）；[m0-ux-spec](../product/m0-ux-spec.md) §4.2；[frontend-standards](../engineering/frontend-standards.md) §2.3 / §7.6 / §10.12

## Context

移除交易重发（ADR-0006）之后，8 条写链 hook 各自仍维护同一套生命周期：main/approve 两个状态槽、stage 派生、`pending` nonce 选择、`{chainId, account}` 归属校验、`useTxWatch` 接线、hash 后落盘与刷新恢复、回执清理、发送错误归一。6 个 `*-record` 模块各自重复「信封 + 哈希/地址/chainId/nonce/timestamp 校验 + 序列化」。结果是同一套 R1/R3/R4/R5 语义写在 8~13 份里：改一次卡住态或归属校验要动 13 个文件，测试面也只能靠 hook 测试与 e2e。

`T002` 曾按「保留重发」设计过一版（R2 三模式、恢复卡重提），随 ADR-0006 一并作废；本 ADR 按「无重发」的新基线重做。

## Decision

1. **一个 module 拥有一次写尝试的生命周期**：
   - `src/shared/lib/write-attempt.ts` —— 纯 reducer：`reduceWriteAttempt<Intent, Receipt>(state, event, policies) → { state, effects }` + 选择器。状态转移、不变量、nonce 选择、归属校验、落盘时机全部在这里，可表驱动测试。
   - `src/shared/model/use-write-attempt.ts` —— 薄 hook：持有 `useTxWatch`、执行 effects（persist/clear/sign/readNonce/notify）、调 adapter 的 codec 与 record 端口。
2. **每个 flow 只做 adapter + 投影 hook**：adapter 提供 `Intent/Receipt/Stored` 具体类型、`persist`（`afterHash`/`none`）、`approve`（`none`/`single`/`keyed`）、`send`/`parseReceipt`/`translate`/`messages` 与记录读写端口；投影 hook 把 `useWriteAttempt` 的输出映射回该 flow 原有的 props。
3. **record 层 6→1**：`src/shared/lib/write-record.ts` 拥有唯一信封 `{ hash, chainId, account, nonce?, recordedAt, payload }`（hash 必填）、通用校验与序列化；flow 只提供 payload codec。**缓存 key 与 scope 语义保持不变**，旧记录不迁移（开发期无兼容义务）。
4. **类型边界**：纯核只吃 `Intent/Receipt`；`Stored` 留在 adapter；`Payload` 留在 record adapter。`shared` 不 import `@/features/*`，用户可见中文由 `messages`/`translate` 注入（CJK 门禁）。
5. **行为完全不变**：13 个 hook 的导出名/返回字段/语义、面板一行、回执内容与外壳、卡住态文案、缓存 key 全部不变。三批迁移：① record 6→1 ② 单笔 8 条 ③ 两步 5 条，每批独立验收与回滚。

## Consequences

- 正面：R1/R3/R4/R5 的语义只有一处实现；13 个 hook 合计从 2,848 行降到 1,406 行；6 份信封校验收成 1 份；新增写链 flow 只写 adapter + 投影，不再复制状态机；纯核可用表驱动测试覆盖「非空回执阻塞提交」「换钱包清回执」「无 hash 不落盘」这类此前只能靠 e2e 发现的路径。
- 代价：adapter 是声明式的，单个 flow 的 adapter 50–400 行（含 payload codec、record 端口、文案插槽）；改动某个 flow 的行为要改 adapter 而不是 hook，位置变了；纯核的 effect 顺序一旦写错会影响所有 flow，所以 core 的单测必须保持表驱动且覆盖顺序。
- 回滚：三批各自可 revert；批 1 独立，批 2/3 依赖批 1 的 record 层。
- 验证：每批 `pnpm check` + 受影响 spec；整体收尾跑全量 e2e（174 条口径）与 T004 基线对比；面板目录 diff 为空是硬性验收项。

## Rejected alternatives

- **一个 hook 全塞（`useAttempt(spec)`）**：状态机仍在 React，生命周期矩阵无法不渲染地测；spec 字段与返回字段会一起变宽，违反「深度是接口的性质」。
- **全局 store + subscribe**：需要根挂载 runtime host，引入挂载顺序依赖，并改变「同 flow 多面板各自独立」的现状；跨页常驻任务条目前没有消费者。
- **不重构，维持 8 份**：8 份生命周期 + 6 份 record 已经证明会漂移（历史的 `approveRevision` 只在 2 个 hook 有、落盘时机三派），且每次卡住态/回执改动都要动 13 个文件。
- **record 层也做 design-it-twice**：它是纯数据层，差异在 payload 而非状态机，用一份通用信封 + 表驱动测试即可。
- **为旧缓存写兼容层**：owner 明确开发期无兼容义务；旧记录与旧 key 直接丢弃。
