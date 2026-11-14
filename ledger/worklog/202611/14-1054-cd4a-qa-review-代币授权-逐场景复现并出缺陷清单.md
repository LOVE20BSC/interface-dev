# 20261114-1054-cd4a-qa-review-代币授权-逐场景复现并出缺陷清单: QA review·代币授权（逐场景复现并出缺陷清单）

- **Tags**: QA, 代币授权
- **Status**: doing · 2026-11-14 10:56:06 · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d
- **Created**: 2026-11-14 10:54:54 · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d

<!-- Header lines are maintained by the script, fixed order: Tags → Status → Created → Sealed.
     The `- **Tags**: …` line is inserted at the top by new --tags; omitted when there are no tags
     (category goes to the ledger and history only, never into this document).
     The `- **Sealed**: …` line is appended on close. -->

## Background

owner 2026-11-14：要求「派 agent 先每个页面/模块单独 review」。本任务是 `/approvals` 的独立 QA。

范围：`src/pages/approvals/**`、`src/features/approve-token/**`、`shared/ui/copyable-address.tsx`、`shared/lib/approval-kind.ts`、`docs/product/three-line/approvals.md`。

通用纪律
- PATH：`export PATH="/Users/BigPolarBear/.foundry/bin:/Users/BigPolarBear/.nvm/versions/node/v24.12.0/bin:/Users/BigPolarBear/Library/pnpm/bin:$PATH"`。
- **8545 绝对不碰**；用自己的验证链与端口，用完 `make -C ../anvil stop PORT=xxxx`。
- **只 review 不改产品代码、不 commit**（改动留工作区会污染并行修复）；不 `git add`/`commit`/`reset`/`checkout`。
- 前端用 **dev server**（不产 dist，避免和修 bug 的 agent 抢 `dist/`）：`VITE_ENV=dev VITE_ANVIL_RPC=http://127.0.0.1:xxxx pnpm dev --port 51xx`；截图脚本用 `node` 直跑 Playwright（参考 `scripts/theme-screenshots.mjs`）。
- 中文文案进 copy 的规则不适用于你（你不改代码），但报告里的术语要按 `GLOSSARY.md`。
- 产出写进 `docs/product/reviews/<module>.md` 与自己的 worklog，不改其它文档。

## To Do

你是**独立 QA**，只做「复现 + 出清单」，不改产品代码、不 commit。产出：
1. `docs/product/reviews/<module>.md`：场景矩阵（正常/刷新恢复/慢 RPC/钱包延迟/错误网络/未连接/重复点击/回执关闭后再操作/切换账户或链/移动端 390×844/桌面 1280×800/浅色/深色），每条给：期望、实际、严重级别（P0 阻塞/P1 严重/P2 一般/P3 文案或体验）、证据（截图 `/tmp/qa-<module>-*.png`、console error、DOM 摘录、tx hash）。
2. 每条缺陷给「最小复现步骤」+「建议修复方向（一句话）」，不要写补丁。
3. 明确区分「**已验证缺陷**」与「**怀疑未复现**」。
4. worklog `## Process`/`## Conclusion` 写：跑了哪些场景、多少条缺陷、最严重的 3 条。
场景至少覆盖：
- 页面顺序（长期授权开关 → 说明 → 自定义地址 → 合约列表）、列表全展开、每行地址点击复制（剪贴板逐字）、无「推荐」；
- 三态额度：未授权 / 具体额度 / 长期授权；「已长期授权」按钮文案与禁用；撤销（approve 0）后回到未授权；长期授权后刷新；
- 默认长期授权开关：切换后刷新是否保持、是否影响本页按钮；
- 自定义地址：EOA、零地址、非法地址、有额度/无额度、授权/撤销；
- 代币选择：社区代币/WETH/LP/自定义 ERC20、余额 0、非法地址；
- 慢钱包、用户取消签名、双击、回执关闭后再操作、刷新后首笔；
- 移动端/桌面、浅色/深色。
验证链：`make -C ../anvil bootstrap PORT=8587`，dev server `VITE_ENV=dev VITE_ANVIL_RPC=http://127.0.0.1:8587 pnpm dev --port 5187`。

## Next

先读上述路径与 `e2e/approvals-numbers.spec.ts`，再按矩阵复现，写 `docs/product/reviews/approvals.md`。

## Process

<!-- Pitfalls and evidence: with revision + file:line or symbol names -->

## Conclusion

<!-- What got done, what got left behind -->

## Execution Log

<!-- Maintained by the script: appended by new / claim / set / release / log / close. Do not edit.
     Backfill with: progress log --id 20261114-1054-cd4a-qa-review-代币授权-逐场景复现并出缺陷清单 --note "...". -->
- 2026-11-14 10:54:54 · new · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d · created
- 2026-11-14 10:56:06 · claim · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d · claimed → doing
