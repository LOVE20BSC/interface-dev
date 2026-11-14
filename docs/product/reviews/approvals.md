# 代币授权（`/approvals`）独立 QA · 场景矩阵与缺陷清单

> 任务：`ledger/worklog/202611/14-1054-cd4a-qa-review-代币授权-逐场景复现并出缺陷清单.md`
> 角色：独立 QA（只复现 + 出清单，不改产品代码、不 commit）。
> 基线：`main` @ `c6be3a9`（工作区有其它 agent 并行改动：swap、`shared/ui/token-picker.tsx`、`shared/config/copy-pages.ts`、`use-tx-watch.ts` 等；本次 review 范围内 `src/pages/approvals/**`、`src/features/approve-token/**`、`shared/ui/copyable-address.tsx`、`shared/lib/approval-kind.ts` 在复现期间 `git status` 为空，未被这些改动波及）。
> 环境：验证链 `make -C ../anvil bootstrap PORT=8587`（clean bootstrap，31337，interval mining 1s）；dev server `VITE_ENV=dev VITE_ANVIL_RPC=http://127.0.0.1:8587 pnpm dev --port 5193`（5187 被并行 QA 的 dev server 占用，故改用 5193）；Playwright（`node` 直跑，参考 `scripts/theme-screenshots.mjs`）；截图 `/tmp/qa-approvals-*.png`。**8545 全程未触碰。**
> 用例来源：`docs/product/three-line/approvals.md` §0/§1（理论值）、`e2e/approvals-numbers.spec.ts`（已由官方门禁覆盖的数值），本节只做独立复现，不引用 e2e 的断言结果。

## 结论摘要

| 项 | 值 |
| --- | --- |
| 场景断言数 | **46** 条（含 8 组深浅色/移动端截图矩阵、三态列表态、确认弹层、自定义地址态） |
| 通过 | 42 条 |
| 失败 | 4 条断言，归并为 **4 条缺陷** |
| 缺陷级别 | **P0：0 · P1：0 · P2：3 · P3：1** |
| 最严重 3 条 | D1 默认选中包装原生币 TestWETH（P2）· D2 用户取消签名后无可见反馈、错误条被弹层遮挡（P2）· D3 RPC 不可用时误显示「还没有可以查看的代币」且余额永久「读取余额中…」（P2） |

**已核对的页面契约全部通过**：页面顺序 ①默认长期授权 → ②授权说明 → ③自定义地址 → ④常用合约、列表 10 行全展开无折叠、地址点击复制逐字一致（剪贴板 + `title` + 2s「已复制」反馈）、无「推荐」字样、不出现 allowance/approve 原文、三态额度与 2^255 阈值、`< 0.000001` 最小可见额度、已长期授权按钮「已长期授权」禁用、撤销归零、长期授权后刷新保持、默认长期授权开关刷新保持且只影响按钮强调、自定义地址（EOA/零地址/非法/自己的地址/有额度/无额度/授权/撤销）、代币切换（社区/TestWETH/UNI-V2/自定义 ERC20/余额 0）、慢钱包等待态、双击只发一笔、回执关闭后再操作、刷新后首笔、未连接/错误网络/慢 RPC、移动端 390×844 无横向溢出、浅色/深色四套截图。

## 修复状态（2026-11-14 · 修复任务 `20261114-1150-8a46`）

四条缺陷经 Lead 评估均属「该修」，本轮 **D1–D4 全部已修**；e2e 断言已写入 `e2e/approvals-numbers.spec.ts`（4 条新用例），**但本轮 e2e 未运行**：`../core` 在 20:06 给 `IStake.stakeLiquidity` 增加第 6 个参数后，`../periphery` 与 `../anvil` 的引导脚本仍是旧调用，任何端口 `make bootstrap` 都会编译失败（协议侧同步由 Lead 统一处理）。因此 **e2e 门禁与 12 张验收截图标记为「待 Lead 在合约侧稳定后统一跑」**；D3 另用 dev server + 死 RPC 做了真实浏览器验证（见下）。

