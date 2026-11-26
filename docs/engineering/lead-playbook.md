# 前端负责人 agent 指导手册（经验沉淀）

> **适用**：接手这个项目的 AI 总负责人（lead）。
> **和别的文档怎么分工**：角色边界看 [agent-role.md](agent-role.md)；硬规则与门禁看 [frontend-standards.md](frontend-standards.md)；本文件只沉淀**操作经验**——怎么把一轮改版做得更快、更稳，以及哪里会翻车。
> **维护规则**：每轮实战结束，只把新出现的「时间黑洞 / 翻车 / 复用技巧」补进对应章节，不写流水账；过时条目直接改写或删除。

## 0. 单 agent 时的链实例（owner 2026-11-19）

只有 lead 一个 agent 开发时，anvil **常驻实例只保留 8545 一条**：8555 只在跑 `pnpm e2e` 期间临时启动（`pnpm e2e` 会 ensure/bootstrap），跑完 `make -C ../anvil stop PORT=8555` 停掉；8566 只在跑合约线脚本时临时起。多条空闲链在长时间 interval mining 下更容易 wedge，也浪费机器。


**验证节奏（owner 2026-11-20）**：细节改动用「现有 8555 + 现有 preview + 相关 spec」，全量 e2e 只留给共享逻辑/链上读写/harness/交付前。默认 `pnpm e2e` 已复用健康链与匹配 build id 的 preview；慢的是手动 `E2E_REUSE_PREVIEW=0`、`e2e:reset-chain`、每轮停链。连续改→跑同一轮不要停链；规范见 frontend-standards §7.12，命令见 e2e/README「快速回归」。

- **bootstrap 的 python 依赖**（2026-11-20 踩坑）：本机 `/usr/local/bin/python3` 是 3.6（跑 `--version` 都被 macOS `Killed: 9`），而 `make -C ../anvil bootstrap` 会调 `python3` 生成空投快照。用 `PATH="/usr/bin:$PATH"` 让它拿到系统 3.9 即可；这不是链/脚本问题，别去 reset 链。

### 0.1 链与环境事故清单（2026-11-26/27 实测，都是真的翻过车）

- **端口归属别猜，用 `lsof -nP -iTCP:<port> -sTCP:LISTEN`**：本机上 8555 的 anvil 和 8545 的 anvil 谁是谁，`ps aux` 的顺序给不出答案；凭直觉猜会把两条链搞反（我差点 kill 掉 owner 的手测链）。`make -C ../anvil stop PORT=…` 永远带上 PORT。
- **全量 e2e 期间不要并行跑 `pnpm check`/`tsc`/`build`**：机器只剩 ~240 MB 可用时 preview(4173) 被挤死，症状是 `net::ERR_CONNECTION_REFUSED at 127.0.0.1:4173` + 「7 passed / 144 did not run」。看起来像代码坏了，其实是资源。
- **8555 在两次 `pnpm e2e` 之间不一定是干净基线**：手工 spec / 调试脚本发过交易后，下一轮的预余额断言会从「10,000」变成「9,997.29」。**跑全量前先 `make -C ../anvil clean PORT=8555 && make -C ../anvil bootstrap PORT=8555`**，或至少确认上一轮结束在快照点。
- **地址「对上」不等于代码对**：部署地址由 deployer nonce 决定，pinned 与 live 都从 nonce 0 部署时**地址可能逐位相同、合约代码却不同**（`launchToken(bytes[])` vs `launchToken(bytes)`）。判据是 `make -C ../anvil pin-status` 的 pinned vs live 列，不是地址。
- **re-pin 流程**（live 前进之后）：`make -C ../anvil pin-lock` → `unpin` → `pin` → `bootstrap PORT=8555 PINNED=1`。`pin-lock` 要求 sibling 工作树干净；Python 的 `__pycache__/` 也会被算成脏（把 `__pycache__/` 加进对应仓的 `.gitignore`，或临时移走）。
- **anvil 1.8.1 会在单次 `anvil_mine` 连挖 ~3,100 块时 wedge**（进程在 LISTEN、HTTP 全超时）。症状是「收据 60 秒没出现」，容易被误判成页面 bug。分块 240 块推、并加链健康探测快速失败。
- **重建 8545 人工链**（只有 owner 明确授权才做）：`make -C ../anvil stop PORT=8545` → `clean PORT=8545` → `bootstrap PORT=8545`。`clean` 会清共享的 `out/cache/broadcast/export`，但**保留其他端口的 `.anvil/<port>/`**；地址确定性复现，前端地址簿不需要改。
- **e2e 失败先要证据，不要先改代码**：`--trace on` 拿 DOM 快照 + network，再用临时 `console.log` 在适配器/core 两端加探针（打完立刻 `cp` 备份还原），最后拿**链上回执 status** 与页面状态对账。2026-11-26 的 P0（成功交易被当成回滚）就是这么定位的：回执 0x1、页面无收据、`onConfirmed` 收到 `reverted=true`。

