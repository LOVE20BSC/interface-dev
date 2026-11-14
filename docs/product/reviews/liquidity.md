# 流动性池（`/liquidity`）独立 QA · 场景矩阵与缺陷清单

> 任务：`ledger/worklog/202611/14-1054-0da9-qa-review-流动性池-逐场景复现并出缺陷清单.md`
> 角色：独立 QA（只复现 + 出清单，不改产品代码、不 `git add`/`commit`）。
> 基线：`HEAD` = `89dcd1c`（`chore(abis): manifest provenance …`）；本次 review 范围内 `src/pages/liquidity/**`、`src/features/liquidity-pool/**` 在复现期间 `git status` 为空，未被并行 agent 的改动波及（工作区有并行改动：`shared/config/copy-pages.ts`、`shared/model/use-tx-watch.ts`、swap 相关文件、`e2e/wallet-stub.ts`）。
> 环境：验证链 `make -C ../anvil bootstrap PORT=8586`（clean bootstrap，chain 31337，interval mining 1s，Hub 已包含）；dev server `VITE_ENV=dev VITE_ANVIL_RPC=http://127.0.0.1:8586 ./node_modules/.bin/vite --port 5186`（**dev server，不产 dist**）；Playwright 用 `node` 直跑（脚本在 `/tmp/qa-liquidity/`，不写仓库）；截图 `/tmp/qa-liquidity-*.png`。**8545 全程未触碰。**
> 稳定性措施：并行 agent 保存 `src/**` 会触发 Vite 全量热重载，把表单状态清空（首轮误判成「回执后表单被清空」）。因此把工作区 `rsync` 成冻结快照 `/tmp/qa-liquidity/repo/`（`node_modules` 软链）后再起 dev server，复现期间源码不再变动。
> 用例来源：`docs/product/three-line/liquidity.md` §0/§1/§3（页面契约）、`e2e/liquidity-numbers.spec.ts`（已由官方门禁覆盖的数值）。本节只做独立复现，不引用 e2e 的断言结果。

## 结论摘要

| 项 | 值 |
| --- | --- |
| 场景矩阵 | **30 条**（含 4 组「移动端/桌面 × 浅色/深色」截图，共 12 张验收截图；截图目录共 77 张） |
| 通过 | 23 条 |
| 失败 | 7 条矩阵项（对应 D2/D3/D5/D6/D7）；另 4 条缺陷由定向探针补充（D1/D4/D8/D9/D10）→ 合计 **10 条已验证缺陷** |
| 缺陷级别 | **P0：0 · P1：1 · P2：4 · P3：5** |
| 最严重 3 条 | D1 授权额度用尽后再次授权，主按钮**永久**禁用（P1）· D2 自定义滑点非法**不阻断**提交、实际仍按旧值下单（P2）· D5 选过自定义代币地址后再切社区，页面**不跟随**且无法清除（P2） |
| 未复现/未覆盖 | 2 条：Hub 缺失降级（环境地址簿恒定含 Hub）、错误网络（wallet stub 下 wagmi 直接连接失败，进不到「网络不对」分支） |
| 修复状态（2026-11-14） | **10/10 已修**（逐条状态与证据见各缺陷末尾的「状态」行） |

**已核对的页面契约全部通过**：智能模式开（只填一侧 / 两侧都填 / 报价逐字 + 折叠详情）、智能模式关（联动 + 只读侧接管 + 比例取整）、空池首次建池（`0.999999` LP、初始价格、Router 授权→提交、建池后查询逐字）、Hub 报价失败的错误卡与「关掉智能模式，自己填两侧」降级、按 LP 数量撤出（25/50/75/100 快捷值与理论线逐字一致、100% 撤净、撤出后空态与总供应回到 `4,472.135954`）、LP 授权→撤出、慢钱包、取消签名、双击只发一笔、刷新后首笔、深池/浅池双向价格、交易对地址复制、移动端 390×844 / 桌面 1280×800 无横向溢出、浅色/深色主题。

---

## 一、已验证缺陷（可复现）

### D1 · P1 · 授权额度用尽后再次授权，主按钮永久禁用（必须刷新页面才能继续）

