# STATUS — LOVE20 界面交接状态

> 采集时点：2026-11-11 20:05（Asia/Taipei）· 本仓 HEAD 以 `git rev-parse HEAD` 为准（本轮提交见 `git log -1`）· anvil 导出源 HEAD 见 `src/config/abis/manifest.json` · 本地链高度随时间增长，以 `cast block-number` 为准。每条事实都能由仓库、`cast` 或文中链接复核；无法确认处标「待核实」。

## 1. 一句话定位

LOVE20BSC 协议的纯静态、移动优先前端：无后端、无索引器、无第三方 API 调用，钱包只支持注入式。本 checkout（目录 `interface-dev-dsh`，`origin` = `LOVE20BSC/interface-dev`）是**三变体中的 dev**（链 31337 / 本地 anvil），当前处于 **M0 收尾**（身份漏斗 + 空投 + 通用兑换）：功能与验收、包体已闭环，发布尚未闭环；M1 未开始——但 **2026-11-17 按 owner 要求提前实装治理页的「质押」部分**（流动性质押 / 加速质押 / 我的质押与解锁），投票、推举与激励铸造仍属 M1、未开工。三变体定义见 [ADR-0002](adr/0002-three-environment-injection.md) §4。

## 2. 当前状态

M0 范围共 6 项（[m0-scope](product/m0-scope.md)「范围内」）。✅ 完成 / 🔄 部分 / ⏳ 未做。