| 缺陷 | 状态 | 修复要点 | 代码证据 | e2e 断言（待跑） |
| --- | --- | --- | --- | --- |
| D1 默认代币 | **已修** | 等社区目录首次加载结束再决定默认，回退只发生在「已 settled」之后 | `approve-token/lib/approval-tokens.ts:29`、`approve-token/ui/approval-panel.tsx:163` | `D1 默认代币…` |
| D2 取消签名反馈 | **已修** | 确认弹层内 `role=alert` 错误区 + 可执行提示，弹层不收起 | `approve-token/ui/approval-confirm-sheet.tsx:88`、`approve-token/ui/approval-panel.tsx:811` | `D2 取消签名…` |
| D3 RPC 误报无代币 | **已修** | 目录失败判定的根因修复 + 网络读不到态 + 「重新读取」自愈 | `swap-token/model/use-swap-catalog.ts:182`、`transfer-token/model/use-transfer-catalog.ts:51,228`、`approve-token/ui/approval-panel.tsx:664` | `D3 RPC 不可用…` |
| D4 内置代币重复 | **已修** | 按地址去重 + 命中内置项时直接选中内置项并提示 | `approve-token/lib/approval-tokens.ts:44`、`approve-token/ui/approval-panel.tsx:100-127,467` | `D4 自定义代币按地址去重…` |

---

## 一、已验证缺陷（可复现）

### D1 · P2 · 首次进入与刷新后默认选中「包装原生币 TestWETH」，而不是社区代币 TestLOVE20

- **期望**：`/approvals` 的代币默认值按实现声明的回退顺序「社区代币 → 包装原生币 → LP」取第一个可用项，clean bootstrap 下有社区代币 TestLOVE20（余额 99,799,100），应默认选中它。
- **实际**：首次进入（未手动选择）稳定选中 **TestWETH**（余额 0），刷新后仍是 TestWETH；三组独立会话复现 **6/6**。
- **最小复现步骤**：
  1. clean bootstrap 8587 链，起 dev server；
  2. 打开 `/approvals`，点「连接钱包」；
  3. 不操作代币选择器，等 3 秒读页面顶部「代币」选择器文案 → 显示 `TestWETH`，余额行 `TestWETH 余额 0`；
  4. `F5` 刷新重复 → 仍为 `TestWETH`。
- **证据**：`/tmp/qa-approvals-default-token-first-visit.png`、`/tmp/qa-approvals-default-token-after-reload.png`、`/tmp/qa-approvals-default-token.png`；断言 `S6.1`、`S9.1`、`S9.2`（3 次失败）；证据链：`src/features/approve-token/ui/approval-panel.tsx` L129-138 的 fallback effect 在 `communityTokens[0]` 仍为空时先取到 `wrappedToken` 并写入 `selectedToken`，之后社区代币加载完成也不会再改选。
- **一句话修复方向**：默认代币改为「等社区代币目录首次加载结束后再决定」，或把 wrapped/LP 回退限制为「社区代币目录已加载且确实为空」。
- **状态（2026-11-14 修复）**：**已修**。默认代币抽成纯函数 `pickDefaultApprovalToken`（`src/features/approve-token/lib/approval-tokens.ts:29`）——社区目录首次加载结束前返回 `undefined`（页面不写选择、也就不会锁死回退），目录 settled 后才按「社区代币 → 包装原生币 → LP」取第一个，目录为空或失败时才回退。页面接入见 `src/features/approve-token/ui/approval-panel.tsx:163`；单测 `approval-tokens.test.ts` 覆盖「加载中不选回退 / 加载完成后选社区代币 / 回退顺序」。e2e 断言：`e2e/approvals-numbers.spec.ts`「D1 默认代币：首次进入与刷新后都默认选中社区代币 TestLOVE20」（**待跑**）。

### D2 · P2 · 用户在钱包里取消签名后，弹层内没有任何反馈，错误提示被弹层挡住

- **期望**：点「确认长期授权」→ 钱包弹窗点取消 → 立刻看到「你在钱包里点了取消，这次授权没有改动。」这类可见反馈，且不误导用户重复点击。
- **实际**：确认弹层**保持打开**、按钮恢复可点、无任何文案变化；真正的错误条渲染在页面底部（`role=alert`），被弹层遮罩完全挡住（几何校验：错误条 y ≥ 弹层 y；截图里完全看不到）。用户只能先点「取消」关闭弹层才会看到错误条；连续实验（取消后重试）最终可成功，说明只是反馈缺失。
- **最小复现步骤**：
  1. 打开 `/approvals` 并连接钱包、选 TestLOVE20；
  2. 任一行点「长期授权」→ 弹层点「确认长期授权」；
  3. 在钱包侧拒绝（stub：`eth_sendTransaction` 抛 4001）；
  4. 观察：弹层原样停留、无错误文案；关闭弹层后页面底部才出现「你在钱包里点了取消，这次授权没有改动。」。
