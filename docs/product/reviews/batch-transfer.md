# 批量转账（`/batch-transfer`）独立 QA · 场景矩阵与缺陷清单

> 任务：`ledger/worklog/202611/14-1054-2082-qa-review-批量转账-逐场景复现并出缺陷清单.md`
> 角色：独立 QA（只复现 + 出清单，不改产品代码、不 `git add/commit`）。
> 基线：`main` @ `7199750`（复现从 `c6be3a9` 开始，期间 Lead 只提交了台账；本轮 review 范围内 `src/pages/batch-transfer/**`、`src/features/batch-transfer/**`、`scripts/verify/batch-transfer-contract.mjs`、`docs/product/three-line/batch-transfer.md` 全程 `git status` 为空，源文件指纹 `d3ac022e4a8a13db77915bdbcfcd1e0a377745b1`；工作区另有并行 agent 对 swap / `shared/ui/token-picker.tsx` / `shared/lib/tx-watch.ts` / `shared/config/copy-pages.ts` 的改动，其中 copy-pages 对 batch 文案只有格式化，语义逐字未变）。
> 环境：验证链 `make -C ../anvil bootstrap PORT=8585`（clean bootstrap，chain 31337，interval mining 1s，块 0 起）；**dev server**（非 build）`VITE_ENV=dev VITE_ANVIL_RPC=http://127.0.0.1:8585 pnpm dev --port 5191`；Playwright 用 `node` 直跑 `/tmp/qa-batch/*.mjs`（`@playwright/test` 的 chromium，注入 EIP-1193 stub wallet，读走页面 HTTP transport、写走 `eth_sendTransaction`，模式同 `e2e/wallet-stub.ts`）；每个脚本前后 `anvil_snapshot`/`anvil_revert` 隔离链状态。**8545 全程未触碰**（本机 8545 上另有人工链在跑，所有 RPC 只打 8585）。
> 用例来源：本文档与 `docs/product/three-line/batch-transfer.md` §0–§4 的页面契约、`e2e/batch-transfer-numbers.spec.ts` 已覆盖的数值；本节独立复现，不引用 e2e 的运行结果。
> 证据约定：截图 `/tmp/qa-batch-*.png`；断言原始数据 `/tmp/qa-batch-results/*.json`（`01-parse`、`02-native-flow`、`03-erc20-approve`、`04-degraded`、`05-responsive`、`06-parser-and-reads`、`07-reads-and-doubleclick`、`08-tiny-proof`、`09-paste100`、`10-details`、`11-copy`）；chain id / tx hash / wei 数值直接来自 8585 的 `eth_getBalance`、`eth_getTransactionReceipt`、`eth_call`。

## 结论摘要

| 项 | 值 |
| --- | --- |
| 场景断言数 | **86** 条（含 8 组移动端/桌面 × 浅色/深色截图矩阵） |
| 通过 | **74** 条 |
| 失败 | **12** 条断言，归并为 **11 条缺陷** |
| 缺陷级别 | **P0：0 · P1：0 · P2：3 · P3：8** |
| 最严重 3 条 | D1 余额读取失败时回执仍断言「上表每一行都已到账」，逐行差额全是「—」（P2）· D2 额度读取失败时同屏出现「额度暂时读不到」与「额度已足够，不需要再次授权」（P2）· D3 小于 0.000001 的金额全链路显示 0，但链上确实转出（P2） |

**页面核心契约通过**：重复地址不合并、逐行标「与第 N 行重复」并**阻止提交**，删行后恢复；1/5/25/100 行清单与粘贴 100 行（CRLF，4899 字符）解析一致；逗号/空格/Tab/行尾空格/行尾逗号/CRLF 全部可用；金额 0/负数/非法/超精度/千分位的拦截与文案（千分位文案见 D4）；授权阶梯 approve → 重读额度 → 批量转账、授权后**刷新**再提交、长期授权文案、批量后 allowance 归零；原生/ERC20 逐行到账差额与链上 wei 完全一致；整批原子失败（合约收款方拒收）错误文案正确、无回执、无「部分成功」、余额不变；慢钱包 6s / 双击 / 取消签名 / 回执关闭后再操作 / 刷新后首笔 / 切换账户（收款方变自己）/ 错误网络 / 未连接；移动端 390×844 与桌面 1280×800 无横向溢出，浅色/深色均可读。

---

## 一、已验证缺陷（可复现）

### D1 · P2 · 余额读取失败时，回执仍然断言「上表每一行都已到账」，而逐行差额全是「—」

- **期望**：预余额或到账后余额读不到时，回执要么给出「这一行核对不到，请自行在区块浏览器确认」的**否定/待确认**结论，要么不渲染「整批一起执行：上表每一行都已到账。」（`docs/product/three-line/batch-transfer.md` §0 承诺「交易确认后重读同一批地址，逐行显示差额」；页面复制文案也承诺「下表每一行的差额都来自链上余额的重新读取」）。
- **实际**：
  1. **预余额读取失败**（三个收款方的 `nativeBalances` 读失败，表格三行均为 `—`、页脚有「收款方余额暂时读不到，提交后仍会逐行核对到账差额。」）时，主按钮仍可点；提交成功后回执每一行显示 `— / — → —`，下方仍写「整批一起执行：上表每一行都已到账。」——既没有核对数据，也没有说明「未能核对」。
  2. **到账后余额读取失败**（交易成功后重读 `nativeBalances` 失败）时同样：回执 `0.01 ETH`、`—`、`— → —`，结论仍是「上表每一行都已到账」。
  3. 两次实验里交易本身都成功（整批原子成功、回执出现），因此不影响资金，但页面把「没有核对」渲染成了「已逐行核对通过」。
- **最小复现步骤**（预余额场景）：
  1. 8585 clean bootstrap + dev server；打开 `/batch-transfer?symbol=TestLOVE20`，连接 #6（`0x976E…0aa9`，10,000 ETH）；
  2. 输入 2 行 `0x9965…A4dc 0.01` / `0x14dC…9955 0.02`，确认表格显示 `10,000`（读取健康）；
  3. 用 Playwright `page.route` 让发往 `http://127.0.0.1:8585` 的 **Multicall3 `0x82ad56cb`** 读失败（页面读 hook 走 multicall），再追加第 3 行 `0x2361…1E8f 0.03` 触发新查询；
  4. 表格三行变 `—`，出现「收款方余额暂时读不到…」，**主按钮仍可点**；点击提交 → 回执三行 `—`，底部仍写「整批一起执行：上表每一行都已到账。」
- **证据**：`/tmp/qa-batch-04-prebalance-read-failure.png`（表格 `—` + 主按钮可点）、`/tmp/qa-batch-04-receipt-with-missing-before-balances.png`（回执全 `—` 与「每一行都已到账」同屏）、`/tmp/qa-batch-04-receipt-post-read-failure.png`；断言数据 `/tmp/qa-batch-results/04-degraded.json` 中 `preBalanceFailureReceipt.deltas = ["—","—","—"]`、`postReadFailureReceipt.deltas = ["—"]`、两者 `atomicNote = "整批一起执行：上表每一行都已到账。"`；代码路径 `src/features/batch-transfer/ui/batch-receipt.tsx` L20-26（`delta === undefined` → `—`）与 L129-131（静态 `copy.batchTransfer.atomicReceipt`）、`src/features/batch-transfer/lib/batch-audit.ts` L40-56（`unknown` 状态未被回执使用）。
- **一句话修复方向**：回执根据 `BatchAuditStatus` 汇总渲染结论——存在 `unknown` 行时把「上表每一行都已到账」换成「有 N 行余额读取失败，未能核对到账，请到区块浏览器确认」，并说明差额不可用原因。

### D2 · P2 · 额度读取失败时，同一提示块同时显示「批量转账额度暂时读不到」和「额度已足够，不需要再次授权」

