# M0 范围（一页）

M0 的目标不是“把协议画出来”，而是**让一个没有钱包的人在手机上打开、看懂、接上钱包、找到自己的身份**，同时把后面所有里程碑都要依赖的工程底座（分层、设计系统、路由、错误文案层、三环境构建、一条命令起链）一次性立住。

M0 结束时的可演示路径（新用户漏斗，顺序固定）：打开页面 → 连接钱包 → 首页 → **无身份时首页只给「去我的 NFT」**（首页不判断铸造，不出现「铸造身份」CTA）→ 我的 NFT 空态「你还没有身份。」+「铸造身份」→ 铸造身份（动态价格预览、LOVE20 余额是否足够的预判、名字唯一性预检查）→ **余额不足时** → 若有空投资格则「铸造空投份额」，否则「兑换代币」（用原生币买入，仅买入方向；落点固定首币 LOVE20）。分支规则：**铸造所需代币不足 → 若有空投资格则引导铸造空投份额 → 否则引导代币兑换**。

## 范围内

| # | 交付 | 完成标志 |
| --- | --- | --- |
| 1 | **导航骨架** | 移动端底部标签栏、桌面端左侧竖栏，同一份配置自动适配；首个标签 = 首页；其余标签为占位页（可见、可导航、标注“即将上线”）。不允许用两套导航组件 |
| 2 | **右上角连接按钮** | 一个入口三个面板：钱包（连接/断开；换地址 = 断开再连，不提供地址列表）、代币社区切换、身份入口（跳转「我的 NFT」，切换由该页「使用此身份」完成）；按钮只呈现三态（未连接 / 链不对 / 已连接），已连接时右触发区下行显示「身份名」或「未选择身份」。不提供网络选择器 |
| 3 | **新用户漏斗** | 顺序固定：打开页面 → 连接钱包 → 首页（无身份时只给「去我的 NFT」）→ 我的 NFT 空态（「你还没有身份。」+「铸造身份」）→ 铸造身份（动态价格预览、LOVE20 余额预判、名字唯一性预检查）→ 余额不足 → 铸造空投份额（有资格）/ 兑换代币（无资格，用原生币买入，仅买入方向；落点固定首币 LOVE20）。分支规则：**铸造所需代币不足 → 若有空投资格则引导铸造空投份额 → 否则引导代币兑换**。身份每次加载按 `ownerOf` 重校验，失效即清除并回落（仍持有其他身份 →「未选择身份」；没有其他身份 →「无身份」） |
| 4 | **工程底座** | 分层架构（展示 / 领域 / 链访问三层，链访问不向上泄漏 viem 类型）；设计系统（颜色、字号、间距、按钮、骨架屏、空状态、错误态）；路由（browser router + 构建期 `404.html`）；错误文案映射层（消费 `registry/errors.json` 约定：selector → 英文错误名 → 中文人话 + 下一步动作）；三种构建模式；GitHub Actions → Pages |
| 5 | **一条命令起全栈** | `WETH + Uniswap V2（Factory/Router，feeToSetter=0）+ core/action/group-chat + Airdrop + Multicall3`，按 ADR-0004 seed 首币池 **200,000 LOVE20 + 100 WETH**（`SEED_LIQUIDITY_TOKEN_AMOUNT=2e23`、`SEED_LIQUIDITY_PARENT_TOKEN_AMOUNT=1e20`），随后导出 `anvil/export/deployments/anvil31337_dev.json`（单文件地址簿）+ `anvil/export/abis/*.json` + 空投快照及证明，并跑 `cast` 断言（链 id、每个地址有代码、`router.factory()/WETH()`、`factory.feeTo()==0`、`token.MINTER()`、`launch.FIRST_TOKEN_ADDRESS()`、pair 储备非零、`airdrop.merkleRoot()` 与快照一致、`phase.currentPhase()>=1`）。**Airdrop 必须是 share + Merkle 语义**（`claim(token, account, share, proof)`，与生产一致），不采用旧前端里金额制或改名的副本；**Multicall3 必须真的部署**，不能只导出接口 ABI |
| 6 | **文案纪律落地** | 界面所有中文过一遍 `GLOSSARY.md` 的六条纪律；“激励/铸造激励/预留/销毁”不得写成“奖励/发放/领取”；同一概念一页一个叫法 |

## 明确不在 M0

- **治理投票**（推举、投票、提案激励）。
- **三条行动流水线**（群行动、群服务、LP 行动的加入/验证/铸造）。
- **群聊**。

这三块的链上能力都在，但 M0 不承诺任何界面；对应的导航项只能是占位页，不得出现半成品表单。

## 依赖与验收