- **证据**：`/tmp/qa-approvals-reject-error.png`（弹层「把「投票」设为长期授权？」仍在，错误条不可见）；断言 `S3.4` 记录 `弹层保持打开=true，底部错误条被弹层遮挡=true`。
- **一句话修复方向**：把 `tx.error` 的展示放进确认弹层（弹层内 alert 区），或在提交失败时收起弹层后再提示。
- **状态（2026-11-14 修复）**：**已修**。确认弹层新增可选 `error` 属性，在按钮上方渲染 `role="alert"` / `data-testid="approvals-confirm-error"` 错误区：第一行是失败结论（取消签名 =「你在钱包里点了取消，这次授权没有改动。」），第二行是可执行提示「这次没有产生交易。可以再点一次上面的按钮重试，或点「取消」先关掉这个窗口。」（`src/features/approve-token/ui/approval-confirm-sheet.tsx:88-99`、copy `approvals.confirmErrorHint`）。弹层保持打开、按钮恢复可点、额度不变；关闭弹层后页面底部错误条仍在（`approval-panel.tsx:811` 把 `tx.error` 同时传给弹层）。e2e 断言：「D2 取消签名…」（先拒绝 4001 → 弹层内可见 → 关闭后底部错误条仍在 → 恢复钱包重试成功上链，**待跑**）。

### D3 · P2 · RPC 不可用时显示「还没有可以查看的代币」并永久「读取余额中…」，没有任何网络错误提示或重试入口

- **期望**：链读不到时代币选择器/余额/额度块给出「读不到，网络可能不稳 / 重新读取」一类可重试状态（页面其它读取路径如自定义地址额度、常用合约额度都已有该文案）。
- **实际**：整页 RPC 失败（`page.route` abort 8587，持续 20s 以上）时：顶部余额行一直是 `读取余额中…`；代币选择器变灰骨架；④常用合约块显示「**还没有可以查看的代币 / 先在代币选择里添加一个 ERC20 代币地址。**」——把网络故障误报成"没有代币"，引导用户去添加代币，且**没有**「重新读取」入口；恢复网络后需要手动刷新页面/重选代币才能恢复（重载后恢复，见 `/tmp/qa-approvals-state-rpc-recovered.png`）。
- **最小复现步骤**：
  1. Playwright 拦截 `http://127.0.0.1:8587/**` 全部 abort（或断网/链停）；
  2. 打开 `/approvals` 并连接钱包；
  3. 等 20s：余额行 `读取余额中…`、列表块「还没有可以查看的代币」；
  4. 恢复网络：页面不会自愈，必须刷新。
- **证据**：`/tmp/qa-approvals-state-rpc-down.png`、`/tmp/qa-approvals-diag-rpc-down.png`；断言 `S7.4`。
- **一句话修复方向**：代币目录/余额读取失败时渲染网络错误态（沿用 `balanceError`/`knownError` 文案 + 重试），不要落到「暂无代币」空态。
- **状态（2026-11-14 修复）**：**已修**。根因有两层：① wagmi `useReadContracts` 在传输层失败时把每个调用解析为 `{status:'failure'}` 的**成功** `data`，而 `useSwapCatalog.isError` 只检查 `pages.isError`/`metadata.isError`/`metadata.data` 的失败项，漏掉 `pages.data` → 目录既不 loading 也不 error；② 面板把「代币 undefined」一律画成「还没有可以查看的代币」，余额行因为 `token === undefined` 永远「读取余额中…」。修复：`use-swap-catalog.ts:182-193` 的 `isError` 同时检查 `pages.data` 的 failure 项；`useTransferCatalog` 暴露 `communityLoading/communityError/refetch`（`use-transfer-catalog.ts:51,228`）；面板在目录失败时渲染 `approvals-block-network-error`「暂时读不到网络数据」+ 正文「…这不是没有代币，请检查网络后重新读取。」+「重新读取」（`approval-panel.tsx:664-680`），余额行写「余额暂时读不到」，「重新读取」同时重拉目录/余额/额度（`retryCatalog`）。**真实浏览器验证（dev server + 死 RPC，8591 无监听）**：390×844 浅色与 1280×800 深色都显示网络错误态、「重新读取」可点、页面不含「还没有可以查看的代币」也不含「请添加一个 ERC20 地址」、无 pageerror；截图 `/tmp/approvals-dsh-verify/approvals-d3-network-error-light-mobile.png`、`/tmp/approvals-dsh-verify/approvals-d3-network-error-dark-desktop.png`。e2e 断言：「D3 RPC 不可用…」（route abort → 网络态 → unroute 后点「重新读取」自愈，**待跑**）。