| # | M0 项 | 状态 | 证据（可复核） |
| --- | --- | --- | --- |
| 1 | 导航骨架 | ✅ | `src/app/navigation` + 5 个一级 tab（`/apps` 为功能页目录）；占位页 `src/pages/{act,group}`（`/gov` 自 2026-11-17 是真实页；`/me` 早已实装）；`7e9b03b` |
| 2 | 右上角连接按钮 | ✅ | [ADR-0003](adr/0003-identity-and-connect-button.md) §1；`src/widgets/connect-pill`；`6db99a4`（品牌字标/余额格式） |
| 3 | 新用户漏斗 | 🔄 | 首页/我的 NFT `ae607dd`；铸造身份 `484af93`+`49f63ce`；空投 `1a7074f`；通用兑换 `b3a2a7d`；**未做真机验收；e2e 已跑在独立 8555 自动化链（§6.1）** |
| 4 | 工程底座 | 🔄 | 分层+架构测试 `7e9b03b`；CI `7f9794a`；路由拆分 `7dc0949`；`.github/workflows/deploy.yml`；ABI manifest + `pnpm abis:check` 漂移门禁已补（ADR-0002 §3）；**缺口：HEAD 未推送，CI 未验证** |
| 5 | 一条命令起全栈 | ✅ | [ADR-0004](adr/0004-anvil-local-chain.md)；clean bootstrap 两次导出同 sha256；本次 `cast chain-id`=31337，`merkleRoot` 与快照一致；前端地址簿由 `pnpm sync:anvil` 生成 |
| 6 | 文案纪律落地 | ✅ | 所有中文进 `src/shared/config/copy.ts`（首屏）与 `src/shared/config/copy-pages.ts`（懒加载页/弹层，生成的错误文案除外），`src/architecture.test.ts` 强制；`7dc0949`；对照 [GLOSSARY](../GLOSSARY.md) |
| — | M0 验收报告 | ✅ | [m0-acceptance](product/m0-acceptance.md)（14 步 + 证据；§3 的 O1–O4 已修复复核，见 §3.1） |
| — | E2E 160 条 | ✅ | `e2e/*.spec.ts` 合计 160 条（历史：152 → 158 → **160**；2026-11-17 晚治理域按 TKM 多页面 IA 重写后 `e2e/gov-stake-numbers.spec.ts` 为 **8 条**：**28 张截图** 1 条（2026-11-18 23:20 起新增 `me-stake-*` 4 张，原 24 张）+ 前端线 7 条）；跑在独立 **8555** 链，按文件 `anvil_snapshot`/`anvil_revert` 隔离。**2026-11-19 04:24 全量：160/160 全绿**（12.8m，EXIT 0，0 retry，命令 `E2E_REUSE_PREVIEW=0 E2E_RETRIES=1 pnpm e2e`；本轮覆盖默认深色 + 数字显示规范（小数位按数量级自适应）+ 治理页交互收口（查询输入即查询、取消质押页精简、流动性质押页顺序、我的 tab 解锁态、社区「本阶段」删除），167 张截图按深色默认重拍、总数 207 不变）；**单测 886 passed（3 skipped，122 文件）**；同日 02:46 全量 160/160（11.0m）为品牌主色统一 + 底导航换序 + 钱包弹层/地址短格式改版后的回归；治理 spec 8 条在全量内通过，另在 8555 与三线链 8566 各 8/8（1.8m / 1.7m，品牌改版前）；live 8555，core `3742f6c` / periphery `d8a105f` / action `b212c76` / group-chat `ed3231a`）；**23:20 版改动**：`/me` 两个标签 + 质押资产卡挪入、社区 tab 去「治理公示」外框与质押入口并移除「验证中的行动」入口、查询只按身份 NFT（ID / 名称）；合约线 `liquidity-contract.mjs` 45/45、`airdrop-contract.mjs` 8/8、`gov-stake-contract.mjs` 161/161 PASS；前端线 `airdrop-numbers.spec.ts` 8/8、`liquidity-numbers.spec.ts` 17/17、`gov-stake-numbers.spec.ts` 8/8。历史沿革：130/130（11-15 三轮 bump）→ 139/139（11-16 03:54）→ 143（资产保护）→ 149（空投三线 + 流动性查询任意地址）→ 150（身份卡片移动 + 铸造后列表读修复）→ 152（批量转账预余额刷新 + 基线）→ 158（治理·质押前端线）→ **160（治理域多页面 IA 复刻 + 智能模式）** |
| — | 2026-11-19 二轮收口（默认深色 / 数字规范 / 治理权口径） | ✅ | ① **默认深色**：`DEFAULT_THEME = 'dark'`，`index.html` 首屏即 `data-theme="dark"` / `theme-color="#0b0e11"` / `color-scheme="dark"`，用户切换仍记 `love20:theme` 且存储优先（[ADR-0005](adr/0005-color-tokens-and-theme.md) §2）；② **数字显示规范**：`formatTokenAmount` 小数位按数量级自适应（按显示值整数部分：<1 → 6 位 / 1–999 → 4 位 / 1e3–1e6 → 2 位 / ≥1e6 → 0 位；千分位 + 截断不四舍五入；未知「—」；会移动的金额用 `formatVisibleTokenAmount` 的 `< 最小可见单位`），实现 `shared/lib/format.ts#fractionDigitsForMagnitude`，规则见 [frontend-standards](engineering/frontend-standards.md) §4.5.1；③ **治理权 / 治理票口径**：治理权 = 流动性质押份额 × 承诺解锁期、只统计未申请解锁的仓位；「治理票」是协议层对「本轮能投出的票数」的计量叫法（由治理权决定），界面仍统一写「治理权」；社区总治理权 = `totalGovVotes`（旧规格写法 `totalValidGovVotes`，同口径）**不含**已申请解锁份额，「流动性质押份额总量」**含**待解锁部分（[GLOSSARY](../GLOSSARY.md) 易混对「治理权 vs 治理票」+ [m0-ux-spec](product/m0-ux-spec.md) §3.14）。页面交互改动（钱包弹层地址/身份行、治理首页「我的」解锁态、社区「本阶段」小字删除、查询输入即查询、流动性质押页顺序、取消质押页精简）见 m0-ux-spec §1.6 / §3.9 / §3.14；全量 e2e / 单测数据见上一行 E2E 行 |
| — | 首页身份读取状态 | ✅ | `loading` / `error` / `unconfigured` 不再只剩问候：骨架卡、错误卡 +「重试」、未部署说明；无身份与未选择卡不变；[m0-ux-spec](product/m0-ux-spec.md) §3.1 · `home-identity-error.png` / `home-no-identity.png` |
| — | 我的 NFT · 选择身份卡片移动（owner 2026-11-17） | ✅ | 「使用此身份 NFT」不再走整页淡出淡入，改为被点的卡片从当前位置 FLIP 移到列表首位（300 ms、`cubic-bezier(0.22, 1, 0.36, 1)`；`src/shared/lib/flip.ts`，无动画库、动画结束不留内联 transform；被点卡临时抬高 + brand 高亮）；忙碌态持续到「移动结束 + `ownerOf()` 确认」；桌面表格行不做 transform，退化为即时置顶 + 620 ms 底色脉冲；`prefers-reduced-motion: reduce` 直接落位；[m0-ux-spec](product/m0-ux-spec.md) §3.2 / §4.8.1；e2e `home-my-nft.spec.ts` 断言 `translateY(Δ)→0`、逐帧 top 轨迹、全程无整页淡出 |
| — | 我的 NFT · 铸造后列表误报读失败（owner 2026-11-17） | ✅ | 根因：`useMemberIdentity().refetch()` 无条件重读 `ownerOf`，而 TanStack `refetch()` 忽略 `enabled:false`，未选择身份时 `args` 为 undefined → viem `AbiEncodingLengthMismatchError` → `ownerRead.isError` → 列表渲染「身份 NFT 列表暂时读不到。」（铸造回跳与「重试」都会触发）；修法沿用仓库既有约定（`use-member-recipient.ts` 等 `if (enabled)`）只在 enabled 时 refetch，并让禁用态的 ownerOf 错误不影响 `status`；`use-member-identities.ts` 同步守卫 `balanceOf`/`tokenOfOwnerByIndex`/`memberName` 三个读；回归：`e2e/mint-identity.spec.ts` 铸造回跳后等 5 s 断言无错误卡，单测 `use-member-identity.test.tsx` + `use-member-identities.test.tsx` 7 例（修前 4 例红） |
| — | 首页空投提醒卡复核（2026-11-17） | ✅ | 卡片本来就显示「你有空投资格，可铸造 {X} {symbol}」（金额 / 首币 symbol 或 decimals 读不到时省略金额分句，绝不写「—」），实现在 `src/pages/home/airdrop-reminder.tsx`（懒加载 chunk，不阻塞问候）；同日复核发现旧组件 `src/features/claim-airdrop/ui/airdrop-eligibility-section.tsx` 是**无引用的死文件**（旧文案「你参与了销毁活动，获得空投铸造资格」，会让人误判规格没实现），已删除，并清掉只被它使用的 `copy.home.eligibilityTitle` / `eligibilityUnavailable` |
| — | 主题（浅色/深色） | ✅ | [ADR-0005](adr/0005-color-tokens-and-theme.md)；`/theme` 应用目录「设置」分类、`requires: null`；两套语义 token 在 `src/index.css`（深色币安配色 canvas `#0B0E11` / surface `#1E2329` / brand `#FCD535`）；`index.html` 首帧前应用 `love20:theme`；全仓清掉 49 处硬编码色类；配色三线 [three-line/theme.md](product/three-line/theme.md)；`e2e/theme-colors.spec.ts`；**2026-11-19 品牌主色统一为 `#fcd535`（浅色 `brand-strong` `#856500`）**；**2026-11-19 二轮：默认主题改为深色**（`DEFAULT_THEME = 'dark'`，`index.html` 首屏即 `data-theme="dark"` / `theme-color="#0b0e11"` / `color-scheme="dark"`；用户切换仍记 `love20:theme` 且存储优先于默认值）；`e2e/theme-colors.spec.ts` 的默认主题用例已改为断言默认深色（`data-theme=dark` / `theme-color=#0b0e11` / `color-scheme=dark`）；**2026-11-19 04:24 全量回归 160/160 覆盖默认深色，167 张截图按深色默认重拍、总数 207 不变** |
| — | 应用·代币转账 | ✅ | `/transfer` 应用目录「代币」分类、`requires: null`（普通转账不依赖协议合约）；代币 = 原生币 / Launch 社区代币分页+搜索 / WETH / LP（地址簿 `pair`）/ 自定义 ERC20（校验 bytecode + 读 symbol/decimals）；收款方 = 地址或按身份 NFT（复用转让页的 ownerOf/memberId 解析 + ID 确认）；智能资产保护开关（默认开启、三页共享偏好 `love20:transfer:assetProtectionEnabled`）开启时已知合约收款**拦截**、关闭后仍二次确认、任意合约只警告；金额行右侧代币选择、余额小字在金额下方（owner 2026-11-16）；ERC20 直接 `transfer`（界面无授权）、原生币普通转账；`tx-watch` 90s 有界 + 重新查询/重新提交；回执可关闭留在原页；`shared/ui/token-picker.tsx` 从兑换页提升并由两页共用；三线校验 [three-line/transfer.md](product/three-line/transfer.md)（理论 先于实现 → 合约线 `scripts/verify/transfer-contract.mjs` 26/26 → 前端线 `e2e/transfer-numbers.spec.ts`）；截图 12 张 `transfer-{form,protection,receipt}-{light,dark}-{mobile,desktop}.png` |
| — | 应用·代币授权 | ✅ | `/approvals` 应用目录「代币」分类、`requires: null`（ERC20 `allowance`/`approve` 任意代币可用）；代币 = Launch 社区代币分页+搜索 / WETH / LP（地址簿 `pair`）/ 自定义 ERC20；常用合约 spender 来自地址簿（router / stake / vote / submit / mint / launch / hub / lpExecutor / batchTransfer / groupChat），逐项三态：未授权 / 长期授权（≥ 2^255，写 `maxUint256`）/ 具体额度（按 decimals 截断，1 wei 显示 `< 0.000001`）；每行「长期授权」「撤销」走确认 sheet + `tx-watch` 90s 有界（已长期授权的行按钮转禁用的「已长期授权」）；自定义 spender 查询/授权/撤销 + 非法地址即时提示；版面按 owner 2026-11-14 整改：代币行 → ①默认使用长期授权 → ②授权说明 → ③自定义地址 → ④常用合约列表（列表全部展开、不折叠；每行缩略合约地址 + 点击复制完整地址 + 「已复制」反馈；极长额度行内截断、全文进 `title`；不再出现「推荐」二字）；默认长期授权偏好写 `love20:tokenApprovalUseUnlimitedByDefault`；风险说明用普通人话；三线校验 [three-line/approvals.md](product/three-line/approvals.md)（理论先于实现 → 合约线 `scripts/verify/approvals-contract.mjs` 26/26 → 前端线 `e2e/approvals-numbers.spec.ts` 6 passed）；截图 12 张 `approvals-{list,confirm,custom}-{light,dark}-{mobile,desktop}.png` |
| — | 应用·批量转账 | ✅ | `/batch-transfer` 应用目录「代币」分类、`requires: batchTransfer`（地址簿未部署时入口禁用 + 人话原因，页面同态）；原生 / 单一 ERC20 切换；文本域逐行「地址 金额」（空白或逗号分隔、粘贴），逐行定位错误、重复地址按行号标出「与第 N 行重复」并阻止提交（不再合并）、合计对比我的余额、超余额禁提交、单行非法禁提交；ERC20 先 `approve(BatchTransfer, 合计)`（额度足够不重复授权，确认后重读额度再允许提交）；提交前 `nativeBalances`/`erc20Balances` 展示预余额，`tx-watch` 确认后重读并逐行显示 `+X` / 未变化 / 异常；`gasLimit` 默认 30000（原生）/ 60000（ERC20）+ 高级选项与 21000–1000000、单块 3000 万上限；收款方是合约时警告、禁止转给合约自身；整批原子在录入/回执/错误三处都写明「有一笔失败全部不到账」；三线校验 [three-line/batch-transfer.md](product/three-line/batch-transfer.md)（理论先于实现 06:34 → 合约线 `scripts/verify/batch-transfer-contract.mjs` 56/56 → 前端线 `e2e/batch-transfer-numbers.spec.ts`）；预余额表标题行常驻「刷新」（owner 2026-11-17）：刷新中保留旧数字、禁止提交，刷新后的读数即提交时的转账前基线（回执逐行差额按它对比），读失败态也由这个按钮承担恢复；截图 12 张 `batch-transfer-{entry-errors,review,receipt}-{light,dark}-{mobile,desktop}.png` |
| — | 应用·流动性池 | ✅ | `/liquidity` 应用目录「代币」分类、`requires: router`（无 Router/Factory 时入口禁用 + 人话原因）；三块 = 添加 / 我的流动性 / 社区流动性（owner 2026-11-14 交互重做：添加与我的页签内去掉社区代币下拉，换代币用右上角社区切换）；添加区只有一个「智能模式」开关（默认开）：开 = 两侧都可填或只填一侧，Hub 自动配平，写入 `addLiquidityWithToken` / `addLiquidityWithNative`（需要时先授权给 Hub）；关 = 改一侧按池子比例自动填另一侧（只读联动，点另一侧可切换驱动侧），走 Router `addLiquidityETH`；Hub 缺失 / 空池自动降级并写明原因；输入后只留「预计获得 X 流动性凭证」，swap 段 / 实进池 / **至少获得的流动性凭证**（Hub 路径；Router 路径仍是最少进池两侧数量）收在默认折叠的「详情」，「已为网络手续费预留」只在点过「全部」原生币后出现；我的流动性读 pair `balanceOf`/`totalSupply` → 份额，**按 LP 数量**撤出（25/50/75/100% 只是快捷填充），只显示「预计收到约 X + Y」，LP 授权 + `removeLiquidityETH`；社区流动性按旧库 TKM 四块布局重做（owner 2026-11-16）：选择交易对（社区代币下拉 + TestWETH 只读 + LP 代币地址可复制）→ 交易对统计（LP 总量 / 两侧总量 / 价格 + 方向切换）→ 查询地址（默认当前钱包、三态按钮、重置、未连接提示、地址非法即时提示）→ 查询结果（**任意地址**的 LP 数量 / 份额 / 可兑换两币数量；`pair.balanceOf` + `totalSupply` + `getReserves` 纯 view，未连接钱包也能查）；无池写「未找到流动性池 / {社区代币}-TestWETH 交易对不存在」；滑点默认 0.5%（0.01–50 校验）+ deadline 20 分钟；`tx-watch` 90s 有界 + 回执可关闭留在原页；三线校验 [three-line/liquidity.md](product/three-line/liquidity.md)（理论线 06:36 先于实现 → 合约线 `scripts/verify/liquidity-contract.mjs` 45/45 → 前端线 `e2e/liquidity-numbers.spec.ts` 17 passed）；截图 20 张 `liquidity-{add,mine,withdraw,query,empty}-{light,dark}-{mobile,desktop}.png`；查询逐项对照见 [reviews/liquidity-query-parity.md](product/reviews/liquidity-query-parity.md) |
| — | 发布 interface-test | ✅ | 2026-11-17 发布了两次：`9ec3e57`（身份卡片移动 + 铸造后列表读修复 + 空投页两行卡片/「立即铸造」）、`a04ac84`（批量转账预余额刷新 + 基线）；两次 `interface-dev` 与 `interface-test` 的 Pages 部署 workflow 均绿、两站 200，远端 `main` = 本仓 HEAD（其后若只有台账/文档提交，不重复发布；站点 build id 见各自 `/build-id.json`）|
| — | 开发规范与 agent 入口（owner 2026-11-17 选 A 档：完整规范 + 轻量 pre-commit） | ✅ | 新增根 `AGENTS.md`（入口：必读顺序 / 十条硬规则 / 提交前命令 / 文档路由 / 收尾自查）+ `docs/engineering/frontend-standards.md`（11 章：分层 8 层与落层判断树、G1–G10 门禁总表与「门禁覆盖不到的地方」、文案纪律、数据与错误、组件与 UI、测试三张判据表、依赖与包体、提交与发布、10 条已知坑、未决项与变更记录）；`CLAUDE.md` / `.github/copilot-instructions.md` / `.cursor/rules/love20.mdc` 是**只写指针的 shim**，由 `src/architecture.test.ts` 新增的「agent entry points」强制（必须指向 `AGENTS.md`、shim ≤30 行、`AGENTS.md` ≤160 行），防规则多处漂移；新增 `pnpm check`（= typecheck + lint + 单测）与 pre-commit 钩子（`.githooks/pre-commit` + `scripts/install-hooks.mjs`，`core.hooksPath` 不入库、装一次即可；无新依赖；实测 49 s；纯文档提交自动跳过；`SKIP_PRE_COMMIT=1` 逃生）；README 补「开发规范」索引节，并把此前 README 0 引用的 `three-line-verification.md` / `e2e/README.md` / `copy-audit.md` / `m0-ux-spec.md` 做成真链接；`vitest.config.ts` 的 `testTimeout` 5 s → 15 s（钩子满载下 `tests/sync-network.test.ts` 起子进程会闪红）；单测 **801/801（116 文件，新增 2 条架构门禁）**、typecheck / lint / build 全绿，包体不变（prod 159.2 kB）；**2026-11-17 追加 D1（owner 选 A）**：`ledger/` 加入 `.prettierignore`，全仓一次性格式化（71 文件 / 522+ 556- 行，纯换行缩进，`ledger/` 未动），`format:check` 并入 `pnpm check` 与 CI `check` job → 格式从「写在配置里没人执行」变成真门禁，`pnpm format:check` 由 118 文件失败变为全绿 |
| — | 术语口径修订（owner 2026-11-17，8 条） | ✅ | [GLOSSARY.md](../GLOSSARY.md) 19 处修订：①`Phase` 中文统一为「阶段」（旧译「时间片」降级为解释用，界面不写；业务上的投票/加入/验证/铸造阶段＝某一轮内按阶段划分的时间段的具名说法，不是 Phase 别名）；②行动标识/提案标识 → **行动编号 / 提案编号**；③群行动/群服务 → **链群行动 / 链群服务**，并写明链群＝**链上社群**的简称；④在售上限/供应上限 → **最大铸币上限**（`MAX_SUPPLY`）；⑤把 **流动性凭证（LP token，持有者按占比分交易手续费）** 与 **流动性质押份额（质押进协议后不分手续费，这部分由质押合约销毁）** 拆成两个词条并加入易混对（此前词表把两者写成同一个「流动性份额」）；⑥「第 N 轮」必须带前缀；**最终不引入「层」这个概念**（owner 同日后续确认）：一律写治理轮 / LP 行动轮 / 链群行动轮 / 链群服务轮，代码标识也从 `RoundLayer` 改为 `RoundKind`；⑦**销毁** 补第二种含义：除「取消预留使其永不铸出」外，还包括通过代币合约 `burn` 让已铸出代币回到「未铸造」状态，两者都永久压低发行量；⑧用户可见错误文案随之更新并 `pnpm gen:errors` 重生成（`errors.generated.ts`，248 个 selector）：`超过最大铸币上限。`、`最大铸币上限不能低于初始供应量。`、`没有获得流动性凭证。`；同步 `docs/product/m0-scope.md`、`m0-ux-spec.md` §4、`contract-issues/006`、`frontend-standards.md` §4.8（原 §4.7 检查清单，2026-11-19 因新增 §4.7「同一内容不在同一页面出现两次」后移）。单测 801/801、build 159.2 kB |
| — | 术语权威文档同步（owner 2026-11-17「CONTEXT.md 这个也一起改」） | ✅ | `matt-gov` 提交 `dfcb544`：CONTEXT.md 的 **Phase** 词条从「底层无语义时间片」改为「全局时钟的一个刻度，中文统一写「阶段」」、**Round** 词条改为「把相邻若干 Phase 串成的一条流水线，第 X 轮落在阶段 X…X+3，四类轮次同号不相等、引用须带类型，不使用「层」这类集合说法」、「按底层 Phase 时间片理解」→「按底层 Phase（阶段）理解」、「行动层激励分配」→「行动激励分配」、「action 层」→「action 代码库」；`docs/naming-standards.md` 量纲表 `Phase | 时间片` → `Phase | 阶段`、Phase/Round 段落同步。保留未动：核心治理层 / 提案扩展层 / 发射分配层（代码库分层＝架构，不是轮次集合名词）。本仓 `GLOSSARY.md` §3 的逐字引文同步更新。matt-gov 五项检查（doc_payloads / naming / naming_test / caller_auth / error_tests）全 PASS |
| — | 治理域（owner 2026-11-17 提前要求；当晚按 owner 要求**复刻旧库 LOVE20TKM 的治理相关页面**）：多页面 IA + 智能模式 | ✅ | **页面结构**：`/gov` 治理首页（我的/社区 tab）· `/stake/stakelp` 流动性质押 · `/stake/staketoken` 质押代币（加速质押）· `/stake/unstake` 取消质押 · `/stake/liquid` 流动性质押数据；旧版 `/gov/rewards`、`/vote/*`、`/verify/*`、`/submit/*`、`/acting/*`、`/action/*` 已按旧路径建好**占位页**（Vote/Verify/Submit/Mint ABI 未导出，页面写清原因，不编数据）。**承诺解锁期（owner 2026-11-18，20:05 改下拉）**：首次质押用**下拉列表**选择任意合法值（`PROMISED_WAITING_PHASES_MIN..MAX`，1–100，每项写「N 个阶段 · 约 X」，不足 1 天按分钟/小时、1 天以上按 `约 x.x 天`；默认下限）；已有仓位再加仓时与 periphery `LOVE20Hub` 语义一致——承诺解锁期必须保持当前值、不再提供选择。**已有流动性质押时**，承诺解锁期卡放在 `/stake/stakelp` 与 `/stake/staketoken` 的最上面，显示当前值（阶段 + 约时长）与「提高」按钮，弹面板单独提高（`increasePromisedWaitingPhases`，只能提高），提高后治理权按份额立即变化。前端线 C1 仍为单步（首押选 10 个阶段 → 回执页面字符串 `治理权 +223.6067`；理论值 wei 不变，按规范 §4.5.1 的数量级规则渲染）；「调整承诺解锁期」卡由 C3 覆盖（10→25）。**流动性质押智能模式**（owner 2026-11-17 晚）：默认开启，单币即可——走 Hub `stakeLiquidityWithNative`，合约先兑换再质押，报价显示「先换成多少 / 实际进池两侧 / 最少获得份额 / 预计治理权」；关闭后两侧都填、直接 `Stake.stakeLiquidity`（不经过兑换），**改一侧另一侧按池子储备比例立即联动**，不等合约截断返还；主按钮下面不再有智能模式快捷入口。旧库逐页蓝图与「不能照抄的旧协议产物」见 [reviews/gov-tkm-stake-pages.md](product/reviews/gov-tkm-stake-pages.md) 与 [reviews/gov-tkm-gov-pages.md](product/reviews/gov-tkm-gov-pages.md)。**以下为质押页细节**： `/gov`（`src/features/governance-stake`）：门禁阶梯（未部署 / 未连接 / 网络不对 / 无身份 NFT / 未选中 / 身份读失败，每块一个下一步）；首页两 tab「我的」「社区」（2026-11-18 20:05 按旧版截图重排，23:20 再改：我的 = 2×2 摘要「有效治理权 / 承诺解锁期 / 治理权占比 / 加速质押占比」+ 两个质押入口 + 「铸造 治理激励」+ 治理权作用卡，**「我的流动性质押」明细卡已整体挪到 `/me` 的「质押资产」标签**；社区 = 「社区总治理权」头条 + 一个行动入口按钮「投票中的行动」（**「验证中的行动」在新协议不存在，按钮已移除**；**不再有「治理公示」标题与外框**）+ 2×2 统计「社区流动性质押份额 / 流动性凭证总量 / 本阶段有效加速份额 / 累计销毁社区代币」，**两个质押入口链接已删除**；旧版 APY / 预计新增铸币 / SL·ST 凭证没有对应只读 view，按硬规则 4 换真实口径、不编数，完整口径仍在 `/stake/liquid`；治理权查询**移除按钱包地址**，只按身份 NFT，支持 **NFT ID / NFT 名称** 两模式，名称由链上 `memberId(name)` 解析成编号（O(1)），结果带复制与备注）。**`/me` 我的页**（2026-11-18 23:20）：新增「钱包余额」/「质押资产」两个标签（默认钱包余额，切到质押资产才挂载治理域读）；「质押资产」下是精简后的「我的流动性质押」卡——两行：流动性质押份额（旁有信息按钮，弹层显示份额、预计可取回社区代币 / 父币、有加速量时的加速代币）+ 加速激励质押量（原「加速质押份额」改名，删掉「只统计本阶段有效」小字）；删掉「正常质押中」状态框与「提高承诺解锁期」按钮，申请解锁改为卡片右上角链接（未申请「申请解锁」/ 解锁中「查看解锁进度」/ 可撤出「撤出」，指向 `/stake/unstake`，解锁中多一行剩余阶段提示）；无仓位是空态卡 + 「去质押流动性」，门禁阶梯与治理域一致。**流动性质押**：社区代币 + 父币（父币按 `PARENT_TOKEN_ADDRESS()` 读，本地为 TestWETH）按池子比例存入 `stakeLiquidity`，承诺解锁期 1–100 阶段（**下拉列表**，每项「N 个阶段 · 约 X」），按池子比例显示实际存入两侧与「预计治理权 +X」（预计，成交以回执为准），社区代币/父币两枚授权阶梯（授权额度写精确额、长期授权偏好开启时写 `maxUint256`）；**加速质押**：社区代币单独存入 `stakeBoost`，上限来自 `boostStakeCap`（显示「本阶段还能加速」与「已加速」），**不产生治理权**、只决定加速激励份额，承诺期固定传当前值（不给用户改，避免与「不产生治理权」自相矛盾）；没有流动性质押时是锁定卡 + 「去质押流动性」。**我的质押（2026-11-18 23:20 从治理首页挪到 `/me` 的「质押资产」标签并精简）**：卡片只留两行——流动性质押份额（旁有信息按钮，弹层显示份额、预计可取回社区代币 / 父币，有加速量时加预计可取回加速代币）与加速激励质押量（原「加速质押份额」）；不再显示治理权 / 承诺解锁期 / 「正常质押中」状态框；「提高承诺解锁期」按钮删除（统一在流动性质押 / 加速激励质押页顶部）；申请解锁改为卡片右上角链接（未申请「申请解锁」/ 解锁中「查看解锁进度」/ 可撤出「撤出」，指向 `/stake/unstake`），解锁中多一行「还要再等 N 个阶段（约 X 分钟）」；无仓位是空态卡 +「去质押流动性」，撤出后回到空态。**社区治理数据**：社区总治理权 / 社区总流动性质押份额 / 我的占比 / 本阶段社区有效加速份额 / 已销毁社区代币；规则默认折叠。文案全部进 `copy-pages.ts`，术语按 GLOSSARY（治理权 / 流动性质押 / 加速质押 / 承诺解锁期 / 申请解锁 / 撤出 / 加速激励 / 销毁），界面不出现函数名、allowance、approve、nonce、gas。**三线校验** [three-line/gov-stake.md](product/three-line/gov-stake.md)：理论线 2026-11-17 12:40 先于实现（HEAD `ace6042`）→ 合约线 `scripts/verify/gov-stake-contract.mjs` **161/161 PASS、退出码 0**（专用 8566 链，三次复跑交易哈希一致）→ 前端线 `e2e/gov-stake-numbers.spec.ts` **8 条（截图 28 张）**（多页面 IA 下 C1–C4 数值口径不变 + 稳态/首页/查询/占位页/智能模式单币两条；2026-11-18 20:05 版复跑 8555 8/8（2.4m，旧）/ 8566 8/8（2.0m，旧）；23:20 版与 2026-11-19 二轮的复跑见 04:24 全量（160/160，治理 spec 8 条在内））；截图 28 张 `gov-home-*` / `me-stake-*` / `stake-lp-*` / `stake-token-*` / `unstake-*` / `gov-vote-placeholder-*`（新增 `me-stake-*` 4 张）；治理域懒加载 chunk `gov-section`（48.8 kB raw / 11.8 kB gzip；`/me` 页 8.2 kB raw / 2.7 kB gzip），首屏包体 prod **159.4** kB / dev **160.9** kB（预算 160 / 161，实测于最终代码，无 WARN）；解锁等待期间阶段与成员读每 15 s 自动刷新（到期后「可以撤出了」自己出现）；父币按 `LOVE20Token.PARENT_TOKEN_ADDRESS()` 读（子币社区不再错取 WETH），回执带哈希复制与浏览器链接；旧库参考摘要见 [reviews/gov-tkm-reference.md](product/reviews/gov-tkm-reference.md) |
| — | M1 治理（投票 / 推举 / 激励铸造） | ⏳ | 未开工；[CI-001](contract-issues/001-no-member-round-index.md) Blocker 未解；治理页的**质押**部分已于 2026-11-17 提前实装（见上一行），本行只跟踪投票/推举/激励铸造 |