- **期望**：额度读不到时只给出「读不到 + 重试/刷新」的单一结论；不能同时断言额度足够，也不能在 CTA 已禁用的状态下给出「不需要再次授权」的肯定句。
- **实际**：ERC20 模式下让额度读失败后，灰色额度块第一行是 `批量转账额度暂时读不到`，紧接着第二行是 **`额度已足够，不需要再次授权。`**；主按钮「批量转账」被禁用。两句互相矛盾，且没有「重试」按钮。
- **最小复现步骤**：
  1. 8585 链，dev server；`/batch-transfer?symbol=TestLOVE20` 连接 #1（`0xf39F…2266`）；
  2. 点「代币」进入 ERC20 模式，等额度行显示 `已允许批量转账合约使用 0 / 本次需要 0 TestLOVE20`；
  3. 让 8585 的 Multicall3 `0x82ad56cb` 读失败并刷新页面，再进「代币」模式并输入 `0x9965…A4dc 0.25`；
  4. 读额度块：两行文案同时出现，CTA 禁用。
- **证据**：`/tmp/qa-batch-07-allowance-read-failure.png`（两行文案同屏）；`/tmp/qa-batch-results/07-reads-and-doubleclick.json` 中 `allowanceReadFailure.allowance = "批量转账额度暂时读不到"`、`disabled = true`、`retryButtons = 0`；代码路径 `src/features/batch-transfer/ui/batch-transfer-panel.tsx` L599-621：`allowance.value === undefined` 时第一行用 `allowanceError`，而第二行的判定是 `parse.total > 0n ? (needsApproval ? allowanceNeed : allowanceReady) : null`，`needsApproval` 在 `allowance.value === undefined` 时为 `false`，于是渲染 `allowanceReady`「额度已足够，不需要再次授权。」（copy 见 `shared/config/copy-pages.ts` L651-652）。
- **一句话修复方向**：第二行加 `allowance.value === undefined` 的第三态（不渲染或渲染「额度读不到，无法判断是否需要授权」），只在额度已知时才给「已足够 / 需要授权」。

### D3 · P2 · 小于 0.000001 的金额全链路显示 0（合计 0 / 行金额 0 / 回执 `0 → 0`、`+0`），链上实际已转出

- **期望**：只要 `parse.total > 0n` 且主按钮可点，页面就不该把金额、差额、到账前后显示成 `0`；至少回执差额应显示 `<0.000001` 或按需要临时提高精度，否则用户看到的是「什么都没转」。
- **实际**：原生 2 行 `0.0000001` / `0.0000002`：
  - 收款清单合计 `合计 0 ETH`，行金额 `0 ETH`，当前余额 `0`（正确）；
  - 主按钮**可点**，交易真实发送并上链；
  - 回执合计 `0 ETH`，逐行 `+0`、`0 → 0`、`—`，仍写「上表每一行都已到账」；
  - 链上核对：两个收款地址分别从 `0` → `100000000000` / `200000000000` wei（即 1e-7 / 2e-7 ETH），**确实到账**。
  - 3 行 `0.0000001` 的版本同样显示 `合计 0 ETH` 并成功上链（`/tmp/qa-batch-05-tiny-amount-receipt.png`）。
- **最小复现步骤**：
  1. `/batch-transfer?symbol=TestLOVE20` 连接 #6；
  2. 输入 `0x0000000000000000000000000000000000002001 0.0000001` 与 `0x0000000000000000000000000000000000002002 0.0000002`；
  3. 观察合计 `0 ETH`，等待预余额读取完成后点「确认批量转账」；
  4. 回执 `0 ETH`、`+0`、`0 → 0`；`cast balance`/`eth_getBalance` 显示 1e11 / 2e11 wei 已到账。
- **证据**：`/tmp/qa-batch-08-tiny-before.png`、`/tmp/qa-batch-08-tiny-receipt.png`、`/tmp/qa-batch-05-tiny-amount-zero-summary.png`；断言 `/tmp/qa-batch-results/08-tiny-proof.json`：`beforeUI.total = "合计 0 ETH"`、`receipt.total = "0 ETH"`、`receipt.deltas = ["+0","+0"]`、`chain.before = {a:"0",b:"0"}`、`chain.after = {a:"100000000000",b:"200000000000"}`、`deltaWei = {a:"100000000000",b:"200000000000"}`；格式化规则 `src/shared/lib/format.ts`（`TOKEN_AMOUNT_MAX_FRACTION_DIGITS = 6`，只截断）。
- **一句话修复方向**：金额/差额显示增加「非零但被截断」分支：`0 < value < 10^-6` 时显示 `<0.000001`（或按 wei 最小单位显示），回执同样处理，避免「转出了 0」的错觉。

### D4 · P3 · 金额写千分位（`1,000` / `2,500.5`）被当成分隔符切开，报「这一行看不懂，需要「地址 金额」」

- **期望**：千分位是常见粘贴格式，应给出可定位的提示（例如「金额不要带千分位逗号」），或直接接受并按数值解析。
- **实际**：`0x9965…A4dc 1,000` 被 `[\s,]+` 切成 3 个 token，整行判 `invalidLine` → 「第 1 行：这一行看不懂，需要「地址 金额」。」同屏两行都这样报，用户无法知道问题出在千分位。
- **最小复现步骤**：原生模式输入 `0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc 1,000`（或 `2,500.5`）→ 看行内错误。
- **证据**：`/tmp/qa-batch-results/01-parse.json` `amountThousands.lineErrors = ["第 1 行：这一行看不懂，需要「地址 金额」。", ...]`；解析实现 `src/features/batch-transfer/lib/batch-parse.ts` L70/L96-102。
- **一句话修复方向**：token 数 > 2 时再尝试识别「地址 + 带千分位数字」并给出专用文案（或剥掉数字中的千分位逗号后再解析）。

### D5 · P3 · 超出精度被截断为 0 的金额只报「金额必须大于 0」，没有说明是精度截断

- **期望**：`0.0000000000000000009`（19 位小数，18 位精度）被截断成 0 时，应提示「已按精度截断，结果为 0」，帮助用户理解为什么「必须大于 0」。
- **实际**：行内只显示「第 1 行：金额必须大于 0。」，没有截断提示（`truncated` 标记只在解析成功时置位）。
- **最小复现步骤**：原生模式输入 `0x9965…A4dc 0.0000000000000000009`。
- **证据**：`/tmp/qa-batch-results/01-parse.json` `amount19Decimals.lineErrors = ["第 1 行：金额必须大于 0。"]`、`truncated = null`；解析实现 `src/features/transfer-token/lib/transfer-amount.ts` L26-41（`value === 0n` 先于 truncated 返回）。
- **一句话修复方向**：`truncated && value === 0n` 单独返回 `truncatedToZero` 原因，文案「小数超过 18 位，按精度截断后为 0」。

### D6 · P3 · 收款方余额/额度读取失败没有「重试」入口；额度恢复后也不自愈，须刷新整页

- **期望**：读取失败属于可恢复错误，页面其它模块（如兑换页）给的是「重新读取/重试」动作；这里应至少有一个重试按钮，网络恢复后自动或一键恢复。
- **实际**：收款方余额读取失败时只有一条说明文字（「收款方余额暂时读不到，提交后仍会逐行核对到账差额。」），没有重试；额度读取失败同样没有重试。实验中把失败注入解除后等待 5s、再把模式在「原生/代币」之间切换一次，额度行仍是「批量转账额度暂时读不到」、CTA 仍禁用，只有整页刷新才恢复。
- **最小复现步骤**：按 D2 步骤制造额度读失败 → 解除注入 → 等 5s → 切模式再切回 → 文案与禁用状态不变；刷新页面才恢复。
- **证据**：`/tmp/qa-batch-results/07-reads-and-doubleclick.json` `allowanceReadFailure.retryButtons = 0`、`allowanceReadFailureRecovery.allowance = "批量转账额度暂时读不到"`、`allowanceRecoveryAfterModeToggle.disabled = true`；`/tmp/qa-batch-results/04-degraded.json` `preBalanceFailure.retryButton = 0`；截图 `/tmp/qa-batch-07-allowance-read-failure.png`、`/tmp/qa-batch-04-prebalance-read-failure.png`。
- **一句话修复方向**：读取失败态渲染「重新读取」按钮（调用 `refetch`），并给 query 设置有限重试/窗口聚焦重取。