### D4 · P3 · 添加内置代币地址为「自定义代币」后，选择器出现两个同名 TestWETH 选项

- **期望**：自定义代币地址若已在目录（社区/包装/LP）中，应去重或直接选中已有项；至少让用户能区分两个同名项。
- **实际**：在代币选择器里添加 `TestWETH` 地址后，选择器同时出现「包装原生币 · TestWETH」与「自定义代币 · TestWETH（自定义徽标）」两个同名项，且两者 `data-testid` 相同（`approvals-token-option-TestWETH`），e2e 若按 testid 选择会 strict mode 冲突；添加后行为本身正确（自动选中、余额 0）。
- **最小复现步骤**：
  1. 打开 `/approvals` → 点顶部代币选择器；
  2. 在「添加自定义代币」输入 `0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9`（内置 TestWETH）→ 点「添加代币」；
  3. 重新打开选择器：包装原生币组与自定义代币组各有一个 `TestWETH`。
- **证据**：`/tmp/qa-approvals-token-custom-group.png`；断言 `S6.5`（通过但记录了重复项计数 `count=2`）。
- **一句话修复方向**：添加自定义代币前按地址去重（已存在则直接选中），或给自定义项加地址后缀区分。
- **状态（2026-11-14 修复）**：**已修**。选择器分组按地址去重（社区 → 包装原生币 → LP → 自定义的优先级，同一地址只出一次，`approval-panel.tsx:189-230` 的 `pushGroup/seenAddresses`）；添加的自定义地址命中内置代币时直接选中内置项（`token` 派生逻辑在 `approval-panel.tsx:109-127`，即使内置元数据晚于自定义代币解析也会切回内置项），自定义分组不再出现第二个同名项，添加框下方写「TestWETH 已经在「包装原生币」里，不用重复添加。」（`data-testid="approvals-token-custom-duplicate"`，copy `approvals.customAlreadyListed`）。单测 `approval-tokens.test.ts`「按地址找内置代币（忽略大小写 / native 不匹配）」；e2e 断言：「D4 自定义代币按地址去重…」（添加 TestWETH 后 `approvals-token-option-TestWETH` 计数 = 1，**待跑**）。

---

## 二、场景矩阵（期望 / 实际 / 级别 / 证据）

图例：✅ 通过；❌ 失败（缺陷见上）；严重级别只对失败项标注。

### s1 页面结构（浅色桌面 1280×800）

| ID | 场景 | 期望 | 实际 | 级别 | 证据 |
| --- | --- | --- | --- | --- | --- |
| S1.1 | 页面顺序 | 代币卡 → ①默认长期授权 → ②授权说明 → ③自定义地址 → ④常用合约 | 文档坐标 124 < 227 < 347 < 585 < 753，严格递增 | – | `/tmp/qa-approvals-list-light-desktop.png` |
| S1.2 | 列表全展开 | 10 行、10 个地址、无 `details` 折叠 | 行序 router→stake→vote→submit→mint→launch→hub→lpExecutor→batchTransfer→groupChat，10/10，0 个 details，逐行地址可见 | – | 同上 |
| S1.3 | 地址点击复制 | 剪贴板逐字 = 完整地址；显示「已复制」；`title` = 完整地址；2s 后反馈消失 | router 与 groupChat 均逐字一致；aria-label「地址已复制：…」；2s 后消失 | – | 同上 + 剪贴板读回 |
| S1.4 | 文案红线 | 无「推荐」、无 allowance/approve 原文 | 均未出现 | – | DOM 全文 |
| S1.5 | 行内元素 | 每行名称、用途、撤销、长期授权、地址按钮 | 10 行均齐（3 个 button/行） | – | 同上 |
| S1.6 | 移动端/深色 | 390 宽无横向滚动；`data-theme=dark` 生效 | scrollWidth 390 = 内宽 390；theme=dark | – | `/tmp/qa-approvals-list-dark-mobile.png` |

