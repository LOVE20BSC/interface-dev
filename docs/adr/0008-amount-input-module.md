# ADR-0008 · 用户金额输入 = 一个解析核 + 每 flow 投影

- 状态：Accepted
- 日期：2026-11-26
- 关联：C2（T001 架构评审候选）；[ADR-0007](0007-write-attempt-module.md)（同一种「共享核 + 投影」形状）；[frontend-standards](../engineering/frontend-standards.md) §2.3 / §7.4

## Context

五个写链页各自实现「把用户输入的金额字符串转成 wei」：兑换、加池、治理质押、代币转账、治理投票。同一件事被写了五份，且口径已经分叉：

- 兑换 / 加池 / 质押：超精度**拒绝**并提示位数；
- 代币转账：超精度**静默截断**并标记（页面提示「按精度截断」）；
- 治理投票：超精度直接算**非法输入**（票数丢一位就是错数）。

除了解析，还有三类复制：原生币预留常量 `10n ** 15n` 五份（两种命名）、`percentToBps` 三份、`applySlippage*` 三份（范围处理各不相同）；批量转账没有自己的金额规则，直接跨 feature `import` 转账页的 parser。

后果是规则一改要动五处，而「共用同一套舍入口径」只写在注释里、不是同一份代码。`shared/lib/token-precision.ts` 早已用同一理由下沉过一次，金额输入没有。

## Decision

1. **解析收成一份**：`src/shared/lib/amount-input.ts` 导出 `parseAmountInput(raw, { decimals, strategy })`，返回 canonical 结果 `empty | invalid | too-precise | zero | ok`；三种策略 `reject-precision` / `truncate-precision` / `reject-as-invalid` 由调用方**显式声明**，不是全局开关。
2. **每个 feature 只做投影**：五个 `parseXAmount` 保留原名、原返回类型、原 kind 语义，内部把 canonical 结果映射回自己的 union。**用户可见行为不变**，49 条既有单测一行期望值都没改。
3. **零的映射保留差异**：`reject-precision` 返 `ok 0n`，另两种返 `zero`——五个页面的按钮门禁依赖这个区别，统一会改变交互，所以由策略决定而不是抹平。
4. **常量与百分比收口**：`NATIVE_FEE_RESERVE_WEI` 只在 `amount-input.ts` 定义一次（旧名 `NATIVE_GAS_RESERVE_WEI` / `NATIVE_FEE_RESERVE_WEI` 用 re-export 保留以免动调用方）；`percentToBps` 与 `applySlippageDown(amount, bps, { clamp })` 只在 `shared/lib/percent.ts`。
5. **不跨 feature 借用**：`batch-transfer/lib/batch-parse.ts` 改为直接调共享层的 `truncate-precision` 策略，不再 `import` 转账页的 parser。
6. **不动 `rawInputValue`**：两个面板的 wei→输入串格式不同（`formatUnits` vs `formatTokenAmount` 去逗号），本轮不统一，避免改变用户看到的「全部」填充串。

## Consequences

- 「超精度怎么处理」现在是一个显式参数，新增写链页不再长出第六份 parser；改规则只改 `amount-input.ts` 与对应 Strategy 的测试。
- 三种精度口径仍然存在（产品有意如此），但它们是**同一份代码里的三个分支**，不再是三份互不知道对方存在的实现。
- `applySlippageDown` 的 `clamp: false` 保留了质押页「bps > 10000 会得到负值」的历史语义（页面层输入校验负责挡住），是已知遗留；若要修，应是独立任务并补测试。
- 首屏包体不变（prod 159.7 kB）：共享模块只被懒加载的 feature lib 引用。
