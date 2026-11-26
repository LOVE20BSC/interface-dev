# ADR-0013 · 自定义代币判定 = 一个 module（代币目录收口第一刀）

- 状态：Accepted
- 日期：2026-11-26
- 关联：候选 A（第二轮架构评审 L1126-3）；[ADR-0008](0008-amount-input-module.md)（同形：判定收口、投影留在 flow）

## Context

「用户粘贴的地址是不是一个能用的代币」在转账页与加池页各写一份 `useCustomToken`，判定已经分叉：

- **零地址**：加池页显式判 `no-code`（文案「这个地址上没有合约，不能作为代币。」），转账页先用 `isConfiguredAddress` 过滤（该函数把零地址排除）→ 落到 `invalid`（文案「这不是一个有效的代币地址，需要 0x 开头的 40 位地址。」）——对格式完全正确的地址说格式错。加池那份的注释写明这是修过的 **QA D9 P3**：修了一处、漏了一处。
- **精度读不到**：加池页不把 token 放进可选列表（注释：「猜一个 18 会让用户看到错误的数量」），转账页 `decimals ?? 18` 猜一个。
- 批准页（`approve-token`）与批量转账复用转账页的 catalog，于是**同一处错误传播到四个页面**。

## Decision

1. **判定收进 `src/entities/community-token/model/use-custom-token.ts`**：`customTokenLookupStatus()` 是纯函数，状态 `empty | malformed | checking | no-code | unreadable | ok`；`useCustomToken()` 是唯一读取实现（bytecode → `symbol()` / `decimals()`）。
2. **零地址一律 `no-code`**（不必等 RPC）；**精度读不到一律不是 `ok`**（不再有 18 位兜底）。
3. **`address` 只按格式过滤，不按「地址簿是否配置」过滤**——零地址也必须走到 bytecode 判定，否则点「读取这个代币」就是静默 no-op（QA D9 的原始问题）。
4. **投影留在各 feature**：转账页把 `malformed` 叫 `invalid`（它的输入框不做格式拦截），加池页叫 `idle`（输入框自己有格式提示）。两个页面的文案因此不变——**字符串本来是对的，错的是映射**。
5. **社区代币的精度也按同一口径**：转账页不再 `decimals ?? 18`，读不到精度的社区代币不进入可选列表（与加池页一致）。

## Consequences

- 四个页面（转账 / 授权 / 批量转账 / 加池）共用一份判定；零地址与精度未知两个用户可见差异被消除。
- QA D9 回归测试从加池页移到共享 module，并新增两条分叉回归（零地址不再落 invalid、精度读不到永不 ok）。
- 首屏包体不变（`entities/community-token` 只被懒侧引用）。
- **未收口的部分（本轮明确不做）**：三份 token 类型（`SwapToken` / `TransferToken` / `LiquidityToken`）与四条 catalog 读模型仍各自存在；把「Launch 分页 + 符号查找 + WETH/LP 元数据 + 统一 token 身份」全并进 entities 是 A 的下一刀，需单独设计（它要动六条调用方与一个 feature 环）。
