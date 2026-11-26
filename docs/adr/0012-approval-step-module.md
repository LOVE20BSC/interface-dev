# ADR-0012 · 授权阶梯的判定 = 一个纯 module，呈现留在各 flow

- 状态：Accepted
- 日期：2026-11-26
- 关联：候选 D（第二轮架构评审 L1126-3）；[ADR-0009](0009-receipt-hash-row.md)（同形：不统一布局，只统一判定）；[m0-ux-spec](../product/m0-ux-spec.md) §4.1

## Context

「这一行授权该说什么、按钮能不能点、要不要整行不渲染」在产品上是一条规则（`m0-ux-spec` §4.1），代码里却在四个 flow 各推一遍：

- 兑换：21 行嵌套三目（`swap-token-panel.tsx:469-491`）
- 加池：五段三目 + 三合一 `disabled`（`add-liquidity-panel.tsx:970-1008`）
- 质押：`StakeApproveRow` 六段 if 链（`stake-controls.tsx:128-149`）
- 铸造：`approval-row.ts` 四行纯函数（唯一带单测的一份）

同一个「不知道」在四处给了三种答案：兑换说「读取整授权额度中…」、质押说「这一笔不需要代币授权」、铸造整行不渲染（这是 owner 2026-11-21 走查发现 P1 之后补的）。`approvalKind`（额度三态）早已在 `shared/lib`，但「状态 → 结论」这段判定没有。

## Decision

1. **判定收进 `src/shared/lib/approval-step.ts`**：`approvalStepState(input)` → `hidden | checking | busy | input-pending | needs-approval | approved | long-term`。顺序是规则的一部分：不需要代币 → （铸造）所需量未知 → 授权进行中 → 额度未知 → 长期授权 → 前置输入未填 → 够/不够。
2. **呈现留在各 flow**：每个 flow 只把状态投影成自己的文案与按钮形态。四个 flow 的措辞差异（「兑换」页说「授权 TestLOVE20」、加池说「授权 TestLOVE20」、质押给一句说明、铸造整行可隐藏）是有意的产品差异，**不进共享层**。
3. **铸造那条 P1 结论变成模型的默认能力**：`hideWhenNeedUnknown` 让「所需量未知」可以落 `hidden` 而不是被当成「不需要授权」。
4. **本轮接四处**：兑换、质押、铸造，以及加池。加池原先的 `approvalNeed()` 在「额度未读回」时返回 `required`（直接显示一个**可点**的「授权」），与共享判定的 `checking`（读取中、不可点）不同；owner 2026-11-26 批准按共享判定对齐后接上（文案与布局不变）。`approvalNeed()` 保留：撤出路径（`my-liquidity-panel`）仍在用。

## Consequences

- 「未知 ≠ 已授权」「授权中不能提交」「长期授权禁用」三条不变量只有一处；今天改其中一条要动四个文件。
- 新增 9 条表驱动单测（`approval-step.test.ts`），覆盖每种状态与两个边界（busy 优先于 unknown、required=false 优先于一切）。四个 flow 今天只有铸造那份有单测。
- 加池页仍保留自己的判定，是已知的**有意不一致**；它与共享判定的差异已记录，等 owner 决定「额度未读回时能不能点授权」。
- 首屏包体不变（`shared/lib` 只被懒侧引用；159.7/160）。
