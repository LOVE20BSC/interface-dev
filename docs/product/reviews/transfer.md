# 代币转账（`/transfer`）独立 QA · 场景矩阵与缺陷清单

> 任务：`ledger/worklog/202611/14-1054-6bd1-qa-review-代币转账-逐场景复现并出缺陷清单.md`
> 角色：独立 QA（只复现 + 出清单，**不改产品代码、不 `git add/commit`**）。
> 基线：`main` @ `c6be3a9`。复现期间工作区有并行 agent 的 swap 修复改动（`src/shared/ui/token-picker.tsx`、`src/shared/config/copy-pages.ts`、`src/shared/lib/tx-watch.ts`、`src/shared/model/use-tx-watch.ts` 等），这些共享模块恰好被 `/transfer` 消费；为得到稳定、可复算的观测，本次用 `git archive HEAD` 把基线源码冻结到 `/tmp/qa-transfer-tree`（`node_modules` 软链 + 独立 vite cache），dev server 从冻结树启动。review 范围内的 `src/pages/transfer/**`、`src/features/transfer-token/**`、`shared/ui/{copyable-address,identity-input-mode,identity-recipient-card,tx-watch-card}.tsx`、`shared/lib/{tx-watch,identity-input,format}.ts` 在 `c6be3a9` 上未被并行改动。
> 环境：验证链 `make -C ../anvil bootstrap PORT=8584`（clean bootstrap，chain 31337，interval mining 1s）；**dev server（不 build）**`VITE_ENV=dev VITE_ANVIL_RPC=http://127.0.0.1:8584 VITE_TX_DEADLINE_MS=10000 vite --port 5190`；Playwright 用 `node` 直跑 `/tmp/qa-transfer/*.mjs`（`@playwright/test` 的 chromium + 注入 EIP-1193 stub wallet，读走页面 HTTP transport、写走 `eth_sendTransaction`，同 `e2e/wallet-stub.ts` 思路）；每个场景独立 browser context，整轮前后 `anvil_snapshot`/`anvil_revert` 隔离链状态；为覆盖「6 位精度 / 自定义 ERC20 余额」额外在 8584 部署了一个 6 位 decimals 的 `QAUSD`（`0x70e0…fc49`，仅测试链）；「地址簿未配置」用另一份把地址簿全置零的冻结树 + 5194 dev server 复现。**8545 人工链全程未触碰。**
> 证据约定：截图 `/tmp/qa-transfer-<场景>-*.png`；断言原始数据 `/tmp/qa-transfer/results.json`（59 条主套件场景，含 expected/actual/status/severity/notes）；链上数值来自 8584 的 `eth_call`/`eth_getBalance`/`eth_getTransactionReceipt`。
> 计数口径：**61 个场景**（主套件 59 + 地址簿空部署 N1 + 慢 RPC 身份门禁 G1）；其中 60 个场景的期望行为全部成立、1 个（R12）因 dev 链限制无法构造而标记 BLOCKED。下表「级别」列只标注**由该场景证据支撑的缺陷**（D1–D7），其余为 `—`。

## 结论摘要

| 项 | 值 |
| --- | --- |
| 场景数 | **61**（一个场景内可含多条断言；e2e `transfer-numbers.spec.ts` 的 8 组数值用例已作为回归重跑，不重复计入） |
| 通过 | **60**；BLOCKED **1**（R12 纯数字名字，dev 链无法铸造） |
| 已验证缺陷 | **7 条** |
| 缺陷级别 | **P0：0 · P1：2 · P2：2 · P3：3** |
| 最严重 3 条 | **D1 提交后刷新丢失在途交易且可重复提交 → 实测双转账（P1）** · **D2 交易丢失/卡住的恢复卡出现后主按钮可点但静默无效（P1）** · **D3 余额读取失败时仍可提交，且没有任何「余额未知」提示（P2）** |

## 验收状态（2026-11-14 修复轮 · `ledger/worklog/202611/14-1200-4eb3-…`）

> 修复实现已落地、单测/组件测试与 lint/typecheck/build 全绿；e2e 用例已写入
> `e2e/transfer-recovery.spec.ts`，因 owner 正在同步合约库、当前任何端口的
> `make bootstrap` 都会编译失败，**待 Lead 在合约侧稳定后统一跑**（`pnpm e2e -- --grep "代币转账"`）。
> 截图由该 spec 生成，未跑前不覆盖本 review 已有的 QA 现场截图。

| 缺陷 | 状态 | 修复要点（文件/符号） | 验证 |
| --- | --- | --- | --- |
| D1 P1 刷新后可重复提交/双转账 | **已修** | `lib/transfer-record.ts`（`transfer_task` 持久化，`read/write/clearStoredTransfer`）+ `use-transfer-transaction.ts`（发送成功即落盘 `confirmed:false`，首帧恢复 `pending` 并继续 `useTxWatch`；`hasPending`/`isHydrating` 同时封锁 `submit()` 与 CTA） | 单测 `transfer-record.test.ts`、`use-transfer-transaction.test.tsx`（刷新恢复在途、二次提交被拒）；e2e `transfer-recovery.spec.ts` 「D1 提交后立即刷新」（提交→immediate reload→在途卡恢复→CTA 禁用→链上只一笔，nonce +1 / 收款方 +1） |
| D2 P1 恢复卡下主按钮静默无效 | **已修** | `transfer-token-panel.tsx`：`pendingStuck` 时主按钮禁用 + `transfer-submit-note`「上面这笔还没有结果，请先用上面的「重新提交」或「重新查询」处理。」，继续入口只剩恢复卡 | 组件测试 `transfer-token-panel.test.tsx`「never leaves a clickable but silent CTA」；e2e「D2 恢复卡」（force click 不发交易、卡内「重新提交」才 +1 笔并出回执） |
| D3 P2 余额读失败仍可提交 | **已修** | `transfer-token-panel.tsx`：`balanceKnown` 纳入 `canSubmit`，余额不可读时禁用 +「余额暂时读不到，稍后重试。」+「重新读取余额」 | 组件测试「blocks submission while the balance is unreadable」；e2e「D3 余额读取失败」 |
| D4 P2 刷新后成功条/哈希丢失 | **已修** | 同一持久化把 `confirmed` 记录留作成功条：`restoredRecord` 首帧恢复成功条（金额 + `transfer-success-strip-hash` + 复制 + 浏览器链接），**回执 sheet 不重复弹出**（与 mint/swap 的「回执是一次性页面状态」口径一致） | 组件测试「restores the success strip with a checkable hash」；hook 单测「restores a confirmed transfer as the success strip only」；e2e「D4 完成后刷新」 |
| D5 P3 余额 0 时「全部」 | **已修** | `transfer-token-panel.tsx`：「全部」`disabled` 条件改为 `spendable === undefined \|\| spendable === 0n`，点击也不填入非法 0 | 组件测试「disables 全部 at a zero spendable balance」；e2e「D5 余额为 0」 |
| D6 P3 两身份模式共享输入残留 | **已修** | `transfer-token-panel.tsx`：ID/名字各存一份输入（`identityInputs.member/name`），切模式不再把 `#2` 当名字查；切模式仍清解析结果与勾选 | 组件测试「keeps ID and name inputs apart」 |
| D7 P3 名字未返回即可确认提交 | **已修** | `use-identity-recipient.ts` 新增 `namePending`（id 模式 `memberName` 读取中）；`transfer-token-panel.tsx` 在名字落定前不渲染确认块、显示「正在读取身份名字…」、`canSubmit` 要求 `identityReady` | 单测「flags the canonical name as pending」；组件测试「holds the identity gate closed」；e2e「D7 慢 RPC」 |