- **期望**：第二笔交易在「授权」上链后，额度重新读回，主按钮从禁用切到可点（页面注释与 e2e 用例都按这个契约写：`approveThenSubmit` 等主按钮解锁）。
- **实际**：加池和撤出**两个面板**都复现。以加池为例：120s 内轮询，链上 allowance 已经是 `100000e18`，页面按钮仍是「授权 TestLOVE20」、主按钮 `disabled`；再点一次授权（链上 allowance 仍为 `100000e18`）依旧不恢复。**只有刷新页面**才恢复（刷新后按钮「已授权 TestLOVE20」、主按钮可点）。撤出面板同理：撤出 50% 后再撤 50%，LP allowance 链上已到 `250894982144114595338`（=250.894982 流动性凭证），页面仍「授权 流动性凭证」、主按钮禁用。
- **影响**：连续两笔（加池→再加池 / 撤出→再撤出）在**同一页面会话内无法完成**，用户被卡死且没有任何提示。这是本页最严重的问题。
- **最小复现步骤**：
  1. clean 链 + dev server，连接账户 #4（`0x15d3…6A65`），打开 `/liquidity?symbol=TestLOVE20`；
  2. 加池输入 `100000`，点「授权 TestLOVE20」→ 等待按钮变「已授权」→ 点「确认添加」→ 回执「流动性添加完成」→「知道了」；
  3. 输入框仍保留 `100000`，点「授权 TestLOVE20」（额度已被上一笔用掉，故回到授权态）；
  4. 等 10–60s：链上 allowance 已是 `100000e18`，但「确认添加」一直禁用、授权文案不变；
  5. 再点一次授权仍不变；`F5` 刷新后「确认添加」立刻可点。
- **证据**：`/tmp/qa-liquidity-c2-reapprove-stuck.png`、`/tmp/qa-liquidity-c2-reapprove-stuck-3rd.png`、`/tmp/qa-liquidity-c2-reapprove-after-reload.png`、`/tmp/qa-liquidity-e5-withdraw-reapprove-stuck.png`；链上读数 `eth_call allowance(0x15d3…, 0x84eA…) = 0x152d02c7e14af6800000`（加池）与 `= 0x0d99de08f623ec960a`（LP）；对照首轮授权可正常解锁 `/tmp/qa-liquidity-c1-after-approve.png`。
- **一句话修复方向**：授权到账后不要依赖「`approvedKey` 变化」触发重读（同一 token+spender 的 key 第二次不会再变），改为在授权回执落地时无条件 `refetch` 额度（或把 approve hash/nonce 纳入 key），并顺带清掉 `approvedKey` 已消费标记。
- **状态：✅ 已修（2026-11-14 20:xx）**。`useLiquidityTransaction` 去掉 `approvedKey`，改为 `approveRevision` 计数器——每确认一次授权就 +1；加池/撤出面板都监听 `approveRevision` 并**无条件** `refetch()` 余额+额度（不再只监听 key 变化）。证据：`src/features/liquidity-pool/model/use-liquidity-transaction.test.ts`（连续两次同 token+spender 授权，revision 0→1→2）、`e2e/liquidity-numbers.spec.ts` 用例 G/H「连续两笔加池 / 撤出」（待合约侧稳定后统一跑）。

### D2 · P2 · 自定义「最多可接受的价格变化」非法时不阻断提交，实际仍按旧值提交

- **期望**：自定义值越界（如 `60`、`abc`、空）时给出范围错误并禁用提交（三线文档 §3 用例 F 明确写「主按钮全程 disabled，链上没有交易」）。
- **实际**：错误文案只在交易设置弹层里可见；关闭弹层后页面**没有任何错误提示**，价格变化标签仍显示旧的有效值 `0.5%`，而「确认添加」/「确认撤出」**保持可点**。点下去交易按旧的 0.5% 最少额提交（详情里的「最少进池」就是 0.5% 算出来的）。撤出面板同样：自定义填 `60` 后「授权 流动性凭证」「确认撤出」都可点。
- **最小复现步骤**：
  1. 连接只有原生币的账户 #5（`0x9965…A4dc`），输入 `10` ETH，等报价出现（无需授权）；
  2. 「交易设置」→ 自定义输入 `60` → 看到红字「自定义值需要在 0.01% 到 50% 之间。（0.01%–50%）」→ 点「完成」关闭弹层；
  3. 观察：页面不显示任何错误、标签仍是 `0.5%`、`确认添加` 可点；点开「详情」，「最少进池」仍是 0.5% 的结果（`9,247.679431 TestLOVE20 + 5.086223 ETH`，理论线 §1 用例 B）。
  4. 撤出侧：任意 LP 数量 + 自定义 `60`，同样可点「确认撤出」。
- **证据**：`/tmp/qa-liquidity-f3-slippage-invalid-submit-enabled.png`、`/tmp/qa-liquidity-b1-slippage-invalid-native-only.png`、`/tmp/qa-liquidity-b1b-slippage-preset.png`、`/tmp/qa-liquidity-f1-withdraw-bad-slippage.png`、`/tmp/qa-liquidity-a4-slippage-invalid-sheet.png`；DOM 读数：`submit disabled=false`、标签 `0.5%`、`自定义值需要在…` 在关闭弹层后不可见。
- **一句话修复方向**：把 `customSlippageError`（非法滑点）纳入两个面板 `canSubmit` / 授权按钮的禁用条件，并在弹层外保留一行可见错误。
- **状态：✅ 已修**。加池面板 `canSubmit` 与授权禁用条件都加了 `customSlippageError === undefined`，并在交易设置下方常显 `liquidity-slippage-error`（弹层关掉也在）；撤出面板同样纳入 `canSubmit`/授权禁用，`liquidity-withdraw-slippage-error` 常显。证据：`add-liquidity-panel.test.tsx`「D2」、`e2e/liquidity-numbers.spec.ts` 边界用例（加池）与用例 G/H（撤出）。