### s2 三态额度（clean bootstrap + 夹具预置，8587 链）

| ID | 场景 | 期望 | 实际 | 级别 | 证据 |
| --- | --- | --- | --- | --- | --- |
| S2.1 | 未授权 | 文本「未授权」、撤销禁用、长期授权可点 | 一致 | – | `/tmp/qa-approvals-list-light-desktop.png` |
| S2.2 | 具体额度截断 | `1234567890123456789` → `1.234567 TestLOVE20`（截断不进位） | 一致，title 同文本 | – | 同上 |
| S2.3 | 最小可见额度 | 1 wei → `< 0.000001 TestLOVE20`（不显示 0/未授权） | 一致 | – | 同上 |
| S2.4 | 2^255 阈值 | `2^255−1` 具体额度长文本；`2^255` 长期授权 | 一致（长文本逐字匹配理论线 §1 用例 E1/E2） | – | 同上 |
| S2.5 | 已长期授权行 | 行文本「长期授权」、按钮「已长期授权」且禁用、撤销可点 | 一致 | – | 同上 |
| S2.6 | 撤销归零 | confirm 显示「未授权」→ 提交后行「未授权」、撤销禁用、链上 allowance=0 | 页面与链上均一致 | – | `/tmp/qa-approvals-receipt-unlimited.png` |

### s3 授权/撤销动作流

| ID | 场景 | 期望 | 实际 | 级别 | 证据 |
| --- | --- | --- | --- | --- | --- |
| S3.1 | 长期授权 | 弹层标题/风险说明/当前额度/确认后=长期授权；提交后回执条 + hash + 行长期授权 + 按钮已长期授权禁用；链上 maxUint256 | 全部一致（hash `0x8b13c174…`） | – | `/tmp/qa-approvals-confirm-unlimited-desktop.png`、`/tmp/qa-approvals-receipt-unlimited.png` |
| S3.2 | 回执关闭后再操作 | 「知道了」→ 回执消失、状态保留；随后撤销回未授权、链上 0 | 一致 | – | – |
| S3.3 | 刷新后首笔 | 刷新 → 重选代币 → 首笔长期授权可提交并上链 | 一致（链上 maxUint256） | – | – |
| S3.4 | 用户取消签名 | 文案「你在钱包里点了取消，这次授权没有改动。」可见；状态不变；可重试 | 文案正确、状态不变、重试成功，**但提示被弹层遮挡、弹层内无反馈** | **P2（D2）** | `/tmp/qa-approvals-reject-error.png` |
| S3.5 | 慢钱包（eth_sendTransaction +3.5s） | 提交按钮「等待钱包确认…」+ 禁用；取消禁用；输入禁用；落链成功 | 隔离运行一致（等待文案/禁用）；批量运行两次因页面热更新/重载抖动中断（见 §4） | – | `/tmp/qa-approvals-slow-wallet-waiting.png` |
| S3.6 | 双击提交 | 连点 3 次只发 1 笔交易 | 隔离运行一致（`eth_sendTransaction` 差 = 1） | – | – |
| S3.7 | 双击行按钮 | 只出现一个确认弹层 | 一致 | – | – |
| S3.8 | 交易确认中 | 提交后出现「交易已经提交，等待上链。」+ hash + 重新查询 | 一致（延迟回执时捕获） | – | `/tmp/qa-approvals-pending-watch.png` |

### s4 默认长期授权偏好

| ID | 场景 | 期望 | 实际 | 级别 | 证据 |
| --- | --- | --- | --- | --- | --- |
| S4.1 | 默认关闭 + 刷新保持 | 默认 off；勾选写 `love20:tokenApprovalUseUnlimitedByDefault='1'`；刷新后仍勾选 | 一致 | – | – |
| S4.2 | 影响本页按钮 | 勾选后长期授权按钮由 secondary 变 outline（`bg-brand-soft/40` + 品牌色边框），取消后恢复；写 `'0'` | 一致（行按钮与自定义地址按钮都受影响） | – | `/tmp/qa-approvals-diag-preference-on.png` |
| S4.3 | 不自动写链 | 开关只改展示，不触发任何 `eth_sendTransaction` | 0 笔 | – | – |
| S4.4 | 刷新后 + 已长期授权 | 偏好关闭保持；已长期授权行仍「已长期授权」禁用 | 一致 | – | – |