### 0.2 e2e 提速的真实账（2026-11-27 剖面实测，别再按直觉定目标）

带 `cast` wrapper 跑全量（174/174，wall 14.0 分钟）得到的真实构成：

| 项 | 实测 | 结论 |
| --- | --- | --- |
| 用例内执行 | **797 s（95%）** | 时间几乎全在「真实写链 + 页面等待」里 |
| 构建 + preview 复用 + 文件级夹具 | 43 s（5%） | 没有「冷 build」可省（preview 已复用） |
| `cast` 子进程 spawn | **174 次**，每次 10–25 ms | 全部换进程内 viem 只省 **~3 秒（0.3%）** |

耗时 top 文件（用例内秒）：`gov-core-numbers` 181 / `liquidity-numbers` 91 / `gov-stake-numbers` 78 / `approvals-numbers` 64 / `batch-transfer-numbers` 60。

**所以**：想显著变快，只有语义级手段——① automine 基线（每笔省 ~1 s，估 1–1.5 分钟）；② 多链并行（省一半以上，代价是快照语义与内存）；③ 合并/删用例（减覆盖）。**都不是「测试基建优化」，要 owner 拍**。安全档（条件等待、去重复 RPC、夹具去重）上限约 30–60 秒。

**教训**：定「16→12 分钟」这种目标前先做剖面。我按「144 处 cast 子进程」估的提速空间与实际差了 20 倍——估算口径错（运行期次数 vs 源码表达式）时会得出完全错误的优先级。

## 1. 一句话结论

**慢不在写代码，在验证基础设施。** 2026-11-18 两轮同规模改版的实测：串行做 135 分钟 → 拆并行 + 去掉重复验证后约 55 分钟。下面每一条都是为了守住这个数字。

## 2. 时间去哪了（实测基线，2026-11-18）

| 项目 | 串行一轮 | 说明 |
| --- | --- | --- |
| 全量 e2e | **40.8 分钟** | 跑了 3 次：16.3m（链假死报废）+ 12.7m（1 条动画 flake）+ 11.8m（全绿） |
| 目标 spec（治理域 8 条） | ~12 分钟 | 8555 跑 4 次 + 8566 跑 2 次，每次 2–3m |
| 失败单点复跑 | ~4 分钟 | 2 次 |
| anvil 重载 | ~10 分钟 | 5 次手动 kill/load-state/重设挖矿 |
| `pnpm check` | ~7 分钟 | 手动 5 次；而 pre-commit 本来还会跑一次 |
| build | ~3 分钟 | prod/dev/e2e 各一次 |
| 写代码 | ~20 分钟 | 真正动手并不慢 |
| 读码/核对截图 | ~16 分钟 | 必要成本 |
| 文档 | ~14 分钟 | |
| 提交+推送 | ~7 分钟 | 钩子会再跑一遍 check |

**记忆点**：一轮里「全量 e2e」只应该有**一次**，且必须跑在**健康的链**上。2026-11-19 按这套做法实测：全量一次 **160/160（11.0m）**、治理 spec 两链 8/8（4.0m / 1.9m），整轮约 55 分钟。

## 3. 每轮的标准时间轴（目标 50–60 分钟）

| 时间 | 谁 | 做什么 |
| --- | --- | --- |
| 0–10m | lead | 读需求 + 读现状代码，定「改哪几个文件、哪些是共享/入口文件」 |
| 10–25m | lead | 先写死契约（testid / 文案 / href / 数据结构），再写核心代码；`tsc` + `eslint` 自查 |
| 15–40m | 3 个子代理并行 | ① e2e：改 spec + 跑目标 spec；② docs：改三份文档；③ unit：改受影响单测 |
| 40–52m | lead | 契约复核 + **一次**全量 e2e（可后台跑）+ 看截图 |
| 52–58m | lead | 清理截图 churn、回填文档数字、commit（pre-commit 跑 check）、push、**确认测试链接可访问**（`pnpm dev --port 5190` → 相关路由） |

可压缩点：3 个子代理的活儿与 lead 写码完全重叠；全量 e2e 用后台跑，和「看截图/整理文档」重叠。

## 4. 派活（并行拆分）模板

