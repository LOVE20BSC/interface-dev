# 全局交互 / 主题 / 我的 / 首页 / 应用目录 / 关于：QA 逐场景复现与缺陷清单

- **状态**：完成（只复现、只出清单；未改产品代码、未 git add / commit）
- **日期**：2026-11-14
- **范围**：全局外壳与顶部（`src/app/shell/**`、`src/widgets/connect-pill/**`）、主题（`src/pages/theme/**`、`src/shared/lib/theme.ts`、`index.html` bootstrap）、我的（`src/pages/me/**`）、首页（`src/pages/home/**`）、应用目录（`src/pages/apps/**`、`src/domain/apps-catalog.ts`）、关于（`src/pages/about/**`）、全局动作/回执/地址复制（`src/shared/ui/**`、`src/features/*/ui/*-receipt*`）、深链接与 404（`src/app/router/**`）
- **台账**：`ledger/worklog/202611/14-1054-d20f-qa-review-全局交互-主题-我的-首页-逐场景复现并出缺陷清单.md`

## 1. 结论速览

| 指标 | 值 |
| --- | --- |
| 复现场景 | **104** 条（自动脚本 101 条 + 人工截图复核 3 条） |
| 通过 | 99 |
| 已验证缺陷 | **4 条记录 / 3 个根因**（P2 ×2 同一根因，P3 ×2） |
| 怀疑未复现 | 1 条（P3） |
| 级别分布 | P0 **0** · P1 **0** · P2 **2** · P3 **3** |
| 修复跟进（2026-11-14 fix-global） | **已修 3 条**（D-1、D-2、D-3）· **收窄 1 条**（G8，不改产品语义）· 逐条证据见 §7 |

**最严重的 3 条**

1. **[P2] 右上角两个菜单关闭后键盘焦点丢失到 `body`**（社区菜单 + 钱包菜单；Esc 关闭与右上角 ✕ 关闭都复现）。键盘 / 读屏用户关掉菜单后，Tab 顺序从页面顶部重新开始，回不到刚操作的触发按钮。证据：`C15`、`C15b`。
2. **[P3 怀疑] 冷启动（URL 没有 `?symbol=`）时字标先显示「LOVE20协议」，约 100–200ms 后才变成链上 symbol「TestLOVE20」**（移动端首页字标与桌面侧栏字标同源）。属 `useCommunityDisplay` 的协议名兜底，是否接受为设计需 owner 确认。证据：`G8`。
3. **[P3] 关于页 390 宽：完整合约地址 `break-all` 换行后，末行只剩 1 个字符**（如 `…F2FdC31` 下一行单独一个 `8`），同一行右侧还有复制图标挤压。证据：`B7` + `/tmp/qa-global-dark-about-390.png`。

> 第 4 条（P3）：我的页「关于」块 label 与链接文案重复为「开源文档 / 开源文档」（`M7`）。

**总体判断**：本模块集合的核心承诺基本成立——主题即时生效且刷新不闪、四类首页提醒互斥且 CTA 正确、应用目录 9 条按分类分组、按钮全部回到内容流且先决按钮在前、回执只有一个「知道了」且不重弹、地址全局可复制、关于页 tab/键盘/复制正常、深链接刷新与 404 正常。没有阻塞级问题；唯一值得排期的是菜单关闭后的焦点回归。

## 2. 环境与复现入口

```bash
export PATH="/Users/BigPolarBear/.foundry/bin:/Users/BigPolarBear/.nvm/versions/node/v24.12.0/bin:/Users/BigPolarBear/Library/pnpm/bin:$PATH"
make -C ../anvil bootstrap PORT=8588          # 独立验证链，未触碰 8545
VITE_ENV=dev VITE_ANVIL_RPC=http://127.0.0.1:8588 pnpm dev --port 5188
node /tmp/qa-global/01-theme-shell.mjs          # 依此类推 02..08
```

- 钱包：注入式 EIP-1193 stub，转发到 8588（`/tmp/qa-global/lib.mjs`），不引入私钥。
- 账户：`0xf39F…2266`（持身份 NFT #1，已铸造）、`0x9965…A4dc`（快照内未铸造 / 空投资格）、`0x8b3a…3Be5d`（快照外无身份）、`0x7099…79C8`（持 NFT #2 但未选身份）。
- 社区 fixture：用 `cast` 在 8588 上 launch 了子社区 `TestCMTOK1`（`0xe082b26c…`），用于「精确 / 前缀 / 切换回最近访问」。
- 交易证据：转账回执一笔真实上链交易 `0xd3fb4bed567d122fa2e2c54fb931e63cfe45cdf30079e860b490dc5e7cd1ff38`（S5）。
- 截图全部在 `/tmp/qa-global-*.png`；脚本在 `/tmp/qa-global/*.mjs`（不在仓库内，避免污染并行修复）。

## 3. 已验证缺陷

### D-1 [P2] 关闭右上角菜单后焦点丢失到 `body`

- **影响**：社区菜单、钱包菜单（桌面 popover / 移动 bottom sheet 都算）。关闭后 `document.activeElement === body`，键盘用户下一次 Tab 从页首开始，读屏焦点脱离触发点。`connect-pill.tsx` 的 `closeMenu()` 里有 `activeTrigger?.focus()`，但被 Radix 关闭动画/`onCloseAutoFocus` 覆盖。
- **最小复现**：
  1. 390×844 打开 `/?symbol=TestLOVE20`，连接钱包；
  2. 点右上角社区药丸 → 抽屉打开（此时焦点在右上角「关闭」）；
  3. 按 `Esc`（或点抽屉右上角 ✕）；
  4. `document.activeElement` 是 `BODY`，不是「当前代币社区 TestLOVE20，打开社区菜单」按钮。
- **期望**：焦点回到触发按钮（WAI-ARIA dialog 惯例）。
- **证据**：`C15`（社区菜单）、`C15b`（钱包菜单），DOM 摘录 `{"tag":"BODY","label":null}`；独立探针在 Esc 与 ✕ 两条路径上均复现。
- **一句话修复方向**：在 `Sheet` / `PopoverContent` 上对关闭时自动聚焦做 `preventDefault`（或 `onCloseAutoFocus` 里自行 `focus()` 到 anchor），确保 Radix 卸载后焦点回到 `communityAnchor` / `walletAnchor`。
- **修复状态：已修（2026-11-14 fix-global）** — `MenuLayer` 对两种弹层都走 Radix `onCloseAutoFocus`：`preventDefault()` + 手动 focus 触发按钮；删除 `ConnectPill.closeMenu()` 里会被焦点陷阱吞掉的 manual focus。证据见 §7.1。

### D-2 [P3] 关于页 390 宽：完整地址换行出现孤字行

- **最小复现**：390×844 打开 `/about?symbol=TestLOVE20` → 合约地址 tab → 「核心」分组里的长地址。
- **实际**：`display="full"` 的地址用 `break-all`，宽度被右侧复制图标占掉后末行只剩 1 个字符（如 `8`），视觉上像地址被截断。
- **期望**：地址与复制图标分两行/两列布局，或地址允许在 `0x` 前缀后换行、不产生孤字。
- **证据**：`B7`、`/tmp/qa-global-dark-about-390.png`、`/tmp/qa-global-light-about-390.png`。
- **一句话修复方向**：把复制图标移出地址行（放在 label 右侧或地址下方），或对完整地址改用 `tabular-nums` + 更小字号的两行栅格。
- **修复状态：已修（2026-11-14 fix-global）** — 采用「地址允许换行但不产生孤字」方案：`CopyableAddress` 的 `display="full"` 在 `0x` 之后每 4 个十六进制字符插入 `<wbr>` 软换行点并加 `text-wrap: balance`，390 宽实测两行 145.8 / 132.5 px（≥4 字符），不再有单字符末行；`title` 与复制文本逐字不变。证据见 §7.2。

