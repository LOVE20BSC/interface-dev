# ADR-0015 · 测试策略：Playwright 留着，把钱花在「让 e2e 少跑」

- 状态：Accepted
- 日期：2026-11-27
- 关联：owner 2026-11-27 批准按此推进；[ADR-0013](0013-custom-token-lookup.md) 等本轮重构的验收基础

## Context

这个前端是纯静态 SPA：没有后端、没有索引器，钱包只支持注入式，链就是它的「后端」。因此测试的重点不是 HTTP 契约，而是**真实链语义 + 用户可见行为**。

现状（2026-11-27）：

- 单元/组件测试 1082 条（`pnpm test`，约 30 秒；2026-11-27 复核收口后）
- e2e 175 条（`pnpm e2e`，约 14–15 分钟）：Playwright + 注入式钱包 stub + 本地 anvil（8555）+ 快照/回滚 + Node 侧 `cast` 读链做数值对照
- 链上数值另有「三线校验」文档与脚本

## Decision

1. **Playwright 保留**，不换 Cypress / Synpress / WebdriverIO / Puppeteer。
   - 关键不是浏览器驱动，而是**注入式钱包 stub**：它能演真钱包演不出的场景（慢钱包返回哈希、幽灵哈希、stale nonce、用户撤销、刷新恢复），而这些正是写链 bug 的主要来源。Synpress 那种「自动化真 MetaMask 扩展」在此项目是负收益（慢、依赖扩展版本、CI 难、破坏确定性）。
2. **新增一层「静态一致性守门」**：`src/config/abis/conformance.test.ts` 断言前端 ABI selector ⊆ 已部署产物、地址簿 ⊆ 部署导出、manifest 模块齐全。把「前端与合约接口漂移」从 e2e 级别降到 `pnpm test` 级别（2026-11-27 `launchToken(bytes[]→bytes)` 这个**函数**改了签名，当时只能靠跑一次全量 e2e——14–15 分钟，加排障更久——才发现，就是缺这一层）。
3. **新增纯函数属性/边界测试**：金额解析、精度截断、滑点、批量合计、回执差额用固定种子 LCG 做确定性伪随机（**不引入 fast-check**，遵守「不加依赖」）。
   - 检出能力：**没有引入变异测试框架**（会加依赖，且不动 `package.json`），只在 P0 回归与 ABI 守门上做了手工反向验证（撤掉修复 / 注入过期 selector 会红）。不要把「属性测试」当成检出能力的证明——`applySlippageDown` 一类断言用的 oracle 就是实现公式本身。
4. **e2e 优化方向是「让 e2e 少跑/跑得快」，不是换个工具**：
   - ~~进程内 viem 替代 13 个 `cast` 子进程 helper~~（2026-11-27 剖面后**不做**：174 次 spawn 全部换掉只省 ~3 秒，见 [lead-playbook §0.2](../engineering/lead-playbook.md)；可维护性收益不足以动一个正常工作的 helper）；
   - 链健康守卫（anvil wedge 时快速失败并给出可执行修复命令）；
   - 挖矿模式全局兜底（单个用例失败不得把整轮拖成收据超时）；
   - 先做**耗时剖面**再谈优化；改 `SUITE_MINING` 或开并行链属语义级变更，需 owner 批准。
5. **不做全量视觉回归**（维护成本 > 收益）；只在 4-6 个稳定页面用 Playwright 自带 `toHaveScreenshot`，且可选。**本轮未落地**（optional；要做时先挑稳定页，否则基线自身会 flake）。

## Consequences

- 「跑一遍全量才知道接口漂移」变成「`pnpm test` 1 秒发现」。
- e2e 只负责它不可替代的部分：真实链写入、钱包交互、跨页流程、用户可见文案。
- 测试分层的取舍被固定下来，后续 agent 不必每次重新论证工具选型。