**未完成清单（别误读为 done）**：三处真机体验、test/prod 地址簿填充（协议尚未在 BSC 测试网/主网部署，两个变体的五个应用页按「未配置」禁用入口）、M1 的投票/推举/激励铸造（治理页只实装质押）。e2e 已隔离到独立 8555 链（§6.1）；包体 prod **159.4** / dev **160.9** kB gzip（2026-11-19 实测；2026-11-17 治理页后为 159.6/161.0；2026-11-16 把钱包菜单/社区菜单/弹层/占位页/404/版本提示文案移到 `copy-pages` 懒加载；dev 预算 161 = 160 + 1 kB 部署数据豁免，§6.2；新增 `gov-page` 懒加载 chunk 不占首屏）；ABI manifest 与漂移门禁已补（§6.5）。

截图共 **207** 张（2026-11-19 04:24 实测：`find docs/product/screenshots -name '*.png' | wc -l` = 207，其中顶层 `ls docs/product/screenshots/*.png` 206 张 + `live/` 1 张；本轮 **167 张已按默认深色重拍、总数不变**；按前缀：home 7 / airdrop 10 / mint 4 / my-nft 5 / swap 21 / transfer 29（含转让抽屉 5、恢复流程 8）/ about 4 / apps 1 / me 3 / approvals 13 / batch-transfer 20 / liquidity 20 / theme 12 / tx-recovery 1 / global-actions 24 / gov-home 8（`gov-home-{mine,community}-{light,dark}-{mobile,desktop}`）/ me-stake 4（`me-stake-{light,dark}-{mobile,desktop}`，2026-11-18 23:20 新增）/ stake-lp 4 / stake-token 4 / unstake 4 / gov-vote-placeholder 4（治理域共 28 张新图；旧的 `gov-{stake,mine,boost-locked}` 12 张已随多页面 IA 重写删除）/ wallet-menu 2 / wallet-no-wallet 1 / community-search 1 / live 1），见 [`product/screenshots/`](product/screenshots/)。本次核对用到的文件：`home-identity-error.png`、`home-no-identity.png`、`swap-form.png`、`mint-form.png`、`airdrop-eligible.png`、`gov-home-mine-light-mobile.png`、`me-stake-light-mobile.png`、`stake-lp-light-mobile.png`、`unstake-light-mobile.png`、[`live/interface-test-live-2026-11-11.png`](product/screenshots/live/interface-test-live-2026-11-11.png)。