### D-3 [P3] 我的页「关于」块 label 与链接文案重复

- **最小复现**：打开 `/me?symbol=TestLOVE20` → 第三块「关于」。
- **实际**：渲染为「开源文档　　开源文档」（`Row` 的 label 用 `copy.me.docs`，链接文案用 `copy.home.docs`，两者同为「开源文档」）。
- **期望**：label 与可点动作不重复，例如 label「开源文档」+ 链接「打开」。
- **证据**：`M7`、`/tmp/qa-global-dark-me-390.png`。
- **一句话修复方向**：给链接换一个动作词（打开 / 前往），或直接去掉左侧 label 让整行成为链接。
- **修复状态：已修（2026-11-14 fix-global）** — 新增 `copy.me.docsAction`「前往文档」，`/me` 的「关于」块标签仍是「开源文档」、链接文案改为「前往文档」；`copy.home.docs` 不再被该页复用。证据见 §7.3。

## 4. 怀疑未复现

| ID | 事项 | 性质 | 说明 |
| --- | --- | --- | --- |
| G8 | 冷启动字标先「LOVE20协议」后「TestLOVE20」 | **已收窄（2026-11-14 fix-global）** | 无 `?symbol=` 的首屏，`useCommunityDisplay` 在 `symbol()` 读回前用协议名兜底；实测 61ms→165ms 换字。按 owner 裁决「不改产品语义、只收窄窗口」处理：`useCommunityDisplay` 新增 `pending`，解析中字标不渲染（未知/未配置社区仍回退「LOVE20协议」），所以首帧不会出现协议名再换名。证据见 §7.4。 |
| A5 | 应用目录禁用态（缺地址 → `aria-disabled` 行 + 原因） | 运行时不可复现 | 本构建地址簿 24 个 slot 全部已配置，无法构造禁用行；逻辑由 `src/domain/apps-catalog.test.ts` 覆盖。需在缺 `batchTransfer` 等地址的构建变体复验。 |
| B4b | 关于页「未配置」行 | 运行时不可复现 | 同上，地址簿无零地址 slot。 |
| B6 | 关于页 tab 状态不入 URL | 设计选择，非缺陷 | 刷新回「合约地址」；若以后要分享「数据」tab，需要 `?tab=`。 |
| S5b | 回执 sheet 右上角 ✕ 与「知道了」同义 | 设计确认项，非缺陷 | 回执内仅 1 个动作按钮「知道了」（实心）；✕ 是弹层通用关闭，二者都走 `onDismiss`（关闭并折叠为成功条）。 |
| W2 | 「检测钱包中…」中间态 | 采样抓不到，已用截图佐证 | 轮询窗口仅 60ms 未抓到；`/tmp/qa-global-dark-home-390.png` 中药丸与首页卡片同时显示「检测钱包中…」，确认该状态渲染。 |
| W1b | 网络切换首次运行失败、重跑通过 | 判定测试抖动 | 首次点击与按钮重渲染竞态；独立探针 `wallet_switchEthereumChain → eth_chainId=0x7a69 → 连接态` 正常。 |

## 5. 场景矩阵（104 条）

> 「证据」列是 `/tmp/qa-global-*.png` 截图；「实际」列为该场景断言时抓到的 DOM/JSON 摘录（已截断）。级别列只对非通过项标注。

### 顶部与全局外壳（27 条）

