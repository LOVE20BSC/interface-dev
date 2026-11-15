# 20261115-1324-cec0-协议第三轮-bump-最新-siblings-重导-abi-pin-lock-全: 协议第三轮 bump：最新 siblings 重导 ABI、pin-lock、全量 e2e 与发布

- **Tags**: core, periphery, ABI, 钉版
- **Status**: doing · 2026-11-15 13:24:51 · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d
- **Created**: 2026-11-15 13:24:27 · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d

<!-- Header lines are maintained by the script, fixed order: Tags → Status → Created → Sealed.
     The `- **Tags**: …` line is inserted at the top by new --tags; omitted when there are no tags
     (category goes to the ledger and history only, never into this document).
     The `- **Sealed**: …` line is appended on close. -->

## Background

owner 2026-11-15 21:22：「我都已经提交」「检查下所有代码库是否是最新的」。核实结果（21:30）：

| 仓 | HEAD | 与 origin/main |
| --- | --- | --- |
| core | `b8950bc` | 一致（本地 0 ahead / 0 behind） |
| periphery | `fc6ed10` | 一致 |
| action | `b05600c` | 一致 |
| group-chat | `fbec477` | 一致 |
| tools / dex / libs / docs / matt-gov / interface-dev-dsh | 各自 HEAD | 一致 |
| **anvil** | `5be5af0` | **本地领先 2（未 push）** |
| **compatibility** | `6866e1c` | **本地领先 1**（与本项目流水线无关，仅记录） |

工作树全部干净。**相对上一轮同步点（core `3f71379` / periphery `172190a` / action `ae781fa` / group-chat `c2cf4f3`）各仓又前进了若干提交**（core 3、periphery 3、action 4、group-chat 3，内容是 deadline modifier 命名对齐、Hub quote/error 对齐、action 校验与事件规范化等），因此：
- 我们提交的 anvil 导出与前端 ABI/manifest **已 stale**（`pnpm abis:check` 会红）；
- 钉版 `siblings.lock` 仍停在更旧的基线（core `8d604a2`…），与当前前端 ABI 不匹配，`PINNED=1` 链不能用于前端 e2e。

**已核实**：anvil live `make build` 在最新 siblings 上**编译通过**（128 files，0 warning），因此本任务不需要再改 anvil 源码，只需重新导出 + 前端重导 + 全量回归 + bump 钉版。

通用纪律：PATH 带 foundry+node24+pnpm；**8545 只在最后重建时用**（过程验证全用 8555/8580/8581）；不 `git reset/checkout/stash/clean`；不跑 `pnpm format`；中文进 copy；**不要 git add/commit**（Lead 统一提交）。

## To Do

1. **重导 anvil 导出**：`cd ../anvil && make stop PORT=8580 && make clean PORT=8580 && make bootstrap PORT=8580`（PINNED=0 live），要求 `ALL CHECKS PASSED`；记 `export/deployments/anvil31337_dev.json` 的 sha256；再 clean 一次确认 sha256 稳定。
   - 把新导出与已提交版本逐键 diff：`addresses`（预期零漂移）、`contracts`/`blockNumber`/`deployBlock`/`params`、`export/abis/*` 的变化清单（函数/事件/错误/字段）。
   - 收尾 `make stop PORT=8580`。
2. **前端重导**：`pnpm sync:anvil` → `pnpm abis:check` 绿；列出前端 ABI 模块的变化。
3. **适配**（typecheck + 语义 + e2e 会暴露的部分）：
   - 若 `LOVE20Hub` 错误名/字段变化 → 更新 `src/features/liquidity-pool/lib/liquidity-errors.ts`（及任何按错误名映射的 copy）。
   - 若 `Stake` 的 deadline modifier / 事件名变化 → 核对 `use-swap-fee`（只读两个 fee ratio）与 approvals spender 列表无影响。
   - 其它 ABI 增删只在前端 `ABI_MODULES` 白名单内适配；不在白名单的（GroupActionExecutor/Mint/Vote 等）只在报告里记录。