## 3. 仓库与环境事实

### 3.1 三个仓库与部署（2026-11-11 实测）

| 仓库 | 是否存在 | 变体 / 链 | Pages |
| --- | --- | --- | --- |
| `LOVE20BSC/interface-dev` | 存在（`git ls-remote` 正常；本仓 `origin`） | dev / 31337 | <https://love20bsc.github.io/interface-dev/> 200，build id `mwb9t10g-85b4d354` |
| `LOVE20BSC/interface-test` | 存在（本仓另有 `test` remote） | test / 97 占位 | <https://love20bsc.github.io/interface-test/> 200，build id `mwb9werl-379de9b0` |
| `LOVE20BSC/interface` | **不存在**（`git ls-remote` 128 `Repository not found`；根站 404） | prod / 56 | 尚未部署 |

线上两站可访问但构建早于当前 HEAD（页面标题仍是旧品牌 `LOVE20`，现应为 `LOVE20协议`）。本地跟踪分支 `test/main` 停在 `8707b6a`，远端实际 `a217ddb`，一律以 `git ls-remote` 为准。

### 3.2 本地链与地址来源

- **两条链，别混**：`http://127.0.0.1:8545` 是**人工链**（开发者浏览器钱包连的链；自动化运行永不触碰），`http://127.0.0.1:8555` 是 **e2e 自动化链**（`pnpm e2e` 自举并复用，入口 `scripts/e2e-chain.mjs`）。两者都是 chainId **31337**；bootstrap 期间 automine（导出块高确定），结束后恢复 `--block-time 1`。链高随时间增长，不写死。
- 运行时状态按端口隔离：8545 保持平铺 `.anvil/`（当前 pid `13323`），8555 在 `.anvil/8555/`；`make stop PORT=8555` / `make clean PORT=8555` 只作用于 8555，反之亦然。
- **重启任何 anvil（尤其 8545）都会让浏览器钱包缓存的 nonce 失效**：已签名未上链的交易会永远 pending（2026-11-11 事故：账户 #1 钱包 nonce 68 vs 链上 nonce 3，页面卡在「确认中…」）。重启链后先在钱包里「重置账户活动」/清掉 pending，再重新发交易；自动化测试不要跑在人工链上。
- 地址唯一来源：`../anvil/export/deployments/anvil31337_dev.json`；ABI/manifest 由 `pnpm sync:anvil` 生成，公共参数与创世快照由 `pnpm sync:network ../core/script/network/<network>` 生成到 `src/config/network/<variant>/{network,airdrop}.json`（`sync:anvil` 保留 `sync:network` 写下的公共字段）；ABI 源为 `../anvil/export/abis/*.json`。禁止手改前端地址簿，也不得以地址簿为目标反推 nonce。
- 本轮实测地址（clean bootstrap）：MemberNFT `0x610178dA211FEF7D417bC0e6FeD39F05609AD788`（seed 后 `totalSupply`=5，e2e 后 6）；首币 `0x8aCd85898458400f7Db866d53FCFF6f0D49741FF`（`symbol`=`TestLOVE20`，`name`=`TestLOVE20@TestWETH`）；AirdropDistributor `0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6`（`airdropInfo`=`merkleRoot 0x046a…c404` / `claimableFromRound 2` / `remainingAmount 5e26`，与内置快照一致）；Phase 因 nonce 前移改为 `0xa513E6E4b8f2a923D98304ec87F64353C4D5C853`。前端 `deployment.blockNumber`=导出 `deployBlock`（2026-11-14 追加两个模块后为 34，此前 32，见下条）。
- 人工链起链：`make stop && make clean && make bootstrap`（≈45–50 s，8545）；重跑必须重新 clean，bootstrap 会拒绝复用旧链。之后 `pnpm sync:anvil`，有兄弟仓时 `pnpm abis:check`。
- e2e 链：`pnpm e2e` 首次在 8555 上执行 `make -C ../anvil bootstrap PORT=8555`（≈1 min），之后复用；需要重建时 `pnpm e2e:reset-chain`。**换端口不影响地址**：同版本 clean bootstrap 从 deployer nonce 0 开始，两个端口的部署地址应与 `src/config/network/anvil31337_dev/network.json` 逐项一致；公共网络配置（params / 创世快照 URI）另由 `pnpm sync:network ../core/script/network/anvil31337_dev` 同步。
- **地址归属不交叉**：`anvil/` 只拥有本地部署；test/prod 地址只能来自合约仓 `script/network/<chain>_<type>/`（当前 core/action 只有 `anvil31337_dev`）。`src/config/network/bscTestnet_test/network.json` 与 `src/config/network/bscMainnet_prod/network.json` 各有 24 个零地址槽 → 「未配置」，test/prod 构建不会显示假数据。
- **2026-11-14 追加 periphery/tools 两个模块（PORT=8556 clean bootstrap，未触碰 8545）**：既有 34 个地址逐键不变，只多出两项——`BatchTransfer`（地址簿 `batchTransfer`，工具的批量转账）`0xc3e53F4d16Ae77Db1c982e75a937B9f60FE63690`（部署块 33）、`LOVE20Hub`（地址簿 `hub`，构造只注入 Stake）`0x84eA74d481Ee0A5332c457a4d796187F6Ba67fEB`（部署块 34）；`deployBlock` 32 → 34。两次 clean bootstrap 的 `export/deployments/anvil31337_dev.json` sha256 均为 `9e811d4d719b96aaa51b707baef3bb9dbcd0a8118bf0e198aa5ca4e17fcbd44c`。ABI 从 `anvil/export/abis/` 经 `pnpm sync:anvil` 生成为 `src/config/abis/{batch-transfer,love20-hub}.ts`。