### D7 · P3 · 先按「本次合计」授权、再改小清单提交，会残留授权额度且页面不提示

- **期望**：授权额度是按提交时的合计算的；清单被改小后提交，页面应提示「本次只用了 X，链上还剩 Y 的授权，可去代币授权页撤销」（或提交前重新收敛额度）。
- **实际**：UI 先授权 `2.000002 TestLOVE20`，再把清单从 3 行改成 2 行（合计 `2`）提交；批量后链上 `allowance(#1 → BatchTransfer)` 仍为 `2000000000000` wei（`0.000002`），页面额度行变为 `已允许批量转账合约使用 0.000002 / 本次需要 0 TestLOVE20`，无任何残留提示。
- **最小复现步骤**：
  1. ERC20 模式（#1，TestLOVE20）输入 `1.5 / 0.5 / 0.000002` 三行 → 点「授权 TestLOVE20」→ 等 CTA 变「批量转账」；
  2. 删掉第三行（合计变 `2`）→ 直接点「批量转账」→ 回执成功；
  3. `eth_call allowance(#1, 0xc3e5…3690)` = `2000000000000`；页面显示「已允许…0.000002 / 本次需要 0」。
- **证据**：`/tmp/qa-batch-results/03-erc20-approve.json` `residualReceipt.allowanceOnChain = "2000000000000"`、`residualAfterDismiss.allowanceLine = "已允许批量转账合约使用 0.000002 / 本次需要 0 TestLOVE20"`、`approvalsWarningShown = 0`；`/tmp/qa-batch-03-residual-allowance-receipt.png`。
- **一句话修复方向**：批量成功且链上额度仍 > 0 时，成功条/回执追加「链上还保留 Y 的授权，可在代币授权页撤销」。

### D8 · P3 · 发送方余额读取失败时「确认批量转账」仍可点，余额不足拦截被静默跳过

- **期望**：余额读不到时，页面不能给出「够转」的暗示；至少提示「余额读不到，提交后由链上模拟/交易校验」，或禁用主按钮直到余额可读。
- **实际**：余额行显示「余额暂时读不到」，`insufficient` 不渲染，主按钮仍可点。若用户余额确实不足，会在模拟/发送阶段才失败（本环境模拟能兜底，但这是把可前置的拦截交给了后续环节）。
- **最小复现步骤**：原生模式让 Multicall3 读失败 → 页面余额「余额暂时读不到」→ 输入 1 行 → 主按钮可点（`disabled=false`）。
- **证据**：`/tmp/qa-batch-results/07-reads-and-doubleclick.json` `balanceReadFailure = {"balance":"余额暂时读不到","insufficient":0,"submitDisabled":false,...}`；截图 `/tmp/qa-batch-07-balance-read-failure.png`。
- **一句话修复方向**：余额 `undefined` 且合计 > 0 时禁用主按钮并给「余额读不到，暂不能判断是否够转」+ 重试。

### D9 · P3 · 代币模式下代币目录/余额读取失败时，余额标签回落成「ETH 余额 —」（资产标签与模式不一致）

- **期望**：ERC20 模式的余额行要么显示所选代币符号，要么显示「余额暂时读不到」，不应在「代币」模式显示 `ETH 余额`。
- **实际**：让 Multicall3 读失败并进入代币模式后，余额行显示 `ETH 余额 —`（`token` 尚未取到 → `symbol` 回退 `NETWORK.nativeCurrency.symbol`），同时代币选择器是空灰占位。
- **最小复现步骤**：ERC20 模式制造 Multicall3 读失败 → 余额行 `ETH 余额 —`。
- **证据**：`/tmp/qa-batch-07-allowance-read-failure.png`（「代币」模式 + `ETH 余额 —`）。
- **一句话修复方向**：`mode === 'token'` 且 `token === undefined` 时余额行显示「代币余额读不到 / 正在选择代币」，不要回退原生币符号。

### D10 · P3 · 纯 CR（旧 Mac 换行）清单整体报「这一行看不懂」

- **期望**：解析器对 `\r`、`\r\n`、`\n` 三种换行都按行切分（当前 `split(/\r?\n/)` 只处理 `\n` 与 `\r\n`）。
- **实际**：解析器层 `A\rB` 只有 1 行，`\r` 被当作空白分隔符 → 一行 4 个 token → `invalidLine`。UI 层因浏览器把 textarea 值里的 CRLF 归一化为 LF，实际粘贴 `CRLF` 正常（已用真实剪贴板粘贴 100 行 CRLF 验证）；纯 CR 在 Chromium 里无法通过粘贴产生，故这是解析器 defensive 缺口，不阻塞真实用户。
- **最小复现步骤（解析器层）**：dev server 页面内 `await import('/src/features/batch-transfer/lib/batch-parse.ts')` → `parseBatchText('0x9965…A4dc 0.1\r0x14dC…9955 0.2', …)` → `errors=[{line:1,reason:'invalidLine'}]`。
- **证据**：`/tmp/qa-batch-results/06-parser-and-reads.json` `parser.crOnly.errors = [{line:1, reason:"invalidLine"}]`，`parser.crlf.rows.length = 2`；实现 `batch-parse.ts` L89。
- **一句话修复方向**：`text.split(/\r\n|\r|\n/)`（或先归一化 `\r\n?` → `\n`）。

### D11 · P3 · 钱包已连接但链不对时，首屏仍显示「连接钱包后批量转账」

- **期望**：钱包在其它网络时，页面首屏就应提示网络不对（全局头部的「批量转账网络不对，点此切换」已有该信息）。
- **实际**：注入钱包 `eth_chainId=0x1` 打开页面，`main` 显示「连接钱包后批量转账。… 连接钱包」，没有网络错误；点「连接钱包」之后才变成「切换到这个应用使用的网络后再批量转账。」+ 头部「批量转账网络不对，点此切换」。根因在全局 injected/wagmi 连接态（未连接时不判断链），非本页独有，按跨页面观察记录。
- **最小复现步骤**：注入 chainId=1 的钱包 → 打开 `/batch-transfer`（未先连接）→ 观察首屏 connect 卡。
- **证据**：`/tmp/qa-batch-results/05-responsive.json` `wrongChainBeforeConnect.bodyText`、`wrongChain.header = "批量转账网络不对，点此切换"`；截图 `/tmp/qa-batch-05-wrong-chain.png`。
- **一句话修复方向**：全局连接入口在已注入钱包时先 `eth_chainId` 探一次，网络不对直接落错误网络卡（或至少把头部网络提示与页面一起渲染）。

---

## 二、场景矩阵（期望 / 实际 / 级别 / 证据）

图例：✅ 通过；❌ 失败（缺陷见上）；级别只对失败项标注。链：8585 clean bootstrap；钱包 stub 账户为 anvil 固定账户。

### s1 页面状态与入口

| ID | 场景 | 期望 | 实际 | 级别 | 证据 |
| --- | --- | --- | --- | --- | --- |
| S1.1 | 未连接 | 状态卡「连接钱包后批量转账。」+ 连接按钮，无输入框 | 文案与按钮一致，`batch-transfer-input` 数量 0 | – | `/tmp/qa-batch-05-disconnected.png`；`05-responsive.json` |
| S1.2 | 错误网络（连接后） | 「切换到这个应用使用的网络后再批量转账。」+ 回首页；无输入框 | 一致；头部「批量转账网络不对，点此切换」 | – | `/tmp/qa-batch-05-wrong-chain.png`；`05-responsive.json` |
| S1.3 | 错误网络切回 31337 | 表单恢复可输入 | 输入框恢复、余额 `10,000` | – | `05-responsive.json`（debug-wrong-chain 输出） |
| S1.4 | 已连接但链不对的首屏 | 首屏即提示网络不对 | 仍显示连接卡，点连接后才发现 | **P3 · D11** | `/tmp/qa-batch-05-wrong-chain.png` |
| S1.5 | 应用目录入口 | `/apps` 有「批量转账」链接到 `/batch-transfer?symbol=…` | 1 个链接，href=`/batch-transfer?symbol=TestLOVE20`，无「未配置」 | – | `/tmp/qa-batch-05-apps-entry.png` |
| S1.6 | 刷新首屏 | 无残留成功条、输入空、模式回原生、gas 30000 | strip=0、input=""、mode=native、gas=30000 | – | `10-details.json` `refreshFirstPaint` |
| S1.7 | 空输入 | `0 行，0 个收款方`、合计 0、空提示、主按钮禁用 | 一致 | – | `/tmp/qa-batch-01-1-empty.png`；`01-parse.json` |
| S1.8 | 仅空白/空行 | 同空输入 | 一致（`lineCount=0`） | – | `01-parse.json` `blank` |