4. **重建 live 8555 并跑全量 e2e 两遍**：`cd ../anvil && make stop PORT=8555 && make clean PORT=8555 && make bootstrap PORT=8555` → `E2E_ANVIL_RPC=http://127.0.0.1:8555 pnpm e2e`（两遍都要 0 failed / 0 did not run）；合约线 `VERIFY_RPC=http://127.0.0.1:8555 node scripts/verify/liquidity-contract.mjs` 也要绿。
5. **bump 钉版**（现在 sibling 都干净）：`cd ../anvil && make pin-lock`（记录新 SHA）→ `make unpin && make pin` → `make bootstrap PINNED=1 PORT=8581` 必须 `ALL CHECKS PASSED` 且导出 sha256 与第 1 步 live 完全相同；`make stop PORT=8581`。
6. **门禁**：`pnpm typecheck` / `lint` / `test` / `VITE_ENV=dev pnpm build`（gzip ≤161 kB）。
7. **文档**：`docs/STATUS.md`（e2e 条数与钉版基线）、`docs/product/delivery-2026-11-14.md` 补「附四：2026-11-15 第三轮 bump」、`three-line/liquidity.md` 若错误名/口径变化则同步、`../anvil/siblings.lock` 的 comment 里参考 SHA 说明；worklog `## Process`/`## Conclusion` 写全命令、数值、sha256、diff 结论。
8. **截图**：受影响页面（流动性池优先）重拍；全量 e2e 会顺带重写其它页面的版本水印，属正常。

**最后一步（Lead 会做）**：用新代码重建 8545 人工链、提交两个仓、push、release。你不要碰 8545、不要 commit。

## Next

先 `cd ../anvil && make bootstrap PORT=8580` 重导并 diff 导出；若地址出现漂移立即停下报告（那会牵动前端地址簿与 e2e 硬编码地址，需要 Lead 决策），零漂移则继续前端 `sync:anvil` 与全量 e2e。

## Process

**0. 前置核实（21:25）**：七个仓 HEAD 与 origin/main 一致、工作树全干净（core `b8950bc` / periphery `fc6ed10` / action `b05600c` / group-chat `fbec477` / tools `44d7f54` / dex `31464c0` / libs `65b1106`；anvil `5be5af0`，anvil 本地领先 origin 2 —— 与本任务无关，属 Lead 的 push 范围）。端口纪律：开工时 8545（人工链 pid 67267）与 8555（上轮 e2e 链 pid 48052）在跑；全程只对 8580/8581 执行 make，8555 只按台账重建，**8545 全程未连接、未 stop、未 reset**。先把已提交导出与 `siblings.lock` 快照到 `/tmp/bump3-baseline/` 作为 diff 基线（`export/deployments/anvil31337_dev.json` 基线 sha256 `222b2c8d…d0aa2`）。