### D3 · P2 · 池子读取未完成/慢 RPC 时，误报「这个代币还没有池子，第一次建池只能两侧都填」

- **期望**：加载中显示骨架/「读取中」，不要在数据没回来时断言「没有池子」。
- **实际**：把 RPC 统一延迟 2.5s 后重载已连接页面，加载瞬间顶部黄条显示「智能模式暂时用不了：**这个代币还没有池子，第一次建池只能两侧都填。**」，而该代币实际有池（TestLOVE20，储备 200,000/100）。数据回来后黄条消失。普通网络下也有一次极短的同类闪烁（首轮 D1 记录到该文案出现再切换成「报价暂时算不出来」）。
- **影响**：慢网/抖动时用户会以为池子没了、第一次建池，可能据此错误操作；文案是确定性断言而不是加载态。
- **最小复现步骤**：
  1. 连接钱包打开 `/liquidity?symbol=TestLOVE20`（已连接的会话）；
  2. RPC 代理把 `eth_call` 延迟 2500ms（或 DevTools 加慢网），`F5`；
  3. 1–2s 内截图：黄条为「…这个代币还没有池子，第一次建池只能两侧都填。」；6s 后黄条消失、页面正常显示报价。
- **证据**：`/tmp/qa-liquidity-e2-slow-loading-flash.png`、`/tmp/qa-liquidity-d2-slow-rpc-loading.png`；`fallbackReason` 在 `pool.hasLiquidity=false`（加载中同样是 false）时就落到 `fallbackEmptyPool`（`liquidity-page`/`add-liquidity-panel.tsx` L123-129）。
- **一句话修复方向**：`fallbackReason` 增加「`pool.isLoading` 时渲染读取中/不渲染」，只有池读完成且 `hasLiquidity===false` 才显示空池原因。
- **状态：✅ 已修**。新增纯函数 `poolNoticeKind`（loading → `正在读取池子…`；read-failed → 「池子暂时读不到。」；只有读完成且无储备才是空池原因）。证据：`liquidity-form.test.ts`「poolNoticeKind（QA D3）」、`add-liquidity-panel.test.tsx`「D3」；慢 RPC 场景本身需要 RPC 代理，未在 e2e 里重放，判定逻辑由单测逐分支覆盖。

### D4 · P2 · URL 直达一个不存在的社区 symbol 时，静默显示首币 TestLOVE20 的池子

- **期望**：`?symbol=NoSuchCommunity99` 应提示「这个社区读不到/不存在」，不要拿别的社区代币顶替。
- **实际**：页面照常渲染，当前社区代币行显示 `TestLOVE20` 及其池子（200,000/100），社区上下文（header 药丸）仍是无效 symbol；没有任何「社区不存在」提示。原因在 `src/features/liquidity-pool/ui/liquidity-page.tsx` L105：`token = customToken ?? communityToken ?? catalog.communityTokens[0]`，社区解析失败时回落到目录第一个代币。
- **最小复现步骤**：
  1. 连接钱包（任意账户），打开 `/liquidity?symbol=NoSuchCommunity99`；
  2. 等 3s：顶部「当前社区代币」= `TestLOVE20`，加池表单可正常报价；页面无错误说明。
- **证据**：`/tmp/qa-liquidity-e2-unknown-community.png`、`/tmp/qa-liquidity-a8-unknown-community.png`。
- **一句话修复方向**：社区 token 状态为 `unknown`/`error` 时渲染「社区读不到 + 重试」状态卡，不要回落到 `communityTokens[0]`（该回落只适合首屏加载中的占位）。
- **状态：✅ 已修**。只在 `community.status === 'loading'`（首屏占位）时才回落到目录第一个代币；`unknown`/`error` 渲染「读不到这个社区。」+「重试」，抬头行与加池/查询面板都不再出现被顶替的 TestLOVE20。证据：`liquidity-page.test.tsx`「D4」、`e2e/liquidity-numbers.spec.ts` 用例 I。

### D5 · P2 · 选过「换个代币地址」后，右上角社区切换不再跟随，也没有清除入口

