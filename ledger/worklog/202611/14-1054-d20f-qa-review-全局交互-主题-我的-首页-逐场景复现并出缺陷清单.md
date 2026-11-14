# 20261114-1054-d20f-qa-review-全局交互-主题-我的-首页-逐场景复现并出缺陷清单: QA review·全局交互/主题/我的/首页（逐场景复现并出缺陷清单）

- **Tags**: QA, 全局, 主题
- **Status**: doing · 2026-11-14 10:56:06 · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d
- **Created**: 2026-11-14 10:54:54 · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d

<!-- Header lines are maintained by the script, fixed order: Tags → Status → Created → Sealed.
     The `- **Tags**: …` line is inserted at the top by new --tags; omitted when there are no tags
     (category goes to the ledger and history only, never into this document).
     The `- **Sealed**: …` line is appended on close. -->

## Background

owner 2026-11-14：要求「派 agent 先每个页面/模块单独 review」。本任务是**全局交互 + 主题 + 我的 + 首页 + 应用目录**的独立 QA（不重复各业务页内部逻辑）。

范围：`src/app/**`（shell/header/nav/router）、`src/widgets/**`、`src/pages/{home,apps,me,theme,about}/**`、`src/shared/config/copy*.ts`、`shared/ui/*`（按钮/回执/sheet/地址复制/身份输入）。

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
- 顶部：字标（未连接时显示/连接后隐藏）、连接按钮状态、社区切换（symbol 精确/前缀/不存在/清空回到最近访问）、钱包菜单（身份行、地址复制、断开连接）；
- 主题：浅/深切换即时生效、刷新不闪、`theme-color`、深色下各页对比度与层级、系统是否被误跟随；
- 我的：身份 NFT 卡片已移除、余额/账户/关于三块、无空块；
- 首页：未连接/无身份/未选身份/空投资格四种提醒、问候语、无底部多余链接；
- 应用目录：9 个条目（含禁用态原因）、分类分组、图标；
- 全局：按钮不再吸底、先决按钮顺序、回执只有一个「知道了」按钮、离开再回来不重弹回执、所有地址可复制、转账/转让无「不能撤回」提示；
- 关于页：地址/数据两个 tab、地址复制、explorer 链接（无 explorer 时不显示）；
- 深链接/刷新/404、键盘 Tab 焦点可见、移动端 390×844 与桌面 1280×800、浅色/深色。
验证链：`make -C ../anvil bootstrap PORT=8588`，dev server `VITE_ENV=dev VITE_ANVIL_RPC=http://127.0.0.1:8588 pnpm dev --port 5188`。

## Next

先读上述路径与 `e2e/{smoke,apps,home-reminders,theme-colors,global-actions-screens,community-switch}.spec.ts`，再按矩阵复现，写 `docs/product/reviews/global.md`。

## Process

<!-- Pitfalls and evidence: with revision + file:line or symbol names -->

## Conclusion

<!-- What got done, what got left behind -->

## Execution Log

<!-- Maintained by the script: appended by new / claim / set / release / log / close. Do not edit.
     Backfill with: progress log --id 20261114-1054-d20f-qa-review-全局交互-主题-我的-首页-逐场景复现并出缺陷清单 --note "...". -->
- 2026-11-14 10:54:54 · new · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d · created
- 2026-11-14 10:56:06 · claim · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d · claimed → doing