**1. live 重导（8580，两次 clean）**
```bash
cd ../anvil && make stop PORT=8580 && make clean PORT=8580 && make bootstrap PORT=8580   # 21:25:43→21:26:37, ALL CHECKS PASSED, exit 0
cd ../anvil && make stop PORT=8580 && make clean PORT=8580 && make bootstrap PORT=8580   # 21:26:50→21:27:43, ALL CHECKS PASSED, exit 0
```
- 两次 run 的 `export/deployments/anvil31337_dev.json` 都是 `222b2c8d2a781b1e81d21c12b79ee47c2cde8b0a0c7c60c81b45c7d8973d0aa2`，与**已提交版本逐字节相同**；`export/abis/*.json` 22 个文件的 sha256 两次 run 完全相同。
- 逐键 diff（`addresses` 36 项 / `params` / `libraries` / `uniswapV2` / `airdropDistributor` / `chainId` / `deployBlock`=34 / `deployer` / `contracts`）：**0 处漂移**，因此没有触发「地址漂移立即停下」的分支。
- **坑 1（为什么字节相同）**：导出里的 `rpcUrl` 不跟随 `PORT`，`script/export.py:461,561` 用 `canonical_rpc_url(params)` 写 profile 的规范端点（8545）。这是设计（端口不影响地址簿），所以「8580 导出与提交版逐字节相同」不证明端口无关；地址/参数无关是由上面 36 个地址 + `deployBlock` 逐键相等单独证明的。
- ABI 变化：22 个导出 ABI 里**只有 `LOVE20Hub` 变** —— `error DeadlineExpired(uint256 blockTimestamp, uint256 deadline)` → `error DeadlineExpired(uint256 deadline)`（entries 50→50，LOVE20Hub 码 17136→17130 bytes，`export/VERIFIED.md` 里的 code size 行同步反映）。核心链改动的另外两个面（`Stake` deadline modifier 命名、group-chat 子模块同步）**不改变 ABI 二进制面**：除 `LOVE20Hub.json` 外 21 个 `export/abis/*.json` 与提交版逐字节相同（`git status` 只显示 `export/abis/LOVE20Hub.json` 与 `export/VERIFIED.md`）。
- `export/VERIFIED.md` 的差异只有 rpc 行（8545→8580）、生成时间戳与账户 ETH 余额（interval mining 出块数不同）：**这份不能提交**，Lead 在 8545 重建时会自然重写。
- 收尾 `make stop PORT=8580`（`lsof` 确认无监听）。

**2. 前端重导与适配**
```bash
pnpm sync:anvil     # 2 file(s) written
pnpm abis:check     # ABIs, manifest, address book and airdrop snapshot match ../anvil/export.
```
- 只有 `src/config/abis/love20-hub.ts`（1265→1260 行，删掉 `DeadlineExpired.blockTimestamp`）与 `manifest.json`；地址簿、空投快照、其余 12 个 ABI 模块全部 `unchanged`。
- manifest 的 `sources.*.head`：core `3f71379`→`b8950bc`、periphery `172190a`→`fc6ed10`、action `f99720a`→`b05600c`、group-chat `c2cf4f3`→`fbec477`、anvil `89937a3`→`5be5af0`；条目数变化只有白名单外的 `ActionTarget` 43→44、`GroupActionExecutor` 171→173（verifier 事件），以及 `LOVE20Hub` 保持 50。
- **适配点 0 处**，依据：`liquidity-errors.ts:36` / `swap-errors.ts:35` 按错误名小写子串（`deadlineexpired` / `expired`）映射 copy，不读 args，而 `DeadlineExpired` 名字未变；全仓按名/args 结构化解码只出现在 `src/features/batch-transfer/lib/batch-errors.ts`（BatchTransfer 的 `failedRecipientIndex`），与 Hub 无关；`use-swap-fee` 只读 Stake 两个 fee ratio，Stake ABI 未变；审批 spender 列表来自地址簿，地址零漂移。
- **坑 2**：`src/config/errors.generated.ts`（选择器→中文）不含 `DeadlineExpired`（新旧都不含），所以本轮没有「选择器失效」回归，但也意味着 Hub/Stake 的 deadline revert 只靠 feature mapper 兜底；该表来源 `../matt-gov/registry/errors.json` 已从 `695a2a18…` 漂到 `7f0151cc…`，且 `pnpm gen:errors` 现在会**报错**：63 个错误名缺中文文案（`ApplicationOverdue`/`VerifierNotElected`/`AirdropAlreadyClaimed`…）。这是独立的 registry 同步任务，不在本轮范围，已写进 delivery 附四 §8。

**3. 重建 live 8555 + 全量 e2e 两遍**
```bash
cd ../anvil && make stop PORT=8555 && make clean PORT=8555 && make bootstrap PORT=8555   # 21:29:19→21:30:12, ALL CHECKS PASSED
E2E_ANVIL_RPC=http://127.0.0.1:8555 pnpm e2e   # 第 1 遍 21:30:16→21:38:46: 130 passed (8.5m), exit 0
E2E_ANVIL_RPC=http://127.0.0.1:8555 pnpm e2e   # 第 2 遍 21:38:54→21:47:01: 130 passed (8.1m), exit 0
```
两遍都是 **0 failed / 0 did not run**；重建后的 8555 导出 sha256 仍 `222b2c8d…`。合约线：`VERIFY_RPC=http://127.0.0.1:8555 node scripts/verify/liquidity-contract.mjs` → **45/45 PASS**，exit 0（A/B/C/D/E/G 数值与上轮逐字相同）。

