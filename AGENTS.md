# AGENTS.md — 接手这个仓库的第一页

> 给 AI 编码代理（DeepSeek Harness / Codex / Cursor / Copilot）和新人看的路由表。
> **规则正文**在 [docs/engineering/frontend-standards.md](docs/engineering/frontend-standards.md)；
> 本文件只回答三件事：必读什么、绝对不许做什么、提交前跑什么。

## 0. 项目一句话

LOVE20BSC 协议前端的 **dev 变体**：纯静态、移动优先、无后端、无索引器、无第三方 API，
钱包只支持注入式（`window.ethereum`），部署在 GitHub Pages。链是本地 anvil（chainId 31337）：
**8545 = 人工链（开发者浏览器钱包连着的）**，**8555 = 自动化链（`pnpm e2e` 自己管）**。
产品负责人是 owner，验收以他的原话为准，不以"看起来更专业"为准。

## 1. 必读顺序（别跳，按这个次序）

| #   | 读什么                                                                                                  | 什么时候必须读                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | [agent-role.md](docs/engineering/agent-role.md) + [lead-playbook.md](docs/engineering/lead-playbook.md) | **你是接手这个项目的总负责人**（拆活 / 派活 / 复核 / 对 owner 汇报）时：前者讲角色边界，后者是时间分配 / 并行拆分 / 链与 flake 的经验手册；只做单一子任务不用读 |
| 1   | 本文件                                                                                                  | 开工前                                                                                                                                                          |
| 2   | [GLOSSARY.md](GLOSSARY.md)                                                                              | **写任何中文文案前**（六条纪律 + 术语表）                                                                                                                       |
| 3   | [m0-ux-spec.md](docs/product/m0-ux-spec.md) §0 设计原则 + §4 横切交互规范                               | 动任何页面/交互前                                                                                                                                               |
| 4   | [frontend-standards.md](docs/engineering/frontend-standards.md)                                         | 按需查章（目录见 §4）                                                                                                                                           |
| 5   | [three-line-verification.md](docs/product/three-line-verification.md)                                   | 改会读写链上数值的页面时（**硬门槛**）                                                                                                                          |
| 6   | [e2e/README.md](e2e/README.md)                                                                          | 跑 e2e 前（8545/8555 硬边界，违反会毁掉人工测试链）                                                                                                             |
| 7   | [docs/adr/](docs/adr/)、[docs/contract-issues/](docs/contract-issues/)                                  | 要改架构、或怀疑合约缺陷时                                                                                                                                      |

## 2. 十条硬规则（违反会被门禁、验收或线上打回）

1. **不加新依赖**，不换库，不引动画库（FLIP 用原生 Web Animations）。首屏包体 gzip 预算
   dev 161 / prod 160 kB，现在 160.8 / 159.4，**余量不到 1 kB**。
2. **不把合约函数映射成界面**：按用户任务组织（拿到身份 / 空投铸造 / 买到币），
   一个任务可以调多个方法；合约有但用户不需要的能力（融合、默认身份、限额）不出现。
3. **所有用户可见中文只能写在** `src/shared/config/copy.ts`（首屏）或
   `src/shared/config/copy-pages.ts`（懒加载页/弹层/占位页）。组件里写中文字面量会被
   `src/architecture.test.ts` 拦下。句子用参数化 copy 函数，禁止 `+` 拼字符串。
4. **未知值绝不渲染 `0`**：加载给骨架，未知给「—」，读失败给「读不到」+ 一个下一步按钮。
   余额、价格、倒计时、可铸造金额都适用。
5. **空投动作叫「空投铸造」**，不叫「领取」；LP 叫「流动性凭证」。术语以 GLOSSARY 为准。
6. **技术词不出现在漏斗里**：身份 / 空投 / 兑换页不出现 gas、approve、allowance、nonce、
   revert、区块、合约等词。确实需要用户决策的参数（如流动性页的滑点）除外，但
   **授权缓冲不许写成「滑点」**。
7. **依赖方向单向**：`app → pages → widgets → features → entities → shared`（+ `domain`/`config` 叶子）。
   ESLint 与架构测试双查。新文件放哪一层见规范 §2.3 判断树。