### s2 收款清单解析（原生模式，#6）

| ID | 场景 | 期望 | 实际 | 级别 | 证据 |
| --- | --- | --- | --- | --- | --- |
| S2.1 | 1 行正常 | `1 行，1 个收款方`、合计正确、可提交 | 一致；预余额 `10,000` | – | `/tmp/qa-batch-01-2-one-line.png` |
| S2.2 | 5 行含 1 行重复 | `5 行，4 个收款方`、合计只含首次出现金额、重复行标「与第 1 行重复」、主按钮禁用、点击不发交易 | 摘要 `5 行，4 个收款方`、合计 `0.450001 ETH`、`第 4 行：与第 1 行重复，这一行先不计入，请删掉其中一行。`、禁用；`eth_sendTransaction` 0 笔 | – | `/tmp/qa-batch-01-3-duplicate-blocked.png`；`02-native-flow.json` |
| S2.3 | 删掉重复行后提交 | 重复提示消失、可提交、金额不变 | 4 行全通过、可提交、合计 `0.450001 ETH` | – | `02-native-flow.json` `fixedState` |
| S2.4 | 同地址大小写不同 | 识别为重复并阻止提交 | `第 2 行：与第 1 行重复…`，`2 行，1 个收款方` | – | `01-parse.json` `duplicateDifferentCase` |
| S2.5 | 同地址重复 3 次 | 后两行各一条「与第 1 行重复」 | 2 条重复提示、`3 行，1 个收款方` | – | `01-parse.json` `tripleDuplicate` |
| S2.6 | 重复行金额不同（0.1 与 0.9） | 只计首次出现金额、两条金额都不静默相加 | 合计 `0.1 ETH`、重复行不计入 | – | `11-copy.json`、`10-details` 同类断言 |
| S2.7 | 重复行缺金额 | 报「缺少金额」（不是重复） | `第 2 行：缺少金额。` | – | `01-parse.json` `duplicateInvalidLater` |
| S2.8 | 非法地址 `0x123` | 行内「地址格式不对，需要 0x 开头的 40 位地址。」 | 一致，其余行仍可解析、主按钮禁用 | – | `01-parse.json` |
| S2.9 | 零地址 | 「收款地址不能是零地址。」 | 一致 | – | `01-parse.json` |
| S2.10 | 转给自己 | 「不能转给自己。」 | 一致 | – | `01-parse.json` `selfAddress` |
| S2.11 | 转给批量转账合约自身 | 「不能转给批量转账合约本身。」 | 一致，禁用 | – | `/tmp/qa-batch-results/11-copy.json` |
| S2.12 | 缺金额 | 「缺少金额。」 | 一致 | – | `11-copy.json` |
| S2.13 | 金额非法 `abc` | 「金额格式不对。」 | 一致 | – | `11-copy.json` |
| S2.14 | 金额 0 / 0.000 | 「金额必须大于 0。」 | 一致 | – | `01-parse.json` `amountZero` |
| S2.15 | 负数 / 正号 | 「金额格式不对。」 | 一致 | – | `01-parse.json` |
| S2.16 | 千分位 `1,000` | 专用提示或接受 | 「这一行看不懂，需要「地址 金额」。」 | **P3 · D4** | `01-parse.json` `amountThousands` |
| S2.17 | 全角数字 `１` | 金额格式不对 | 一致 | – | `01-parse.json` `amountFullWidth` |
| S2.18 | 科学计数 `1e3` | 金额格式不对 | 一致 | – | `01-parse.json` `amountExponent` |
| S2.19 | 19 位小数 `0.0000000000000000009` | 说明被精度截断为 0 | 只报「金额必须大于 0。」 | **P3 · D5** | `01-parse.json` `amount19Decimals` |
| S2.20 | 超精度 `1.5000000000000000009` | 截断为 1.5 + 「金额已按精度截断到 18 位小数。」 | 一致 | – | `/tmp/qa-batch-01-4-truncated-and-invalid.png` |
| S2.21 | CRLF 换行 | 两行分别解析 | UI：真实剪贴板 CRLF 粘贴 100 行 → 100 行；解析器：`crlf.rows=2` | – | `06-parser-and-reads.json` `crlf`、`09-paste100.json` |
| S2.22 | 纯 CR 换行 | 按行切分 | 解析器 `invalidLine`（UI 不可达） | **P3 · D10** | `06-parser-and-reads.json` `crOnly` |
| S2.23 | 逗号紧贴 / 逗号带空格 | 解析成功 | `0x…,0.1`、`0x… , 0.2` 均成功 | – | `01-parse.json`、`06-parser-and-reads.json` |
| S2.24 | Tab 分隔 | 解析成功 | 一致 | – | `01-parse.json` `tabs` |
| S2.25 | 行尾空格/制表符 | 忽略 | 一致 | – | `01-parse.json` `trailingSpaces` |
| S2.26 | 行尾逗号 | 忽略空 token | 一致（`1 行，1 个收款方`） | – | `06-parser-and-reads.json` `trailingComma` |
| S2.27 | 一行 3 个 token | 「这一行看不懂」 | 一致 | – | `01-parse.json` `threeTokens` |
| S2.28 | 地址缺 0x | 地址格式不对 | 一致 | – | `01-parse.json` `addressNo0x` |
| S2.29 | 25 行 | 25 行 25 收款方、可提交、表格 25 行 | 一致 | – | `/tmp/qa-batch-01-25-rows-mobile.png` |
| S2.30 | 100 行（fill） | 100 行 100 收款方、合计 0.1 ETH、可提交 | 一致；fill→摘要 299ms | – | `/tmp/qa-batch-01-100-rows-mobile.png` |
| S2.31 | 100 行真实粘贴（CRLF，4899 字符） | 100 行、表格 100 行、余额全部读出（无 `—`） | 摘要 `100 行，100 个收款方`、合计 `0.1 ETH`、表格 100 行、`—` 计数 0、76ms | – | `/tmp/qa-batch-09-paste-100-rows.png`、`/tmp/qa-batch-09-paste-100-rows-table.png` |
| S2.32 | 100 行里夹 2 个重复 | 98 收款方 + 2 条重复提示 + 禁用 | 一致 | – | `/tmp/qa-batch-01-100-rows-duplicates.png` |
| S2.33 | 400 行 × 每行预算 100000 | 「超过一个区块的容量」并禁用 | 400 行 400 收款方；`这批交易的计算上限超过一个区块的容量，请减少收款方或调低每行执行预算。`；禁用 | – | `/tmp/qa-batch-01-400-rows-block-gas.png` |
| S2.34 | ERC20 模式重复地址 | 同样拦截并禁用 | `2 行，1 个收款方`、重复提示、CTA「授权 TestLOVE20」禁用 | – | `/tmp/qa-batch-05-duplicate-token-mode.png` |
| S2.35 | 原生 4 行超余额 | 合计 `10,000.5 ETH`、`ETH 不够，还差 0.501`、预留手续费提示、禁用 | 一致 | – | `11-copy.json`、`01-parse.json` 同类 |

### s3 金额展示与精度

