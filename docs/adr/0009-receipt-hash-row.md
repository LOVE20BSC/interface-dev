# ADR-0009 · 交易回执的哈希行 = 一个组件，回执正文留在各 flow

- 状态：Accepted
- 日期：2026-11-26
- 关联：C4（T001 架构评审候选）；[m0-ux-spec](../product/m0-ux-spec.md) §4.3；[ADR-0007](0007-write-attempt-module.md)（同一个「共享末端 + flow 只给差异」形状）

## Context

六个回执 module（转账 / 兑换 / 批量转账 / 空投 / 铸造 / 流动性）加治理域的质押回执，各自手写同一段「哈希行」：算区块浏览器链接、维护 `copied` 状态、复制按钮、复制成功 2 秒后复原、浏览器链接。写法已经分叉——五处复制成功用 `copy.common.copied`、流动性回执与治理域用各域的 key；`交易哈希` 在 copy 里出现 8 次（7 个 section）、`在区块浏览器里查看` 8 次、`复制交易哈希` 7 次。

`m0-ux-spec` §4.3 已经定义了回执的共用内容（标题 + 你得到什么 + 哈希 + 唯一按钮「好的」），所以这不是设计问题，是实现被复制了七份。

## Decision

1. **哈希行收成 `src/shared/ui/tx-hash-row.tsx`**：拥有区块浏览器链接、`copied` 状态、复制按钮、2 秒复原、链接文案；props 只有 `hash` / `testId` 与四个文案覆盖（默认值就是原来逐字相同的四句）。
2. **五处结构相同的回执直接换用**：转账、兑换、批量转账、空投、铸造。每处删掉自己的 `copied` / `explorerUrl` / `handleCopy` 与对应 imports。
3. **公共词汇放懒加载层**：`copy.common.txHashLabel` / `txHashCopy` / `txHashExplorer` 定义在 `copy-pages.ts`（`common` 覆盖块），不占首屏包体。
4. **布局不同的两处不强行统一**：流动性回执把浏览器链接居中放在 `<dl>` 外面、按钮无 aria-label；治理域质押回执是纯文本链、无图标、无 2 秒复原。它们只把文案改指 `copy.common.txHash*`，**布局与交互保持原样**。
5. **回执正文不进共享层**：标题、「你得到什么」、唯一按钮、关闭清理仍留在各 flow——那正是产品差异所在。

## Consequences

- 回执规则再变（例如复制反馈时长、链接样式）只改一个组件；七个 flow 的文案改动集中到三句话。
- 首屏包体不变（prod 159.8 / 160 kB）：组件只被懒加载的回执引用。
- 流动性回执与治理域回执仍是手写实现，是已知的**有意不一致**（布局不同）；若将来 owner 要求统一视觉，应先改规格再收口。
- 各域 copy section 里仍留有同义的 `hashLabel` / `copyHash` / `explorer` key。**2026-11-27 复核更正**：五处回执已改指 `copy.common.txHash*` 后，**哈希相关**的 key 已有一部分零引用（`liquidity.receipt.copyHash`、`gov.receipt.{hash,copyHash,copied,explorer}`、airdrop 回执里的同义 key）；`gov.receipt.close/refreshHint/votes` 等非哈希 key 仍在用。零引用那些属于「同一句话两处真相」的待清理项；本轮不删（`copy-pages.ts` 另有在途改动），真正的去重是让面板的「成功条」也切到共享组件。