### 3.3 工具链（实测）

- **可用**：nvm Node **v24.12.0** + pnpm **11.5.1**（`package.json` engines `>=22.12.0`；CI 用 Node 24 + pnpm 11.5.1）。
- **不可用**：DSH 自带 Node **v24.21.0**（`~/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/node/bin/node`）。加载 rollup 原生二进制失败：`dlopen(.../@rollup/rollup-darwin-arm64/rollup.darwin-arm64.node) … code signature … different Team IDs`。同一 `.node` 在系统 Node 下加载正常。**install / build 一律用系统 Node，不要用 DSH 运行时。**
- 代码地图：`src/` 分层 `app → pages → widgets → features → entities → shared`，`domain`/`config` 为叶子；ESLint + `src/architecture.test.ts` 双重强制，详见 [README](../README.md) §Layout。
- 工作区：HEAD 以 `git rev-parse HEAD` 为准；本轮改动前工作区干净。`dist/`、`dist-*/`、`.build-id`、`.research/` 均被 gitignore。
- **兄弟仓改动会打断本地链时改用「钉版」**：`../anvil` 新增 `siblings.lock`（七个兄弟仓的 `url` + `sha`，基线取上次成功导出的 `sources.*.head`）与 `make pin` / `pin-status` / `unpin`；`make bootstrap PINNED=1 PORT=<port>` 用 `.siblings-pinned/` 里只读的 `git worktree` 快照编译，默认 `PINNED=0` 仍走 `.siblings/` 软链、行为不变。2026-11-14 在 owner 正改 core `IStake.stakeLiquidity`（live core 编译不过）时，`PINNED=1` 在 8580 上两次 bootstrap 产出的 `export/deployments/anvil31337_dev.json` 与仓库已提交版本 sha256 均为 `9e811d4d…c44c`（逐字节相同），随后 `make stop PORT=8580`。**2026-11-15 第三轮 bump**：`make pin-lock` 把锁从 core `8d604a2` / periphery `3b825a5` / action `66e2d65` / group-chat `45f1966` 更新到 core `b8950bc` / periphery `fc6ed10` / action `b05600c` / group-chat `fbec477`（libs `65b1106` / dex `31464c0` / tools `44d7f54` 不变）；`make unpin && make pin` 后 `make pin-status` 显示七个仓 lock = pinned = live；`make bootstrap PINNED=1 PORT=8581` → `ALL CHECKS PASSED`，导出 sha256 `222b2c8d…d0aa2` 与 live 8580/8555 三次逐字节相同，`export/abis/*` 也逐字节相同；随后 `make stop PORT=8581`。bump 流程见 `../anvil/README.md`「Pinned siblings」。