| ID | 场景 | 期望 | 实际 | 级别 | 证据 |
| --- | --- | --- | --- | --- | --- |
| S3.1 | 0.0000001 / 0.0000002 | 非零金额不显示为 0 | 全链路 `0`，链上实际到账 1e11/2e11 wei | **P2 · D3** | `/tmp/qa-batch-08-tiny-receipt.png` |
| S3.2 | 大额千分位与 6 位小数截断 | `99,799,100`、`99,999,099.99991`、`10,000.5` | 一致 | – | `/tmp/qa-batch-03-after-approve.png`、`01-parse.json` |
| S3.3 | 0.1 + 0.2 wei 精度 | 合计 300000000000000000，无浮点误差 | 一致 | – | `06-parser-and-reads.json` `totalWei` |
| S3.4 | 截断提示出现条件 | 只有该行超精度才提示 | 一致（未超精度时 `truncated=null`） | – | `01-parse.json` |

### s4 授权（ERC20，#1 / TestLOVE20）

| ID | 场景 | 期望 | 实际 | 级别 | 证据 |
| --- | --- | --- | --- | --- | --- |
| S4.1 | 授权阶梯 0 → 授权 → 批量 | 总额 2.000002；CTA 先「授权 TestLOVE20」，确认后同位置「批量转账」；额度行更新；链上 allowance 2.000002 | 一致；授权中 CTA「等待钱包确认…」 | – | `/tmp/qa-batch-03-approve-pending.png`、`/tmp/qa-batch-03-after-approve.png` |
| S4.2 | 授权后**刷新**再提交 | 刷新后额度保留、直接「批量转账」、提交成功 | 一致；3 行差额 `+1.5/+0.5/+0.000002` | – | `/tmp/qa-batch-03-refresh-after-approve.png`、`/tmp/qa-batch-03-receipt-erc20.png` |
| S4.3 | 已长期授权 | 「已长期授权，本次需要 X，不需要再次授权」+ CTA「批量转账」 | 一致 | – | `/tmp/qa-batch-03-long-term-allowance.png` |
| S4.4 | 长期授权后批量 | 额度仍为长期（2^255−本次） | 回执正常、额度行保持长期 | – | `/tmp/qa-batch-03-long-term-receipt.png` |
| S4.5 | 批量后额度 | allowance 扣到 0 | 链上 `0` | – | `03-erc20-approve.json` `batchReceipt.allowanceOnChain` |
| S4.6 | 清单改小后提交 | 提示残留授权或收敛额度 | 残留 `0.000002`，页面「已允许…0.000002 / 本次需要 0」无提示 | **P3 · D7** | `/tmp/qa-batch-03-residual-allowance-receipt.png` |
| S4.7 | 取消授权签名 | 「你在钱包里点了取消，这一批没有转出。」、0 交易、额度仍 0 | 一致 | – | `/tmp/qa-batch-04-cancel-approve.png` |
| S4.8 | 双击授权 | 只发 1 笔 approve | stub 记录 1 笔，CTA 变「批量转账」，额度 0.25 | – | `10-details.json` `doubleClickApprove` |
| S4.9 | 额度读失败 | 单一「读不到」结论 + 可重试 | 与「额度已足够」同屏、无重试 | **P2 · D2** | `/tmp/qa-batch-07-allowance-read-failure.png` |
| S4.10 | 100 行代币不足额 | CTA「授权 …」但禁用 + 差多少 | `TestLOVE20 不够，还差 0.1`，禁用 | – | `/tmp/qa-batch-01-100-rows-token-mode.png` |

### s5 核对与回执

| ID | 场景 | 期望 | 实际 | 级别 | 证据 |
| --- | --- | --- | --- | --- | --- |
| S5.1 | 预余额表 | 每行地址/金额/当前余额与链上对齐 | 4 行均 `10,000`，行金额 `0.1/0.2/0.15/0.000001` | – | `/tmp/qa-batch-05-review-light-mobile.png` |
| S5.2 | 收款方是合约 | 「有收款方是合约地址」警告 + 行内「合约」徽标，不禁止提交 | 警告全文正确（含「失败时整批都会回滚」）、徽标 1 个 | – | `10-details.json` `contractRecipient` |
| S5.3 | 预余额读取失败 | 表格「—」+ 可提交可以，但回执不能断言已逐行核对 | 回执三行 `—`，仍写「上表每一行都已到账」 | **P2 · D1** | `/tmp/qa-batch-04-receipt-with-missing-before-balances.png` |
| S5.4 | 到账后余额读取失败 | 同上 | 回执 `—` + 「上表每一行都已到账」 | **P2 · D1** | `/tmp/qa-batch-04-receipt-post-read-failure.png` |
| S5.5 | 原生成功回执 | 合计 0.450001、4 个收款方、差额 `+0.1/+0.2/+0.15/+0.000001`、链上逐账户一致、交易 status=1 | 一致；链上 4 个账户余额精确增加 | – | `/tmp/qa-batch-02-receipt-mobile.png`、`02-native-flow.json` |
| S5.6 | ERC20 成功回执 | 差额 `+1.5/+0.5/+0.000002`、发送方余额按合计减少、allowance 归零 | 一致（发送方 `99,799,100 → 99,799,097.999998`） | – | `/tmp/qa-batch-03-receipt-erc20.png` |
| S5.7 | 关闭回执（知道了） | 成功条「已转出 …」、表单清空、URL 留在本页 | 一致；余额刷新 | – | `/tmp/qa-batch-02-after-dismiss.png` |
| S5.8 | 关闭回执（X） | 同「知道了」 | 成功条出现、回执消失、输入清空 | – | `/tmp/qa-batch-05-receipt-closed-by-x.png` |
| S5.9 | 回执关闭后再操作 | 可直接录下一批并成功 | 第二笔 `0.01 ETH` 成功，成功条更新 | – | `02-native-flow.json` |
| S5.10 | 回执后刷新 | 不残留成功条 | `successStripCount=0` | – | `02-native-flow.json` `secondReload` |
| S5.11 | 回执形态 | 移动端底部 Sheet、桌面页内卡片 | 390：Sheet + 关闭按钮；1280：页内卡，无 Sheet | – | `/tmp/qa-batch-05-receipt-light-mobile.png`、`/tmp/qa-batch-05-receipt-light-desktop.png` |

### s6 整批原子与模拟拦截

| ID | 场景 | 期望 | 实际 | 级别 | 证据 |
| --- | --- | --- | --- | --- | --- |
| S6.1 | 收款方合约拒收（原生） | 模拟阶段拦截：错误卡「第 2 行收款方拒收了这笔转账（对方可能是不接收 ETH 的合约）。整批没有转出，你的资产没有变化。」、无回执、主按钮恢复、余额不变 | 一致；交易未发（无 wallet 请求）；#5 与代币合约 ETH 余额不变 | – | `/tmp/qa-batch-04-atomic-revert-error.png`、`04-degraded.json` |
| S6.2 | 重复提交同一失败批 | 同样文案、无回执 | 一致 | – | `04-degraded.json` `atomicFailureRepeat` |
| S6.3 | ERC20 每行预算 21000 | 模拟拦截「第 1 行的执行预算不够，这一批没有转出。可以在高级选项里调高每行执行预算。」、0 钱包请求 | 一致 | – | `/tmp/qa-batch-04-gas-too-low.png` |

### s7 钱包交互与恢复

