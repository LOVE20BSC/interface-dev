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

- 基线 `main` @ `c6be3a9`；review 范围内 `src/pages/approvals/**`、`src/features/approve-token/**`、`shared/ui/copyable-address.tsx`、`shared/lib/approval-kind.ts` 复现期间 `git status` 为空（工作区脏的是并行 agent 的 swap/token-picker/copy-pages/use-tx-watch 改动）。
- 环境：`make -C ../anvil bootstrap PORT=8587`（clean bootstrap，interval mining 1s）；dev server `VITE_ENV=dev VITE_ANVIL_RPC=http://127.0.0.1:8587 pnpm dev --port 5193`。**5187 被另一个 QA agent 的 vite 占用**（其 `VITE_ANVIL_RPC` 也指向 8587），我的 5187 进程被 SIGTERM；同链 `anvil_snapshot`/`anvil_revert` 会被跨会话回滚，故链状态相关断言全部单会话隔离复跑。8545 未触碰。
- 复现方式：`/tmp/qa-approvals/*.mjs`（Playwright `node` 直跑，注入 EIP-1193 wallet stub，支持延迟/拒绝/双击/慢 RPC/RPC 断网/错误 chainId）。共 46 条断言 + 8 张深浅色×移动/桌面截图。
- 通过：页面顺序 ①→④、列表 10 行全展开无折叠、地址点击复制逐字（剪贴板/title/2s 反馈）、无「推荐」、三态额度与 `2^255` 阈值、`< 0.000001` 最小可见、`已长期授权` 禁用、撤销归零、长期授权后刷新保持、默认长期授权开关刷新保持且只改按钮强调（`secondary`→`outline`）、自定义 spender 全分支、代币切换（社区/TestWETH/UNI-V2/自定义/余额 0）、慢钱包等待态、双击只发一笔、回执关闭后再操作、刷新后首笔、未连接/错误网络/慢 RPC、390×844 无横向溢出、浅/深色截图。
- 失败/缺陷（详见 `docs/product/reviews/approvals.md`）：
  - D1 P2 默认代币错：首次进入/刷新后默认选中 TestWETH（余额 0），而非社区代币 TestLOVE20。根因 `approval-panel.tsx` L129-138 fallback effect 在社区代币目录未就绪时先取 wrapped 并锁定。6/6 稳定复现。
  - D2 P2 取消签名无可见反馈：弹层保持打开且无提示，`role=alert` 错误条被弹层遮挡（几何 + 截图证实），关闭弹层后才看得到；取消后重试可成功。
  - D3 P2 RPC 不可用误导：整页 RPC abort 20s 后余额仍「读取余额中…」、列表块显示「还没有可以查看的代币」，无网络错误/重试；恢复网络需手动刷新。
  - D4 P3 自定义代币重复：添加内置 TestWETH 地址后选择器出现两个同名 TestWETH（内置+自定义），且两者 `data-testid` 相同。
- 抖动（非产品缺陷）：S3.5 慢钱包与 S3.6 双击提交在整批运行时被并行 agent 的 HMR 重载打断；隔离单跑通过，证据 `/tmp/qa-approvals-slow-wallet-waiting.png`、`diag-slow-wallet-after`。

## Conclusion

- 产出 `docs/product/reviews/approvals.md`：46 条场景矩阵（期望/实际/级别/证据，每条缺陷含最小复现步骤 + 一句话修复方向），区分「已验证缺陷」与「怀疑未复现/未覆盖」。
- 统计：46 条断言，42 通过，4 失败 → 4 条缺陷（P0 0 / P1 0 / P2 3 / P3 1）。
- 最严重 3 条：D1 默认代币选中 TestWETH（P2）、D2 取消签名后无可见反馈（P2）、D3 RPC 不可用被误报成「还没有可以查看的代币」且永久读取中（P2）。
- 未覆盖：页面内热切换账户（stub 无 `accountsChanged`）、移动端 TokenPicker 搜索/分页逐项交互。未改产品代码、未 git add/commit；临时脚本与截图留在 `/tmp/qa-approvals*`。

## Execution Log

<!-- Maintained by the script: appended by new / claim / set / release / log / close. Do not edit.
     Backfill with: progress log --id 20261114-1054-cd4a-qa-review-代币授权-逐场景复现并出缺陷清单 --note "...". -->
- 2026-11-14 10:54:54 · new · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d · created
- 2026-11-14 10:56:06 · claim · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d · claimed → doing