8. **只有 `src/shared/lib/cache.ts` 能碰 `localStorage`/`sessionStorage`**；key 格式
   `love20:v1:<chainId>:<contractAddress>:<wallet>:<businessKey>`。
9. **不手改生成物**：`src/config/errors.generated.ts`（`pnpm gen:errors`）、
   `src/config/*/network.json`（`pnpm sync:anvil`）、ABI 模块（`pnpm sync:anvil`）、
   `src/config/build-id.generated.ts`。改文案走 `scripts/error-messages.zh.json`。
10. **已知合约缺陷不绕过、不硬编码绕过值**：写进 `docs/contract-issues/`（001–017 已有 17 条），
    页面按「未配置 / 待接入 / 不支持，已停页」如实呈现，禁止编数据。

**另外两条事故级禁令**：自动化永不触碰 **8545** 人工链（见 e2e/README 顶部事故记录）；
`git commit` 前必须让 pre-commit 门禁跑完，不要习惯性 `--no-verify`。

## 3. 提交前必跑

```bash
pnpm check          # format:check + typecheck + lint + 单测（878 条），pre-commit 钩子自动调这个
pnpm build          # 包体门禁（scripts/check-bundle.mjs）+ 404.html + build-id
pnpm e2e            # 全量 Playwright（160 条，约 11 分钟；自己起/复用 8555 链）
```

- 钩子安装一次即可：`pnpm hooks:install`（写 `core.hooksPath=.githooks`，本机生效，不入库）。
  纯文档提交会自动跳过；紧急逃生 `SKIP_PRE_COMMIT=1 git commit …`，但要在提交信息里写明原因。
- **e2e 不在 CI 里**（CI 只跑 typecheck/lint/test/build）。"CI 绿了"**不能**代替跑 e2e。
- 改了会读写链上数值的页面 → 三线校验的四个交付物缺一不可（规范 §7.5）。

## 4. 找规则去哪个文件

| 我要…                                          | 读                                                              |
| ---------------------------------------------- | --------------------------------------------------------------- |
| 判断新文件放哪个目录                           | 规范 §2.3                                                       |
| 知道哪条规则会被机器拦                         | 规范 §3 门禁总表                                                |
| 写按钮/状态/空态/错态文案                      | 规范 §4 + GLOSSARY                                              |
| 处理读失败、loading、refetch                   | 规范 §5（`refetch()` 无视 `enabled:false`，这是踩过的坑）       |
| 加 testid、写动效、用颜色                      | 规范 §6                                                         |
| 决定要不要补测试 / 三线 / e2e                  | 规范 §7 三张判据表                                              |
| 提交、发布、Pages 出事                         | 规范 §9                                                         |
| 遇到「为什么会这样」                           | 规范 §10 已知坑清单（11 条，都有根因和正解）                    |
| 交互细节（授权阶梯、pending 三态、nonce 口径） | m0-ux-spec §4                                                   |
| 派子代理 / 给子代理立规矩                      | [roles/README.md](docs/engineering/roles/README.md)（角色手册） |
| 术语、禁用词                                   | GLOSSARY.md                                                     |

## 5. 收尾自查（在自己回复里逐条打勾，不要只说"已完成"）

- [ ] `pnpm check` 通过（不是"应该能过"）
- [ ] 新增/修改的中文都在 copy 文件里，且查过 GLOSSARY
- [ ] 读失败 / 加载 / 未知三种状态都处理了，没有把未知渲染成 `0`
- [ ] 动过数值页面 → 三线校验文档 + 合约线脚本 + 前端线 spec + 四张截图齐全
- [ ] 动过 UI → `pnpm e2e` 对应 spec 通过；动过共享逻辑 → 全量 e2e
- [ ] 截图归档到 `docs/product/screenshots/`（390×844 / 1280×800，浅色 + 深色）
- [ ] 三线/规范/STATUS 文档已同步；没有留下"文档写 A 代码做 B"
- [ ] **交付附可访问的测试链接**（本地 `http://localhost:5190/<路由>?symbol=…` 或 Pages），并自己 curl 过 200
