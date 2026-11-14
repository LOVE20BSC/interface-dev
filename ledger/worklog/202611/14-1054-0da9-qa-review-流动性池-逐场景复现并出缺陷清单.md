# 20261114-1054-0da9-qa-review-流动性池-逐场景复现并出缺陷清单: QA review·流动性池（逐场景复现并出缺陷清单）

- **Tags**: QA, 流动性池
- **Status**: doing · 2026-11-14 10:56:05 · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d
- **Created**: 2026-11-14 10:54:54 · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d

<!-- Header lines are maintained by the script, fixed order: Tags → Status → Created → Sealed.
     The `- **Tags**: …` line is inserted at the top by new --tags; omitted when there are no tags
     (category goes to the ledger and history only, never into this document).
     The `- **Sealed**: …` line is appended on close. -->

## Background

owner 2026-11-14：要求「派 agent 先每个页面/模块单独 review」。本任务是 `/liquidity` 的独立 QA。

范围：`src/pages/liquidity/**`、`src/features/liquidity-pool/**`、`shared/ui/{copyable-address,token-picker}.tsx`、`docs/product/three-line/liquidity.md`。

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
- 添加：智能模式开（只填一侧 / 两侧都填 / 两侧比例不匹配时的行为）、智能模式关（一侧自动补另一侧、改只读侧的交互）、空池首次建池、Hub 缺失降级 Router、滑点与 deadline、授权步骤（额度不足/足够/长期授权）、实时报价（预计凭证）与详情展开；
- 我的流动性：LP 数量输入与 25/50/75/100% 快捷、超出持仓、撤出 0、LP 授权、撤出后份额归零与空态；
- 社区查询：无池代币、自定义代币地址、pair 地址复制、双向价格切换、深池/浅池数值边界；
- 事务：慢钱包（3–8 秒）、用户取消签名、双击、回执关闭后再操作、刷新后首笔、连续两笔；
- 移动端/桌面、浅色/深色、右上角社区切换后页面是否跟随。
验证链：`make -C ../anvil bootstrap PORT=8586`（Hub/BatchTransfer 已包含），dev server `VITE_ENV=dev VITE_ANVIL_RPC=http://127.0.0.1:8586 pnpm dev --port 5186`。

## Next

先读上述路径与 `e2e/liquidity-numbers.spec.ts`（避免重复报已知项），再按矩阵复现，写 `docs/product/reviews/liquidity.md`。

## Process

<!-- Pitfalls and evidence: with revision + file:line or symbol names -->

## Conclusion

<!-- What got done, what got left behind -->

## Execution Log

<!-- Maintained by the script: appended by new / claim / set / release / log / close. Do not edit.
     Backfill with: progress log --id 20261114-1054-0da9-qa-review-流动性池-逐场景复现并出缺陷清单 --note "...". -->
- 2026-11-14 10:54:54 · new · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d · created
- 2026-11-14 10:56:05 · claim · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d · claimed → doing