## 4. 常用命令

| 目的 | 命令 | 备注 |
| --- | --- | --- |
| 开发 | `pnpm dev` | <http://127.0.0.1:5173>，默认 dev 变体 |
| 类型检查 | `pnpm typecheck` | 两份 tsconfig 都跑 |
| Lint | `pnpm lint` | `--max-warnings=0` |
| 单元/组件测试 | `pnpm test` | Vitest；`test:watch` 可选 |
| 构建 | `pnpm build` | typecheck → vite → 404/.nojekyll/build-id → 包体门禁；默认 **prod** 变体 |
| dev 变体构建 | `VITE_ENV=dev pnpm build` | 测包体/本地地址簿时必须显式指定 |
| 预览产物 | `pnpm preview` | <http://127.0.0.1:4173> |
| E2E | `pnpm e2e` | Playwright，**143 条**；在独立 **8555** 自动化链上自举/复用（`scripts/e2e-chain.mjs`），`playwright.config.ts` 强制 `VITE_ENV=dev` 并跑 `build && preview`，把解析出的 RPC 作为 `VITE_ANVIL_RPC` 烘进构建 |
| 只看 e2e 链 | `pnpm e2e:ensure-chain` | 打印 8555 端点与「自举/复用」结果，不跑测试；`pnpm e2e:reset-chain` 重建 |
| 格式化 | `pnpm format` / `pnpm format:check` | Prettier |
| 起人工链（8545） | `make stop && make clean && make bootstrap` | 只从全新链/nonce 0 部署；旧链会被拒绝 |
| 起 e2e 链（8555） | `pnpm e2e`（首次自举）/ `make -C ../anvil bootstrap PORT=8555` | 运行时状态 `.anvil/8555/`，与 8545 互不影响 |
| 同步地址/ABI | `pnpm sync:anvil` | bootstrap 后运行；地址簿/ABI/manifest 一次写完，并保留 `sync:network` 的公共字段 |
| 同步网络公共配置 | `pnpm sync:network ../core/script/network/anvil31337_dev` | 从 core 发布的网络目录读公共 `params` 与创世快照 → `src/config/network/<variant>/` |
| ABI 漂移门禁 | `pnpm abis:check` | 无 `../anvil/export` 时明确跳过 |
| 发布到 test | `pnpm release-to-interface-test` | 裸仓库名别名；也可 `pnpm release-to LOVE20BSC/interface-test` |
| 发布到 prod | `pnpm release-to-interface` | 目标仓尚不存在 |

发布前置固定为：干净工作区（含未跟踪文件）→ 当前 SHA 的 CI 绿 → 目标 `main` 是 `HEAD` 祖先 → 打印 SHA/目标/提交并确认（`RELEASE_YES=1` 跳过）→ fast-forward push。命令零写入、不打 tag、不 force（[ADR-0002](adr/0002-three-environment-injection.md) §4）。

CI 环境规则（`.github/workflows/deploy.yml`）：取 `github.repository` 最后一个 `/` 之后的名字转小写，含 `dev` → dev，否则含 `test` → test，否则 prod；`vars.VITE_ENV` 可覆盖，base 分别为 `/interface-dev/`、`/interface-test/`、`/`。只有 push `main` 或手动 dispatch 触发；ABI 漂移门禁不在这个 workflow（本仓无 forge/兄弟仓）。

## 5. 已定的关键决策（附链接）

| 决策 | 结论 | 出处 |
| --- | --- | --- |
| 技术栈与静态托管 | React 19 + TS + Vite + Tailwind + wagmi/viem + TanStack Query + Radix + pnpm；GitHub Pages；无 Next/PWA/自定义响应头；`base` 构建期烘入，深链靠 `404.html` | [ADR-0001](adr/0001-stack-and-static-hosting.md) |
| 三环境注入 | 同一代码库三次构建，差异只在构建期环境包；组件/数据层零环境分支；地址、chainId、品牌全编译进产物 | [ADR-0002](adr/0002-three-environment-injection.md) §1–§2 |
| 身份模型 | 身份 = `(chainId, MemberNFT 地址, tokenId)`；MemberNFT 由种子 core 的 `MEMBER_NFT_ADDRESS()` 解析；`balanceOf`+`tokenOfOwnerByIndex` 枚举；每次加载 `ownerOf` 重校验 | [ADR-0003](adr/0003-identity-and-connect-button.md) §2 |
| 本地链 | `make bootstrap` 一条命令完成 preflight→fixture→build→anvil→fresh→部署→seed→导出→验证；`export/` 是唯一来源，前端只经 `pnpm sync:anvil` 消费 | [ADR-0004](adr/0004-anvil-local-chain.md) |
| 品牌标签 | 社区名 = 链上 `symbol()`；无社区/未知回退「LOVE20协议」（协议名，不是代币社区）；`name()` = `<子币 symbol>@<父币 symbol>`，仅技术详情可见 | [m0-ux-spec](product/m0-ux-spec.md) §1.3/§2.1；[GLOSSARY](../GLOSSARY.md) 易混对 |
| 空投页措辞 | 标题与状态统一「空投铸造」（2026-11-11 由「铸造空投份额」改名）；**2026-11-17 起 `/airdrop` 的铸造按钮改为「立即铸造」**，S5 卡片两行（「我的份额 {percent}，预计可铸造空投 {symbol}：」+ 数量，不重复 symbol），无「本次空投：{symbol}」元信息行，「规则」折叠默认展开。不写「领取空投」；被铸造的对象仍叫「空投份额」；合约动作 `claim` 只留在代码/术语层 | [m0-ux-spec](product/m0-ux-spec.md) §3.4；[GLOSSARY](../GLOSSARY.md) |
| 空投数据源 | `AirdropDistributor`（地址簿 `airdropDistributor`）：`claim(token,share,proof)` 只付 `msg.sender`；每个 token 的根、轮次、快照 URI、已认领/剩余份额与金额全部来自**一次** `airdropInfo(token)`（`merkleRoot` / `claimableFromRound` / `snapshotUri` / `totalRemainingShare` / `remainingAmount` 等）；创世快照用内置 JSON 并以 `airdropInfo(genesisToken).merkleRoot` 校验，后续 Launch 代币从 `airdropInfo(token).snapshotUri` 拉取；轮次门槛用 `airdropInfo(token).claimableFromRound` + Phase 估算「约 X 分钟」 | [m0-ux-spec](product/m0-ux-spec.md) §3.4；[CI-017](contract-issues/017-genesis-snapshot-uri-locked.md) |
| 已铸造量 | 已铸造态必须显示实际铸造数量，金额来自 `claimedAmount(token,wallet)` 一次 view 调用，不依赖本机缓存 | [m0-ux-spec](product/m0-ux-spec.md) §3.4；[CI-014](contract-issues/014-airdrop-claimed-amount-not-readable.md) |
| tools 两个工具合约 | `BatchTransfer` / `UniswapV2Zap` **先不做进前端**（owner 2026-11-12 决定），M2 再作为「应用 → 工具」分类上线；两者独立于协议、不在 M0 漏斗内 | [contract-change-impact-2026-11-12](product/contract-change-impact-2026-11-12.md) §3 |
| Test 前缀 | dev/test 变体前端强制名字以 `Test` 开头（大小写敏感），prod 无此规则；`core@72a1604` 起合约不再自动加/改前缀 | [m0-ux-spec](product/m0-ux-spec.md) §3.3/§6；[CI-004](contract-issues/004-member-nft-test-prefix-mismatch.md) |
| 通用兑换页 | 任意代币 ↔ 任意代币（含原生币），路径 ≤3 跳；报价只调 `Router.getAmountsOut`；费率不写死，读不到就写「以链上费率为准」 | [m0-ux-spec](product/m0-ux-spec.md) §3.5；`b3a2a7d` |
| 无第三方 / 零密钥 | 钱包 injected-only；无 WalletConnect/AppKit/第三方 API/Service Worker；所有 `VITE_*` 公开，环境包不放任何密钥 | [README](../README.md) §Stack；[ADR-0002](adr/0002-three-environment-injection.md) §1 |
| i18n 纪律 | 所有用户可见文案进 `shared/config/copy.ts`（首屏）/ `shared/config/copy-pages.ts`（懒加载页与弹层）；组件内禁止 CJK 字面量（架构测试强制）；暂不引入 i18n 库 | [README](../README.md)「i18n readiness」 |
| 缓存与错误 | 唯一存储封装 `shared/lib/cache.ts`，键 `love20:v1:<chainId>:<contractAddress>:<wallet>:<businessKey>`；合约错误 selector → 中文人话 | [ADR-0003](adr/0003-identity-and-connect-button.md) §3；[README](../README.md) §Storage |
| 底栏与占位页 | 5 个 tab 同权重，不做中央凸起；**行动**仍是占位页（「即将上线」），**治理**自 2026-11-17 起是真实页（流动性质押 + 加速质押；投票/推举属 M1），**我的**早已实装；占位页不出现半成品表单 | [README](../README.md)「Decisions…」；[m0-ux-spec](product/m0-ux-spec.md) §1.2/§3.14 |
| 应用目录 | 底栏「链群」改为「应用」（`/apps?symbol=`）：功能型页面统一由 `src/domain/apps-catalog.ts` 的数据目录管理（今日：创世空投 / 身份 NFT / 代币兑换 / 开源文档；`/about` 是文档、合约地址与只读链上数据页，无合约地址依赖），≥2 个分类自动分组，未来页面只加目录条目；`/group` 深链保留、不再上底栏 | [m0-ux-spec](product/m0-ux-spec.md) §1.2/§3.6/§3.8 |