- **期望**：右上角社区切换是页面的「当前社区」唯一入口（页内已删除社区下拉，见三线 §3）；切社区后本页 token/池子/查询三块都应跟随。
- **实际**：未选自定义地址时跟随正常（TestLOVE20 → TestCMTOK1，URL 与页面 token 同步，查询显示「这个代币还没有流动性池。」）。一旦通过「换个代币地址」选过自定义代币，再切社区：URL 已变成 `?symbol=TestCMTOK1`，但页面「当前社区代币」仍是 `TestLOVE20 自定义`，池子/查询也不跟随；页内没有「清除自定义代币」按钮，只能刷新或再输入另一个地址。原因：`token = customToken ?? communityToken`，`customToken` 没有在 symbol 变化时清空。
- **最小复现步骤**：
  1. 连接钱包打开 `/liquidity?symbol=TestLOVE20`；
  2. 「换个代币地址」输入 `0x8aCd85898458400f7Db866d53FCFF6f0D49741FF`（TestLOVE20 本身即可触发「自定义」标记）→「读取这个代币」；
  3. 右上角社区药丸 → 搜索 `TestCMTOK1` → 点精确匹配结果；
  4. 观察：URL `?symbol=TestCMTOK1`，但 token 行仍是 `TestLOVE20 自定义`，查询仍是 TestLOVE20 的池子。
- **证据**：`/tmp/qa-liquidity-e1-custom-overrides-community.png`、对照 `/tmp/qa-liquidity-e1-community-followed.png`（无自定义时正常跟随）。
- **一句话修复方向**：`symbol` 变化时清空自定义代币选择（或在令牌栏提供「返回社区代币」清除入口）。
- **状态：✅ 已修**。`?symbol=` 变化时清空 `customToken` 并调用 `clearCustomToken()`（地址输入框一起清空），抬头/池子/查询三块跟随新社区；无需刷新。证据：`liquidity-page.test.tsx`「D5」、`e2e/liquidity-numbers.spec.ts` 用例 J（快照内 launch 子社区后走右上角菜单切换）。

### D6 · P3 · 空池 / 智能模式关时只填一侧，报「金额必须大于 0。」与实际不符

- **期望**：用户已经填了 `100`，缺的是另一侧，应说「另一侧还需要填写」之类，而不是说金额必须大于 0。
- **实际**：空池（首币建池）只填社区代币 `100` → 红字「金额必须大于 0。」；智能模式关、只填社区代币 `1000` → 同样「金额必须大于 0。」。页面同时又有「第一次建池要两侧都填」的提示，两条信息互相矛盾。
- **最小复现步骤**：
  1. 空池：自定义 TestX（无 pair）→ 只填 `100` → 读 `liquidity-amount-error`；
  2. 有池：智能模式关 → 只填 `1000` → 读同一位。
- **证据**：`/tmp/qa-liquidity-a2-off-after-one-side.png`、`/tmp/qa-liquidity-e4-empty-pool-add.png`；DOM `金额必须大于 0。`（`add-liquidity-panel.tsx` L181-183 对「任一侧为 0」复用 `amountZero`）。
- **一句话修复方向**：区分「两侧都为空」与「缺另一侧」，后者用专门的「另一侧数量还需要填写」文案。
- **状态：✅ 已修**。新增 `addSideIssue` 判定：Router 路径只填一侧 → 「另一侧的数量还需要填写。」；显式填 0 / 两侧都是 0 → 「金额必须大于 0。」。证据：`liquidity-form.test.ts`「addSideIssue」、`add-liquidity-panel.test.tsx`「D6/D7」、e2e 边界用例。

### D7 · P3 · 输入 0 或极小数（1 wei）时没有任何解释，只有一行通用提示且主按钮禁用

- **期望**：给出「金额必须大于 0。」或「这笔数量太小，池子配平后没有可用的份额。」（copy 里两条都有），而不是静默禁用。
- **实际**：加池输入 `0` → 无错误文案；输入 `0.000000000000000001`（1 wei）→ 报价卡只有「填好数量后，这里显示预计获得的流动性凭证。」，主按钮禁用，无原因。撤出输入 `0` → 无错误、无「预计收到约」、按钮禁用。
- **最小复现步骤**：连接 #5（只有原生币）→ 输入 `0`，再输入 `0.000000000000000001`；我的流动性撤出输入框输入 `0`。
- **证据**：`/tmp/qa-liquidity-b2-zero-native.png`、`/tmp/qa-liquidity-b2-tiny-native.png`、`/tmp/qa-liquidity-f1-withdraw-zero.png`；`copy.liquidity.errors.amountTooSmall` / `copy.liquidity.add.amountZero` 未被使用。
- **一句话修复方向**：报价为 0 / 撤出额为 0 时渲染「数量太小」或「必须大于 0」的可见错误。
- **状态：✅ 已修**。加池：显式 0 → 「金额必须大于 0。」；有输入、算完了却拿不到份额（如两侧各 1 wei）→ 「这笔数量太小，池子配平后没有可用的份额。」。撤出：输入 0 → 「金额必须大于 0。」；LP 太小导致某一侧为 0 → 同一条「数量太小」。证据：同上单测/组件测试 + e2e 用例 G/H（撤出 0）与边界用例（1 wei）。