- **先选角色**：子代理角色手册在 [roles/](roles/README.md)（`e2e-runner` / `unit-tester` / `docs-writer` / `chain-operator` / `reviewer`）。派活时把「角色手册路径 + 本轮契约 + 写作用域 + 验证命令 + 回报格式」贴进 spawn prompt，子代理开工先读手册，注意事项不用手抄。
- **默认三路**：e2e（改 spec + 跑目标链）、docs（三份文档）、unit（单测）。三者写作用域互不重叠。
- **契约先行**：派活前把 testid / 文案 / href / 数据来源写死在 prompt 里；子代理**不许改 `src/`**，发现「契约 vs 实现」不符只回报。
- **写作用域表**：e2e agent 只碰 `e2e/*.spec.ts`；docs agent 只碰指定的 3 份文档；unit agent 只碰 1 个 test 文件；lead 独占 `src/` 与提交。
- **并发禁忌（踩过）**：同一时刻只允许一个进程跑会写 `src/config/build-id.generated.ts` 的命令（`pnpm typecheck` / `test` / `build` / `e2e` 都会跑 `gen-build-id`）。并发会让 build-id 互相覆盖，preview 复用校验误判、构建 hash 不一致。子代理跑 e2e 时，lead 不要跑 typecheck/build，也不要改 `src/`。
- **子代理回报格式**：改了哪些断言/段落（分点）、命令 + 通过数 + 耗时 + EXIT、发现的契约差异（若有）。不要只说「已完成」。

## 5. 验证策略（省时间的关键）

- **迭代期**：只跑受影响文件——`npx vitest run <file>`、`npx eslint <paths>`；**不跑** `pnpm check`、**不跑** `pnpm build`。
- **收尾**：目标 e2e spec（2–3m）；改到共享文件（`copy.ts`、`shared/`、`app/`）或改文案/包体相关才需要**一次**全量（约 12m）；`pnpm check` 交给 pre-commit 那一次。
- **`E2E_REUSE_PREVIEW=1`**：迭代期复用 preview（配置会按源码 hash 校验，源码变了自动重建）；首跑与最终跑用 `0`。
- **`E2E_RETRIES=1`**：收尾跑全量时给已知动画 flake 一次自愈机会（本地默认 0、CI 默认 2）；仍失败就是真问题，别再加次数。
- **flake 清单（已知）**：`e2e/home-my-nft.spec.ts` 的 FLIP 动画采样断言（`current <= previous + 1`）偶发 1–2px 抖动。处理：单点复跑；复跑绿就记为 flake，**不要**改实现去迁就。
- **全量失败先分诊**：看错误是 `operation timed out` / `failed to confirm chain ID`（链假死，不是代码）还是断言不符（代码/测试问题）。链假死先 doctor，再重跑，别急着改代码。

## 6. 链管理（anvil 假死是常态）

- **症状**：端口还 LISTEN，但 HTTP 全超时；cast 报 `failed to confirm chain ID from fork endpoint`；e2e 中途整轮报废。长时间 interval mining 或一次 `anvil_mine` 推几千块之后出现（8555/8566 都复现过）。
- **工具**：`node scripts/e2e-chain-doctor.mjs`（2026-11-18 加）
  - 默认检查并自愈 8555：探测 RPC → kill 假活进程 → `anvil --load-state <state>` → 恢复 `automine=false` + `intervalMining=1`；
  - `--check` 只探测（CI/脚本用）；`--port 8566` 换链；`--state <path>` 换快照；硬拒绝 8545。
- **本机快照**：`/tmp/state-8566-canonical.json`（8555/8566 共用，owner 机器上的本地产物，不在仓库里）；丢失时 `pnpm e2e:reset-chain` 重新 bootstrap（需要 `../anvil` 仓库）。
- **全量前先 doctor**，且不要在链已长时间高频出块后直接开全量。
- **挖矿模式**必须是 `automine=false` + `intervalMining=1`；`e2e/chain.ts#restoreMining()` 会回读断言，模式不对会让后续 spec 全超时。
- 铁律：**自动化永不碰 8545 人工链**（只读也不碰）。

## 7. 截图与交付物

- 全量 e2e 会重写上百张截图（余额、区块号、时序都会变），但**只有本领域截图应入库**。清理三步（跑完全量后做）：
  ```bash
  mkdir -p /tmp/domain-shots && rm -f /tmp/domain-shots/*.png
  cp docs/product/screenshots/<本领域前缀>-*.png /tmp/domain-shots/
  git checkout -- docs/product/screenshots
  cp /tmp/domain-shots/*.png docs/product/screenshots/
  ```
- 四档截图 = 390×844 / 1280×800 × 浅色/深色；新增一个截图状态 = +4 张，记得同步文档里的张数（24 → 28 …）。
- 截图先自己 `read_image` 看一遍：数字换行、链接换行、深色对比度这三类问题最常出现。
- 领域截图贡献者：`e2e` 里对应的 spec 自己 `page.screenshot`，不要手工截图。