**已核对且通过的核心契约**：默认 按地址 + 原生币，余额行裸数字（无 symbol/无「余额」/18 位不显示精度）；代币分组顺序固定、社区/包装/LP/自定义四类均可选，自定义校验（格式 / 无 bytecode / 读不到 metadata）与 6 位精度截断正确；收款方三模式显式决定语义（ID 只收数字、名字走 `memberId`、大小写不敏感、纯数字名字不会被当 ID）、自转/零地址/不存在/自己/非法各自人话错误；已知合约强制勾选、任意合约只警告、换收款方后勾选失效；金额门禁（空 / 0 / 负数 / 非法 / 千分位 / 全角 / 首尾空格）、余额不足差额、超精度截断、`全部`（ERC20 满额 / 原生留 0.001）与回执金额逐 wei 一致；正常一笔 / 连续两笔 / 双击只发一笔 / 慢钱包「转账中…」+ 三处输入禁用 / 取消签名人话错误可重试 / 回执关闭落成功条且余额刷新、输入清空 / 链上回滚人话错误且无回执；回执收款地址与哈希复制逐字一致、身份 owner 地址复制、剪贴板失败降级「复制失败」；未连接 / 错误网络 / 链切换 / 深链无 `?symbol=` / 地址簿为空降级；移动端 390×844（代币与回执均为底部 sheet、ESC 关闭落成功条）、360 宽无横向溢出、桌面 1280×800、浅色/深色；切换钱包账户后余额/地址跟随且表单保留。

---

## 一、已验证缺陷（可复现）

### D1 · P1 · 提交后刷新丢失在途交易状态，同一笔可被重复提交 → 实测双转账（收款方实收 2 倍）

**状态：已修（2026-11-14）。** 在途交易落盘并在刷新后恢复 pending 卡片、继续 watch 同一哈希；在途/恢复中禁止新提交（`use-transfer-transaction.ts` + `transfer-record.ts`）。e2e 见上表。

- **期望**：交易已广播（页面已显示「交易已经提交，等待上链。0xd63c…」）后刷新，应恢复这笔交易的 pending 或回执（`docs/product/m0-ux-spec.md` §3.3 对铸造页的同类要求：「用户刷新页面时若有未完成交易，应看到恢复后的 pending 或收据，而不是空白表单」；兑换页也已持久化收据）。至少不能在用户不知情时让同一笔转账被再发一次。
- **实际**：在 pending 卡片可见时 `F5` 刷新 → 页面回到**完全空白表单**：没有 pending、没有回执、没有成功条、也没有任何「有一笔已提交的交易」提示（`afterReload={"pending":0,"receipt":0,"strip":0,"amount":"","recipient":""}`）。第一笔仍在链上确认（收款方 +1 TestLOVE20）；用户认为没转出去、重新填 1 并提交 → 第二笔也上链，**收款方余额 +2 TestLOVE20**，而 UI 只展示了第二笔的回执。
- **最小复现步骤**：
  1. 8584 链 + 5190 dev server；打开 `/transfer?symbol=TestLOVE20`，连接 anvil #4（`0x90F7…b906`，99,999,099.99 TestLOVE20）；
  2. 选 `TestLOVE20`，金额 `1`，收款方 `0x14dC79964da2C08b23698B3D3cc7Ca32193d9955`（#8），点「确认转账」；
  3. 等 `data-testid="tx-watch-pending"` 出现（哈希已知、尚未出回执）后立刻 `page.reload()`；
  4. 重连后观察：表单为空、无任何 pending/回执痕迹；
  5. 再填金额 `1`、同一收款方、提交；等两笔都上链后 `cast call balanceOf(#8)` → **2e18**（2 个 TestLOVE20）。
- **证据**：`/tmp/qa-transfer-S7-pending-before-reload.png`（刷新前 pending 卡片）、`/tmp/qa-transfer-S7-after-reload-blank.png`（刷新后空白表单）、`/tmp/qa-transfer-S7-second-receipt.png`；`/tmp/qa-transfer/results.json` 中 `S7.actual`：`pendingBeforeReload="交易已经提交，等待上链。 0xd63c514937…22f84a45 …" firstSendCount=1 afterReload={"pending":0,"receipt":0,"strip":0,"amount":"","recipient":""} sendCountAfterSecondClick=1 recipientDelta=2000000000000000000 wei`。代码路径：`src/features/transfer-token/model/use-transfer-transaction.ts` L59-60（`pending`/`receipt` 只在组件内存里，没有 `cache` 落盘；对比 `use-mint-transaction.ts`/`use-swap-transaction.ts` 都写了 `StoredTask`/收据）。
- **一句话修复方向**：把 `{hash, request}` 与最近一笔回执按 `cache.ts` 命名空间落盘，首帧读出后重建 pending/回执（或至少在存在未决 pending 时禁用再次提交并给出「这笔还没确认」提示）。

### D2 · P1 · 交易丢失/卡住的恢复卡出现后，主按钮「确认转账」可点但静默无效（dead CTA）

**状态：已修（2026-11-14）。** 恢复卡出现时主按钮禁用并写明下一步；继续入口是卡里的「重新提交」。