### s5 自定义 spender

| ID | 场景 | 期望 | 实际 | 级别 | 证据 |
| --- | --- | --- | --- | --- | --- |
| S5.1 | EOA 无额度 | 「这个地址没有授权额度。」、撤销禁用、长期授权可用 | 一致 | – | – |
| S5.2 | 非法 `0x1234` | 即时提示「这是一个无效的地址，需要 0x 开头的 40 位地址。」、不出现额度块 | 一致 | – | – |
| S5.3 | 零地址 | 「授权地址不能是零地址。」、无额度块 | 一致 | – | – |
| S5.4 | 自己的地址 | 「这是你自己的钱包地址，授权给自己没有意义。」 | 一致 | – | – |
| S5.5 | 空格/小写 | trim 后可识别；地址点击复制逐字一致 | 一致（剪贴板 = 输入地址去空格） | – | – |
| S5.6 | 已有额度 | 预置 2.5e18 → `2.5 TestLOVE20`、撤销可用 | 一致 | – | – |
| S5.7 | 授权/撤销 | 长期授权 →「已长期授权」禁用、链上 max；撤销 → 「这个地址没有授权额度。」、链上 0 | 一致 | – | – |
| S5.8 | 等于常用合约（router） | 列表隐藏该行（9 行）、标签「兑换路由」、额度一致；清空输入恢复 10 行 | 一致 | – | – |

### s6 代币切换

| ID | 场景 | 期望 | 实际 | 级别 | 证据 |
| --- | --- | --- | --- | --- | --- |
| S6.1 | 默认代币 | 社区代币 TestLOVE20 | **TestWETH** | **P2（D1）** | `/tmp/qa-approvals-default-token.png` |
| S6.2 | 切 TestWETH | 余额 0；额度按该代币重读（router = 预置 2.5 TestWETH），其余未授权 | 一致 | – | `/tmp/qa-approvals-token-weth.png` |
| S6.3 | 切 UNI-V2 | 余额 0、各行未授权 | 一致 | – | – |
| S6.4 | 切回 TestLOVE20 | 回到该代币额度（router 长期授权） | 一致 | – | – |
| S6.5 | 自定义 ERC20 | 添加后自动选中，自定义分组 + 「自定义」徽标 | 一致；但同名内置项重复出现 | **P3（D4）** | `/tmp/qa-approvals-token-custom-group.png` |
| S6.6 | 自定义代币错误 | 非法地址 / 无合约 →「这个地址上没有合约」/ 非 ERC20 合约 →「读不到这个代币的名称或精度」 | 三种提示均正确 | – | `/tmp/qa-approvals-token-custom-error.png` |
| S6.7 | 切代币保留自定义 spender | 输入保留，额度按新代币重读 | 一致 | – | – |

### s7 钱包 / 链状态

| ID | 场景 | 期望 | 实际 | 级别 | 证据 |
| --- | --- | --- | --- | --- | --- |
| S7.1 | 未连接 | 「连接钱包后查看授权。」卡片 + 连接按钮，无列表 | 一致 | – | `/tmp/qa-approvals-state-disconnected.png` |
| S7.2 | 错误网络（chainId 1） | 顶栏「网络不对，点此切换」；页面「切换到这个应用使用的网络后再查看授权。」+ 回首页，无列表 | 一致 | – | `/tmp/qa-approvals-state-wrong-chain.png`（见 `diag-wrong-chain-connected`） |
| S7.3 | 慢 RPC（每请求 +2s） | 余额「读取余额中…」、行「读取授权额度中…」，不误报未授权；加载完成后正确 | 一致 | – | `/tmp/qa-approvals-state-slow-rpc.png` |
| S7.4 | RPC 不可用 | 网络读不到态 + 可重试 | **「还没有可以查看的代币」+ 永久「读取余额中…」，无错误/重试** | **P2（D3）** | `/tmp/qa-approvals-state-rpc-down.png` |
| S7.5 | 切换账户（#2） | 余额与各行额度按新钱包重读 | 一致（余额 99,999,099.999991，全未授权） | – | – |