| ID | 场景 | 期望 | 实际 | 级别 | 证据 |
| --- | --- | --- | --- | --- | --- |
| S7.1 | 慢钱包 6s | CTA「等待钱包确认…」、表单/按钮禁用、完成后回执 | 一致；整笔约 9.6s 完成 | – | `/tmp/qa-batch-02-slow-wallet.png` |
| S7.2 | 慢钱包等待期双击 | 只发 1 笔 | stub 1 笔 | – | `02-native-flow.json` `sendLogAfterDoubleClick=1` |
| S7.3 | 无延迟双击 | 只发 1 笔 | 1 笔、1 份回执 | – | `07-reads-and-doubleclick.json` `doubleClick` |
| S7.4 | 取消签名 | 「你在钱包里点了取消，这一批没有转出。」、0 交易、CTA 恢复 | 一致 | – | `/tmp/qa-batch-02-cancel-error.png` |
| S7.5 | 刷新后首笔 | 钱包自动重连、输入清空、首笔成功 | 一致（`0.04 ETH` 回执，差额 `+0.04`） | – | `/tmp/qa-batch-02-first-batch-after-reload.png` |
| S7.6 | 表单已填时切换账户 | 收款方变自己 → 行内「不能转给自己」+ 禁用；切回恢复 | 一致（余额随账户刷新） | – | `/tmp/qa-batch-05-account-switch-self.png` |
| S7.7 | 发送方余额读取失败 | 不应在余额未知时放行 | 余额「读不到」、无限额提示、主按钮仍可点 | **P3 · D8** | `/tmp/qa-batch-07-balance-read-failure.png` |

### s8 响应式与主题

| ID | 场景 | 期望 | 实际 | 级别 | 证据 |
| --- | --- | --- | --- | --- | --- |
| S8.1 | 移动端 390×844 浅色 | 无横向溢出、录入/核对/回执可读 | `scrollWidth=390=clientWidth`；截图三态 | – | `/tmp/qa-batch-05-entry-light-mobile.png`、`-review-light-mobile.png`、`-receipt-light-mobile.png` |
| S8.2 | 移动端 390×844 深色 | 同上，`data-theme=dark` | 一致（`bodyBg rgb(11,14,17)`），错误/重复/警告可读 | – | `/tmp/qa-batch-05-entry-dark-mobile.png` 等 |
| S8.3 | 桌面 1280×800 浅色 | 无横向溢出、核对表列对齐 | `scrollWidth=1280=clientWidth` | – | `/tmp/qa-batch-05-review-light-desktop.png` |
| S8.4 | 桌面 1280×800 深色 | 同上 | 一致 | – | `/tmp/qa-batch-05-receipt-dark-desktop.png` 等 |
| S8.5 | 深/浅色对比度 | 重复提示（warning）、行内错误（danger）、成功条（success）可读 | 视觉检查可读，未见与背景融合 | – | 上述截图 |
| S8.6 | 回执 Sheet 关闭 | X 与「知道了」都能关闭并落成功条 | 一致 | – | `/tmp/qa-batch-05-receipt-closed-by-x.png` |

### s9 降级读取态

| ID | 场景 | 期望 | 实际 | 级别 | 证据 |
| --- | --- | --- | --- | --- | --- |
| S9.1 | 代币模式目录/余额读失败 | 资产标签与模式一致 | 「代币」模式显示 `ETH 余额 —` | **P3 · D9** | `/tmp/qa-batch-07-allowance-read-failure.png` |
| S9.2 | 读取失败后恢复 | 网络恢复后自动/一键恢复 | 解除注入 + 等 5s + 切模式仍「读不到」；须刷新 | **P3 · D6** | `07-reads-and-doubleclick.json` |

---

## 三、怀疑但未复现（注明卡点）

| # | 怀疑点 | 卡在哪一步 |
| --- | --- | --- |
| N1 | 未部署 BatchTransfer 时页面应落「这个环境还没有部署批量转账合约…」状态卡 | 当前 `anvil31337_dev.json` 已配置 `batchTransfer`；不改部署文件无法构造；只做了代码走查（`batch-transfer-panel.tsx` L323-331），未在 UI 复现 |
| N2 | ERC20 模式下「收款方是合约」且合约拒收 ERC20 时的错误文案（`ERC20TransferFailed` + `hasCode` 分支） | 本环境社区代币只有 TestLOVE20，找不到会拒收 `transferFrom` 的合约收款方；原生拒收路径（S6.1）已复现，ERC20 分支未复现 |
| N3 | gas 下限 `10000` / 上限 `2000000` 的行内文案 | 官方 e2e 有断言，本轮只独立复现了「单块容量」与「执行预算不足；没有单独跑这两个数值 |
| N4 | 交易 replaced / dropped / nonce-gap 的恢复卡（`TxWatchCard` + 重新提交） | 需要操控钱包 nonce/节点（发同 nonce 交易或丢 tx），stub 钱包没有做替换能力；并行 agent 正在改 `use-tx-watch`，本轮不覆盖 |
| N5 | 授权确认后「额度回读未完成时按钮仍禁用」的竞态 | 用 3s 慢钱包 + 正常 RPC 未撞到窗口；未构造「approve 已上链但 allowance 读慢」的组合 |
| N6 | 100 行清单在移动端的滚动/长列表性能问题 | 功能与渲染都正常（100 行表格 + 100 个余额全部读出），未观察到卡顿；无量化阈值可判失败 |
| N7 | 纯 CR 换行的真实用户路径（D10 的 UI 可复现性） | 浏览器 textarea 会把 CRLF 归一化为 LF，纯 CR 无法经粘贴/输入产生；只在解析器层复现 |
| N8 | 400 行粘贴（Playwright 键盘粘贴）| 单次键盘粘贴 400 行超时（`waitForFunction` 20s 未出现 `400 行`），改用 `fill` 注入已验证同一「单块容量」判定（S2.33）；真实用户手速粘贴未测 |
| N9 | 深色模式下个别低对比元素（如禁用按钮文字、`text-warning` 小字）的 WCAG 数值 | 只做了视觉检查与截图，未做像素级对比度计算 |

---

## 四、环境、复现脚本与限制

- **链**：`make -C ../anvil bootstrap PORT=8585`（clean bootstrap；chain 31337，1s interval mining；地址簿与 `src/config/deployments/anvil31337_dev.json` 一致）。每个 Playwright 脚本前后 `anvil_snapshot` / `anvil_revert`，脚本之间链状态互不污染；测试结束后 `make -C ../anvil stop PORT=8585`。
- **前端**：dev server `VITE_ENV=dev VITE_ANVIL_RPC=http://127.0.0.1:8585 pnpm dev --port 5191`（**非 build**）。并行 agent 改 `src/**` 时 Vite HMR 会整页 reload，脚本均带重试/重填；在并行改动停止后又完整重跑了原生与 ERC20 主流程（19:36–19:38），结论与首次一致。另有一次 Vite optimize-deps 陈旧（`ccip-…js` 504）导致错误解码失败、页面报「网络连接不稳定」，重启 dev server（`--force`）后恢复，属于 dev 环境问题，不计入缺陷。
- **钱包**：`/tmp/qa-batch/lib.mjs` 注入 EIP-1193 stub（`eth_accounts`/`eth_chainId`/`eth_sendTransaction` 等），读走页面自身 HTTP transport，写走 anvil 解锁账户 `eth_sendTransaction`；支持取消签名（`4001`）、慢钱包延迟、切换账户/链，用于复现取消/慢钱包/错误网络/切换账户场景。
- **降级读取注入**：`page.route` 拦截发往 8585 的 JSON-RPC，按**请求**里的 `eth_call` 选择器给对应 **response id** 注入 error（页面 hook 读走 Multicall3 `0x82ad56cb`；回执重读走 `nativeBalances 0x93bdc1ab`），用于复现 D1/D2/D6/D8/D9。
- **截图**：`/tmp/qa-batch-*.png` 共 61 张；原始断言数据在 `/tmp/qa-batch-results/*.json`；脚本在 `/tmp/qa-batch/*.mjs`（`01-parse`、`02-native-flow`、`03-erc20-approve`、`04-degraded`、`05-responsive`、`06-parser-and-reads`、`07-reads-and-doubleclick`、`08-tiny-proof`、`09-paste100`、`10-details`、`11-copy`）。
- **不改产品代码 / 不 commit**：本轮只写本文件与 `/tmp` 下的脚本、截图、JSON；`git status` 中 `src/pages/batch-transfer/**`、`src/features/batch-transfer/**` 为空。
- **限制**：headless Chromium + stub 钱包（非真实浏览器扩展）；真实移动设备未测；交易 watcher 相关的极端路径（N4）未覆盖。