**4. bump 钉版**
- bump 前 `make pin-status`：lock/pinned 还是旧的 core `8d604a2` / periphery `3b825a5` / action `66e2d65` / group-chat `45f1966`，live 已是新的。
- `make pin-lock` → 只写 4 个 sha（core `b8950bcc…`、periphery `fc6ed10e…`、action `b05600ca…`、group-chat `fbec4777…`），libs `65b1106…` / dex `31464c0…` / tools `44d7f54…` 不变；`comment` / `schemaVersion` / 仓顺序 / `url` 与基线 JSON 逐字相同（relock 只写机器字段，comment 本来就没有硬编码 SHA，无需手改）。
- `make unpin && make pin` → `make pin-status` 七个仓全部 `pinned`（lock = pinned = live），`make unpin` 明确打印 `sibling working trees unchanged (git status still clean)`；复核七个兄弟仓 `git status --porcelain` 均为 0。
- `make bootstrap PINNED=1 PORT=8581` → **ALL CHECKS PASSED**（21:48:53→21:49:53），导出 sha256 `222b2c8d…d0aa2` 与 live 完全相同，22 个 `export/abis/*.json` 逐字节相同 → 钉版链与 live 链对前端等价。随后 `make stop PORT=8581`（`lsof` 确认无监听）。
- 额外证明：对 PINNED 导出再跑 `pnpm sync:anvil` → 13 个 ABI 模块 + 地址簿 + 空投**全部 `unchanged`**（只有 manifest `exportedAt` 更新），`pnpm abis:check` 仍绿。

**5. 门禁**（全部 exit 0）
`pnpm typecheck` 0 error；`pnpm lint` 无输出；`pnpm test` **97 files / 630 tests passed**（78.74s）；`VITE_ENV=dev pnpm build` 首屏 gzip **160.8 kB ≤ 161 kB**、`wallet SDK check: injected-only`。

**6. 截图**：两遍 e2e 重写 67 张（总量 147，0 新增/0 删除）。抽检 `liquidity-add-light-desktop.png` / `liquidity-mine-dark-desktop.png` / `approvals-list-light-desktop.png`：PIL 逐像素 diff 的 bbox 都是 `(72,713)-(120,723)`，即左下角 48×10 px 的版本水印，页面内容零差异；流动性池相关 12 张随全量 e2e 重拍，本轮文案无变化。

**7. 文档**：`docs/STATUS.md`（E2E 行补第三轮 130/130 两遍 + 合约线 45/45；§3.3 钉版条目补第三轮 lock 新旧 SHA 与 PINNED=1 结论；截图总数 135→147 实测更新）、`docs/product/delivery-2026-11-14.md` 新增「附四」（8 节，含 sha256/逐键 diff/ABI 变化/两遍 e2e/lock 表/门禁/截图/遗留）、`docs/product/three-line/liquidity.md` 补第三轮说明（错误名与口径未变，合约线 45/45）。

**坑 3（工具）**：`siblings.lock` 不是 `.json` 后缀，`node -e "require('./siblings.lock')"` 会 `SyntaxError`（误判「comment 相同」）。改用 `JSON.parse(readFileSync(...))` 后确认 comment 真正相同。

## Conclusion

