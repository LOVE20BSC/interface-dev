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

环境：`make -C ../anvil bootstrap PORT=8586`（31337、interval 1s、Hub 已包含）+ `VITE_ENV=dev VITE_ANVIL_RPC=http://127.0.0.1:8586 vite --port 5186`；Playwright node 直跑（脚本 `/tmp/qa-liquidity/`），截图 `/tmp/qa-liquidity-*.png`；8545 全程未碰。

踩坑 1（重要，影响结论可信度）：并行 agent 保存 `src/**` 会触发 Vite 全量热重载，把表单状态清空。首轮因此在「回执关闭后」看到输入框被清空、授权后主按钮不解锁，差点误判成产品缺陷。做法：把工作区 `rsync` 成冻结快照 `/tmp/qa-liquidity/repo/`（`node_modules` 软链）再起 dev server；冻结后同一操作可稳定复现，假象消失。**其它 QA 若共用 dev server 也要注意这一点。**

踩坑 2：页面所有链读都经 Multicall3 `aggregate3` 批处理（`0xcA11…CA11`，selector `0x82ad56cb`），所以 `page.route` 按单条 `eth_call` 的 `to/data` 匹配不到 Hub 报价；改为在 8586 前挂 RPC 代理（`/tmp/qa-liquidity/rpc-proxy.mjs`），解码 `aggregate3` 后只把 `quoteLpWithNative` 子调用改写成 `allowFailure` 的失败调用，才复现出「Hub 报价失败降级」。慢 RPC 同样走该代理。

关键代码定位：D1 根因在 `use-liquidity-transaction.ts:126`（`setApprovedKeyValue(approveKey(...))` 对同一 token+spender 第二次不再变化）+ `add-liquidity-panel.tsx:209-214` / `my-liquidity-panel.tsx:107-112`（只监听 `approvedKey` 变化才 refetch）；D2 在 `add-liquidity-panel.tsx:221-231` 与 `my-liquidity-panel.tsx:120-132` 的 `canSubmit` 未包含 `customSlippageError`；D3 在 `add-liquidity-panel.tsx:123-129`（`hubReady` 用 `pool.hasLiquidity`，加载中也是 false）；D4/D5 在 `liquidity-page.tsx:105`（`customToken ?? communityToken ?? communityTokens[0]`，自定义代币没有在 symbol 变化时清空）。

复现矩阵 30 条，其中 4 组「移动端 390×844 / 桌面 1280×800 × 浅色/深色」共 12 张验收截图；原始输出在 `/tmp/qa-liquidity/scenario-*.log`。

## Conclusion

产出 `docs/product/reviews/liquidity.md`：30 条场景矩阵（PASS 20 / FAIL 10）→ **10 条已验证缺陷：P1 1 条、P2 4 条、P3 5 条**；另有 2 条「怀疑未复现/未覆盖」（Hub 缺失降级、错误网络），原因写在报告第三节。

最严重 3 条：
1. **P1 D1 授权额度用尽后再次授权，主按钮永久禁用**（加池/撤出都中；链上 allowance 已够、页面仍显示「授权」；只能刷新页面）。连续两笔场景直接不可用。
2. **P2 D2 自定义「最多可接受的价格变化」非法时不阻断提交**，弹层外无错误、标签回旧值 0.5%，交易按 0.5% 最少额提交（与三线 §3 用例 F「主按钮全程 disabled」相反）。
3. **P2 D5 选过「换个代币地址」后社区切换不跟随**（URL 已切、页面仍是自定义代币池），且没有清除入口。

未修产品代码、未 `git add`/`commit`；`docs/product/reviews/liquidity.md` 是唯一新增文件（另写入本 worklog）。验证链与 dev server 已停。

## Execution Log

<!-- Maintained by the script: appended by new / claim / set / release / log / close. Do not edit.
     Backfill with: progress log --id 20261114-1054-0da9-qa-review-流动性池-逐场景复现并出缺陷清单 --note "...". -->
- 2026-11-14 10:54:54 · new · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d · created
- 2026-11-14 10:56:05 · claim · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d · claimed → doing