## 五、与三线文档/实现的一致性备注

- `docs/product/three-line/batch-transfer.md` §3 的 6 组前端字符串在本轮全部独立复现（重复行拦截、A 4 行合计、B 授权阶梯、C 行错误、D 超余额、E 整批回滚、gas 越界中的单块容量），未发现与理论线/合约线数值不一致的地方；缺陷集中在**读取失败/极端展示**的非正常路径，不推翻三线结论。
- 实现侧最小定位：D1 `batch-receipt.tsx` L20-26 + L129-131、`batch-audit.ts` L40-56；D2/D9 `batch-transfer-panel.tsx` L599-621、L102-107；D3 `shared/lib/format.ts`（6 位截断）；D4/D5/D10 `batch-parse.ts` L89/L96-102 + `transfer-amount.ts` L26-41；D6/D8 `batch-transfer-panel.tsx`（读取失败态无 retry、`available` undefined 时跳过 insufficient）；D7 `batch-transfer-panel.tsx` L184-221（授权按提交时合计）。

---

## 六、修复结果（2026-11-14 20:40，修复 agent `fix-batch`）

> 台账：`ledger/worklog/202611/14-1150-85d5-修复-批量转账-qa-缺陷-11-条.md`。工作区未 commit（并行 3 个修复 agent 共用同一工作树）。
> **门禁状态**：`../core@00113ae` 给 `IStake.stakeLiquidity` 加了 `promisedWaitingPhases` 第 6 参，而 `../periphery/LOVE20Hub.sol`、`../anvil/script/SeedFlow.s.sol` 仍是旧调用 → 现在**任何端口的 `make bootstrap` 都在编译阶段失败**。按 Lead 2026-11-14 20:13 协调：本轮**不跑 e2e、不重拍截图**，标注「待 Lead 在合约侧稳定后统一跑」；单测 / lint / 本任务相关文件的 typecheck 已本地跑过（§6.2）。

### 6.1 逐条状态

| 缺陷 | 状态 | 根因与修复 | 证据（代码 / 单测 / e2e） |
| --- | --- | --- | --- |
| **D1** P2 余额读失败仍断言「每一行都已到账」 | **已修** | 回执结论原来是静态字符串 `copy.batchTransfer.atomicReceipt`，`BatchAuditStatus.unknown` 从未被回执使用。新增 `summarizeBatchAudit()` 汇总 `unknown`/`mismatch`，回执按三态渲染：全部 matched → 原句；有 unknown → 「到账核对不完整：有 N 行余额读取失败，未能核对，请到区块浏览器确认交易结果。」；有差额异常 → 「到账核对发现异常…」；图标同时从成功绿换成警告色（`data-status` 可断言）。`—` 仍是 `undefined`，从不折叠成 0。提交前读失败与到账后读失败都走同一 `unknown` 分支。 | `lib/batch-audit.ts:82` `summarizeBatchAudit`；`ui/batch-receipt.tsx:97-171` 结论 + 残留授权 + 图标；单测 `batch-audit.test.ts` 新增 4 条（verified / 单行 unknown / 预余额失败 / anomaly）、`batch-receipt.test.ts` 新增 2 条；e2e 用例 M（注入 `nativeBalances` 读失败 → 回执 `data-status=unverified` + 「到账核对不完整」+ 差额 `—`） |
| **D2** P2 额度读失败同屏「读不到」+「已足够」 | **已修** | 根因：第二行判定用 `needsApproval`，而 `allowance.value === undefined` 时 `needsApproval === false`，于是落进 `allowanceReady`。抽出 `allowanceReadState()` 三态（loading / unknown / need / ready），未知态只渲染「额度暂时读不到，无法判断是否需要授权，请重试读取。」+「重新读取」，主按钮禁用；「已足够 / 需要授权」只在读到真实额度时出现。 | `lib/batch-read-state.ts:19`；`ui/batch-transfer-panel.tsx:713-745`；单测 `batch-read-state.test.ts` 4 条（未知态对所有合计都不返回 ready）；e2e 用例 N（注入 `allowance` 读失败 → 单一未知态 + 无「已足够」+「重新读取」自愈） |
| **D3** P2 极小金额全链路显示 0 | **已修** | 根因：`formatTokenAmount` 只截断到 6 位，1e-7 ETH → `0`。在共享层新增 `formatVisibleTokenAmount` / `smallestVisibleTokenAmount`：非零但被显示规则截成 0 时输出 `< 0.000001`（与代币授权的 `< 0.000001 {symbol}` 约定一致），`0` 仍只代表精确 0、unknown 仍是 `—`。批量页合计 / 行金额 / 预余额 / 回执合计 / 逐行差额 / 到账前后 / 成功条全部改用该函数；差额 `< 0.000001` 不再加 `+`。 | `shared/lib/format.ts:158,176`；`ui/batch-transfer-panel.tsx` 全部金额点、`ui/batch-receipt.tsx`、`ui/batch-entry-table.tsx:83,93`；单测 `format.test.ts` 新增 3 条；e2e 用例 H（`< 0.000001` 全链路） |
| **D4** P3 千分位金额被逗号切碎 | **已修** | 解析器原来 `tokens.length !== 2` 直接 `invalidLine`。新增 `recoverGroupedAmount()`：地址 token + 尾部仅由千分位组构成（`\d{1,3}(,\d{3})+(\.\d+)?`）时去掉逗号按数值解析；其它 3+ token（如 `0.1 0.2`）仍是 `invalidLine`。 | `lib/batch-parse.ts:84,128`；单测 `batch-parse.test.ts` 2 条（接受 `1,000` / `2,500.5` / `1,000,000.25`，仍拒绝 `0.1 0.2`）；e2e 用例 I |
| **D5** P3 精度截断为 0 只报「必须大于 0」 | **已修** | `parseTransferAmount` 的 `zero` 增加可选 `truncated` 标记（`0.0000000000000000009` @18 位 → `{kind:'zero',truncated:true}`），批量解析把这种行报 `truncatedToZero`，文案「小数位超过精度，按精度截断后为 0。」；真正的 0 仍是零金额文案。 | `transfer-token/lib/transfer-amount.ts:22,45`；`lib/batch-parse.ts:174`；copy `reasons.truncatedToZero`；单测 `transfer-amount.test.ts` 2 条、`batch-parse.test.ts` 1 条；e2e 用例 J |
| **D6** P3 读失败无重试、不自愈 | **已修** | 新增统一 `RetryButton`（「重新读取」）：收款方余额读失败（核对表下 `batch-transfer-rows-retry`）、发送方余额读失败（`batch-transfer-balance-retry`）、额度读失败（`batch-transfer-allowance-retry`）都有入口；切换原生/代币时显式 `refetch` 三者，读入恢复不再需要整页刷新。 | `ui/batch-transfer-panel.tsx:77`（RetryButton）、`:579-596`（余额）、`:730-745`（额度）、`:272-283` switchMode；`ui/batch-entry-table.tsx` `onRetry`；e2e 重试入口断言待统一跑 |
| **D7** P3 改小清单后残留授权无提示 | **已修** | 回执新增 `residualAllowance`：批量上链后（代币模式）用新增的命令式 `useBatchAllowanceReader()` 重读 `allowance(wallet, BatchTransfer)`，>0 时回执追加「链上还保留 X {symbol} 的授权，可到「代币授权」页撤销。」；读失败为 `undefined`（不当作 0）。 | `model/use-batch-allowance.ts:63`；`ui/batch-transfer-panel.tsx:254-258`；`lib/batch-receipt.ts:22,40`；`ui/batch-receipt.tsx:160-171`；单测 `batch-receipt.test.ts` 1 条；e2e 用例 K |
| **D8** P3 发送方余额读不到仍可提交 | **已修** | 新增 `balanceReadBlocksSubmit(total, balance, isLoading)`：合计 > 0 且余额 `undefined`（非 loading）时禁用主按钮，写「余额暂时读不到，还不能判断够不够转，请先重试读取。」+「重新读取」；余额已知时不改变原 insufficient 逻辑。 | `lib/batch-read-state.ts:38`；`ui/batch-transfer-panel.tsx:225,280,578-596`；单测 `batch-read-state.test.ts` 2 条；e2e 降级读注入待统一跑 |
| **D9** P3 代币模式余额标签回落 ETH | **已修** | 余额行改由 `balanceLineState()` 决定：`mode==='token' && token===undefined` → `unknownToken`，显示「代币余额暂时读不到，换个代币或重试读取。」（不再用 `NETWORK.nativeCurrency.symbol` 拼「ETH 余额 —」）；额度行同样不再用原生符号兜底。 | `lib/batch-read-state.ts:53`；`ui/batch-transfer-panel.tsx:367-387,716-729`（额度行 tokenUnresolved 分支）；单测 `batch-read-state.test.ts` 2 条 |
| **D10** P3 纯 CR 换行解析器不可达 | **已修（防御性）** | `text.split(/\r?\n/)` → `split(/\r\n|\r|\n/)`，CRLF / LF / 纯 CR 统一按行。**真实用户路径不可达**（浏览器 textarea 把 CRLF 归一化为 LF，纯 CR 无法经粘贴/输入产生，QA N7 已注明），因此这是解析器健壮性修复，不涉及 UI 行为变化。 | `lib/batch-parse.ts:112`；单测 `batch-parse.test.ts` 1 条（三种换行同一结果）；无 e2e（UI 不可达） |
| **D11** P3 已连接但链不对首屏仍「连接钱包」 | **已修** | 根因：`useWalletConnection().isWrongChain` 只在 `account.isConnected` 时成立，而 wagmi 在用户点「连接」前不会连接，注入钱包的 `eth_chainId` 谁都没读。新增 `useInjectedChainId()`：直接向注入 provider 探 `eth_chainId`（不需要账户、不触发授权弹窗），监听 `chainChanged`，并对晚注入钱包做有界重探；`isWrongChain = currentChainId !== undefined && currentChainId !== target`。配套：头部 ConnectPill 先判网络再判连接（显示「网络不对，点此切换」）；`/batch-transfer` 先判 `isWrongChain` 再判 `!isConnected`，首屏落「网络不对。+ 切换到这个应用使用的网络后再批量转账。」；未连接时的「切换网络」走 provider 的 `wallet_switchEthereumChain` + `wallet_addEthereumChain`（EIP-3326/3085）回退。 | `features/connect-wallet/model/use-injected-chain.ts:37`；`use-wallet-connection.ts:39-48,63-85`；`widgets/connect-pill/connect-pill.tsx:46-50`；`ui/batch-transfer-panel.tsx:423-434`（错误网络先于未连接，标题+回首页）；e2e 用例 L（注入 `0x1`，首屏无「连接钱包后批量转账。」） |

