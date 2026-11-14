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
4. worklog `## Process

- 链路：`make -C ../anvil bootstrap PORT=8588`（独立链，未触碰 8545）→ `VITE_ENV=dev VITE_ANVIL_RPC=http://127.0.0.1:8588 pnpm dev --port 5188`（dev server，不 build、不产 dist）→ 8 个 `node` Playwright 脚本（`/tmp/qa-global/01..08-*.mjs`）跑 390×844 / 1280×800 × 浅/深两套。
- 账户与 fixture：`0xf39F…2266`（持 NFT #1，已铸造）、`0x9965…A4dc`（快照内未铸造=空投资格）、`0x8b3a…3Be5d`（无身份）、`0x7099…79C8`（持 NFT #2 未选身份）；子社区 `TestCMTOK1` 用 `cast` 在 8588 上 launch（`0xe082b26c…`），用于精确/前缀/最近访问切换。
- 覆盖：顶部字标（未连接显示/连接后隐藏）、连接按钮（含「检测钱包中…」「连接中…」中间态、双击、慢钱包 2s）、错误网络（连接后变「网络不对，点此切换」→ 切换成功）、社区菜单（精确/前缀/不存在/清空回最近访问/当前项 no-op/慢 RPC loading/父币子币 stub）、钱包菜单（身份行 ready/loading/empty/needs-selection、地址复制、断开连接、桌面 popover vs 移动 sheet、Esc 焦点）、主题（浅/深即时、bootstrap 早于首绘、meta theme-color、系统深色不跟随、键盘方向键、刷新保留、切社区不回退）、对比度（token 级 13 对 + 5 页 × 2 主题真实文本扫描，最差 4.77 深色 / 4.43 浅色小字，无 <3.0 硬失败）、我的（三块、无身份 NFT 卡、地址复制、未连接、跟随 symbol）、首页四态（未连接/无身份/未选身份/空投资格）+ 已连接问候、慢 RPC loading 卡、RPC 失败错误卡 + 重试、应用目录 9 条与 4 分类分组/图标/无填充按钮/禁用态不可复现、关于（两 tab/键盘 Home End ←→/地址复制/无 explorer/数据 tab 数值/刷新回默认 tab）、深链接（/my-nft 冷启动、/apps /theme 刷新、未知路径 404 + 回首页、未知 symbol 兜底协议名、裸 `/` 补 symbol）、键盘（Tab ring、底部导航 Enter、菜单 Esc 焦点）、按钮不吸底（swap/mint/liquidity/transfer 均 `position: static` 且授权在主体之前）、回执（一笔真实转账 `0xd3fb4bed…`：唯一「知道了」、收起成成功条、离开再从应用目录回来不重弹、地址复制）、转账/转让无「不能撤回」文案、移动/桌面骨架（底部 5 tab、桌面侧栏折叠、无横向溢出）。
- 工具坑：菜单搜索清空时内容重挂载，`getByRole('dialog')` 会短暂为 0，改用 `[role="dialog"]` + waitFor；dev server 的 CSS 由 JS 注入，深色刷新首帧 `html/body` 背景透明是 Vite dev 特性（生产 dist 的 CSS 在 head 阻塞渲染 + inline bootstrap 早于首绘，已核实不闪）。
- 产物：`docs/product/reviews/global.md`（矩阵 104 条 + 缺陷复现步骤）；截图 `/tmp/qa-global-*.png`；脚本 `/tmp/qa-global/*.mjs`（不入仓）。

## Conclusion

- 场景 104 条（自动 101 + 人工截图复核 3）：通过 99、已验证缺陷 4 条记录 / 3 个根因（P2 ×2 同根因、P3 ×2）、怀疑未复现 1 条；级别分布 P0 0 / P1 0 / P2 2 / P3 3。
- 最严重 3 条：① [P2] 社区菜单与钱包菜单关闭后焦点丢到 `body`（Esc 与 ✕ 都复现，`connect-pill.tsx` 的 `activeTrigger.focus()` 被 Radix 关闭聚焦覆盖）；② [P3 怀疑] 冷启动无 `?symbol=` 时字标先「LOVE20协议」约 100–200ms 再变 `TestLOVE20`；③ [P3] 关于页 390 宽完整地址换行出现孤字行。
- 其余 1 条 P3：我的页「关于」块 label 与链接文案同为「开源文档」。
- 未复现：应用目录禁用态与关于页「未配置」行（本构建地址簿 24 slot 全配置，只能靠 `apps-catalog` 单测覆盖）、回执右上角 ✕（与「知道了」同义，设计确认项）、关于页 tab 不入 URL（设计选择）。
- 收尾：未改产品代码、未 git add/commit；验证链与 dev server 已停止。

## Execution Log

<!-- Maintained by the script: appended by new / claim / set / release / log / close. Do not edit.
     Backfill with: progress log --id 20261114-1054-d20f-qa-review-全局交互-主题-我的-首页-逐场景复现并出缺陷清单 --note "...". -->
- 2026-11-14 10:54:54 · new · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d · created
- 2026-11-14 10:56:06 · claim · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d · claimed → doing