- **期望**：`tx-watch` 进入 `slow | dropped | replaced | nonceGap` 时页面「必须渲染恢复卡 **并重新启用主操作**，绝不能是死路」（`src/shared/lib/tx-watch.ts` L159-167 的契约）。既然重新启用，点它就必须真的发出交易（或明确让人去点「重新提交」），不能什么都不发生。
- **实际**：钱包返回一个链上不存在的哈希 → 10s 后恢复卡出现（「这笔交易还没有被确认 / 链上没有找到这笔交易，它可能已经丢失。」）；此时主按钮 `disabled=false`。点击「确认转账」：`sendCount` 仍为 1（没有发新交易）、没有 error alert、没有 pending/回执、没有任何文案变化——**可点的主按钮完全静默**。真正能继续的是恢复卡里的「重新提交」（点了会发新交易并成功出回执）。
- **最小复现步骤**：
  1. 打开 `/transfer?symbol=TestLOVE20`，连接 #1；stub 钱包让**第一次** `eth_sendTransaction` 返回合法格式但链上不存在的哈希（如 `0xabab…ab01`），之后放行真实发送；
  2. 选 `TestLOVE20`、金额 `0.1`、收款方 `0x2361…1E8f`，提交；
  3. 等 ~10s（`VITE_TX_DEADLINE_MS=10000`）到恢复卡出现；
  4. 点页面底部的主按钮「确认转账」→ 观察 1.5s：无新 `eth_sendTransaction`、无提示；再点恢复卡「重新提交」→ 新交易发出并出回执。
- **证据**：`/tmp/qa-transfer-S8-recovery-card.png`；`/tmp/qa-transfer/results.json` 中 `S8.actual`：`submitDisabledAfterStuck=false sendsBefore=1 sendsAfterMainClick=1 feedbackOnMainClick=false sendsAfterResubmit=2 receiptAfterResubmit="0.1 TestLOVE20"`。代码路径：`transfer-token-panel.tsx` L185（`busy = tx.stage !== 'idle' || receipt !== null`；stuck 时 `stage='idle'` → `canSubmit=true` 且按钮可点）与 `use-transfer-transaction.ts` L149（`submit()` 在 `pending !== null` 时直接 `return`，没有反馈）。
- **一句话修复方向**：stuck 状态下主按钮改为调用既有 `resubmit()`（或改成「重新提交」文案/直接禁用并在恢复卡里引导），并保证 `submit()` 的早退至少给出可见反馈。

### D3 · P2 · 余额读取失败时仍可提交，且没有「余额未知」提示

**状态：已修（2026-11-14）。** 余额未知时主按钮禁用 +「余额暂时读不到，稍后重试。」+ 重新读取入口。

- **期望**：余额读不到时要么禁止提交（无法判断是否超额），要么显式提示「余额暂时读不到，仍可提交但可能被链上拒绝」。页面自己已有「余额暂时读不到」的文案，说明这是被承认的状态。
- **实际**：让 RPC 拒绝 `balanceOf`/`eth_getBalance` 后，余额行显示「余额暂时读不到」（正确），「全部」按钮禁用（正确），但**主按钮仍可点**：填 `1` + 合法收款方后 `submitDisabled=false`。页面没有任何提示告诉用户余额未知；超额的唯一后果是钱包/链上拒绝（错误会映射成「不够付手续费」等人话，但已经是提交之后了）。
- **最小复现步骤**：
  1. Playwright 拦截发往 `http://127.0.0.1:8584` 的 JSON-RPC，把 body 含 `70a08231`（`balanceOf`）或 `eth_getBalance` 的请求回成 JSON-RPC error（其它请求放行）；
  2. 打开 `/transfer?symbol=TestLOVE20` 连接 #1、选 `TestLOVE20`，等余额行变「余额暂时读不到」；
  3. 金额 `1`、收款方任意合法地址 → 主按钮可点。
- **证据**：`/tmp/qa-transfer-X1-balance-read-failure.png`；`results.json` 中 `X1.actual`：`balance="余额暂时读不到" submitDisabled=false maxDisabled=true`。代码路径：`transfer-token-panel.tsx` L177-193（`insufficient` 依赖 `spendable`，`balance === undefined` 时直接为 `false`；`canSubmit` 没有 balance-known 条件）。
- **一句话修复方向**：把「余额已读到」纳入 `canSubmit`（或在余额未知时把主按钮改为「余额读不到，先重试」并给 `refetch` 入口）。

### D4 · P2 · 刷新后已完成的转账回执 / 成功条 / 哈希全部丢失

**状态：已修（2026-11-14）。** 刷新后恢复成功条（金额 + 可复制哈希 + 浏览器链接），回执 sheet 不重复弹出。

- **期望**：刷新后仍能看到最近一笔转账的结果（成功条或回执），至少保留 hash 供核对；兑换页/铸造页/空投页都持久化了收据（`swap-receipt-record.ts`、`use-mint-transaction.ts`、`airdrop-claim-record.ts`），本页没有。
- **实际**：转账成功 → 点「知道了」→ 成功条「已转出 0.1 TestLOVE20」可见 → `F5` → 成功条、回执、hash 全部消失，只剩余额数字（余额本身是链上真值，所以用户看不出刚才那笔的结果）。
- **最小复现步骤**：
  1. `/transfer` 连接 #1，转 `0.1 TestLOVE20` 给 #8 → 回执出现 → 点「知道了」看到成功条 → 记下 hash；
  2. `F5` 刷新并重新连接；
  3. 观察：`transfer-success-strip` 与 `transfer-receipt-*` 计数均为 0。
- **证据**：`/tmp/qa-transfer-S10-refresh-lost-strip.png`；`results.json` 中 `S10.actual`：`hashBeforeReload="0x736eeab838…" stripAfterReload=0 receiptAfterReload=0`。
- **一句话修复方向**：与 D1 同一处落盘：把 `TransferRecord` 存进 namespaced cache，首帧恢复成功条（对齐 swap 的 receipt record 口径）。

### D5 · P3 · 余额为 0 时「全部」仍可点，填入 `0` 并触发「金额必须大于 0。」

**状态：已修（2026-11-14）。** 可花余额为 0 时「全部」禁用。