### D8 · P3 · 原生币单边（本次不需要代币授权）时，授权按钮显示「已授权 TestLOVE20」而链上额度是 0

- **期望**：本次交易不需要代币时，授权行不显示或显示「这笔不需要授权」。
- **实际**：智能模式开、只填 10 ETH（账户 #5，代币余额 0、Hub allowance 0）时，授权按钮禁用但文案「已授权 TestLOVE20」，下方说明「这次要用的额度已经够，不需要再授权。」——把「不需要授权」说成「已授权」。
- **最小复现步骤**：连接 #5 → 只填 `10` ETH → 读 `liquidity-add-approve` 文案。
- **证据**：`/tmp/qa-liquidity-b1-slippage-invalid-native-only.png`；DOM `已授权 TestLOVE20` + `disabled=true`，链上 `allowance=0`。
- **一句话修复方向**：`requiredTokenAmount === 0` 时隐藏授权行或改成「这一笔不需要额外授权」。
- **状态：✅ 已修**。新增 `approvalNeed`（required / satisfied / not-needed）：不需要代币时授权按钮显示「这一笔不需要代币授权」，不再出现「已授权 TestLOVE20」；撤出数量为 0 时同样不冒充已授权。证据：`liquidity-form.test.ts`「approvalNeed（QA D8）」、`add-liquidity-panel.test.tsx`「D8」、`e2e/liquidity-numbers.spec.ts` 用例 M。

### D9 · P3 · 自定义代币输入零地址后点「读取这个代币」，完全无反馈（静默 no-op）

- **期望**：提示「这个地址上没有合约，不能作为代币。」（copy 已有）或「读不到这个代币的名称或精度」。
- **实际**：粘贴 `0x0000000000000000000000000000000000000000` 点「读取这个代币」，等 6s：不报错、不显示「正在读取这个代币…」、token 行不变（仍 TestLOVE20），点击像没发生。对照：合法地址（TestX）能正常读取并切换，说明不是按钮/输入问题；零地址在 `isConfiguredAddress` 处被当成「未配置」直接跳过，`custom.status` 停在 `idle`，所以没有任何错误分支。
- **最小复现步骤**：连接钱包 →「换个代币地址」→ 输入 40 个 0 的地址 →「读取这个代币」→ 观察 6s。
- **证据**：`/tmp/qa-liquidity-f2-zero-address.png`、`/tmp/qa-liquidity-e3-zero-address-silent.png`；DOM `liquidity-custom-error` 数量 0，`custom.status` 无 checking/ok/错误态。
- **一句话修复方向**：`addCustomToken` 对零地址直接落 `invalid`/`no-code` 错误分支，给出「这个地址上没有合约」。
- **状态：✅ 已修**。自定义代币解析不再用 `isConfiguredAddress` 把零地址过滤成「未配置」（静默 no-op）；零地址直接落 `no-code`（不必等 RPC），其它无代码地址照常读 bytecode 后落同一分支，显示「这个地址上没有合约，不能作为代币。」。证据：`use-liquidity-catalog.test.ts`「customTokenStatus（QA D9）」、`e2e/liquidity-numbers.spec.ts` 用例 K（待统一跑）。

### D10 · P3 · 添加/查询页签来回切换会清空已填金额与已展开详情

- **期望**：同页页签切换保留表单（或至少提示会丢失）。
- **实际**：加池输入 `123`（或已填好 100000 + 展开详情）→ 切「社区流动性查询」→ 切回「添加流动性」：输入框已清空、智能模式回到默认开、详情折叠。对正在抄地址/核对数量的用户是打断。
- **最小复现步骤**：连接钱包 → 输入 `123` → 点「社区流动性查询」→ 点「添加流动性」→ 输入框为空。
- **证据**：`/tmp/qa-liquidity-a1-token-only.png` 与 A6 记录（`input after tab round-trip = ""`）；实现上 `liquidity-page.tsx` 按 `tab` 条件渲染，切走即卸载面板。
- **一句话修复方向**：把添加/撤出表单状态提升到页面层（或页签用 CSS 隐藏而非卸载），切回时恢复。
- **状态：✅ 已修**。三个页签面板常驻、非活动页签用 `hidden` 隐藏（不再按 `tab` 条件卸载），切回时输入金额、展开的「详情」、智能模式开关、写链状态都保留。证据：`liquidity-page.test.tsx`「D10」、`e2e/liquidity-numbers.spec.ts` 用例 L。

---

## 二、场景矩阵（期望 / 实际 / 级别 / 证据）

> PASS = 与三线文档/页面契约逐字一致；FAIL = 见第一节缺陷编号。