| ID | 场景 | 期望 | 实际 | 级别 | 证据 |
| --- | --- | --- | --- | --- | --- |
| G1 | 未连接首页：移动端字标显示 + 连接按钮可用 + 顶部无字标链接 | home-wordmark 可见且为 TestLOVE20；连接钱包按钮 ≥1 且 enabled；banner 内无 link | {"wordmarkVisible":true,"wordmarkText":"TestLOVE20","connectCount":2,"connectEnabled":true,"headerLinks":0} | 通过 | /tmp/qa-global-shell-disconnected-home-390.png |
| G2 | 连接后：移动端字标隐藏，右上角药丸显示 symbol + 地址 + 身份 NFT 行 | home-wordmark 计数 0；药丸含 TestLOVE20、0xf39F…2266、Testdev-member-0 | {"wordmarkCount":0,"chip":"TestLOVE20","pillText":"0xf39F…2266 Testdev-member-0"} | 通过 | /tmp/qa-global-shell-connected-home-390.png |
| G2b | 连接态药丸身份行文案与地址缩写正确 | 地址缩写 0xf39F…2266，身份行 Testdev-member-0 | 0xf39F…2266 Testdev-member-0 | 通过 |  |
| G3 | 钱包菜单「断开连接」后回到未连接态（字标回、药丸去、连接按钮回） | 字标重新可见、药丸消失、出现连接钱包按钮 | {"wordmark":true,"pillGone":true,"connectCount":2} | 通过 | /tmp/qa-global-shell-after-disconnect-390.png |
| G4 | 桌面 1280：左侧栏字标 + 页头「首页」标签，底部导航仅移动端 | 侧栏含 symbol（顶部 wordmark）、5 个导航项；页头显示「首页」；底部 tab bar 在桌面不渲染/不可见 | {"sidebarWordmark":"L20 TestLOVE20 首页 治理 即将上线 行动 即将上线 应用 我的 本地开发 版本 e2e-71997501 收起侧栏","headerHomeLabel":1,"bottomNavVisible":false,"navCount":0,"side… | 通过 | /tmp/qa-global-shell-desktop-home-1280.png |
| G5 | 390 宽非首页：社区药丸收窄为单字母圆标（compact chip） | 药丸只显示 symbol 首字母 T（悬停/读屏仍为完整 symbol） | T | 通过 | /tmp/qa-global-shell-compact-chip-390.png |
| G6 | document.title 跟随社区 symbol（应用 · TestLOVE20） | 应用 · TestLOVE20 | 应用 · TestLOVE20 | 通过 |  |
| G7 | 首页/应用页无 console error / pageerror | 无 error | none | 通过 |  |
| C15 | 社区菜单 Esc 关闭后焦点回到触发按钮（键盘可达） | 菜单关闭，activeElement 为「当前代币社区…」按钮 | {"tag":"BODY","label":null} | **缺陷 P2** |  |
| C15b | 钱包菜单 Esc 关闭后焦点回到触发按钮 | activeElement 为「打开钱包与身份 NFT 菜单」按钮 | {"tag":"BODY","label":null} | **缺陷 P2** |  |
| C9 | 钱包菜单完整地址点击复制：剪贴板拿到完整地址 + 就地「已复制」反馈 | 剪贴板 = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266；按钮出现「已复制」；title 为完整地址 | {"clipboard":"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266","copyFeedback":"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 已复制","title":"0xf39Fd6e51aad88F6F… | 通过 | /tmp/qa-global-wallet-menu-address-copied-390.png |
| C16 | 桌面 1280：右上角菜单为锚定 popover（非全屏底部 sheet） | dialog 宽度明显小于视口、靠右上 | {"x":787,"y":59,"width":288,"height":404} | 通过 | /tmp/qa-global-wallet-menu-desktop-1280.png |
| C17 | 社区切换与钱包菜单操作期间无 console error | 无 error | none | 通过 |  |
| M3 | 我的页钱包地址可点击复制，剪贴板与「已复制」反馈正确 | 剪贴板 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266；按钮出现 已复制 | {"clipboard":"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266","text":"0xf39F…2266 已复制"} | 通过 | /tmp/qa-global-me-address-copied-390.png |
| D7 | 键盘 Tab 焦点可见（focus-visible ring 出现在每个可视停靠点） | 前 10 个 Tab 停靠点（首页未连接）均有可见 ring（box-shadow/outline） | [{"tag":"BUTTON","text":"连接钱包","label":"连接钱包","boxShadow":"rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgb(237, 241, 247) 0px … | 通过 | /tmp/qa-global-keyboard-focus-home-390.png |
| D8 | 底部导航可键盘到达并用 Enter 导航 | Tab 到「应用」后 Enter 打开 /apps | {"navOk":true,"url":"http://127.0.0.1:5188/apps?symbol=TestLOVE20"} | 通过 |  |
| D11 | 首页无返回按钮；二级页（我的）有返回按钮与标题 | 首页返回按钮 0；我的页返回按钮 1，标题「我的」 | {"homeBack":0,"meBack":1,"meTitle":"我的"} | 通过 | /tmp/qa-global-me-header-back-390.png |
| S7 | 回执里的收款地址可点击复制（完整地址进剪贴板） | 剪贴板 = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8；出现 已复制 | {"clipboard":"0x70997970C51812dc3A010C7d01b50e0d17dc79C8","text":"0x70997970C51812dc3A010C7d01b50e0d17dc79C8 已复制"} | 通过 |  |
| S8 | 转账页不出现「不能撤回 / 不可撤回」类提示 | 页面文案不含 不能撤回/不可撤回/无法撤回 | 把代币转给另一个地址或身份 NFT 的持有人。请先核对收款方与金额。 收款方 按地址 9,891.052387 ETH 转账金额 全部 确认转账 | 通过 |  |
| S9 | 任务页（转账）底部没有多余「回首页」链接 | main 内「回首页」链接 0 | 0 | 通过 |  |
| S10 | 身份 NFT 转让弹层不出现「不能撤回 / 不可撤回」提示 | 转让弹层文案含「转让会改变控制者」类说明，但没有「不能撤回」 | {"transferButtons":1,"hasCantUndo":false} | 通过 | /tmp/qa-global-my-nft-transfer-sheet-390.png |
| S11 | 兑换页 390：无横向溢出，内容可纵向滚动（页面不被吸底按钮裁切） | scrollWidth ≈ innerWidth | {"docWidth":390,"innerWidth":390,"bodyHeight":883} | 通过 | /tmp/qa-global-swap-390-full.png |
| W1 | 错误网络：连接后药丸变成「网络不对，点此切换」，不出现钱包/身份菜单 | 未连接时是「连接钱包」；点击连接后 header 只有「网络不对，点此切换」；无钱包菜单按钮 | {"before":"TestLOVE20 连接钱包","after":"网络不对，点此切换","wrongVisible":true,"walletMenu":0} | 通过 | /tmp/qa-global-wrong-network-pill-390.png |
| W1b | 点击「网络不对，点此切换」后钱包切到目标链并回到连接态 | 出现钱包菜单按钮（连接态药丸），错误提示消失 | {"pill":"TestLOVE20 0xf39F…2266 未选择身份 NFT","walletMenu":1} | 通过 | /tmp/qa-global-wrong-network-switched-390.png |
| W5 | 钱包弹窗慢（2s）+ 连接按钮重复点击：只连一次，出现「连接中…」并最终稳定为连接态 | 中间态出现「连接中…」；双击不会重复弹窗/报错；最终 header 只有一个药丸，无错误对话框 | {"samples":["LOVE20协议 连接中…","TestLOVE20 连接中…","TestLOVE20 0xf39F…2266 读取身份 NFT 中…","TestLOVE20 0xf39F…2266 未选择身份 NFT"],"finalHeader":"TestLOVE20 0xf39… | 通过 | /tmp/qa-global-connect-slow-wallet-390.png |
| W2 | 连接按钮在注入钱包探测期间有明确的「检测钱包中…」中间态（不是空白/误点） | header 至少出现一次「检测钱包中…」，随后变为「连接钱包」 | ["LOVE20协议 连接钱包","TestLOVE20 连接钱包"] | 通过 | /tmp/qa-global-connect-probe-390.png /tmp/qa-global-dark-home-390.png |
| G8 | 冷启动（无 ?symbol）字标先显示「LOVE20协议」再变 TestLOVE20 | 首帧即社区 symbol，或明确的加载占位 | 实测 61ms 时为「LOVE20协议」，165ms 后为「TestLOVE20」（桌面侧栏与移动端字标同源） | **怀疑 P3** | /tmp/qa-global-shell-desktop-home-1280.png |

### 主题（21 条）

| ID | 场景 | 期望 | 实际 | 级别 | 证据 |
| --- | --- | --- | --- | --- | --- |
| T1 | 浅色：默认/存储浅色时 data-theme、color-scheme、背景一致 | data-theme=light, color-scheme=light, body 背景 #edf1f7, 主题卡「浅色」选中 | {"dataTheme":"light","colorScheme":"light","bodyBg":"rgb(237, 241, 247)","selected":"true"} | 通过 | /tmp/qa-global-theme-light-390.png |
| T2 | 浅→深即时生效（同一帧内 data-theme / class / meta / 背景全部切换并持久化） | data-theme=dark, .dark, color-scheme=dark, body #0b0e11, meta #0b0e11, 选中态变深色, localStorag… | {"dataTheme":"dark","hasDarkClass":true,"colorScheme":"dark","bodyBg":"rgb(11, 14, 17)","metaThemeColor":"#0b0e11","metaColorScheme":"dark","stored":"… | 通过 | /tmp/qa-global-theme-dark-390.png |
| T3 | 深色刷新：bootstrap 在首帧（首次绘制）前已设置 data-theme=dark，无浅色闪屏 | inline 脚本在 rAF 首帧之前写入 data-theme=dark；dist/index.html 的 CSS 是 head 中阻塞渲染的 <link>，所以首帧即深色 | {"firstSets":[{"at":4.700000047683716,"value":"dark"}],"firstFrames":[{"at":6,"readyState":"interactive","theme":"dark","bodyBg":"rgba(0, 0, 0, 0)","h… | 通过 | /tmp/qa-global-theme-dark-reload-390.png |
| T6 | 主题选择刷新后保留（/theme） | 刷新后仍为深色，选中态为「深色」 | {"theme":"dark","selected":"true"} | 通过 |  |
| T7 | 主题页键盘：方向键切换配色（radiogroup roving） | 聚焦「深色」按 ← 切回浅色，且焦点留在选项上 | {"theme":"light","focused":"深色"} | 通过 |  |
| T4 | theme-color / color-scheme meta 跟随切换（浏览器 chrome 同步） | 深色 #0b0e11、浅色 #edf1f7，color-scheme 同步 | {"darkMeta":"#0b0e11","lightMeta":"#edf1f7"} | 通过 |  |
| T5 | 系统深色偏好在没有存储选择时不得被跟随（只两套显式配色） | prefers-color-scheme=dark + 无 localStorage → 仍为浅色 radio 选中、body #edf1f7 | {"dataTheme":"light","colorScheme":"light","bodyBg":"rgb(237, 241, 247)","stored":null,"selected":"true"} | 通过 | /tmp/qa-global-theme-system-dark-390.png |
| K1l | 浅色配色：token 级 WCAG 对比度达标（line-2 浏览器计算值） | ≥4.5 / ≥4.5 / ≥4.5 / ≥4.5 / ≥4.5 / ≥4.5 / ≥4.5 / ≥4.5 / ≥4.5 / ≥4.5 / ≥3 / ≥3 / ≥3 | [{"pair":"foreground/background","ratio":15.75,"requirement":4.5,"ok":true},{"pair":"foreground/surface","ratio":17.85,"requirement":4.5,"ok":true},{"… | 通过 |  |
| K2l-home | 浅色 home 页：真实渲染文本对比度扫描（无 <3.0 的硬失败） | 所有可见文本对比度 ≥ 3.0（正文 ≥ 4.5） | {"total":12,"worst":[{"text":"测试网 · 没有真实价值","ratio":4.43,"fontSize":11,"large":false,"color":"rgb(180, 83, 9)","bg":"rgb(237, 241, 247)"},{"text":"连接钱… | 通过 | /tmp/qa-global-light-home-390.png |
| K2l-apps | 浅色 apps 页：真实渲染文本对比度扫描（无 <3.0 的硬失败） | 所有可见文本对比度 ≥ 3.0（正文 ≥ 4.5） | {"total":30,"worst":[{"text":"测试网 · 没有真实价值","ratio":4.43,"fontSize":11,"large":false,"color":"rgb(180, 83, 9)","bg":"rgb(237, 241, 247)"},{"text":"代币"… | 通过 | /tmp/qa-global-light-apps-390.png |
| K2l-me | 浅色 me 页：真实渲染文本对比度扫描（无 <3.0 的硬失败） | 所有可见文本对比度 ≥ 3.0（正文 ≥ 4.5） | {"total":20,"worst":[{"text":"测试网 · 没有真实价值","ratio":4.43,"fontSize":11,"large":false,"color":"rgb(180, 83, 9)","bg":"rgb(237, 241, 247)"},{"text":"首页"… | 通过 | /tmp/qa-global-light-me-390.png |
| K2l-about | 浅色 about 页：真实渲染文本对比度扫描（无 <3.0 的硬失败） | 所有可见文本对比度 ≥ 3.0（正文 ≥ 4.5） | {"total":28,"worst":[{"text":"测试网 · 没有真实价值","ratio":4.43,"fontSize":11,"large":false,"color":"rgb(180, 83, 9)","bg":"rgb(237, 241, 247)"},{"text":"首页"… | 通过 | /tmp/qa-global-light-about-390.png |
| K2l-theme | 浅色 theme 页：真实渲染文本对比度扫描（无 <3.0 的硬失败） | 所有可见文本对比度 ≥ 3.0（正文 ≥ 4.5） | {"total":15,"worst":[{"text":"测试网 · 没有真实价值","ratio":4.43,"fontSize":11,"large":false,"color":"rgb(180, 83, 9)","bg":"rgb(237, 241, 247)"},{"text":"L20… | 通过 | /tmp/qa-global-light-theme-390.png |
| K1 | 深色配色：token 级 WCAG 对比度达标（line-2 浏览器计算值） | ≥4.5 / ≥4.5 / ≥4.5 / ≥4.5 / ≥4.5 / ≥4.5 / ≥4.5 / ≥4.5 / ≥4.5 / ≥4.5 / ≥3 / ≥3 / ≥3 | [{"pair":"foreground/background","ratio":16.35,"requirement":4.5,"ok":true},{"pair":"foreground/surface","ratio":13.36,"requirement":4.5,"ok":true},{"… | 通过 |  |
| K2-home | 深色 home 页：真实渲染文本对比度扫描（无 <3.0 的硬失败） | 所有可见文本对比度 ≥ 3.0（正文 ≥ 4.5） | {"total":12,"worst":[{"text":"一个钱包可以拥有多个身份 NFT，身份 NFT ","ratio":4.77,"fontSize":14,"large":false,"color":"rgb(132, 142, 156)","bg":"rgb(30, 35, 41)"},… | 通过 | /tmp/qa-global-dark-home-390.png |
| K2-apps | 深色 apps 页：真实渲染文本对比度扫描（无 <3.0 的硬失败） | 所有可见文本对比度 ≥ 3.0（正文 ≥ 4.5） | {"total":30,"worst":[{"text":"按快照份额铸造创世代币","ratio":4.77,"fontSize":12,"large":false,"color":"rgb(132, 142, 156)","bg":"rgb(30, 35, 41)"},{"text":"在任意代… | 通过 | /tmp/qa-global-dark-apps-390.png |
| K2-me | 深色 me 页：真实渲染文本对比度扫描（无 <3.0 的硬失败） | 所有可见文本对比度 ≥ 3.0（正文 ≥ 4.5） | {"total":20,"worst":[{"text":"钱包地址","ratio":4.77,"fontSize":14,"large":false,"color":"rgb(132, 142, 156)","bg":"rgb(30, 35, 41)"},{"text":"网络","ratio"… | 通过 | /tmp/qa-global-dark-me-390.png |
| K2-about | 深色 about 页：真实渲染文本对比度扫描（无 <3.0 的硬失败） | 所有可见文本对比度 ≥ 3.0（正文 ≥ 4.5） | {"total":28,"worst":[{"text":"文档托管在 GitHub Pages，会在新标签","ratio":4.77,"fontSize":12,"large":false,"color":"rgb(132, 142, 156)","bg":"rgb(30, 35, 41)"},… | 通过 | /tmp/qa-global-dark-about-390.png |
| K2-theme | 深色 theme 页：真实渲染文本对比度扫描（无 <3.0 的硬失败） | 所有可见文本对比度 ≥ 3.0（正文 ≥ 4.5） | {"total":15,"worst":[{"text":"L20","ratio":5.17,"fontSize":8,"large":false,"color":"rgb(255, 255, 255)","bg":"rgb(37, 99, 235)"},{"text":"主题只改变显示，不影响链… | 通过 | /tmp/qa-global-dark-theme-390.png |
| K3 | 深色：画布与卡片的层级可区分（surface 比 background 亮，不只是靠边框） | body 背景 #0b0e11；卡片 surface #1e2329；两者亮度对比 ≥ 1.15 | {"bodyBg":"rgb(11, 14, 17)","cardBg":"rgb(30, 35, 41)"} | 通过 | /tmp/qa-global-dark-home-390.png |
| W3 | 深色下切换社区：不刷新页面且配色不回退浅色 | data-theme=dark、body #0b0e11、localStorage=dark；标题跟新 symbol | {"theme":"dark","bg":"rgb(11, 14, 17)","stored":"dark","title":"TestCMTOK1"} | 通过 | /tmp/qa-global-dark-child-community-390.png |

### 社区切换与钱包菜单（12 条）

| ID | 场景 | 期望 | 实际 | 级别 | 证据 |
| --- | --- | --- | --- | --- | --- |
| C1 | 社区菜单默认展示「最近访问」（新钱包空态）+ 父币/子币未接入 stub | 显示 最近访问 / 还没有访问过其他社区。/ 父币 未接入 / 子币 未接入；搜索框在顶部 | 代币社区 代币社区 按 symbol 搜索代币社区 最近访问 还没有访问过其他社区。 输入完整 symbol 可直接切换；前缀相同的社区也会列出来。 父币 未接入 子币 未接入 切换社区不会切换网络，也不会刷新页面。 | 通过 | /tmp/qa-global-community-menu-recents-empty-390.png |
| C7 | 父币/子币 stub 行具有 aria-disabled 且无点击行为（不是死链） | 2 行 aria-disabled=true，文案含 父币/子币 与 未接入 | ["父币未接入","子币未接入"] | 通过 |  |
| C3 | 前缀搜索：输入 Test 列出前缀相同的社区（当前社区带「当前」标记） | 结果含 TestLOVE20 与 TestCMTOK1；TestLOVE20 标记「当前」；前缀候选提示文案可见 | ["TestLOVE20","TestCMTOK1"] | 通过 | /tmp/qa-global-community-search-prefix-390.png |
| C2 | 精确 symbol 切换：输入子社区完整 symbol 点击结果，URL/药丸/标题同步且不刷新页面 | URL ?symbol=TestCMTOK1；药丸变 TestCMTOK1；首页 document.title 为裸 symbol「TestCMTOK1」；菜单关闭；无整页刷新 | {"exactText":"TestCMTOK1","url":"http://127.0.0.1:5188/?symbol=TestCMTOK1","chip":"TestCMTOK1","title":"TestCMTOK1","dialogGone":true,"noReload":"aliv… | 通过 | /tmp/qa-global-community-switched-child-390.png |
| C4 | 清空搜索输入后恢复「最近访问」，最近访问保留刚访问过的社区 | 重开菜单 最近访问 含 TestCMTOK1；输入 Te 变搜索结果；清空后回到 最近访问 且仍含 TestCMTOK1 | {"recentsBody":"代币社区 代币社区 按 symbol 搜索代币社区 最近访问 TestCMTOK1 输入完整 symbol 可直接切换；前缀相同的社区也会列出来。 父币 未接入 子币 未接入 切换社区不会切换网络，也不会刷新页面。","searchingBody":"代币社区 代币社… | 通过 | /tmp/qa-global-community-recents-restored-390.png |
| C5 | 输入不存在的 symbol：诚实空态、不发起切换、URL 不变 | 显示「没有找到这个 symbol 的社区。」；URL 仍为 ?symbol=TestCMTOK1 | {"url":"http://127.0.0.1:5188/?symbol=TestLOVE20","body":"代币社区 代币社区 按 symbol 搜索代币社区 搜索结果 没有找到这个 symbol 的社区。 父币 未接入 子币 未接入 切换社区不会切换网络，也不会刷新页面。"} | 通过 | /tmp/qa-global-community-search-unknown-390.png |
| C6 | 搜索当前社区并点击：标「当前」，只关闭菜单，不重复切换、不改 URL | 结果带「当前」徽标；点击后菜单关闭且 URL 不变 | {"currentBadge":"TestLOVE20 当前 精确匹配","url":"http://127.0.0.1:5188/?symbol=TestLOVE20","dialogGone":true} | 通过 |  |
| C8 | 慢 RPC：搜索结果加载中有明确「正在查找…」反馈，而不是空白 | 出现「正在查找…」与「搜索结果」 | 代币社区 代币社区 按 symbol 搜索代币社区 搜索结果 正在查找… 父币 未接入 子币 未接入 切换社区不会切换网络，也不会刷新页面。 | 通过 | /tmp/qa-global-community-search-loading-390.png |
| C10 | 钱包菜单身份行（已选身份）：名称 + NFT 编号 + 查看NFT 链接；余额两行 | 身份 NFT 行显示 Testdev-member-0 / NFT #1 / 查看NFT；含 TestLOVE20 余额与 ETH 余额行 | 钱包与身份 NFT 钱包与身份 NFT 钱包地址 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 已复制 身份 NFT Testdev-member-0 NFT #1 查看NFT TestLOVE20 余额 99,799,100 ETH 余额 9,892.052… | 通过 |  |
| C11 | 慢 RPC：身份行读不到时显示「读取中/读不到」，不把本地缓存的 Testdev-member-0 当事实 | 身份行不出现 Testdev-member-0；显示 读取身份 NFT 中…（或 身份 NFT 暂时读不到） | 钱包与身份 NFT 钱包与身份 NFT 钱包地址 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 身份 NFT 读取中… TestLOVE20 余额 ETH 余额 ETH 用于支付网络手续费 断开连接 当前身份 NFT 保存在这台设备；换浏览器需要重新选择。 | 通过 | /tmp/qa-global-wallet-menu-identity-loading-390.png |
| C13 | 无身份 NFT 钱包：身份行显示「未关联 NFT / 去铸造」并链接 /mint | 身份行 未关联 NFT + 去铸造；链接 /mint（保留 symbol） | {"outsiderDialog":"钱包与身份 NFT 钱包与身份 NFT 钱包地址 0x8b3a350cf5c34c9194CA85829A2df0Ec3153be5d 身份 NFT 未关联 NFT 去铸造 TestLOVE20 余额 0 ETH 余额 0 ETH 用于支付网络手续费 断开连接 … | 通过 | /tmp/qa-global-wallet-menu-outsider-390.png |
| C14 | 持有身份 NFT 但未选择：身份行「未选择身份 NFT / 去选择」链接 /my-nft | 身份行 未选择身份 NFT + 去选择；链接 /my-nft | {"holderDialog":"钱包与身份 NFT 钱包与身份 NFT 钱包地址 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 身份 NFT 未选择身份 NFT 去选择 TestLOVE20 余额 99,999,099.99991 ETH 余额 9,999.… | 通过 | /tmp/qa-global-wallet-menu-needs-selection-390.png |

### 首页（8 条）

| ID | 场景 | 期望 | 实际 | 级别 | 证据 |
| --- | --- | --- | --- | --- | --- |
| H1 | 未连接：问候 + 「先连接钱包」提醒卡 + 连接按钮，无其它提醒/无底部链接 | h1=你好；含 先连接钱包/一个钱包可以拥有多个身份 NFT；无提醒卡；main 内无链接；填充按钮只有「连接钱包」1 个 | {"greeting":"你好","body":"先连接钱包 一个钱包可以拥有多个身份 NFT，身份 NFT 才是参与凭证。 连接钱包 你好","mainLinks":0,"solidButtons":1} | 通过 | /tmp/qa-global-home-disconnected-390.png  |
| H2 | 无身份 NFT：提醒卡「你还没有身份 NFT」+ 唯一实心按钮「铸造身份 NFT」→ /mint | 卡片可见；链接 href=/mint?symbol=TestLOVE20；main 内实心按钮 =1；无空投提醒 | {"cardText":"你还没有身份 NFT 铸造身份 NFT","href":"/mint?symbol=TestLOVE20","airdropCard":0,"greeting":"你好"} | 通过 | /tmp/qa-global-home-no-identity-390.png |
| H3 | 持有身份 NFT 但未选：提醒卡「你还没有选择身份 NFT」+「选择身份 NFT」→ /my-nft | 卡片可见；链接 href=/my-nft?symbol=TestLOVE20；问候仍为「你好」；无「你还没有身份 NFT」卡 | {"cardText":"你还没有选择身份 NFT 选择身份 NFT","href":"/my-nft?symbol=TestLOVE20","greeting":"你好","noIdentityCard":0} | 通过 | /tmp/qa-global-home-needs-selection-390.png |
| H4 | 空投资格：提醒卡「你有空投资格，可铸造 X TestLOVE20」+「空投铸造」→ /airdrop | 卡片可见；文案含 你有空投资格 与公司格式金额；链接 href=/airdrop?symbol=TestLOVE20 | {"text":"你有空投资格，可铸造 100,000,000 TestLOVE20 空投铸造","href":"/airdrop?symbol=TestLOVE20"} | 通过 | /tmp/qa-global-home-airdrop-eligible-390.png |
| H5 | 已连接已选身份且无事可做：只有问候（你好，Testdev-member-0），无提醒、无底部链接、无实心按钮 | h1=你好，Testdev-member-0；提醒卡 0；main 内链接 0；实心按钮 0 | {"greeting":"你好，Testdev-member-0","reminders":0,"mainLinks":0,"body":"你好，Testdev-member-0"} | 通过 | /tmp/qa-global-home-nothing-to-do-390.png |
| H6 | 慢 RPC/身份读取中：首页给「读取身份 NFT 中…」加载卡，而不是裸问候 | 出现 读取身份 NFT 中… 卡（骨架屏），问候为「你好」且不显示缓存名 | {"loadingVisible":true,"body":"你好 读取身份 NFT 中…"} | 通过 | /tmp/qa-global-home-identity-loading-390.png |
| H7 | RPC 不可用：身份错误卡 + 重试恢复（错误时不泄露缓存身份名） | 错误卡「身份 NFT 暂时读不到」+ 重试；问候为「你好」；恢复后问候含 Testdev-member-0 | {"greetingOnError":"你好","greetingAfter":"你好，Testdev-member-0"} | 通过 | /tmp/qa-global-home-identity-error-390.png |
| W4 | 空投资格 + 无身份同时成立时，提醒卡按优先级只给一条主行动（无重复实心按钮） | 同时出现「你还没有身份 NFT」与「你有空投资格」两张卡时，只有一张卡片使用实心主按钮 | {"cards":["home-reminder-identity","home-reminder-airdrop"]} | 通过 | /tmp/qa-global-home-eligible-no-identity-390.png |

### 我的（6 条）

| ID | 场景 | 期望 | 实际 | 级别 | 证据 |
| --- | --- | --- | --- | --- | --- |
| M1 | 我的页三块：我的余额 / 账户 / 关于；身份 NFT 卡片已移除；无空块 | 3 个 section（我的余额、账户、关于）；不出现「当前身份 NFT/我的身份 NFT」区块；每块都有内容 | [{"title":"我的余额","text":"我的余额 99,799,100 TestLOVE20 兑换"},{"title":"账户","text":"账户 钱包地址 0xf39F…2266 网络 Anvil Local · chain 31337"},{"title":"关于","text"… | 通过 | /tmp/qa-global-me-connected-390.png |
| M2 | 我的页内容：余额显示代币数量+兑换链接，账户显示钱包地址/网络，关于显示版本/开源文档 | 余额 99,799,100 TestLOVE20 + 兑换；钱包地址 0xf39F…2266；网络 Anvil Local · chain 31337；版本 + 开源文档 | 我的余额 99,799,100 TestLOVE20 兑换 账户 钱包地址 0xf39F…2266 网络 Anvil Local · chain 31337 关于 版本 e2e-c6be3a9b · 本地开发 开源文档 开源文档 | 通过 |  |
| M4 | 我的页没有实心主按钮（不消耗唯一填充按钮规则） | main 内实心按钮 0 | 0 | 通过 |  |
| M5 | 未连接访问「我的」：账户块显示未连接，余额块不空白、页面不崩 | 含 未连接；余额 显示「—」或说明；网络行仍显示；无 console error | 我的余额 — 兑换 账户 钱包地址 未连接 网络 Anvil Local · chain 31337 关于 版本 e2e-c6be3a9b · 本地开发 开源文档 开源文档 | 通过 | /tmp/qa-global-me-disconnected-390.png |
| M6 | 我的页跟随 ?symbol= 切换社区（余额标签与页标题） | 标题「我的 · TestCMTOK1」；余额以 TestCMTOK1 计 | {"title":"我的 · TestCMTOK1","text":"我的余额 1,000,000,000 TestCMTOK1 兑换 账户 钱包地址 0xf39F…2266 网络 Anvil Local · chain 31337 关于 版本 e2e-c6be3a9b · 本地开发 开源文档 开源… | 通过 | /tmp/qa-global-me-child-community-390.png |
| M7 | 「关于」块里 label 与链接文案重复：开源文档 / 开源文档 | label 与动作文案不重复（如 label 开源文档 + 链接「打开」） | 渲染为「开源文档    开源文档」 | **缺陷 P3** | /tmp/qa-global-dark-me-390.png /tmp/qa-global-light-me-390.png |

### 应用目录（7 条）

| ID | 场景 | 期望 | 实际 | 级别 | 证据 |
| --- | --- | --- | --- | --- | --- |
| A1 | 9 个条目齐全：目录顺序在分类内保持（代币组 6 条 → 身份 NFT → 资料 → 设置），分组渲染而非单一平铺列表 | ["airdrop","swap","transfer","liquidity","batchTransfer","approvals","myNft","about","them… | ["airdrop","swap","transfer","liquidity","batchTransfer","approvals","myNft","about","theme"] | 通过 | /tmp/qa-global-apps-catalog-390.png |
| A2 | 每条目名称与描述齐全，且保留 ?symbol= 查询 | 9 行均含中文 label+description；每个链接 href 以 ?symbol=TestLOVE20 结尾 | [{"id":"airdrop","tag":"A","text":"创世空投 按快照份额铸造创世代币","href":"/airdrop?symbol=TestLOVE20","icons":2},{"id":"swap","tag":"A","text":"代币兑换 在任意代币之间互换","hr… | 通过 |  |
| A3 | 四个分类分组按顺序显示：代币 / 身份 NFT / 资料 / 设置 | ["代币","身份 NFT","资料","设置"] | ["代币","身份 NFT","资料","设置"] | 通过 |  |
| A4 | 每条目都有图标（每行至少有 1 个 svg，禁用行也保留图标） | 每行 svg 数 ≥ 2（分类图标 + 箭头） | [2,2,2,2,2,2,2,2,2] | 通过 |  |
| A5 | 禁用态：本构建地址簿 24 个 slot 全部已配置，运行时无禁用行（禁用分支由 domain 单测覆盖） | main 内 aria-disabled 行 = 0（无「未配置」原因行）；禁用逻辑见 src/domain/apps-catalog.test.ts | {"disabledRows":0,"note":"地址簿无零地址 slot，无法在运行时构造禁用态"} | 通过 |  |
| A6 | 应用目录页没有填充主按钮（纯导航页） | main 内 button 数 = 0 | 0 | 通过 |  |
| A7 | 条目跳转保留 ?symbol=，页头标题正确，返回回到 /apps | /theme?symbol=TestLOVE20 且页头「主题」；返回 /apps | {"themeTitle":"主题","url":"http://127.0.0.1:5188/apps?symbol=TestLOVE20"} | 通过 |  |

### 关于（7 条）

| ID | 场景 | 期望 | 实际 | 级别 | 证据 |
| --- | --- | --- | --- | --- | --- |
| B1 | 关于页两个 tab（合约地址/数据），默认选中合约地址 | tabs = [合约地址, 数据]；合约地址 aria-selected=true；面板可见 | {"tabs":["合约地址","数据"],"contractsSelected":"true"} | 通过 | /tmp/qa-global-about-contracts-390.png |
| B2 | 点击「数据」tab 切换，链上数值可读（身份 NFT 总量/代币总量/当前阶段/空投池） | data aria-selected=true；数值均为数字格式（含千分位），不是 — | {"dataSelected":"true","supply":"5","communitySupply":"999,995,499 TestLOVE20","phase":"13","pool":"500,000,000 TestLOVE20"} | 通过 | /tmp/qa-global-about-data-390.png |
| B3 | 关于页 tab 键盘：Home/End/←→ 切换并移动焦点 | Home→合约地址选中+焦点在它；End→数据；←→ 前后移动 | {"afterHome":{"selected":"true","focused":"合约地址"},"afterEnd":{"selected":"true","focused":"数据"},"afterArrow":{"selected":"true","focused":"合约地址"}} | 通过 |  |
| B4 | 合约地址列表：完整地址展示 + 点击复制 + anvil 无 explorer 时不显示 explorer 链接 | memberNFT 行含完整地址 0x610178dA211FEF7D417bC0e6FeD39F05609AD788；复制后剪贴板一致且显示 已复制；explorer 链接 0；… | {"memberNftRow":"身份 NFT 0x610178dA211FEF7D417bC0e6FeD39F05609AD788","clipboard":"0x610178dA211FEF7D417bC0e6FeD39F05609AD788","explorerLinks":0,"notCon… | 通过 | /tmp/qa-global-about-address-copied-390.png |
| B5 | 开源文档链接指向部署配置的 docsUrl，新标签页打开 | href=https://love20bsc.github.io/docs/, target=_blank, rel 含 noreferrer | {"href":"https://love20bsc.github.io/docs/","target":"_blank","rel":"noreferrer"} | 通过 |  |
| B6 | 关于页刷新：回到默认「合约地址」tab（tab 不入 URL，属本地状态） | 刷新后合约地址 tab 选中（不是「数据」） | {"tabAfterRefresh":"true"} | 通过 |  |
| B7 | 390 宽：完整合约地址 break-all 换行后只剩 1–2 个字符独占一行 | 地址与复制图标分区，换行不产生孤字行 | 如 0x8A79…dC31 下一行只剩「8」；0x9A67…7508 下一行只剩「8」 | **缺陷 P3** | /tmp/qa-global-dark-about-390.png /tmp/qa-global-light-about-390.png |

### 深链/刷新/404 与移动-桌面骨架（9 条）

| ID | 场景 | 期望 | 实际 | 级别 | 证据 |
| --- | --- | --- | --- | --- | --- |
| D1 | 深链接直接打开 /my-nft?symbol=：标题正确、有返回按钮、无历史时返回回首页 | title「我的 NFT · TestLOVE20」；有「返回上一页」；冷启动点击返回落到 /?symbol= | {"title":"我的 NFT · TestLOVE20","urlAfterBack":"http://127.0.0.1:5188/?symbol=TestLOVE20"} | 通过 | /tmp/qa-global-deeplink-my-nft-390.png |
| D2 | /apps?symbol= 刷新：URL/标题/列表全保留 | URL 仍带 ?symbol=TestLOVE20；title「应用 · TestLOVE20」；9 行目录仍在 | {"url":"http://127.0.0.1:5188/apps?symbol=TestLOVE20","title":"应用 · TestLOVE20","rows":9} | 通过 |  |
| D3 | /theme?symbol= 刷新：深色偏好与 ?symbol 同时保留 | data-theme=dark；URL 带 symbol；title「主题 · TestLOVE20」 | {"theme":"dark","url":"http://127.0.0.1:5188/theme?symbol=TestLOVE20","title":"主题 · TestLOVE20"} | 通过 |  |
| D4 | 未知路径（含 ?symbol=）：404 空态 + 回首页按钮 + 页头有标题，不白屏 | 显示 页面不存在 / 可能是链接过期或拼错了 / 回首页；页头标题非空（协议名兜底） | {"headerTitle":"LOVE20协议","actionHref":"/"} | 通过 | /tmp/qa-global-not-found-390.png |
| D4b | 404 页「回首页」真的回到首页且保留 symbol | URL 为 /?symbol=TestLOVE20，首页问候出现 | http://127.0.0.1:5188/?symbol=TestLOVE20 | 通过 |  |
| D5 | 不存在的社区 symbol：标题回退协议名，页面不崩，URL 不被改写 | title「LOVE20协议」；URL 保留 ?symbol=NOT_A_REAL_COMMUNITY；首页问候存在 | {"title":"LOVE20协议","url":"http://127.0.0.1:5188/?symbol=NOT_A_REAL_COMMUNITY","greeting":"你好"} | 通过 | /tmp/qa-global-unknown-community-390.png |
| D6 | 裸 / 自动补 ?symbol=（replace，不产生额外历史记录） | URL 变为 /?symbol=TestLOVE20；回退不会停留在“补参数”那一刻（history 被 replace） | {"afterSeed":"http://127.0.0.1:5188/?symbol=TestLOVE20","urlAfterBack":"about:blank"} | 通过 |  |
| D9 | 移动端 390：底部 5 个 tab、当前 tab 高亮、无横向溢出 | 5 个 tab（首页/治理/行动/应用/我的）；应用 aria-current=page；scrollWidth ≈ innerWidth | {"tabs":5,"labels":["首页","治理（即将上线）","行动（即将上线）","应用","我的"],"active":[null,null,null,"page",null],"horizontalOverflow":false,"docWidth":390,"innerWidth"… | 通过 | /tmp/qa-global-mobile-apps-tabbar-390.png |
| D10 | 桌面：侧栏可折叠/展开（折叠后仅图标、aria-label 与 title 提示） | aside 可见；底部 tab bar 在桌面隐藏；折叠后宽度 64px 且文字隐藏；出现「展开侧栏」 | {"asideVisible":true,"bottomNavHidden":true,"collapsed":{"width":64,"labelsVisible":false},"expandBtn":true} | 通过 | /tmp/qa-global-desktop-sidebar-collapsed-1280.png |

### 全局动作、回执与文案（7 条）

| ID | 场景 | 期望 | 实际 | 级别 | 证据 |
| --- | --- | --- | --- | --- | --- |
| S1 | 兑换页：按钮在内容流里（不吸底），授权步骤在兑换按钮之前 | main 内无 position:fixed/sticky 动作元素；约 授权按钮 y < 兑换按钮 y；滚动后按钮随内容移动 | {"fixedInMain":[],"approveRect":{"top":478,"bottom":585,"height":107,"position":"static","text":"授权 TestLOVE20第一次只是允许合约扣走","docTop":478},"submitRect":… | 通过 | /tmp/qa-global-swap-actions-flow-390.png |
| S2 | 铸造页：先「授权」后「铸造」两个按钮都在内容流内 | mint-approve 在 mint-submit 之前（docTop 更小）；无 fixed/sticky | {"approveRect":{"top":451,"bottom":499,"height":48,"position":"static","text":"已授权","docTop":451},"submitRect":{"top":555,"bottom":603,"height":48,"po… | 通过 | /tmp/qa-global-mint-actions-flow-390.png |
| S3 | 流动性页：授权按钮在确认按钮之前，且都不吸底 | liquidity-add-approve docTop < liquidity-add-submit docTop；position static | {"approveRect":{"top":662,"bottom":710,"height":48,"position":"static","text":"已授权 TestLOVE20","docTop":662},"submitRect":{"top":746,"bottom":794,"hei… | 通过 | /tmp/qa-global-liquidity-actions-flow-390.png |
| S4 | 转账页：提交按钮在内容流内、可点击（无吸底） | transfer-submit enabled 且 position static；main 内无 fixed/sticky | {"submitEnabled":true,"submitRect":{"top":486,"bottom":534,"height":48,"position":"static","text":"确认转账","docTop":486},"fixedInMain":[]} | 通过 | /tmp/qa-global-transfer-form-390.png |
| S5 | 转账回执（移动端 sheet）：只有一个主按钮「知道了」，不出现「留在本页/回首页」 | 回执含「转账已发送」+ 收款地址 + 交易哈希；实心按钮 1 个且文案「知道了」；无「留在本页」 | {"receiptText":"转账完成 转账完成 已转出 1 ETH 收款人 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 交易哈希 0xd3fb4bed567d122fa2e2c54fb931e63cfe45cdf30079e860b490dc5e7cd1… | 通过 | /tmp/qa-global-transfer-receipt-390.png |
| S6 | 点「知道了」：回执关闭、留在转账页并折叠为成功条（不跳页） | 回执消失；出现 transfer-success-strip；URL 仍在 /transfer | {"dialogCount":0,"strip":true,"url":"http://127.0.0.1:5188/transfer?symbol=TestLOVE20"} | 通过 | /tmp/qa-global-transfer-receipt-dismissed-390.png |
| S6b | 离开转账页再从应用目录回来：回执不重新弹出 | 无回执 dialog；显示干净转账表单（无成功条） | {"dialogCount":0,"strip":0} | 通过 | /tmp/qa-global-transfer-return-no-receipt-390.png |

## 6. 附注与限制

- **dev server 首帧白底是环境现象，不是产品缺陷**：`index.html` 没有 `<link rel=stylesheet>`，Vite dev 用 JS 注入 CSS，所以 dev 下深色刷新首帧 `html/body` 背景仍是透明（`rgba(0,0,0,0)`）。生产构建 `dist/index.html` 的 CSS 是 head 中阻塞渲染的 `<link>`，且 inline theme bootstrap 早于它执行（实测 `data-theme=dark` 在首个 rAF 前 4–7ms 写入），因此生产路径不会闪白。报告中 T3 按「bootstrap 早于首次绘制」判定通过，并已单列此环境注记。
- **Playwright 侧噪声**：菜单在搜索词清空时会重挂载内容，`getByRole('dialog')` 在重渲染瞬间会短暂返回 0，改用 `[role="dialog"]` + `waitFor` 后稳定；这属于测试侧现象，不是 UI 缺陷。
- **未覆盖**：真实浏览器扩展钱包（只用注入 stub）、`accountsChanged` 切换账户、存在区块浏览器时关于页/回执的 explorer 链接、HTTPS + 本地 RPC 的拦截提示、生产构建的视觉走查（本轮按要求只用 dev server，未 build，以免和修复 agent 抢 `dist/`）。
- **未触碰**：8545 链未读写；`git add/commit` 未执行；产品代码与其它文档未修改。验证链与 dev server 已按纪律收尾（`make -C ../anvil stop PORT=8588`）。

## 7. 修复跟进（2026-11-14 · fix-global）

> 范围：本报告的 4 条记录（D-1 / D-2 / D-3 / G8）。未做「精度显示统一」（另派任务），未改其它模块业务逻辑；工作树未 `git add/commit`（Lead 统一提交）。
> 环境：`pnpm typecheck` 全仓红是并行 agent 的在途文件（approval-tokens.test / liquidity copy key / batch copy key），本轮自己的文件 eslint 绿、相关单测 12 文件 53 条绿；**e2e 因 owner 正在改合约库（`../core` 给 `IStake.stakeLiquidity` 加第 6 参，periphery/anvil 未同步，任何端口 bootstrap 都编译失败）而阻塞，按 Lead 裁决由 Lead 统一跑**，相关 e2e 断言已写入仓库待执行。

### 7.1 D-1 菜单关闭后焦点丢失到 `body` — 已修（P2）

- 根因：两个菜单都没有 Radix `Trigger`（触发按钮在 eager shell 里、弹层是懒加载的），Radix 关闭时没有可恢复的触发器，`FocusScope` 卸载只把焦点交回 `body`；`connect-pill.tsx` 原来的 `activeTrigger?.focus()` 在弹层仍挂载时执行，会被焦点陷阱驳回。
- 改动（`src/widgets/connect-pill/menu-layer.tsx`、`src/shared/ui/sheet.tsx`、`src/widgets/connect-pill/connect-pill.tsx`）：`MenuLayer` 为 Sheet 与 PopoverContent 都传 `onCloseAutoFocus`，里面 `event.preventDefault()` + `anchor.focus()`；`Sheet` 新增可选 `onCloseAutoFocus` 透传；`ConnectPill.closeMenu()` 只做 `setOpenMenu(null)`。
- 证据：
  - 单测 `src/widgets/connect-pill/menu-layer.test.tsx`（3 条：移动端 sheet 的 Esc / ✕ + 桌面 popover 的 Esc）：去掉修复时 3 条全红（`document.activeElement` 是 `BODY`），加上后 3 条全绿。
  - e2e 断言（待 Lead 统一跑）：`e2e/community-switch.spec.ts`「菜单关闭后的焦点回归」——社区菜单 Esc / ✕、钱包菜单 Esc / ✕、桌面 popover Esc，断言 `document.activeElement` 的 `aria-label` 等于触发按钮。

### 7.2 D-2 关于页 390 宽地址孤字行 — 已修（P3）

- 根因：`display="full"` 用 `break-all` 贪婪断行，复制图标（12px + gap 4px）挤压行宽，390 宽下每行约 41 字符，末行只剩 1 个字符。
- 改动（`src/shared/ui/copyable-address.tsx`）：`0x` 之后每 4 个十六进制字符一个 `<wbr>` 软换行点 + `text-wrap: balance`，`overflow-wrap: anywhere` 兜底；文本内容、`title`、剪贴板字符串逐字不变（`<wbr>` 不产生字符）。
- 证据（dev server 390×844 实测，`about-address-memberNFT`）：
  - 软换行点 10 个；两行宽度 **145.8 / 132.5 px**（每行 ≥ 4 个字符组，不再有单字符末行）；`document.documentElement.scrollWidth === innerWidth === 390`（无横向溢出）。
  - 截图：[about-addresses-390-light.png](../screenshots/about-addresses-390-light.png)、[about-addresses-390-dark.png](../screenshots/about-addresses-390-dark.png)（浅色/深色两套都成立）。
  - 单测 `src/shared/ui/copyable-address.test.tsx` 新增 `wbr` 数量与文本一致性断言。
  - e2e 断言（待 Lead 统一跑）：`e2e/about.spec.ts` 断言 `wbr` = 10、行数 ≤ 2、每行宽度 > 20px（覆盖「不再有孤字行」）。

### 7.3 D-3 我的页「关于」块文案重复 — 已修（P3）

- 根因：`Row` 的标签取 `copy.me.docs`（开源文档），链接文案取 `copy.home.docs`（同为开源文档）。
- 改动（`src/shared/config/copy-pages.ts`、`src/pages/me/me-page.tsx`）：新增 `me.docsAction: '前往文档'`，链接文案与标签不再重复。
- 证据：dev server `/me?symbol=TestLOVE20`「关于」块文本为「版本 … 开源文档 前往文档」，块内**没有**文案为「开源文档」的链接；截图 [me-about-docs-row-390-light.png](../screenshots/me-about-docs-row-390-light.png)、[me-about-docs-row-390-dark.png](../screenshots/me-about-docs-row-390-dark.png)。单测 `src/pages/me/me-page.test.tsx` 断言标签「开源文档」+ 链接「前往文档」+ 无同名链接；e2e 断言写入 `e2e/home-reminders.spec.ts`（待 Lead 统一跑）。

### 7.4 G8 冷启动字标先协议名后社区名 — 已收窄（不改语义）

- 根因：`useCommunityDisplay` 在 `symbol()` 读回前用协议标签兜底，字标首帧渲染「LOVE20协议」再换社区名。
- 改动（`src/entities/community-token/model/use-community-display.ts`、`src/app/shell/app-header.tsx`、`src/app/shell/desktop-sidebar.tsx`）：`CommunityDisplay` 新增 `pending`（`status === 'loading'` 或 metadata 读取中）；移动端页头字标与桌面侧栏字标在 `pending` 时不渲染，解析完成后再出现。**协议名的兜底语义不变**：未知 / 未配置等已定论状态照旧显示「LOVE20协议」，`document.title`、药丸 chip 的兜底也保持不变。
- 证据：单测 `use-community-display.test.ts`（cold-start pending / 未知社区 not pending）、`app-header.test.tsx`、`desktop-sidebar.test.tsx`（pending 时不渲染字标、不出现协议名）。
- e2e 断言（待 Lead 统一跑）：`e2e/community-switch.spec.ts` 用 `MutationObserver` 记录字标出现过的文本，断言冷启动只出现过一次 `TestLOVE20`、从未出现「LOVE20协议」。

### 7.5 门禁与遗留

| 门禁 | 结果 |
|---|---|
| eslint（本轮自己的文件，含 e2e spec） | 绿（`--max-warnings=0` 无输出） |
| 单测（受影响范围：connect-pill / app-shell / community-token / document-title / me / copyable-address） | **12 文件 53 条全绿** |
| `pnpm typecheck` 全仓 | **红**，报错全在并行 agent 的在途文件（`approval-tokens.test.ts`、`liquidity-pool` 与 `batch-transfer` 的 copy key），非本任务改动 |
| `pnpm build` / e2e | **阻塞**：owner 改 `../core` 后 periphery/anvil 未同步，bootstrap 编译失败；按 Lead 裁决由 Lead 在合约侧稳定后统一跑 |
| 截图 | [about-addresses-390-light.png](../screenshots/about-addresses-390-light.png) / [about-addresses-390-dark.png](../screenshots/about-addresses-390-dark.png) / [me-about-docs-row-390-light.png](../screenshots/me-about-docs-row-390-light.png) / [me-about-docs-row-390-dark.png](../screenshots/me-about-docs-row-390-dark.png)（dev server 390×844，钱包未连接/RPC 不可用属环境现象，不影响地址换行与文案证据）；仓库既有 `about-contracts.png` / `about-data.png` / `me-profile.png` 待 Lead 统一 e2e 时重生成 |