## 6. 已知坑与注意事项

1. **E2E 已隔离到独立链（8545 人工链不可触碰）**：2026-11-11，`pnpm e2e` 在人工正在使用的 8545 上 bootstrap/回滚，把账户 #1 的链上 nonce 从 68 打回 3，他签名的 approve 永远 pending、页面卡「确认中…」。现在的规则：
   - `pnpm e2e` 由 `scripts/e2e-chain.mjs` 守护：默认链 `http://127.0.0.1:8555`，本机命中 `:8545` **立即失败**（`playwright.config.ts` 对直接 `playwright test` 同样拒绝）；未显式设置 `E2E_ANVIL_RPC` 时首次在 8555 上 `make -C ../anvil bootstrap PORT=8555`、之后复用。
   - `e2e/chain.ts` 仍按 spec 文件 `anvil_snapshot`/`anvil_revert`（文件内测试共享夹具，如 mint 收据给 my-nft 列表用；按测试回滚会抹掉下一个测试依赖的状态），`playwright.config.ts` 固定 `workers: 1`——快照作用于整条链，不能让两个文件同时改链。现在它只作用于自动化链，**链脏/被强杀用 `pnpm e2e:reset-chain` 重建，不要去动 8545**。
   - 复核（2026-11-11 21:53–21:58 +08:00）：`pnpm e2e` 连跑两遍均 **33/33**（各 1.3m，中间无 bootstrap；快照 id 0x0–0x3 → 0x4–0x7 连续）；杀掉 8555 后重跑自动 bootstrap 并再次 33/33；两遍前后 8545 的 `block-number` 969→969、`nonce 0x7099…` 69→69、`anvil_getAutomine` true→true、pid 13323 不变。操作见 [e2e/README.md](../e2e/README.md)。
2. **首屏包体（修复后复核）**：门禁 `scripts/check-bundle.mjs`（level-9）实测 **prod 159.4 kB / dev 160.9 kB** gzip（2026-11-19 复核；2026-11-16：把只在钱包菜单/社区菜单/弹层/占位页/404/版本提示里用的文案从 `copy.ts` 拆到懒加载 `copy-pages.ts` 后；此前 2026-11-12 为 prod 158.3 / dev 159.2，迁移前 159.2–159.3 / 160.0–160.1）；Vite 自身报数更高（统计口径不同）。dev 与 prod 的差异来自**部署数据压缩率**，不是 dev-only 代码：两者 raw 约 535 kB，部署 JSON 的 anvil 真实地址比零地址占位更难压缩，测试网横幅/dev 标识是两个变体共有的真实 UI。门禁因此给 dev 显式 **+1 kB 数据豁免**（dev 目标 161 kB，硬限 200 仍适用；prod 仍按 160 kB），不再输出无法行动的 WARN。后续 prod 不得超 160、dev 不得超 161。
3. **三处真机（390×844）体验缺陷**：① 主按钮被固定底栏遮挡——[`swap-form.png`](product/screenshots/swap-form.png) 里「兑换」只剩上沿；② 小数位不统一——`mint-form.png` 显示 `99,998,199.99`（2 位）、`swap-form.png` `19.938012`（6 位）、`airdrop-eligible.png` `100,000,000`（0 位）；③ 6 字标题被截——`airdrop-eligible.png` 页头「铸造空投…」。
4. **地址确定性已收敛（冲突已解决）**：clean bootstrap 从 deployer nonce 0 开始，地址确定；bootstrap 期间 automine，导出块高也确定（§6 有两次 sha256 相同的证明命令）。只有「已用过的链」会得到另一组地址，所以 `make bootstrap` 现在拒绝复用任何运行中的链，`export.py` 还会拒绝 nonce 首笔不为 0 的 broadcast。`m0-scope` 与 ADR-0004 已按「deterministic-from-clean」统一；操作上仍只消费 `pnpm sync:anvil` 生成物，绝不硬编码、绝不手设 nonce。
5. **ABI 必须 generate-then-commit（已补齐）**：core `out/`、dex `build/` 都被各自仓库 gitignore（core `.gitignore:1`、dex `.gitignore:1`），本仓也忽略 `out/`。`pnpm sync:anvil` 生成 `src/config/abis/*.ts`（含 `airdrop-distributor.ts`）、`src/config/abis/manifest.json`（core/action/group-chat/libs/dex/anvil/periphery/tools 的 HEAD、导出块高/时间、每合约条目数）与快照；`pnpm abis:check` 在有 `../anvil/export` 时逐字节校验，缺失时明确跳过。不要把 `abi` 手改后再提交。
6. **合约问题清单已过基线**：`docs/contract-issues/README.md` 审计基线 `core@43d5344`，而 core HEAD 已是 **`72a1604`**（CI-004 在该提交标为已修复）。13 条中 12 Open / 1 修复，需按新 HEAD 复核；[CI-001](contract-issues/001-no-member-round-index.md) 仍是 M1 Blocker。
7. **空投快照必须与链上根一致**：导出/内置快照的 `merkleRoot`=`0x046a5d53…c6c404`（10 个账户），页面用 `airdropInfo(创世代币).merkleRoot` 校验；本地匹配即使用，否则回退链上 HTTP(S) URI，仍不可用时按「空投资格暂时读不到」+「重试」处理，不显示数字。新部署在构造期写定创世 URI；旧部署的空 URI 仍由本地快照兼容（CI-017）。
8. **test/prod 地址簿为空**：两份 JSON 各 24 个零地址，现在发布会得到「未配置」界面；地址只能来自合约仓 `script/network/`，不得把 anvil 地址抄过去。
9. **Pages 缓存**：`index.html` 最多陈旧 600 s、旧哈希 chunk 会 404；只能靠 build id 比对 + `vite:preloadError` 兜底；不启用 PWA。
10. **构建运行时**：不要用 DSH 自带 Node 跑 `pnpm install/build`（rollup 原生二进制 code-signature 失败，见 §3.3）。
11. **Pages 上的 dev 构建只能做 UI/文案预览**：HTTPS 页面不能访问回环 RPC（2026-11-12 复现的 Chromium 报错：`Permission was denied for this request to access the 'loopback' address space`，目标 `http://127.0.0.1:8545/`，来源 `https://love20bsc.github.io`）；交互测试必须用 localhost 本地服务（`pnpm dev`，如 <http://localhost:5180>），或换成可访问的链。界面已对该组合显示一次性可关闭说明（`src/app/shell/rpc-blocked-notice.tsx`），不再误报「网络可能不稳」。
12. **三线校验链必须来自 clean bootstrap，不要 dump 8545 人工链**：2026-11-17 治理·质押三线曾用 `anvil_dumpState(8545)` 起 8566，事后发现 8545 比 clean bootstrap 多一个手工铸造的身份（MemberNFT `totalSupply` 6 vs 5），且 `TestLOVE20.totalSupply()` 差约 0.9 币（`999994599998649999819999988` vs `999995499999099999909999997`）。凡是吃 `token.totalSupply()` 的量（加速上限 `mintCap`、加速金额、撤出总额）在两条基线上显示不同，同一份断言在套件链 8555 上会红。正解：`anvil_dumpState` **只读** dump 8555（e2e 套件链本身就是 clean bootstrap），再用 `anvil --load-state` 起 8566；`docs/product/three-line/gov-stake.md` §0.4 记录了完整证据。

## 7. 下一步（按顺序）