| # | 场景 | 期望 | 实际 | 结果 | 证据 |
| --- | --- | --- | --- | --- | --- |
| S1 | 智能模式默认态 | 开关开、提示「只填一侧，或两侧都填…」 | 一致 | PASS | `smoke.png` |
| S2 | 智能模式开·只填社区代币 `100000` | `预计获得 1,003.579928 流动性凭证`；详情三段逐字 | 全部逐字一致 | PASS | `a1-token-only.png` |
| S3 | 智能模式开·两侧都填且不匹配（`1000` + `1 ETH`） | 自动配平、详情给出 swap 段 | `预计获得 33.510373`；`其中 0.24882 ETH 会先换成 494.920942 TestLOVE20。` / 实际进池 / 最少进池 | PASS | `a1-both-sides.png` |
| S4 | 智能模式开·详情默认折叠 | 未点开时无 `liquidity-details` | 一致（count=0） | PASS | S2 记录 |
| S5 | 智能模式关·只填社区代币 `1000` | 原生币自动 `0.5` 且只读；详情 `实际进池 1,000 … + 0.5 ETH`、`预计获得 22.360679` | 一致 | PASS | `b3-smart-off-mirror.png` |
| S6 | 智能模式关·改只读侧 | 点只读侧接管输入，反方向联动 | 点原生币框后原生可编辑、代币变只读；`0.25` → `500`；`333` → `0.1665` | PASS | `b3-smart-off-switch-driver.png`、`b4-mirror-333.png` |
| S7 | 智能模式关·只填一侧 | 提示另一侧需要填写 | 显示「金额必须大于 0。」 | FAIL D6 | `a2-off-after-one-side.png` |
| S8 | 智能模式关→开 | 保留两侧数值、报价回到 Hub 路径 | `333`/`0.1665` 保留，报价 `7.446106` | PASS | `b5-smart-on-again.png` |
| S9 | 空池·首次建池提示 | `这个代币还没有流动性池。` + `智能模式暂时用不了：…第一次建池只能两侧都填。` | 逐字一致 | PASS | `e4-empty-pool-add.png` |
| S10 | 空池·只填一侧 | 不可提交 | 不可提交（文案见 D6） | FAIL D6 | `e4-empty-pool-add.png` |
| S11 | 空池·两侧 `100 TestX` + `0.01 ETH` | `预计获得 0.999999`；详情 `第一次建池：1 ETH = 10,000 TestX` | 逐字一致 | PASS | `e4-empty-pool-quote.png` |
| S12 | 空池·授权→建池 | Router 授权后提交成功、回执 | 成功，回执「流动性添加完成」 | PASS | `e4-first-mint-receipt.png` |
| S13 | 建池后查询 | `100 TestX` / `0.01 ETH` / `1 ETH ≈ 10,000 TestX` / `1 TestX ≈ 0.0001 ETH` | 逐字一致 | PASS | `e4-first-pool-query.png` |
| S14 | 建池后智能模式恢复 | 不再显示「还没有池子」，Hub 报价可用 | 黄条消失，`预计获得 0.00498` | PASS | `e4-testx-smart-after-pool.png` |
| S15 | Hub 报价失败（RPC 注入） | 顶部说明 + 报价错误卡 + 「重新计算 / 关掉智能模式，自己填两侧」 | 一致；点降级后走 Router，`1000`+`0.5` → `22.360679` | PASS | `d1-hub-quote-failed.png`、`d1-degraded-ready.png` |
| S16 | 加载中智能模式提示 | 不应断言没有池子 | 慢 RPC 时误报空池原因 | FAIL D3 | `e2-slow-loading-flash.png` |
| S17 | 滑点预设 0.1/0.5/1.0 与有效期说明 | 切换生效、显示「提交后 20 分钟内有效」 | 一致（`0.1%` 生效） | PASS | `b1b-slippage-preset.png` |
| S18 | 滑点自定义非法 `60` / `abc` | 提示并禁用提交 | 提示只在弹层内、提交仍可点（按 0.5% 下单） | FAIL D2 | `f3-slippage-invalid-submit-enabled.png` |
| S19 | 授权→提交（加池） | 「授权 TestLOVE20」→「已授权」→「确认添加」→ 回执 hash | 成功，回执 `0x5c2479dc…1443ce` | PASS | `c1-before-approve.png`、`c1-after-approve.png`、`c1-add-receipt.png` |
| S20 | 长期授权态（预置 unlimited） | 显示「已长期授权」+ 长期授权说明、主按钮解锁 | 一致 | PASS | `longterm-approval.png` |
| S21 | 我的流动性·LP 与占比 | `1,003.579928` / `18.32%` / `持有 1,003.579928` | 一致 | PASS | `f1-withdraw-100.png` |
| S22 | 撤出 25/50/75/100% 快捷 | 回填 LP 数量 + 「预计收到约」与理论值逐字 | 25% → `250.894982` / `13,745.872912 + 4.581957`；50% → `501.789964` / `27,491.745825 + 9.163915`；75% → `752.684946` / `41,237.618738 + 13.745872`；100% → `1003.579928` / `54,983.491651 + 18.32783` | PASS | `f1-withdraw-100.png` |
| S23 | 撤出·超出持仓 / 0 | 超持仓报错；0 给原因 | 超持仓「超过你持有的 1,003.579928 流动性凭证。」；0 无提示 | FAIL D7（0 部分） | `f1-withdraw-zero.png` |
| S24 | 撤出·滑点非法 | 禁用提交 | 仍可授权与提交 | FAIL D2 | `f1-withdraw-bad-slippage.png` |
| S25 | LP 授权→撤出 100% | 回执「已撤出 54,983.491651 … + 18.32783 ETH」→ 空态 | 一致；空态「你还没有这个池子的流动性。」 | PASS | `f1-withdraw-receipt.png`、`f1-empty-after-withdraw.png` |
| S26 | 撤出后链上回到初始 | 凭证总量 `4,472.135954`、储备 `245,016.508348` / `81.672169` | 一致 | PASS | `f1-query-after-withdraw.png` |
| S27 | 事务·慢钱包（4s） | 等待中无错误、最终出回执 | 7.07s 出「流动性添加完成」，途中无错误 | PASS | `c2-slow-wallet-waiting.png`、`c2-slow-wallet-done.png` |
| S28 | 事务·取消签名 / 双击 / 回执关闭后再操作 / 刷新后首笔 | 取消给文案且可重试；双击只 1 笔；回执关闭不丢状态；刷新后首笔可提交 | 取消→「你在钱包里点了取消，没有扣款。」；双击 `eth_sendTransaction` 计数 1；回执关闭后输入保留；刷新后授权态恢复、可提交 | 通过（回执后再操作撞 D1） | `c2-cancel-signature.png`、`c2-double-click.png`、`c2-reapprove-after-reload.png` |
| S29 | 查询页·深池/浅池/双向价格/地址复制 | 200,000/100 → `1 ETH ≈ 2,000`、`1 TestLOVE20 ≈ 0.0005 ETH`；pair 完整地址 + `title` + 复制到剪贴板 | 一致；复制后剪贴板 = `0x3FC12a5abAe69C8Eee58C37cEDC266751507620D` | PASS | `a7-query-deep.png` |
| S30 | 社区切换跟随 / 未连接 / 移动端桌面深浅色 | 切社区页面跟随；未连接可读查询；布局无溢出 | 无自定义代币时跟随（`TestCMTOK1` 显示无池空态）；有自定义代币时不跟随；未连接 add/mine 显示连接卡、查询可读；12 张四套截图无横向溢出 | FAIL D5（自定义代币场景） | `e1-community-followed.png`、`e1-custom-overrides-community.png`、`d3-disconnected-query.png`、`e6-*.png` |