- **期望**：可花余额为 0 时「全部」禁用（和余额读取中时一样），不要产生一个注定非法的金额。
- **实际**：`spendable=0` 时代币与原生币两种情况下「全部」都 `enabled=true`；点击后金额输入变 `0`，紧接着出现错误行「金额必须大于 0。」，主按钮禁用——一次点击换来一个错误态。
- **最小复现步骤**：
  1. `/transfer` 连接 #6（`0x9965…A4dc`，TestLOVE20 余额 0）→ 选 `TestLOVE20` → 点「全部」→ 输入框 `0` + 错误行；
  2. 原生币场景：#10（`0xa0Ee…3F16`，ETH 0）连接后点「全部」→ 输入框 `0` + 同一错误行。
- **证据**：`/tmp/qa-transfer-A6-max-zero-balance.png`、`/tmp/qa-transfer-X3-native-max-zero.png`；`results.json` 中 `A6.actual`：`maxButtonEnabled=true filled="0" error="金额必须大于 0。" disabled=true`；`X3.actual` 同形。
- **一句话修复方向**：「全部」按钮的 disabled 条件从 `balance === undefined` 改为 `spendable === undefined || spendable === 0n`。

### D6 · P3 · 两个身份模式的输入是同一份文本：ID→名字 切换后残留 `#2` 被当名字查询并报 not-found

**状态：已修（2026-11-14）。** ID 与名字各存一份输入，切模式不重解释另一模式的文本。

- **期望**：切换收款方类型时不清空用户输入（现在是独立保留地址/身份两份），但**身份 ID 与身份名字是两种语义**，切到名字模式后不应把 ID 模式的 `#2` 当成名字去查并弹错。规范口径：「模式显式决定输入含义，不从文本猜」「切模式会清空上一模式的解析结果与确认勾选」。
- **实际**：地址模式填的地址在切到身份模式后为空、切回来仍在（正确）；但 `identityInput` 被 ID 与名字两个模式共享：ID 模式解析 `#2` 并勾选确认 → 切到名字模式，输入框里还是 `#2`，即刻按名字查询并显示「没有找到这个名称对应的身份 NFT。」；再切回 ID 模式能重新解析，但确认勾选已被清空（这一半正确）。用户看到的是一个莫名的错误。
- **最小复现步骤**：
  1. `/transfer` 连接 #1，选 `TestLOVE20`；收款方切「按身份 NFT ID」，输入 `#2`，出现确认块后勾选，填金额；
  2. 左侧下拉切「按身份 NFT 名字」→ 输入框仍为 `#2`，出现「没有找到这个名称对应的身份 NFT。」，确认块消失；
  3. 再切回「按身份 NFT ID」→ 重新解析出 #2，但勾选已清空、主按钮禁用。
- **证据**：`/tmp/qa-transfer-R11-mode-switch-residual.png`；`results.json` 中 `R11.actual`：`addressKept="0x2361…1E8f" memberInputEmpty=true addressBack="0x2361…1E8f" beforeSwitchDisabled=false nameModeResidualValue="#2" summaryInName=0 ackAfterReturn=false afterSwitchDisabled=true`。
- **一句话修复方向**：`identityInput` 按模式分开存（ID/名字各自一份），或切到另一身份模式时清空该输入（与「切模式清空解析结果」同一动作）。

### D7 · P3 · 慢 RPC 下链上规范名还没读到时，身份确认门禁已可勾选并提交

**状态：已修（2026-11-14）。** `memberName` 读取期间确认块不渲染（「正在读取身份名字…」），名字到达后才可勾选/提交。

- **期望**：规范（UX spec §3.10）：身份模式解析成功后显示「身份 NFT #{id} {name}」+ 收款人地址，**必须勾选确认才能提交**；名字是防混淆的唯一补充信息，应当和 id、地址一起在门禁里就绪。
- **实际**：把 `memberName(uint256)`（selector `0xe92ced07`）延迟 6s、其余 RPC 正常时，`ownerOf` 一回来确认块就出现，但标题只有「身份 NFT #2」（无名字）；勾选框可见、勾选并填金额后主按钮**已经可点**；6s 后名字才补进标题（此时内容才完整）。也就是说慢 RPC 下用户可以在看不到名字的情况下确认提交。
- **最小复现步骤**：
  1. Playwright 拦截 8584 RPC，把 body 含 `e92ced07` 的请求延迟 6s 后放行；
  2. `/transfer` 连接 #1、选 `TestLOVE20`、收款方切「按身份 NFT ID」、输入 `#2`；
  3. 确认块一出现（名字还没回）就勾选确认、填 `0.1` → 主按钮可点；截图标题只有 `身份 NFT #2`。
- **证据**：`/tmp/qa-transfer-G1-identity-gate-name-pending.png`；`results.json` 外部记录 `G1.actual`：`titleWhileNamePending="身份 NFT #2 收款人 0x7099…79C8 我确认 #2 及上面的收款地址都正确" ackCheckboxVisible=true submitDisabledWhileNamePending=false titleAfterNameArrived="身份 NFT #2 Testdev-member-1 …"`。代码路径：`use-identity-recipient.ts` L73-81（id 模式的 `name` 只是 `memberName` 读的产物，`identityResolved` 只看 id/address）与 `transfer-token-panel.tsx` L186-193（`canSubmit` 不要求 `identity.name`）。
- **一句话修复方向**：id 模式在 `memberName` 未落定前把确认块标记为「读取名字中」并保持主按钮禁用（或确认勾选在名字到达前不可勾）。

---

## 二、场景矩阵（逐场景：期望 / 实际 / 级别 / 证据）

> 级别列只标缺陷：`Px · Dy`。`—` 表示该场景期望行为全部成立。证据列省略了 `results.json` 的逐条 JSON（见文末），只列截图；未列截图的行，实测值已足够复算（均在 `results.json`）。

### 入口与网络

