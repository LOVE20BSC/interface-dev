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

### 环境与基线

- 基线 `main` @ `c6be3a9`。复现期间并行 agent 正在改 swap 及其共享模块（`shared/ui/token-picker.tsx`、`shared/config/copy-pages.ts`、`shared/lib/tx-watch.ts`、`shared/model/use-tx-watch.ts`），这些恰好被 `/transfer` 消费；为保证观测稳定可复算，用 `git archive HEAD` 把基线源码冻结到 `/tmp/qa-transfer-tree`（`node_modules` 软链 + 独立 vite `cacheDir=/tmp/qa-transfer-tree/.vite-cache`），dev server 从冻结树起。
- 验证链：`export PATH=...; make -C ../anvil bootstrap PORT=8584`（clean bootstrap，chain 31337，interval mining 1s；bootstrap 结束 ALL CHECKS PASSED）。**8545 人工链全程未触碰**（所有 RPC 只打 8584）。
- dev server（不 build、不抢 dist）：`VITE_ENV=dev VITE_ANVIL_RPC=http://127.0.0.1:8584 VITE_TX_DEADLINE_MS=10000 node node_modules/vite/bin/vite.js --config vite.qa.config.ts --port 5190`（`VITE_TX_DEADLINE_MS=10000` 只为让 `tx-watch` 恢复卡在用例内可达，生产默认 90s 不变）。
- Playwright 用 `node` 直跑 `/tmp/qa-transfer/*.mjs`（chromium + 注入 EIP-1193 stub wallet；读走页面 HTTP transport、写走 `eth_sendTransaction`；stub 可配 3.5s 慢签名 / 4001 取消 / 永不返回 / 返回链上不存在的哈希 / 只第一笔假哈希）。每个场景独立 context；整轮套件前后 `anvil_snapshot`/`anvil_revert`（每轮 `[chain] snapshot 0x…` / `reverted 0x…`）。
- 额外环境构造：① 为覆盖 6 位精度与自定义 ERC20 成功路径，在 8584 部署测试代币 `QAUSD`（`0x70e0…fc49`，symbol=QAUSD、decimals=6、1000 枚给 anvil #1）；② 「地址簿未配置」用冻结树副本把 `src/config/deployments/anvil31337_dev.json` 的 24 个地址全置零（只在 /tmp 副本里，未动仓库），另起 5194 dev server。
- 排查记录（坑）：活动工作区 dev server 首轮曾把「不存在的身份 NFT 编号 #9999」显示成「这个身份 NFT 暂时查不到，网络可能不稳。」；换到冻结树 + 独立 vite cache 后不复现（活动 dev server 的优化依赖缓存混入了两套 viem/react，`instanceof BaseError` 判定失效）。**未计入缺陷**，报告「补充说明 1」有记录。

### 跑了哪些场景

61 个场景（主套件 59 + 地址簿空部署 N1 + 慢 RPC 身份门禁 G1），每个场景一个独立 browser context，断言原始数据 `/tmp/qa-transfer/results.json`：

- 入口/网络：未连接、错误网络（首屏）、已连接后 `chainChanged` 切错网、深链无 `?symbol=`、地址簿全空降级（N1）。
- 代币：默认原生币与余额行规则、选择器分组顺序、社区 TestLOVE20 / TestWETH / LP UNI-V2、自定义 6 位 QAUSD、自定义 EOA / 非法地址 / 读不到 metadata、搜索（无结果/精确/关闭清空）、切代币后金额残留 + 6 位截断。
- 收款方：地址非法/零/自己；已知合约 pair 强制勾选 + 换收款方清勾选；任意合约只警告；ID 模式 `#2`/`2`、非法输入、自己的 #1、不存在 #9999；名字模式（大小写变体/不存在/自己）；模式切换残留（R11）；慢 RPC 名字未到即开门禁（G1）；纯数字名字（BLOCKED，R12）。
- 金额：空/0/负数/非数字/千分位/全角/空格、余额不足（ERC20 差 1 / 原生差 0.001）、18 位与 6 位超精度截断、全部（ERC20 满额 / 原生留 0.001）、余额 0 点全部。
- 提交：正常一笔、连续两笔、双击、慢钱包 3.5s、取消签名、刷新后首笔、**提交后立刻刷新**（D1）、假哈希丢失恢复卡 + 主按钮死点 + 重新提交（D2）、回执关闭后再操作、回执关闭后刷新（D4）、防重入、链上回滚（原生转给无 receive 的合约）。
- 复制/响应式/边界：回执收款地址与哈希复制（剪贴板逐字）、身份 owner 复制、剪贴板不可用降级；390×844 浅/深（代币 sheet、回执 sheet、ESC 关闭落成功条）、360 宽、1280×800 深色；余额读取失败（D3，X1）、外部抢跑（X2）、钱包挂起（X5）、切换账户（X6）。