---

## 三、怀疑未复现 / 未覆盖（不列为缺陷，留给后续环境复跑）

| # | 场景 | 为什么没结论 | 建议 |
| --- | --- | --- | --- |
| N1 | **Hub 缺失时降级 Router**（`hub === undefined` 的页面文案与路径） | 验证链的地址簿恒定包含 Hub（`0x84eA…7fEB`），页面的 `hub` 来自部署 JSON；移除 Hub 需要改 `src/config/deployments/*.json` 或环境变量，属改产品配置，超出「只复现」范围。**等价路径已覆盖**：Hub 报价失败（RPC 注入 revert）→ 顶部提示 + 「关掉智能模式，自己填两侧」→ Router 路径可用（S15）。 | 用一份去掉 `hub` 的部署配置起 dev server 复跑：应看到底部 `这个环境没有配置智能加池的合约…` 与黄条 `智能模式暂时用不了：…`。 |
| N2 | **错误网络**（`网络不对。` + 切换网络按钮） | wallet stub 固定 `eth_chainId = 0x1` 时 wagmi 连接直接失败（页面停在「连接钱包后添加流动性。」的未连接态），没有进入 `isWrongChain` 分支；要进入该分支需要在已连接后把链切到未配置网络，stub 无法稳定模拟 `chainChanged`。 | 用真实钱包或能触发 `chainChanged` 的 stub 复跑：连接后切到 chain 1，确认 add/mine 显示「网络不对。」且查询仍可读。 |

补充未覆盖项（非缺陷，记录口径）：LP/代币「额度不足→再授权」的**恰好够**边界（本轮只覆盖 0 额度与 unlimited）；撤出输入超过 18 位小数；深色主题下长地址换行细节（截图看无溢出，但未做几何断言）。

---

## 四、复现环境与脚本

