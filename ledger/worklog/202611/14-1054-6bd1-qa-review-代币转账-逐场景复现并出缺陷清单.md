# 20261114-1054-6bd1-qa-review-代币转账-逐场景复现并出缺陷清单: QA review·代币转账（逐场景复现并出缺陷清单）

- **Tags**: QA, 代币转账
- **Status**: doing · 2026-11-14 10:56:05 · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d
- **Created**: 2026-11-14 10:54:54 · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d

<!-- Header lines are maintained by the script, fixed order: Tags → Status → Created → Sealed.
     The `- **Tags**: …` line is inserted at the top by new --tags; omitted when there are no tags
     (category goes to the ledger and history only, never into this document).
     The `- **Sealed**: …` line is appended on close. -->

## Background

owner 2026-11-14：要求「派 agent 先每个页面/模块单独 review」，并已实测出兑换页 4 个缺陷。本任务是 `/transfer` 的独立 QA。

范围：`src/pages/transfer/**`、`src/features/transfer-token/**`、共享的 `shared/ui/{copyable-address,identity-input-mode,identity-recipient-card}.tsx`、`shared/lib/{tx-watch,identity-input,format}.ts`。

通用纪律
- 环境 PATH：`export PATH="/Users/BigPolarBear/.foundry/bin:/Users/BigPolarBear/.nvm/versions/node/v24.12.0/bin:/Users/BigPolarBear/Library/pnpm/bin:$PATH"`。
- **8545 人工链绝对不能碰**；每任务用自己的验证链端口与 preview 端口（见任务正文），用完 `make -C ../anvil stop PORT=xxxx`。
- 不 `git reset/checkout/stash/clean`，不 `git add -A`；**不要 git commit**（多 agent 共用 index 出过事故），改动留工作区由 Lead 提交；中文文案进 copy。
- 构建/e2e 抢 `/tmp/love20-build-e2e.lock`（mkdir 重试，最多 40 分钟，拿不到就跳过并在报告标注）。
- 不跑 `pnpm format`（只 prettier 自己的文件）；不改 `ledger/pool.json`、`../anvil`、`src/config/deployments/*`、`src/config/abis/*`。
- 完成后在 worklog `## Process`/`## Conclusion` 写证据（命令、输出、截图路径）。

## To Do

你是**独立 QA**，只做「复现 + 出清单」，**不改产品代码、不 commit**。产出：
1. `docs/product/reviews/<module>.md`：场景矩阵（正常/刷新恢复/断网或慢 RPC/钱包延迟/错误网络/未连接/重复点击/回执关闭后再操作/切换账户或链/移动端 390×844/桌面 1280×800/浅色/深色），每个场景给出：期望、实际、严重级别（P0 阻塞/P1 严重/P2 一般/P3 文案或体验）、证据（截图路径 `/tmp/qa-<module>-*.png`、console error、tx hash、DOM 摘录）。
2. 每条缺陷给「最小复现步骤」与「建议修复方向（一句话）」，不要写补丁。
3. 报告里明确区分「**已验证的缺陷**」与「**怀疑但未复现**」，后者注明卡在哪一步。
4. 你自己的 worklog `## Process`/`## Conclusion` 写：跑了哪些场景、多少条缺陷、最严重的 3 条。
场景至少覆盖：
- 未连接 / 错误网络 / 地址簿未配置；
- 代币选择：原生 / 社区代币 / WETH / LP / 自定义 ERC20（非合约地址、错误 decimals、余额 0）；
- 收款方三模式：地址（非法、自己、零地址、已知协议合约、任意合约）、身份 NFT ID（纯数字、不存在的 ID、别人的 ID）、身份 NFT 名字（含数字名字、不存在的名字、大小写）；切换模式时残留输入；
- 金额：全部、留 gas 边界、超余额、0、负数、非法小数、超过 decimals、粘贴带空格/逗号；
- 提交：正常一笔、连续两笔、双击、钱包延迟（人为 3–8 秒）、用户取消签名、回执关闭后再操作、刷新后首笔；
- 移动端/桌面、浅色/深色、复制地址（剪贴板内容对比）。
验证链：`make -C ../anvil bootstrap PORT=8584`，e2e/screenshot 用 `E2E_PORT=4190 E2E_ANVIL_RPC=http://127.0.0.1:8584`。

## Next

先读上述路径与 `e2e/transfer-numbers.spec.ts`（了解现有覆盖，避免重复报已知项），再按场景矩阵逐条复现，最后写 `docs/product/reviews/transfer.md`。

## Process

<!-- Pitfalls and evidence: with revision + file:line or symbol names -->

## Conclusion

<!-- What got done, what got left behind -->

## Execution Log

<!-- Maintained by the script: appended by new / claim / set / release / log / close. Do not edit.
     Backfill with: progress log --id 20261114-1054-6bd1-qa-review-代币转账-逐场景复现并出缺陷清单 --note "...". -->
- 2026-11-14 10:54:54 · new · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d · created
- 2026-11-14 10:56:05 · claim · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d · claimed → doing