### 结果

- 场景 61：60 个场景期望成立、1 个 BLOCKED（R12）。
- 缺陷 7 条：**P1 ×2（D1、D2）· P2 ×2（D3、D4）· P3 ×3（D5、D6、D7）**。
- 报告：`docs/product/reviews/transfer.md`（含每条缺陷的最小复现步骤、一句话修复方向、场景矩阵与卡点）；截图 63 张 `/tmp/qa-transfer-*.png`；断言原始数据 `/tmp/qa-transfer/results.json`。
- 复跑命令：`cd /tmp/qa-transfer && node run.mjs`（需 5190 dev server + 8584 链）；`node run-gate.mjs`（G1）；`QA_BASE=http://127.0.0.1:5194 node run-noaddr.mjs`（N1）。
- 收尾：`make -C ../anvil stop PORT=8584`；关闭 5190/5194 dev server。

## Conclusion

已完成 `/transfer` 的独立 QA（只复现出清单，未改产品代码、未 commit）。

- **场景覆盖**：61 个场景（未连接/错误网络/链切换/地址簿空降级、5 类代币与自定义校验、收款方三模式全错误态与切换残留、金额全门禁与两种全部、提交 12 条含刷新/慢钱包/取消/双击/回执关闭后再操作/链上回滚、复制 4 条、移动端/桌面/浅深色/360 宽、余额读取失败/外部抢跑/挂起/切账户）。60 通过、1 BLOCKED。
- **缺陷 7 条**：P1 2 · P2 2 · P3 3。最严重 3 条：
  1. **D1（P1）提交后刷新丢失在途交易且可重复提交 → 实测双转账**：pending 状态只存组件内存；`F5` 后页面空白、无任何提示，再提交同一笔 → 收款方实测 +2 倍，UI 只显示一笔回执（证据 `/tmp/qa-transfer-S7-*.png`、`recipientDelta=2000000000000000000 wei`）。修复方向：按 `cache.ts` 落盘 `{hash, request}` 与最近回执（对齐 mint/swap）。
  2. **D2（P1）恢复卡出现后主按钮可点但静默无效**：stuck 时 `stage='idle'` 使 `canSubmit=true`，而 `submit()` 因 `pending !== null` 直接 return，点击零反馈（`sendCount` 不变）；只有恢复卡里的「重新提交」有效。修复方向：stuck 时主按钮接 `resubmit()` 或禁用并引导。
  3. **D3（P2）余额读取失败仍可提交**：余额行「余额暂时读不到」但主按钮可点，无「余额未知」提示（`X1`）。修复方向：把余额已读到纳入 `canSubmit` 或换文案 + 重试入口。
- 其余：D4（P2）刷新后已完成回执/成功条/hash 全丢；D5（P3）余额 0 时「全部」可点并产生「金额必须大于 0。」；D6（P3）ID/名字两模式共享输入，切名字模式残留 `#2` 被当名字查；D7（P3）慢 RPC 下链上规范名未到即可勾选提交。
- **未复现/卡点**：R12 纯数字身份 NFT 名字（dev 名称必须以 `Test` 开头，无法注册纯数字名字，BLOCKED）；自定义代币「错误 decimals」（未部署异常 decimals 合约，未覆盖）；钱包 Promise 永不 settle 与成功条不随新操作隐藏记为观察。
- 遗留：无（未改产品代码）；验证链与 dev server 已停。报告 `docs/product/reviews/transfer.md`。

## Execution Log

<!-- Maintained by the script: appended by new / claim / set / release / log / close. Do not edit.
     Backfill with: progress log --id 20261114-1054-6bd1-qa-review-代币转账-逐场景复现并出缺陷清单 --note "...". -->
- 2026-11-14 10:54:54 · new · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d · created
- 2026-11-14 10:56:05 · claim · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d · claimed → doing