### 6.2 门禁真实输出（2026-11-14 20:30–20:40，本机）

| 门禁 | 结果 | 说明 |
| --- | --- | --- |
| `npx vitest run`（全部单测） | **92 files / 612 tests passed (10.66s)** | 含本任务新增/扩展的 `format.test.ts`、`batch-parse.test.ts`、`batch-audit.test.ts`、`batch-receipt.test.ts`、`batch-read-state.test.ts`、`transfer-amount.test.ts` |
| `eslint`（本任务全部改动文件，`--max-warnings=0`） | **exit 0** | `src/features/batch-transfer/**`、`src/shared/lib/format*.ts`、`src/features/transfer-token/lib/transfer-amount*.ts`、`src/features/connect-wallet/model/*`、`src/widgets/connect-pill/connect-pill.tsx`、`src/shared/config/copy-pages.ts`、`e2e/batch-transfer-numbers.spec.ts` |
| `tsc --noEmit -p tsconfig.json`（全仓） | **0 错误（exit 0，20:39）** | 20:30 时全仓曾有 4 个错误，均在并行 agent 在途文件（`liquidity-page.test.tsx`、`transfer-token-panel.test.tsx`），非本任务改动；并行 agent 修完后 20:39 复跑为 0 |
| `pnpm build` | **通过（exit 0，20:39，`/tmp/love20-build-e2e.lock` 下）** | `tsc` + `vite build` + `postbuild` + `check-bundle` 全过；首屏 JS gzip 159.7 kB（预算 ≤160 kB），`dist/assets/batch-transfer-page-*.js` 41.34 kB；未触碰 `/tmp` 外产物 |
| `pnpm e2e --grep "批量转账"` | **待 Lead 统一跑** | 合约侧 `stakeLiquidity` 签名与 periphery/anvil 未同步，任何端口 `make bootstrap` 编译失败；e2e 用例已写好（H/I/J/K/L），未执行 |
| 12 张截图 | **待统一跑** | 正常路径（录入/核对/回执）显示文案未变（极小值、读失败、残留授权、错误网络都不在这 12 张的状态里），跑通 e2e 后按需重拍 |

### 6.3 变更文件

- 共享层：`src/shared/lib/format.ts`（`formatVisibleTokenAmount` / `smallestVisibleTokenAmount`）、`src/shared/lib/format.test.ts`、`src/shared/config/copy-pages.ts`（`batchTransfer` 的读失败/极小值/回执结论/残留授权/错误网络文案、`reasons.truncatedToZero`、`states.wrongChainTitle`）。
- 批量转账：`lib/batch-parse.ts`（D4/D5/D10）、`lib/batch-audit.ts`（D1 汇总）、`lib/batch-receipt.ts`（D7 残留授权）、`lib/batch-read-state.ts`（D2/D8/D9 纯状态机，新增）、`model/use-batch-allowance.ts`（D7 命令式额度读）、`ui/batch-transfer-panel.tsx`、`ui/batch-receipt.tsx`、`ui/batch-entry-table.tsx`；单测 `batch-parse.test.ts`、`batch-audit.test.ts`、`batch-receipt.test.ts`（新增）、`batch-read-state.test.ts`（新增）。
- 转账解析：`src/features/transfer-token/lib/transfer-amount.ts`（D5 `zero.truncated`）与单测。
- 连接：`src/features/connect-wallet/model/use-injected-chain.ts`（新增）、`use-wallet-connection.ts`、`src/widgets/connect-pill/connect-pill.tsx`。
- e2e：`e2e/batch-transfer-numbers.spec.ts` 新增用例 H/I/J/K/L/M/N（D3/D4/D5/D7/D11/D1/D2），并新增 `failReadsWithSelector()` 读失败注入 helper。
- 文档：本节、`docs/product/m0-ux-spec.md` §3.12、`docs/product/three-line/batch-transfer.md` §3。

### 6.4 残留与待办（交 Lead）

1. **合约侧稳定后**统一跑 `E2E_PORT=4192 E2E_ANVIL_RPC=http://127.0.0.1:8590 pnpm e2e --grep "批量转账"`，并按结果重拍 12 张截图。
2. **降级读 e2e 已写、未跑**：`e2e/batch-transfer-numbers.spec.ts` 的 `failReadsWithSelector()` 按 JSON-RPC 请求里的 `eth_call` 选择器注入读失败（D1 用 `nativeBalances 0x93bdc1ab`，D2 用 `allowance 0xdd62ed3e`），对应用例 M/N；链稳定后随 `--grep "批量转账"` 一起验证，若注入方式与 anvil/viem 批量行为不符需按实际响应调整。D8 的「余额未知禁止提交」由 `batch-read-state.test.ts` 单测覆盖（发送方余额走 `eth_getBalance`，无同款注入点）。
3. D11 是全局连接层的改动（`use-wallet-connection` / ConnectPill），会改变所有页面在「注入钱包 + 链不对」时的首屏：头部从「连接钱包」变为「网络不对，点此切换」，页面各自落自己的网络不对态。全量 e2e 跑通前需要 Lead 关注是否有其它页面对该首屏文案有断言（当前 spec 中未见 wrong-chain 首屏断言）。