## 8. 包体与首屏

- 预算：**prod 160 / dev 161 kB gzip**（dev 有 +1 kB 部署数据豁免）；只有 `pnpm build`（`scripts/check-bundle.mjs`）能量准。
- 只有 `index.html` 直接加载/`modulepreload` 的 JS 计入首屏；懒加载 chunk 不计入，但**别把 features 拉进 app shell / home**。
- `copy.ts` 是首屏文案，`copy-pages.ts` 是懒加载页文案；往首屏加字之前先量 build。
- 新页面一律走 `src/app/router/lazy-routes.ts`。

## 9. 文档回填

- 派 docs agent 写正文，**具体耗时/通过数留占位**，跑完由 lead 回填（避免「跑一次改一次」）。
- 三线数值页：理论线先于实现 → 合约线脚本 → 前端线 spec + 四档截图 → §3 对照表；数值口径没变时文档只加「变更记录」，不改理论值。
- 每轮收尾检查三处一致性：**UX spec 描述 ↔ 页面实际 testid/文案 ↔ e2e 断言**。

## 10. 翻车清单（持续补充）

| 坑 | 现象 | 正解 |
| --- | --- | --- |
| anvil 假死 | LISTEN 但 HTTP 超时，全量报废 | 先 `e2e-chain-doctor.mjs`，再跑 |
| 全量 e2e 重复跑 | 一轮 40+ 分钟全耗在测试 | 目标 spec 迭代 + 收尾一次全量 |
| build-id 并发写 | preview 复用误判、build hash 不一致 | 同一时刻只跑一个 build/test/e2e 进程 |
| 截图 churn | 全量后几十张无关截图变脏 | 保存本领域 → `git checkout` 其余 → 恢复 |
| 动画 flake | `home-my-nft` FLIP 采样偶发失败 | 单点复跑证明是 flake，不改实现 |
| 子代理同改 src | 互相覆盖、契约漂移 | 契约先行 + 写作用域表，子代理不碰 src |
| 组件里写中文 | `architecture.test.ts` 拦下 | 中文只进 `copy.ts` / `copy-pages.ts` |
| 未知值渲染 0 | 违反硬规则 4 | 未知给「—」，读失败给「读不到 + 重试」 |
| 手改生成物 | errors / network / ABI / build-id 漂移 | 只走 `pnpm gen:errors` / `sync:anvil` |
| `--no-verify` | 绕过门禁，不可信 | 禁止；紧急情况必须写明原因 |
| 交付没给测试链接 | owner 要自己找入口，等于没交付 | 每次交付附 `http://localhost:5190/<路由>?symbol=…`（或 Pages 链接）并先自己 curl 一次 200 |

## 11. 汇报模板（固定四段）

1. **做了什么**：按 owner 的原始要求逐条对应，不复述他的话；
2. **证据**：**可访问的测试链接**（必须，见 §13）+ 命令 + 通过数/耗时/EXIT + 包体数字 + 截图路径（表格优先）；
3. **没做什么 + 原因**：例如「8566 未复跑，因为…」；
4. **需要拍板的事**：一次只问真正需要决策的（合 main、发 test、范围取舍）。

## 12. 交付的定义（owner 2026-11-19 01:35）

**每次交付都必须带一个可访问的测试链接**，否则视为未交付。标准做法：

```bash
# 1) 起/确认本地 dev server（默认 5190，服务于当前 worktree、指向 8545 人工链）
lsof -nP -iTCP:5190 -sTCP:LISTEN || (nohup pnpm dev --port 5190 > /tmp/vite-5190.log 2>&1 &)
# 2) 自己先验证可访问（HTTP 200 + 路由存在）
curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:5190/gov?symbol=TestLOVE20"
```

- 链接要给到**具体路由**（如 `/gov?symbol=TestLOVE20`、`/me?symbol=TestLOVE20`），不要只给首页；
- 已发布变体给 Pages 链接，并说明对应 build id / commit；
- 本地 dev server 不碰链：它只是让 owner 用自己的钱包去连 8545 人工链手测；
- 交付报告里链接放在「证据」第一条，owner 可以直接点。

## 13. 本文件怎么维护

- 每轮结束问自己三句：**哪里最慢？哪里最险？哪个动作下次可以省掉？** 有答案就改对应章节。
- 角色/边界问题 → 改 [agent-role.md](agent-role.md)；规则/门禁 → 改 [frontend-standards.md](frontend-standards.md)；只有「经验」留在这里，避免三处漂移。