**做完了**（第三轮 bump 全链条，未提交任何 git 改动，等 Lead 统一 commit）：
1. **重导**：最新 siblings（core `b8950bc` / periphery `fc6ed10` / action `b05600c` / group-chat `fbec477` / tools `44d7f54` / dex `31464c0` / libs `65b1106`）在 8580 上两次 clean bootstrap 均 `ALL CHECKS PASSED`，导出 sha256 `222b2c8d2a781b1e81d21c12b79ee47c2cde8b0a0c7c60c81b45c7d8973d0aa2` 两次相同、且与已提交版本逐字节相同；**地址/参数/块号 0 漂移**（36 个地址逐键相等）。
2. **ABI 变化只有一处**：`LOVE20Hub.DeadlineExpired(uint256 blockTimestamp, uint256 deadline)` → `DeadlineExpired(uint256 deadline)`（50 entries，码 17136→17130 bytes）；其余 21 个导出 ABI 逐字节未变（含 `Stake`、`GroupChat`）。白名单外的 `ActionTarget` 43→44、`GroupActionExecutor` 171→173 只在 manifest/导出层记录。
3. **前端**：`pnpm sync:anvil` 只改 `love20-hub.ts` + `manifest.json`（地址簿/空投/12 个 ABI 模块 unchanged），`pnpm abis:check` 绿；**代码适配 0 处**（错误名未变、映射按名子串、无结构化解码消费 Hub 错误）。
4. **回归**：重建 8555 → 全量 e2e **两遍 130/130，0 failed / 0 did not run，exit 0**（8.5m / 8.1m）；合约线 `liquidity-contract.mjs` **45/45 PASS**。
5. **钉版 bump**：`siblings.lock` 4 个 sha 更新（core `b8950bc` / periphery `fc6ed10` / action `b05600c` / group-chat `fbec477`，libs/dex/tools 不变），comment/schema/url 保留；`unpin+pin` 后 lock=pinned=live；`PINNED=1 PORT=8581` `ALL CHECKS PASSED`，导出 sha256 与 live **逐字节相同**、ABI 逐字节相同；对 PINNED 导出重跑 `sync:anvil` 全部 `unchanged`。
6. **门禁全绿**：typecheck 0 error / lint 无输出 / test 97 files 630 tests / `VITE_ENV=dev build` 首屏 gzip 160.8 kB ≤ 161 kB。
7. **文档**：STATUS（e2e 条数 + 钉版基线 + 截图 147）、delivery 附四、three-line/liquidity 第三轮说明、本 worklog。

**留给 Lead / 下一步**：
- **提交前必须用新代码 clean bootstrap 8545 一次**，把 `../anvil/export/VERIFIED.md` 重生成回 8545 口径（当前那份来自 8581 PINNED run，rpc 行写 `http://127.0.0.1:8581`，端口/时间戳/ETH 余额都随链走）。`export/deployments/anvil31337_dev.json` 与 `export/abis/*` 与端口无关，可直接提交。
- 两个仓的未提交改动：`../anvil` 3 个文件（`export/abis/LOVE20Hub.json`、`export/VERIFIED.md`、`siblings.lock`）；本仓 `src/config/abis/{love20-hub.ts,manifest.json}`、67 张截图（仅版本水印差异）、`docs/STATUS.md`、`docs/product/delivery-2026-11-14.md`、`docs/product/three-line/liquidity.md`、本 worklog。**按纪律未 `git add`**。
- 独立遗留（不在本轮范围）：错误选择器目录落后 registry（190 vs 248 个选择器；`pnpm gen:errors` 会因 63 个错误名缺中文文案报错退出），`DeadlineExpired` 新旧都不在该目录里，Hub/Stake deadline revert 目前只由 `describeSwapError` / `describeLiquidityError` 兜底。需要单独任务先补 63 条中文文案再重生成。
- 端口状态：8545 未动（人工链仍在）；8555 保留运行供 e2e 复用（套件设计如此，`pnpm e2e` 会校验 build id 后复用）；8580 / 8581 已 stop。`../anvil` 本地领先 origin 2 个提交（非本任务产生），由 Lead push。

## Execution Log

<!-- Maintained by the script: appended by new / claim / set / release / log / close. Do not edit.
     Backfill with: progress log --id 20261115-1324-cec0-协议第三轮-bump-最新-siblings-重导-abi-pin-lock-全 --note "...". -->
- 2026-11-15 13:24:27 · new · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d · created
- 2026-11-15 13:24:51 · claim · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d · claimed → doing