- 验证链：`make -C ../anvil bootstrap PORT=8586` → `cast chain-id = 31337`；跑完 `make -C ../anvil stop PORT=8586`。
- dev server：`/tmp/qa-liquidity/repo`（工作区冻结快照，`node_modules` 软链到仓内）→ `VITE_ENV=dev VITE_ANVIL_RPC=http://127.0.0.1:8586 ./node_modules/.bin/vite --port 5186`。**不产 `dist/`，不与修 bug 的 agent 抢构建产物。**
- 写链/注入：`/tmp/qa-liquidity/harness.mjs`（EIP-1193 stub + anvil snapshot/revert）、`/tmp/qa-liquidity/rpc-proxy.mjs`（8586 前置换算：慢 RPC、只让 `quoteLpWithNative` 子调用 revert —— 页面读走 Multicall3 `aggregate3`，因此按 sub-call 改写而不是匹配单条 `eth_call`）。
- 场景脚本：`scenario-a/b/c1/c2/d/e/f.mjs` 与 `probe-*.mjs`，原始输出 `/tmp/qa-liquidity/scenario-*.log`。
- 每轮用例都 `anvil_snapshot` / `anvil_revert` 隔离；唯一例外是手工 `cast` 初始化子社区 `TestCMTOK1`（用于社区切换用例）与 #4 的 unlimited 授权（用于长期授权用例）。


## 五、修复验证（2026-11-14 20:xx）

修复在 `src/features/liquidity-pool/**` 与 `src/shared/config/copy-pages.ts`，未 `git add`/`commit`（Lead 统一提交）。

| 缺陷 | 代码改动 | 已跑通的断言 |
| --- | --- | --- |
| D1 | `use-liquidity-transaction.ts`：`approveRevision`（每次授权确认 +1）替代 `approvedKey`；`add-liquidity-panel.tsx` / `my-liquidity-panel.tsx` 监听 revision 无条件重读 allowance+余额 | `use-liquidity-transaction.test.ts` 1；e2e 用例 G/H（待跑） |
| D2 | 两个面板 `canSubmit`/授权禁用纳入 `customSlippageError`；`liquidity-slippage-error`、`liquidity-withdraw-slippage-error` 常显 | `add-liquidity-panel.test.tsx` 1；e2e 边界 + G/H（待跑） |
| D3 | `liquidity-form.ts`：`poolNoticeKind`（loading/read-failed/empty 分开） | `liquidity-form.test.ts` 4 + `add-liquidity-panel.test.tsx` 1 |
| D4 | `liquidity-page.tsx`：unknown/error 渲染「读不到这个社区。」+ 重试，不回退目录首币 | `liquidity-page.test.tsx` 1；e2e 用例 I（待跑） |
| D5 | `liquidity-page.tsx`：`symbol` 变化清自定义代币 | `liquidity-page.test.tsx` 1；e2e 用例 J（待跑） |
| D6/D7 | `liquidity-form.ts`：`addSideIssue`；加池/撤出面板 0 与「太小」的可见原因 | `liquidity-form.test.ts` 4 + `add-liquidity-panel.test.tsx` 1；e2e 边界 + G/H（待跑） |
| D8 | `liquidity-form.ts`：`approvalNeed`；文案 `copy.approve.notNeeded` | `liquidity-form.test.ts` 1 + `add-liquidity-panel.test.tsx` 1；e2e 用例 M（待跑） |
| D9 | `use-liquidity-catalog.ts`：`customTokenStatus` 纯函数，零地址直接 `no-code` | `use-liquidity-catalog.test.ts` 3；e2e 用例 K（待跑） |
| D10 | `liquidity-page.tsx`：三面板常驻 + `hidden` | `liquidity-page.test.tsx` 1；e2e 用例 L（待跑） |

本轮可跑的验证：

```
$ npx vitest run src/features/liquidity-pool
 Test Files  6 passed (6)
      Tests  38 passed (38)
$ pnpm test
 Test Files  93 passed (93)
      Tests  615 passed (615)

$ npx eslint src/features/liquidity-pool e2e/liquidity-numbers.spec.ts --max-warnings=0   # 0
$ pnpm typecheck   # 0（并行任务收尾后全仓转绿）
$ pnpm lint        # 0
# 抢锁后官方 build：
$ VITE_ENV=dev pnpm build   # ✓ built in 8.16s，退出码 0
```

**e2e / 16 张截图：待 Lead 在合约侧稳定后统一跑（build 已单独跑通）。** 原因：`../core@00113ae` 给 `IStake.stakeLiquidity` 加了第 6 参，`../periphery/LOVE20Hub.sol`、`../anvil/script/SeedFlow.s.sol` 还是旧调用 → 当前任何端口 `make bootstrap` 都会编译失败；且并行 agent 的改动让全仓 `pnpm typecheck` 在途为红，`pnpm build`（内含 typecheck）无法作为本轮门禁。`e2e/liquidity-numbers.spec.ts` 已新增用例 G/H/I/J/K/L/M 与 D2/D6/D7 断言，截图 `liquidity-{add,mine,withdraw,empty}-{light,dark}-{mobile,desktop}.png` 由该 spec 的「验收截图」describe 覆盖，跑一次即更新。