| 场景 | 期望（要点） | 实际（实测） | 级别 | 证据 |
| --- | --- | --- | --- | --- |
| E1 未连接钱包 | 状态卡「连接钱包后转账。」+ 连接按钮；不出现转账表单 | title=连接钱包后转账。 connectBtn=true formCount=0 | — | `/tmp/qa-transfer-E1-disconnected.png` |
| E2 错误网络（钱包在 chain 1） | 「切换到这个应用使用的网络后再转账。」+ 回首页；不出现转账表单 | wrongChainCard=ok backHome=true formCount=0（console 仅 1 条资源 404，无 pageerror） | — | `/tmp/qa-transfer-E2-wrong-chain.png` |
| E3 已连接后钱包切到错误网络（chainChanged） | 页面响应切链，出现错误网络状态卡（不留在可提交表单） | wrongChainCardAfterChainChanged=true | — | `/tmp/qa-transfer-E3-chain-changed.png` |
| E4 深链 /transfer（无 ?symbol=） | 页面可直接使用：原生币余额可见、代币选择器可用、URL 不被强行改写 | url=http://127.0.0.1:5190/transfer?symbol=TestLOVE20 communityTokenVisible=true | — | `/tmp/qa-transfer-E4-deeplink-no-symbol.png` |
| N1 地址簿未配置（空地址簿部署）时的 /transfer 降级 | 原生币可用；无社区代币时「还没有发现社区代币。」；无包装/LP 分组；身份模式提示「这个环境还没有配置身份 NFT 合约。」；自定义 ERC20 仍可用；… | pickerHasNative=true 空社区提示=true 无包装分组=true 无LP分组=true 自定义QAUSD可加=true 精度行=精度 6 位 身份未配置提示=true consoleErrors=[] | — | `/tmp/qa-transfer-N1-empty-addressbook-picker.png`、`/tmp/qa-transfer-N1-empty-addressbook-identity.png` |

### 代币选择

| 场景 | 期望（要点） | 实际（实测） | 级别 | 证据 |
| --- | --- | --- | --- | --- |
| T1 默认原生币 + 余额行规则 | 按地址默认；余额行「10,000」不带 symbol / 不带「余额」/ 无精度行；代币下拉显示 ETH | balance="10,000" trigger="ETH" decimalsRows=0 「代币」titleCount=0 | — | `/tmp/qa-transfer-T1-native-default.png` |
| T2 代币选择器分组与顺序 | 分组顺序 原生币 → 社区代币 → 包装原生币 → 流动性凭证；条目 ETH / TestLOVE20 / TestWETH / UNI-V2 | groupPositions=[26,36,54,71] rows=true,true,true,true | — | `/tmp/qa-transfer-T2-token-picker.png` |
| T3 选择社区代币 TestLOVE20 | 下拉显示 TestLOVE20，余额 99,799,100，无精度行（18 位） | trigger="TestLOVE20" balance="99,799,100" decimalsRows=0 | — | — |
| T4 选择包装原生币 TestWETH（余额 0） | 下拉显示 TestWETH，余额 0，无精度行 | trigger="TestWETH" balance="0" | — | — |
| T5 选择 LP 代币 UNI-V2（余额 0） | 下拉显示 UNI-V2，余额 0 | trigger="UNI-V2" balance="0" | — | — |
| T6 自定义 ERC20：6 位精度 QAUSD（余额 1,00… | 添加后自动选中，下拉含「自定义」、余额 1,000、显示「精度 6 位」 | trigger="QAUSD" decimals="精度 6 位" balance="1,000" | — | `/tmp/qa-transfer-T6-custom-6-decimals.png` |
| T7 自定义代币：非合约地址（EOA） | 「这个地址上没有合约，不能作为代币。」，不产生代币条目 | error="这个地址上没有合约，不能作为代币。 重新读取" triggerStill="ETH" | — | `/tmp/qa-transfer-T7-custom-eoa.png` |
| T8 自定义代币：非 40 位地址 | 「这不是一个有效的代币地址，需要 0x 开头的 40 位地址。」 | error="这不是一个有效的代币地址，需要 0x 开头的 40 位地址。 重新读取" | — | — |
| T9 自定义代币：读不到 symbol/decimals（Mem… | 「读不到这个代币的名称或精度，暂时不能转账。」 | error="读不到这个代币的名称或精度，暂时不能转账。 重新读取" | — | — |
| T10 代币搜索：无结果 / 精确 symbol / 关闭后清空 | 搜索无结果提示、精确 symbol 可选中、关闭选择器后搜索词清空 | emptyShown=true selected=TestLOVE20 reopenSearchValue="" | — | — |
| T11 切换代币后金额残留 + 6 位精度截断 | 18 位代币输入 1.123456789 后切到 6 位代币：截断提示「已按精度截断到 6 位小数。」，提交金额 1.123456 | amountInput="1.123456789" truncationHint=1 submitDisabled=false receipt="1.123456 QAUSD" | — | `/tmp/qa-transfer-T11-truncation-6-decimals.png` |

### 收款方：按地址 / 身份 NFT

| 场景 | 期望（要点） | 实际（实测） | 级别 | 证据 |
| --- | --- | --- | --- | --- |
| R1 按地址校验：非法 / 零地址 / 自己 | 三种错误文案各自出现且主按钮禁用，不发交易 | 收款地址格式不对，需要 0x 开头的 40 位地址。=disabled:true / 收款地址不能是零地址。=disabled:true / 不能转给自己。=disabled:true | — | `/tmp/qa-transfer-R1-address-invalid.png` |
| R2 已知合约（pair）：强制勾选门禁 + 换收款方后勾选失效 | 显示「这是「交易对」合约地址」+ 勾选框；未勾选禁用；勾选后可提交；换地址后勾选自动清空 | disabledBefore=true disabledAfter=false warning=true knownGone=true disabledContract=false ackAfterRecipientChange=false disabledBack=true | — | `/tmp/qa-transfer-R2-known-contract.png` |
| R3 任意合约地址（QAUSD 代币合约）：只警告不阻断 | 出现「这个地址是一个合约」警告；主按钮仍可提交 | warning="这个地址是一个合约 转进合约的代币可能取不回来，请确认你清楚它的用途。" submitDisabled=false sendCount=0 | — | — |
| R4 按身份 NFT ID：#2 解析 + 勾选门禁（#2 与 … | 「身份 NFT #2 Testdev-member-1」+「收款人 0x7099…79C8」；未勾选禁用，勾选后可提交 | title="身份 NFT #2 Testdev-member-1 收款人 0x7099…79C8 我确认 #2 及上面的收款地址都正确" recipient="收款人 0x7099…79C8" disabledBefore=true disabledAfter=false noHash="身份 … | — | `/tmp/qa-transfer-R4-identity-id.png` |
| R5 ID 模式非法输入：名字文本 / # / 非数字 | 「请输入身份 NFT 编号，例如 #12。」且不出现身份确认块、主按钮禁用 | Testdev-member-1 => ok, summary=0, disabled=true / # => ok, summary=0, disabled=true / 12abc => ok, summary=0, disabled=true | — | — |
| R6 ID 模式填自己的身份 NFT（#1，账户 #1） | 「这是你自己的身份 NFT。」，不出现收款人卡片，主按钮禁用 | selfError=ok summary=0 disabled=true | — | `/tmp/qa-transfer-R6-identity-self.png` |
| R7 ID 模式不存在的编号 #9999 | 「这个身份 NFT 不存在。」，主按钮禁用 | error=ok disabled=true | — | — |
| R8 名字模式：Testdev-member-1 与大小写变体 | 名字解析到「身份 NFT #2 Testdev-member-1」；大小写不敏感（合约统一小写） | Testdev-member-1=ok / TESTDEV-MEMBER-1=ok / testdev-member-1=ok | — | `/tmp/qa-transfer-R8-identity-name.png` |
| R9 名字模式：不存在的名字 | 「没有找到这个名称对应的身份 NFT。」，主按钮禁用 | error=ok disabled=true | — | `/tmp/qa-transfer-R9-name-not-found.png` |
| R10 名字模式：自己的名字 Testdev-member-0 | 「这是你自己的身份 NFT。」 | selfError=true summary=0 disabled=true | — | — |
| R11 切换收款方模式：输入残留与确认勾选重置 | 各模式输入独立保留；切模式清空上一模式的解析结果与勾选；共享的身份输入在两个身份模式间残留文本 | addressKept="0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f" memberInputEmpty=true addressBack="0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f" beforeSwitchD… | P3 · D6 | `/tmp/qa-transfer-R11-mode-switch-residual.png` |
| R12 纯数字身份 NFT 名字（不可复现） | 名字模式对纯数字名字按名字查（memberId），不会被当成 ID | BLOCKED：名字模式输入 `12345` 得到「没有找到这个名称对应的身份 NFT。」（未按 ID 解析）；卡点见「未复现」。 | — | — |
| G1 慢 RPC：链上规范名还没读到时身份确认门禁已可勾选/提交 | 规范：确认块显示 id + 链上规范名 + 收款地址后主按钮才可提交 | 名字未到时确认块标题="身份 NFT #2 收款人 0x7099…79C8 我确认 #2 及上面的收款地址都正确"，勾选框可见，勾选+填金额后主按钮已可点；6s 后名字才补上 | P3 · D7 | `/tmp/qa-transfer-G1-identity-gate-name-pending.png` |