| # | 事项 | 完成标志 |
| --- | --- | --- |
| 1 | ✅ 包体保持预算内 | prod gate ≤160 kB（2026-11-17 复核 159.2 kB）；dev ≤161 kB（复核 160.6 kB，含 `check-bundle.mjs` 显式 1 kB 部署数据豁免）；不引入 WalletConnect 字节 |
| 2 | 修三处真机体验：底栏遮挡主按钮、小数位统一、6 字标题不截断 | 按 390×844 重出 `product/screenshots/` 对照图，主按钮完整可见、金额精度有统一规则（**小数位一项已由 2026-11-19 数字显示规范关闭**：小数位按数量级自适应，见 §2 二轮收口行 + [frontend-standards](engineering/frontend-standards.md) §4.5.1） |
| 3 | ✅ E2E 独立链隔离 | 自动化链 8555（`pnpm e2e` 自举/复用，8545 硬拒绝）；按文件快照/回滚；连跑两遍均全绿且 8545 前后不变（§6.1） |
| 4 | 写 M0 验收报告 | 按 [m0-ux-spec](product/m0-ux-spec.md) §6 的 14 步 + 四个阻塞点逐条附证据（截图/交易哈希/命令输出） |
| 5 | 发布到 interface-test | 先解决 test 地址来源（合约仓当前只有 `anvil31337_dev` 参数，前端 test 簿仍全 0）→ 干净工作区 + CI 绿 → `pnpm release-to-interface-test`；线上 build id 对应发布 commit |
| 6 | 之后才是 M1 的其余部分（推举/投票/激励铸造；质押已于 2026-11-17 提前实装） | CI-001 解除并有 view 级枚举方案；prod 仓 `LOVE20BSC/interface` 到时才创建 |

## 8. 如何接手（最短路径）

1. **读什么**：先 [ADR-0001](adr/0001-stack-and-static-hosting.md)→[0004](adr/0004-anvil-local-chain.md)（0002 环境/发布、0004 起链最关键），再本文件，再 [m0-ux-spec](product/m0-ux-spec.md)；改文案前读 [GLOSSARY](../GLOSSARY.md)。
2. **起链**：`make -C ../anvil bootstrap`；`cast chain-id --rpc-url http://127.0.0.1:8545` 应为 31337；收链 `make -C ../anvil stop`。同一时刻只允许一条链。
3. **跑测试**：`pnpm install` → `pnpm typecheck && pnpm lint && pnpm test`；`pnpm e2e` 跑 143 条，首次需干净链，之后可按文件快照/回滚重复跑（见 [e2e/README.md](../e2e/README.md)）。
4. **改 UI 的纪律**：文案只进 `shared/config/copy.ts`（首屏）或 `shared/config/copy-pages.ts`（懒加载页/弹层）；组件内禁止中文字面量；缓存只走 `shared/lib/cache.ts`；地址/chainId 只从环境包来；禁止硬编码费率；金额与倒计时必须标「约/预计」；不调 `tokenURI`、不读事件日志。
5. **改 ABI/地址**：先 clean bootstrap，再 `pnpm sync:anvil` 生成并提交；不手改、不把 `out/`/`build/` 带进仓，不为了匹配旧地址簿调 nonce。漂移门禁 `pnpm abis:check`。
6. **提交纪律**：显式 `git add <path>`（不要 `git add -A`）；已推送 commit 禁止 amend；不提交 `dist*/`、`.research/`、`.build-id`、`.env`。
7. **发布纪律**：只接受 fast-forward；`pnpm release-to-interface-test` 会检查干净工作区、CI 绿、目标 `main` 是祖先；拒绝 force、拒绝网页 merge。
8. **不确定就写「待核实」**：不要发明地址、费率、文案或合约能力；`../core`、`../action`、`../anvil` 等兄弟仓只读。

## 9. 文档索引

`.research/` 是本地只读输入且被 gitignore，干净 checkout 里没有这些文件；交接时需单独拷贝。

| 文档 | 回答什么问题 |
| --- | --- |
| [STATUS.md](STATUS.md) | 本文件：当前做到哪、怎么接手、下一步 |
| [ADR-0001](adr/0001-stack-and-static-hosting.md) | 为什么是这套栈、Pages 六条硬约束如何落到架构、包体门禁口径 |
| [ADR-0002](adr/0002-three-environment-injection.md) | 三环境如何注入、ABI 流水线、单命令 fast-forward 发布、仓库名选环境 |
| [ADR-0003](adr/0003-identity-and-connect-button.md) | 连接按钮三面板、身份三元组与枚举、缓存命名空间、社区切换语义 |
| [ADR-0004](adr/0004-anvil-local-chain.md) | `make bootstrap` 做什么、fresh/nonce 0 守卫、seed 顺序、8545 端口策略、`pnpm sync:anvil` 单向同步与确定性证明 |
| [m0-scope](product/m0-scope.md) | M0 交付 6 项、明确不做什么、依赖/验收、仍待确认的假设 |
| [m0-ux-spec](product/m0-ux-spec.md) | 应用外壳与 5 个页面的交互、横切规范、§6 验收脚本 |
| [contract-issues/README](contract-issues/README.md) | 13 条合约侧问题的索引、严重级别定义、修复流程与基线 |
| [CI-001](contract-issues/001-no-member-round-index.md) | 无按 `memberId` 的轮次/行动索引（Blocker，M1 阻塞） |
| [CI-002](contract-issues/002-reward-quote-linear-scan.md) | 激励报价线性扫描本轮全部提案（High） |
| [CI-003](contract-issues/003-created-round-not-exposed.md) | `createdRound` 未暴露，流水线/倒计时拿不到（High） |
| [CI-004](contract-issues/004-member-nft-test-prefix-mismatch.md) | Test 前缀报价/查重与铸造不一致（已修复 core@72a1604） |
| [CI-005](contract-issues/005-no-onboarding-path.md) | 没币用户入网路径缺失（High） |
| [CI-006](contract-issues/006-claim-amounts-are-live.md) | 待铸造金额现算会变甚至归零（High） |
| [CI-007](contract-issues/007-round-not-started-inconsistent.md) | 「轮次未开始」三种不一致答复（Medium） |
| [CI-008](contract-issues/008-no-phase-timing-view.md) | 无阶段时间/偏移视图，倒计时要在 TS 重算（Medium） |
| [CI-009](contract-issues/009-verifier-surface-gaps.md) | 验证者侧没有按人索引（Medium） |
| [CI-010](contract-issues/010-address-book-not-discoverable.md) | 地址簿不可链上发现，错地址静默返回 0（Medium） |
| [CI-011](contract-issues/011-silent-zero-ambiguity.md) | 静默 0 / 歧义 0：分不清「没有」与「未开始」（Medium） |
| [CI-012](contract-issues/012-name-homoglyph-spoofing.md) | 名称同形可伪造身份（Medium） |
| [CI-013](contract-issues/013-member-nft-no-token-uri.md) | MemberNFT 无 `tokenURI`，钱包里是空白 NFT（Low） |
| [GLOSSARY](../GLOSSARY.md) | 界面中文的硬约束、一词一义、易混对（写文案前必读） |
| [delivery-2026-11-14](product/delivery-2026-11-14.md) | 本轮五页 + anvil 外围合约接入的交付索引：三线证据、门禁、人工验收路径、已知限制 |
| [three-line-verification](product/three-line-verification.md) | 三线校验规范（理论线 → 合约线 → 前端线，理论线为基准） |
| [README](../README.md) | 栈、命令、分层、环境注入、连接按钮、存储/错误、i18n、托管、stub 清单 |
| [.research/protocol-contracts.md](../.research/protocol-contracts.md) | core/action/group-chat 前端可用面与合约事实清单 |
| [.research/domain-model.md](../.research/domain-model.md) | 领域术语、Phase/Round 语义、角色与对象关系 |
| [.research/dex-and-anvil.md](../.research/dex-and-anvil.md) | dex/anvil 现状与本地 bootstrap 必须补什么 |
| [.research/libs-and-artifacts.md](../.research/libs-and-artifacts.md) | libs/compatibility/cache 的产物与 ABI 生成策略 |
| [.research/membernft-identity.md](../.research/membernft-identity.md) | MemberNFT 实现、身份发现与持有人枚举 |
| [.research/network-and-token-acquisition.md](../.research/network-and-token-acquisition.md) | 网络配置、买币/空投、phase 时序等集成事实 |
| [.research/static-hosting-and-ux.md](../.research/static-hosting-and-ux.md) | Pages 实测约束与消费级 dApp UX 基准 |
| [.research/tkm-connect-and-nav.md](../.research/tkm-connect-and-nav.md) | 参考实现的连接按钮、底栏与桌面外壳 |
| [.research/tkm-funnel-pages.md](../.research/tkm-funnel-pages.md) | 参考实现四个漏斗页的结构与文案 |