### s8 响应式与主题（截图矩阵）

| ID | 场景 | 结果 | 证据 |
| --- | --- | --- | --- |
| S8.1 | 390×844 浅色 列表态 | 通过：三态行（长期授权/1.234567/未授权）、地址可复制、无横向溢出 | `/tmp/qa-approvals-final-list-light-mobile.png` |
| S8.2 | 390×844 深色 列表态 | 通过 | `/tmp/qa-approvals-final-list-dark-mobile.png` |
| S8.3 | 1280×800 浅色 列表态 | 通过 | `/tmp/qa-approvals-final-list-light-desktop.png` |
| S8.4 | 1280×800 深色 列表态 | 通过 | `/tmp/qa-approvals-final-list-dark-desktop.png` |
| S8.5 | 确认弹层 移动/桌面 | 弹层内容与按钮布局正确、可取消 | `/tmp/qa-approvals-final-confirm-mobile.png`、`/tmp/qa-approvals-final-confirm-desktop.png` |
| S8.6 | 自定义地址态 移动/桌面 | 2.5 TestLOVE20 展示、撤销可用 | `/tmp/qa-approvals-final-custom-mobile.png`、`/tmp/qa-approvals-final-custom-desktop.png` |

---

## 三、怀疑未复现 / 未覆盖

| 项 | 状态 | 说明 |
| --- | --- | --- |
| 慢钱包等待态在整批运行中偶发超时（S3.5） | **非产品缺陷（环境抖动）** | 隔离运行通过（等待文案「等待钱包确认…」、按钮禁用、落链成功，见 `/tmp/qa-approvals-slow-wallet-waiting.png` / `diag-slow-wallet-after`）；整批运行时 dev server 被并行 agent 的 HMR 更新/重载打断。 |
| 双击提交偶发不回执（S3.6） | **非产品缺陷（环境抖动）** | 隔离运行 `eth_sendTransaction` 只发 1 笔；另一次批量运行因页面被热更新重载导致回执条等不到。 |
| 页面内账户热切换（不刷新，`accountsChanged`） | **未覆盖** | 注入钱包 stub 未实现 `accountsChanged` 事件；只覆盖了「换账户重新加载」与「错误网络连接」。 |
| 移动端代币选择器底部 sheet 逐项交互（搜索/加载更多/分组滚动） | **未逐项覆盖** | 本次只覆盖打开/选择/自定义分组截图；搜索与分页属共享 `TokenPicker` 组件，不属本页回归重点。 |
| 页面 URL 自动带上 `?symbol=TestLOVE20` | **观察，未判缺陷** | 选代币后地址栏出现该参数；不改变页面行为，未发现副作用。 |
| 慢钱包期间整页输入禁用（S3.5 的「输入禁用」断言） | **单次隔离通过** | 只验证了自定义地址输入框 `disabled`；未逐一枚举所有控件。 |

---

## 四、环境与可信度说明（重要）

1. **验证链 8587 被并行 QA agent 共用**：复现期间观察到另一个 agent 的 dev server（`/tmp/qa-liquidity/repo`）也指向 `VITE_ANVIL_RPC=http://127.0.0.1:8587`，并占用 5187 端口把本任务的 dev server 顶掉（vite exit 143）。跨会话的 `anvil_snapshot`/`anvil_revert` 会互相回滚夹具，导致批次中个别断言读到「未授权」的旧状态（如 S1 截图循环一次中断）。**因此所有链状态相关结论都在隔离会话里单独复跑过**；D1–D4 与链状态无关，可在任意 clean 链复现。
2. dev server 端口：5187 被占，实际使用 **5193**（同一 dev server 模式，不产 dist）；8545 未触碰。
3. 并行 agent 正在改动工作区文件（`shared/ui/token-picker.tsx`、`shared/config/copy-pages.ts`、`use-tx-watch.ts` 等），HMR 会在测试中途重载页面，是 §3 两条「抖动」的直接原因；本页专属文件在复现期间无改动。
4. 复现脚本（临时，未入库）：`/tmp/qa-approvals/{lib,scenarios1,scenarios2,scenarios3b,scenarios4}.mjs`；原始结果 `/tmp/qa-approvals/{s1,s2b,s3b,s4}.log`。