### 金额

| 场景 | 期望（要点） | 实际（实测） | 级别 | 证据 |
| --- | --- | --- | --- | --- |
| A1 金额门禁：空 / 0 / 负数 / 非数字 / 千分位逗号… | 空=禁用无错误；0=「金额必须大于 0。」；负数/abc/1.2.3/1,5/1 000=「请输入有效的金额。」；首尾空格合法 | empty disabled=true errors=0 / 0=>金额必须大于 0。 disabled=true / 0.000=>金额必须大于 0。 disabled=true / -1=>请输入有效的金额。 disabled=true / abc=>请输入有效的金额。 disabled=tr… | — | `/tmp/qa-transfer-A1-amount-gates.png` |
| A2 余额不足：ERC20 差 1 / 原生币差 0.001 | 「TestLOVE20 不够，还差 1」/「ETH 不够，还差 0.001」+ 预留提示；主按钮禁用 | erc20="TestLOVE20 不够，还差 1" disabled=true / native="ETH 不够，还差 0.001" gasNote=1 disabled=true | — | `/tmp/qa-transfer-A2-insufficient.png` |
| A3 18 位代币超精度截断并提交 | 「已按精度截断到 18 位小数。」，提交值 = 1.5，回执「1.5 TestLOVE20」 | truncationHint=1 disabled=false receipt="1.5 TestLOVE20" | — | — |
| A4 「全部」ERC20：输入满额、可提交、余额归零 | 输入 = 完整余额；可提交；回执按 6 位小数显示；关闭后余额 0 | amountInput="99999099.999819999991" expectedInput="99999099.999819999991" disabled=false amountErrors=0 receipt="99,999,099.999819 TestLOVE20" expect… | — | `/tmp/qa-transfer-A4-max-erc20.png` |
| A5 「全部」原生币：预留 0.001 并提交 | 输入 9999.999；提示「已为网络手续费预留约 0.001 ETH。」；回执「9,999.999 ETH」 | amountInput="9999.999" expectedInput="9999.999" note=1 disabled=false receipt="9,999.999 ETH" expectedReceipt="9,999.999" balanceAfter="0.000978" | — | `/tmp/qa-transfer-A5-max-native.png` |
| A6 余额为 0 时点「全部」 | 余额 0 时「全部」不应产生一个非法金额（理想：按钮禁用） | maxButtonEnabled=true filled="0" error="金额必须大于 0。" disabled=true | P3 · D5 | `/tmp/qa-transfer-A6-max-zero-balance.png` |

### 提交 / 回执 / 恢复