- **前置**：本地全栈可一键起（第 5 项；`dex/build` 被 gitignore，脚本必须自己 `make build`，不能假定产物存在）；dev 的 ABI 与地址只由 `anvil/export/deployments/anvil31337_dev.json` 与 `anvil/export/abis/*.json` 提供（test/prod 见 ADR-0002），前端**不得**硬编码地址；`registry/errors.json` 约定可用。
- **批量读取**：初始身份 NFT 资产与链上数据均通过 Multicall3 批量读取（部署见第 5 项），不逐 token 串行请求。
- **构建**：dev / test / prod 三次构建，各自 `--base` 正确、`404.html` 由构建生成、`.nojekyll` 存在；首屏 JS gzip **warn 160 kB / 硬失败 200 kB**（`scripts/check-bundle.mjs`），所有 shipped chunk（含懒加载）经字节扫描不得含 WalletConnect/AppKit。
- **E2E**：按 UX Spec §6「M0 验收脚本大纲」执行——前置条件、14 个步骤（含资格 / 无资格 / 错误腿）与四个阻塞点均以 §6 为准，本文不复述；脚本跑 `vite preview --base=/<repo>/` 的产物（不是 dev server）。
- **人工验收**：手机真机走一遍身份流；桌面走一遍导航适配；文案抽查 10 条对照 `GLOSSARY.md`。

## 已定（不再是假设）

**仓库拓扑、环境选择与发布同步。** 三仓为 `LOVE20BSC/interface-dev`（唯一开发地，dev）、`LOVE20BSC/interface-test`（test）、`LOVE20BSC/interface`（prod）；三仓各只有一条长期 `main`，共享同一个 commit。环境变体在 CI 里按**仓库名关键字**选择：名字含 `dev` → dev，否则含 `test` → test，否则 prod（按 `dev` → `test` → `prod` 顺序判定，结果确定）；仓库变量 `VITE_ENV` 可显式覆盖。已接受的代价：名字含 `dev` 的 fork 会构建 dev 变体，owner 明确接受，以换取 `interface1` / `interface2` / `interface3` 这类拆分带宽的仓库自动落 prod。同步是 `pnpm release-to <target>` 的 fast-forward 推送，`target` 接受 `owner/repo`、完整 git URL、本地路径三种写法；命令内没有 test/prod 词汇，环境分类只发生在 CI（preflight：干净工作区 → CI 绿 → 目标 `main` 是 `HEAD` 的祖先；打印 SHA + 目标 + commit subject 后交互确认，`RELEASE_YES=1` 跳过）。tag 只标里程碑，不是同步的前置条件。发布命令不写任何文件、不打 tag、不 force，**仓内不维护发布日志**；审计痕迹由三仓相同的 commit SHA、Actions run 历史与 Pages deployments 记录承担（见 ADR-0002）。

**NFT 发现与身份枚举。** 每个协议部署只有一个全局 MemberNFT（`ERC721Enumerable`）；环境包给一个种子 core 合约地址，前端读其 `MEMBER_NFT_ADDRESS()` 定位 MemberNFT，再用 `balanceOf(wallet)` + `tokenOfOwnerByIndex(wallet, i)` 枚举该钱包的全部身份。原“已知合约白名单 + 手动填地址兜底”作废；无需事件扫描、后端索引器或合约改动。

**代币切换。** 只切 URL 里的 `?symbol=`：不切链、不清身份、不离开当前页；「当前代币」不持久化（UX Spec §2.1–§2.4）。

**桌面导航。** `<md` 底部标签栏、`≥md` 左侧可折叠竖栏，同一份导航配置自动适配（UX Spec §1.1）。

**生产托管。** GitHub Pages + 可选自定义域名（项目路径与自定义域名分别构建）。与其绑定的是：无自定义响应头、无 rewrite、`index.html` 最多陈旧 600 s、WalletConnect 只能验一个域名、换域名即清空本地存储；若日后要求邮件/社交登录，Pages 缺 COOP 头，必须换能设响应头的静态托管（Cloudflare Pages / Netlify / Vercel），构建已保持中立。见 ADR-0001。

## 假设清单（仍待确认）

| # | 假设 | 影响 | 若不成立 |
| --- | --- | --- | --- |
| 1 | **用户可见角色**由 16 个链上角色收敛为 6 个：访客 / 持币人 / 成员 / 行动参与者 / 验证者 / 发射者 | 决定首页文案、引导路径、帮助页结构；链群 owner 并入“成员 + 管理权限”，推举/投票并入“成员动作”，LP 提供者并入“行动参与者”，distributor / Proposal Target / Executor 不面向用户，群聊角色排 M2，部署与运维不出现在界面 | 若角色必须一一对应，界面将出现 16 套状态与文案，与“非加密原生用户”目标直接冲突 |
| 2 | **群聊**排到 M2 | 决定导航占位项的说明文案 | 若群聊提前，需要成员资格判定、分页读取与消息渲染，M0 工期不成立 |

## 已知技术风险（不是假设，是事实）

- **一条产物只能服务一种托管形态**：项目路径与自定义域名必须分别构建（`--base` 烘进产物）。
- **陈旧外壳无法根治**：Pages 固定 `max-age=600` 且不可改头，只能靠 build id 比对 + `vite:preloadError` → 刷新。
- **本地链不方便手机**：钱包按规范须拒绝 `http:` RPC，且同一 chainId 只能添加一次；移动端联调走测试网或 HTTPS 隧道。
- **地址不可复现**：本地部署地址依赖 nonce 与库链接顺序（历史运行从 nonce 61/75 开始），因此前端必须只消费导出的地址簿。
- **应用内浏览器打不开钱包**（Android 微信/Telegram 等）：平台级限制，只能在连接**之前**给出“用浏览器打开/复制链接/扫码”的横幅。