| 场景 | 期望（要点） | 实际（实测） | 级别 | 证据 |
| --- | --- | --- | --- | --- |
| S1 正常一笔 ERC20：回执 → 知道了 → 成功条 + 余… | 回执「已转出 0.5 TestLOVE20」；关闭后成功条「已转出 0.5 TestLOVE20」、余额 99,799,099.5、金额与收款方清空、UR… | beforeDisabled=false receipt="0.5 TestLOVE20" recipient="0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f" hashOk=true strip="已转出 0.5 TestLOVE20" balance="… | — | `/tmp/qa-transfer-S1-receipt.png`、`/tmp/qa-transfer-S1-success-strip.png` |
| S2 连续两笔：第二笔回执与成功条更新、不串数据 | 第一笔 1 成功后成功条「已转出 1 …」；第二笔 2.5 成功后回执与成功条都变成 2.5，余额正确累计 | first="1 TestLOVE20" strip1="已转出 1 TestLOVE20" second="2.5 TestLOVE20" strip2="已转出 2.5 TestLOVE20" balance="99,799,094.5" | — | `/tmp/qa-transfer-S2-consecutive.png` |
| S3 双击提交：同一毫秒两次点击只发一笔 | sendCount=1、只出现一笔回执、余额只减一次 | sendCount=1 receipt="0.1 TestLOVE20" recipientDelta=100000000000000000 wei | — | `/tmp/qa-transfer-S3-double-click.png` |
| S4 慢钱包 3.5s：按钮「转账中…」+ 输入禁用 | 点按后按钮文案「转账中…」并禁用；金额/收款方/代币下拉禁用；签名返回后上链并出回执 | buttonText="转账中…" buttonDisabled=true amountDisabled=true recipientDisabled=true tokenDisabled=true receiptAfter=6490ms receipt="0.2 TestLOVE20" | — | `/tmp/qa-transfer-S4-wallet-pending.png` |
| S5 用户取消签名（4001） | 人话错误「你在钱包里点了取消，没有转出。」；主按钮恢复可点；不出现回执/成功条；余额不变 | error="你在钱包里点了取消，没有转出。" submitDisabled=false receipt=0 strip=0 sendCount=1 balanceUnchanged=true | — | `/tmp/qa-transfer-S5-user-rejected.png` |
| S6 刷新后首笔：reload 后钱包自动重连并立刻转账 | 刷新后自动重连，第一笔转账直接成功并出回执 | submitDisabled=false receipt="0.25 TestLOVE20" consoleErrors=[] | — | — |
| S7 提交后立刻刷新：pending 状态丢失 + 可重复提交导… | 刷新后应能看到这笔交易的 pending/回执（同 swap/铸造的恢复要求）；实际：页面回到空白表单，可再次提交同一笔 | pendingBeforeReload="交易已经提交，等待上链。 0xd63c514937…22f84a45 约 10 秒后仍未确认，可以重新提交一笔。 重新查询" firstSendCount=1 afterReload={"pending":0,"receipt":0,"strip":0,"… | P1 · D1 | `/tmp/qa-transfer-S7-pending-before-reload.png`、`/tmp/qa-transfer-S7-after-reload-blank.png` |
| S8 交易丢失（钱包返回不存在的哈希）：恢复卡 + 主按钮死点 … | 过期后出现恢复卡（「这笔交易还没有被确认」+ 丢失说明）；主按钮可点且点击应有效；「重新提交」应发出新交易并成功 | recovery="这笔交易还没有被确认 链上没有找到这笔交易，它可能已经丢失。 重新提交 重新查询 0xababababab…ababab01" submitDisabledAfterStuck=false sendsBefore=1 sendsAfterMainClick=1 feedback… | P1 · D2 | `/tmp/qa-transfer-S8-recovery-card.png` |
| S9 回执关闭后再操作：成功条保留、新一笔回执正常 | 成功条存在时修改金额/切换代币，成功条不遮挡新操作；再次提交得到新回执 | strip1="已转出 0.1 TestLOVE20" stripWhileTyping="已转出 0.1 TestLOVE20" disabled=false receipt2="0.2 TestLOVE20" strip2="已转出 0.2 TestLOVE20" | — | `/tmp/qa-transfer-S9-after-receipt-dismiss.png` |
| S10 回执关闭后刷新：成功条与交易记录丢失 | 刷新后至少保留最近一笔回执/成功条（同页其他写操作页面的持久化口径） | hashBeforeReload="0x736eeab838…" stripAfterReload=0 receiptAfterReload=0 balance="9,892.051836" | P2 · D4 | `/tmp/qa-transfer-S10-refresh-lost-strip.png` |
| S11 提交后按钮防重入（回执出现前不会再发第二笔） | 回执出现前，即使输入仍然合法，主按钮也不可再触发第二笔 | submitDisabledWhileMining=true sendCount=1 | — | — |
| S12 链上回滚（原生币转给没有 receive 的合约） | 回滚后给人话错误「交易上链了，但没有成功。你的资产没有变化。」；不出现回执/成功条；主按钮恢复可点 | disabledBefore=false error="交易上链了，但没有成功。你的资产没有变化。" receipt=0 strip=0 disabledAfter=false | — | `/tmp/qa-transfer-S12-reverted.png` |

### 复制与响应式

| 场景 | 期望（要点） | 实际（实测） | 级别 | 证据 |
| --- | --- | --- | --- | --- |
| C1 回执收款地址复制（剪贴板内容逐字比对） | 点击收款人地址后出现「已复制」，剪贴板 = 0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f | clipboard="0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f" | — | `/tmp/qa-transfer-C1-copy-receipt-recipient.png` |
| C2 回执交易哈希复制 | 点「复制交易哈希」后出现「已复制」，剪贴板 = 回执显示的完整 64 位哈希 | hash="0x26ea46816dc118761c83f04c9cb42615675038851ee92a56480edffe1bd5cca6" clipboard="0x26ea46816dc118761c83f04c9cb42615675038851ee92a56480edffe1bd5cc… | — | `/tmp/qa-transfer-C2-copy-hash.png` |
| C3 身份 NFT 卡片收款地址复制 | 「收款人 0x7099…79C8」点击后复制完整 owner 地址（0x7099…79C8 全量） | label="收款人 0x7099…79C8" clipboard="0x70997970C51812dc3A010C7d01b50e0d17dc79C8" | — | `/tmp/qa-transfer-C3-copy-identity-owner.png` |
| C4 剪贴板不可用时的降级提示 | 复制失败时显示「复制失败」，不静默失效 | copyFailedShown=true | — | `/tmp/qa-transfer-C4-copy-failed.png` |
| V1 移动端 390×844 浅色：表单 / 代币 sheet … | 表单无横向溢出；代币选择器为底部 sheet；回执为底部 sheet，可「知道了」关闭并留在原页 | formWidth={"scroll":390,"inner":390} tokenSheetDialog=true receiptDialog=true afterWidth={"scroll":390,"inner":390} | — | `/tmp/qa-transfer-V1-mobile-light-form.png`、`/tmp/qa-transfer-V1-mobile-light-token-sheet.png` |
| V2 移动端 390×844 深色：主题生效 + 表单/回执截图 | data-theme=dark 生效，表单与回执深色渲染，无控制台错误 | data-theme=dark consoleErrors=[] | — | `/tmp/qa-transfer-V2-mobile-dark-form.png`、`/tmp/qa-transfer-V2-mobile-dark-receipt.png` |
| V3 桌面 1280×800 深色：表单 / 资产保护 / 回执… | 桌面端回执为页面内卡片；深色主题表单一屏可见；无横向溢出 | data-theme=dark receiptIsDialog=false width={"scroll":1280,"inner":1280} | — | `/tmp/qa-transfer-V3-desktop-dark-form.png`、`/tmp/qa-transfer-V3-desktop-dark-protection.png` |
| V4 360×800 最窄宽度：表单不横向溢出 | 360 宽下 scrollWidth ≤ innerWidth（无横向滚动） | scrollWidth=360 innerWidth=360 | — | `/tmp/qa-transfer-V4-360-form.png` |
| X4 移动端回执 sheet：按 ESC 关闭后落成功条 | 底部 sheet 用 ESC/遮罩关闭也走 onDismiss：留在原页 + 成功条，不丢数据 | stripAfterEscape=true stripAmount="已转出 0.05 TestLOVE20" url=http://127.0.0.1:5190/transfer?symbol=TestLOVE20 | — | `/tmp/qa-transfer-X4-mobile-sheet-escape.png` |

### 边界 / 降级

| 场景 | 期望（要点） | 实际（实测） | 级别 | 证据 |
| --- | --- | --- | --- | --- |
| X1 余额读取失败（RPC 层拒绝 balanceOf / et… | 余额行显示「余额暂时读不到」；不清楚余额时主按钮不应假装一切正常（至少给出不可提交/提示） | balance="余额暂时读不到" submitDisabled=false maxDisabled=true | P2 · D3 | `/tmp/qa-transfer-X1-balance-read-failure.png` |
| X2 外部抢跑：提交前余额被清空 → 发送失败人话错误 | 钱包/链上拒绝时给人话错误（不出现 gas / nonce / revert / 原始 hex），不出现回执 | error="ETH 不够付手续费。请先转一点 ETH 进来。" receiptCount=0 | — | `/tmp/qa-transfer-X2-insufficient-after-race.png` |
| X3 余额为 0 的原生币点「全部」 | 余额 0 时「全部」不应产生非法金额（理想：按钮禁用） | maxButtonEnabled=true filled="0" error="金额必须大于 0。" | P3 · D5 | `/tmp/qa-transfer-X3-native-max-zero.png` |
| X5 钱包永不返回（挂起）时的页面状态 | 钱包长时间不返回时页面停在「转账中…」；至少不出现回执/错误，且用户可离开（记录体验事实） | after12s button="转账中…" disabled=true errorCount=0 | — | `/tmp/qa-transfer-X5-wallet-hanging-12s.png` |
| X6 表单填好后切换钱包账户 | 切换账户后地址/余额跟随新账户，收款方与金额保留，可按新账户正常提交 | balance="99,999,099.999639" amountKept="0.1" recipientKept="0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f" submitDisabled=false receipt="0.1 TestLOVE20" | — | `/tmp/qa-transfer-X6-account-switch.png` |
---

## 三、怀疑但未复现 / 卡点

| 项 | 期望 | 卡在哪一步 | 处理 |
| --- | --- | --- | --- |
| R12 纯数字身份 NFT 名字 | 名字模式对「存在且纯数字」的名字按 `memberId(name)` 查，不会被当成 ID（owner 2026-11-14 的防混淆要求） | dev 变体名称必须以 `Test` 开头（`mint` 规则），链上**无法注册纯数字名字**；只能验证「不存在的纯数字文本」在名字模式得到「没有找到这个名称对应的身份 NFT。」（未走 ID 解析），无法构造正向用例 | BLOCKED，未列为缺陷。建议在 test 环境用允许任意名字的部署或 `anvil_setStorage` 造一个纯数字名字再补测 |
| 自定义 ERC20 的「错误 decimals」 | 例如 `decimals()=0/255` 或返回非 `uint8` 时代币选择器的表现 | 本次只覆盖了合法 6 位（`QAUSD`）与「读不到 metadata」（MemberNFT 合约 / EOA）；没有部署 decimals 异常值的合约 | 未覆盖。可另发一个只返回异常 `decimals()` 的测试合约补测（`useCustomToken` 对非 `number` 结果落到 `unreadable`，风险低） |
| 钱包 Promise 永不 settle | 页面永久停在「转账中…」（X5 实测 12s 后仍如此） | 无法在真实浏览器钱包里构造「永不返回」；stub 构造的挂起是否等同真实钱包行为存疑 | 记为**体验观察**，未列缺陷（浏览器钱包自身可取消） |
| 成功条不随新操作消失 | 关闭回执后再输入新金额/切代币，顶部仍显示上一笔「已转出 X」（S9 实测） | 非规范明确要求；与铸造页 sticky 条口径一致 | 记为**待产品确认的观察**，未列缺陷 |

## 四、补充说明（环境与可复算性）

1. **基线冻结**：因并行 agent 正在改 swap 及其共享模块（`token-picker` / `copy-pages` / `tx-watch` / `use-tx-watch`），活动工作区的 dev server 会 HMR 到与 review 无关的中间态。本次用 `git archive HEAD` 冻结 `c6be3a9` 的源码到 `/tmp/qa-transfer-tree`（`node_modules` 软链、独立 `cacheDir`），dev server 从冻结树起在 5190。首轮在活动工作区 dev server 上曾观察到「不存在的身份 NFT 编号被报成『网络可能不稳』」——换到冻结树 + 独立 vite cache 后**不复现**（判断为活动 dev server 依赖重复/缓存污染的环境问题，**未计入缺陷**）。
2. **链状态隔离**：每轮套件前后 `anvil_snapshot`/`anvil_revert`；`/tmp/qa-transfer/results.json` 的 `recipientDelta`、`sendCount`、余额文本都是本轮实测。为覆盖 6 位精度与自定义代币成功路径，在 8584 部署了 `QAUSD`（`symbol=QAUSD`、`decimals=6`、1000 枚给 anvil #1）；它只存在于验证链，不影响 `src/config/deployments/*`。
3. **地址簿未配置**（N1）：把冻结树的 `src/config/deployments/anvil31337_dev.json` 的 24 个地址全部置零（只在 /tmp 副本里），另起 5194 dev server 复现；页面降级正确（原生币 + 自定义 ERC20 可用，无包装/LP 分组，空社区文案，身份模式提示「这个环境还没有配置身份 NFT 合约。」），没有白屏/console error。
4. **未覆盖**：真实移动端钱包（WalletConnect/内置浏览器）与真实 BSC 网络延迟——本次全部用注入式 EIP-1193 stub + 本地 anvil；reorg / 交易被替换（`replaced`）路径依赖 `tx-watch` 的共享实现，`e2e/tx-recovery.spec.ts` 已覆盖，不在本页重复造。
5. **复跑**：`cd /tmp/qa-transfer && node run.mjs`（需 5190 dev server + 8584 链）；`node run-gate.mjs`（G1）、`QA_BASE=http://127.0.0.1:5194 node run-noaddr.mjs`（N1）。截图全部在 `/tmp/qa-transfer-*.png`，断言原始数据 `/tmp/qa-transfer/results.json`。
