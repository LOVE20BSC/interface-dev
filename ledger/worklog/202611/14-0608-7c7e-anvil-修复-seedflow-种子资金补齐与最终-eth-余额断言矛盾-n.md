# 20261114-0608-7c7e-anvil-修复-seedflow-种子资金补齐与最终-eth-余额断言矛盾-n: anvil·修复 SeedFlow 种子资金补齐与最终 ETH 余额断言矛盾（N-01）

- **Tags**: anvil, SeedFlow, 种子资金
- **Status**: doing · 2026-11-14 06:08:39 · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d
- **Created**: 2026-11-14 06:08:01 · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d

<!-- Header lines are maintained by the script, fixed order: Tags → Status → Created → Sealed.
     The `- **Tags**: …` line is inserted at the top by new --tags; omitted when there are no tags
     (category goes to the ledger and history only, never into this document).
     The `- **Sealed**: …` line is appended on close. -->

## Background

外部审计报告 N-01（P2，owner 2026-11-14 转来，要求安排修复）：

- 位置：`../anvil/script/SeedFlow.s.sol:142`（补齐到 `SEED_ETH_PER_ACCOUNT`）、`:236`（liquidity member 花费原生币质押）、`:276`（最终断言每个种子账户余额 ≥ `SEED_ETH_PER_ACCOUNT`）。
- 问题：把余额不足的账户补到 `ethPerAccount`，随后该成员又支付 `liquidityParentTokenAmount`（默认 1 ETH）包装成 WETH 并质押，最后还要求账户仍 ≥ `ethPerAccount` —— 三者互斥。
- 触发条件：仅在账户初始余额低于 `SEED_ETH_PER_ACCOUNT`（如 `ANVIL_BALANCE` 调低）时触发；默认 anvil 每个账户 10000 ETH，`_fundEth` 是 no-op，所以当前 bootstrap 一直绿，属于**潜伏缺陷**。
- 附加事实（审计未提，需一并核对）：`../anvil/script/verify.sh:350` 也对每个种子账户断言 `balance >= SEED_ETH_PER_ACCOUNT`，与 SeedFlow 的最终断言同源同病；修复后两处必须仍然成立。
- 语义（`params/anvil31337_dev/seed.params:28` 注释）：`SEED_ETH_PER_ACCOUNT` 是「给每个种子账户的启动资金，方便开发者在任何账户上发交易」，**不是最终保留金**。

结论：按语义修「补齐金额的计算」，而不是删断言——`_fundEth` 对 liquidity member 需要额外预支 `liquidityParentTokenAmount` + 一笔明确写死的 gas allowance，使「补到 X」与「花掉质押额和 gas 后仍 ≥ X」自洽；默认 profile 下仍应为 no-op（导出哈希/地址不变）。

通用要求：只改 `../anvil`（本任务是 anvil 仓任务，前端仓只提交台账/文档）；不碰 8545 人工链，验证用专用端口（建议 `PORT=8580`，用完 `make stop PORT=8580`）；不 `git reset/checkout/stash/clean`，不 `git add -A`；中文 commit。

## To Do

1. **先复现**：`cd ../anvil && ANVIL_BALANCE=0 make bootstrap PORT=8580`（或 `2e18`），确认脚本在 seed 阶段失败（模拟或最终断言），把失败日志与行号记进 worklog。若 `make` 不传 `ANVIL_BALANCE`，先看 `params/anvil31337_dev/network.params` 与 `script/lib/params.sh` 的优先级，用导出的环境变量覆盖。
2. **修补齐逻辑**（`SeedFlow._fundEth`）：liquidity member 的补齐目标 = `SEED_ETH_PER_ACCOUNT + SEED_LIQUIDITY_PARENT_TOKEN_AMOUNT + GAS_ALLOWANCE`；其它账户仍是 `SEED_ETH_PER_ACCOUNT`。`GAS_ALLOWANCE` 用命名常量（建议 `0.01 ether`）并注释说明它覆盖该成员的 claim / mint / approve / wrap / stake 等交易 gas，若实测不够就调大并在注释写明依据。
3. **保留最终断言**（`:276` 与 `verify.sh:350` 都不删）：修完后两者在低余额启动下也必须成立；确认 `verify.sh` 无需改断言逻辑（若需要改，只允许改注释/期望值说明，不能放松）。
4. **语义文档同步**：`params/anvil31337_dev/seed.params` 中 `SEED_ETH_PER_ACCOUNT` 注释写明「启动资金；liquidity member 额外预支质押额与 gas」；`SeedFlow.s.sol` 头注释第 1 条同步；`../anvil/README.md` 的 seed 行（约 line 301）同步。
5. **回归**：
   a. 低余额（0 或 2e18）bootstrap 全绿（`ALL CHECKS PASSED`）——证明修复生效；
   b. 默认 profile 在**另一端口** clean bootstrap 两次，导出 `deployments/*.json` 的 sha256 两次一致，且与当前提交版本逐键相同（既有地址/块号/哈希都不变）——证明修复对默认链零影响；
   c. 前端仓 `pnpm abis:check` 仍绿（导出未变）。
6. 如果能把「补齐目标计算」抽成纯函数，加最小 `forge test`（`../anvil/test/` 目前没有测试，可新建一个只测纯函数的 `SeedFlowFunding.t.sol`；若引入测试需要改 foundry 配置，先评估再决定，不强制）。
7. 提交 `../anvil` 中文 commit；在 worklog `## Process`/`## Conclusion` 写：复现日志、改动 diff 摘要、两次导出哈希、默认 profile 不变的证据、遗留风险。

## To Do 之外：不要做的事
- 不要顺手改 seed 的其它金额/参数（质押额、代币量等），不要动部署顺序，不要为了「让断言过」放宽任何 require 的阈值。

## Next

先读 `../anvil/script/SeedFlow.s.sol` 的 `_fundEth` / `_stakeLiquidity` / `_assertSeedState` 与 `script/verify.sh:340-360`，再读 `params/anvil31337_dev/seed.params`、`params/anvil31337_dev/network.params`、`script/lib/params.sh`（确认 `ANVIL_BALANCE` 覆盖方式），然后按 `ANVIL_BALANCE=0` 复现。

## Process

### 0. 先纠正两个会让「复现」跑偏的环境事实

1. **`ANVIL_BALANCE` 不能用环境变量覆盖**。`script/lib/params.sh` 的 `PARAMS_PRESERVE=(ANVIL_HOST ANVIL_PORT CHAIN_ID)`，`params_load` 对其它键一律用文件值覆盖环境值。实测 `ANVIL_BALANCE=0 bash -c 'source script/lib/params.sh; ANVIL_BALANCE=0; params_load params/anvil31337_dev/network.params; echo $ANVIL_BALANCE'` → `10000`。所以复现只能临时改 `params/anvil31337_dev/network.params`（或另建 profile），本次改后已还原（md5 与备份一致 `d988d67845151c5ace06de04b7e4801e`）。
2. **anvil 的 `--balance` 按 ETH 解析，不是 wei**。实测 `anvil --balance 150` → `balanceOf` 150e18 wei；`--balance 0` → 0。因此台账里建议的 `ANVIL_BALANCE=2e18` 经 `params_expand_value` 展开成 `2000000000000000000` 后被 anvil 当成 **2e18 ETH/账户**（等于无限）：修复前跑 `make bootstrap PORT=8580` 就是 `ALL CHECKS PASSED` —— 它不能作为低余额证据。`ANVIL_BALANCE=0` 则连部署的 gas 都付不起：`make libraries` 报 `Insufficient funds for gas * price + value`（`Estimated amount required: 1.735704647012672679 ETH`），根本到不了 seed 阶段。
3. 补充量级：部署阶段本身消耗 ≈7.8 ETH（29 笔 tx，广播 gas price ≈99 gwei）。低余额场景必须同时满足「deployer 付得起部署」和「种子账户余额 < 目标」。

### 1. 复现（修复前，`ANVIL_BALANCE=150` = 150 ETH/账户，其余 shipped 参数）

`make bootstrap PORT=8580` 在 seed 阶段失败，证据：

- `.anvil/8580/seed.log:615` → `Error: script failed: seeded account is under-funded`
- `.anvil/8580/seed.log:587` → trace `└─ ← [Revert] seeded account is under-funded`
- 失败点即 `script/SeedFlow.s.sol:282`（`_assertSeedState` 的 `entries[i].account.balance >= params.ethPerAccount`）

数值链：deploy 后 deployer（= 种子账户 0 = liquidity member，均为 anvil index 0）余额
`142.184608471394744402 ETH`；`_fundEth` 没有任何 top-up（其余账户 150 ETH ≥ 100）；
`_stakeLiquidity` 把 100 ETH 包成 WETH 并质押（这笔 ETH 永久离开钱包）；最后账户 0 只剩
≈42.18 ETH < 100 → 断言失败。注意 forge script 先本地模拟、成功才广播，所以这条链上停在
「仅部署」状态。

同源的 `script/verify.sh:350` 是同一个谓词（`balance >= SEED_ETH_PER_ACCOUNT`）。因为这次 seed
没落链，无法直接看到它红；修复后低余额跑 `make verify` 该行 PASS（见 §3a）。

### 2. 修复（../anvil `f8d6e99`）

- 新增纯函数 `SeedFlow.seedEthTarget(ethPerAccount, liquidityParentTokenAmount, liquidityMemberIndex, index)`：
  liquidity member 的目标 = `SEED_ETH_PER_ACCOUNT + SEED_LIQUIDITY_PARENT_TOKEN_AMOUNT + SEED_GAS_ALLOWANCE`，其它账户仍为 `SEED_ETH_PER_ACCOUNT`；`_fundEth` 改用它算 top-up。
- `SEED_GAS_ALLOWANCE = 0.2 ether`（`public constant`，便于测试与复用）：覆盖该账户 seed 期间自己签名的 7 笔交易（claim / approve / mint / approve token / approve WETH / deposit / stakeLiquidity）。实测 **1,335,352 gas**，本地广播 gas price ≈99 gwei → **0.1322 ETH**，留 ~50% 余量。台账建议的 0.01 ether 实测不够（少一个数量级），按要求「实测不足就调大并写依据」，依据写在常量注释里。
- `_assertSeedState` 与 `script/verify.sh:350` 的断言**一行未改**；质押额 / 代币量 / 部署顺序均未动。
- 语义文档同步：`params/anvil31337_dev/seed.params` 的 `SEED_ETH_PER_ACCOUNT` 注释（启动资金≠保留金、liquidity member 额外预支）、`SeedFlow.s.sol` 头注释第 1 条、`README.md` §6 seed 表 ETH 行。
- 新增 `test/SeedFlowFunding.t.sol`（4 个纯函数用例，foundry 的 `test = "test"` 已配好，无需改配置）：`forge test` → 4 passed / 0 failed。

### 3. 低余额回归

**a) 真正的低余额语义场景（余额不足的 liquidity member + 付得起的 deployer）** — 临时
`SEED_LIQUIDITY_MEMBER_INDEX=1`、`ANVIL_BALANCE=180`（跑完已还原）：

- 修复前：`seeded account is under-funded`；账户 1 从 180 ETH 起，`_fundEth` 不补（180 ≥ 100），
  质押 100 ETH 后 ≈79.87 ETH < 100 → 断言失败。
- 修复后：`eth topped up: 0x7099…C79C8 20200000000000000000`（补 20.2 ETH 到目标 200.2），
  seed 结束余额 `seed[0]=151.93`、`seed[1]=100.0723`、`seed[2..4]=179.95` ETH；
  `make verify` → `PASS ETH balances of 5 seeded accounts >= 100000000000000000000 wei`、
  `ALL CHECKS PASSED — report written to export/VERIFIED.md`。

**b) shipped 参数（`SEED_LIQUIDITY_MEMBER_INDEX=0`）+ `ANVIL_BALANCE=150`：修复后仍红，且结构性无法绿。**
deployer 与 liquidity member 是同一个账户，`_fundEth` 对它的 top-up 是**自转账**（净变化只有 gas，
不能抬高余额）：它需要 seed 开始时就有 ≥200.2 ETH，即每账户 ≥ ~208 ETH —— 而那时补齐本来就是
no-op（修复前也绿）。所以均匀调低 `--balance` 时 index 0 不存在「修复前红 / 修复后绿」的窗口。
这是「补款来源=deployer 自身」的结构限制，不是 N-01 的目标计算问题；要支持需让 `_fundEth` 从其它
种子账户的盈余回补（每个账户自己签名，仍不做 state forgery），属超出 N-01 的设计变更，留给 owner 决策。

**c) 台账建议的两个字面值**：`ANVIL_BALANCE=2e18` 修复后 `ALL CHECKS PASSED`（但按 §0.2 它是
2e18 ETH/账户，无证明力）；`ANVIL_BALANCE=0` 停在 `make libraries`（deployer 无 gas），与 N-01 无关。

### 4. 默认 profile 零影响（另一端口 8581，两次 clean bootstrap）

- 两次 `export/deployments/anvil31337_dev.json` sha256 均为
  `9e811d4d719b96aaa51b707baef3bb9dbcd0a8118bf0e198aa5ca4e17fcbd44c`（与 `docs/STATUS.md` §5 里记录的同一 hash 一致）。
- 24 个导出文件（`deployments/*.json` + `abis/*.json`）两次 sha256 全部相同；其中 22 个被提交的路径与
  `HEAD` 的 blob 逐字节相同（`.addresses.json` / `.multicall3.json` 是 gitignore 的中间产物）。
- 与提交版本逐键比较：`anvil31337_dev.json` 扁平化后 **183 个键、0 处差异**；84 个地址、36 个
  `blockNumber`、`chainId=31337`、`deployBlock=34` 全部不变。

### 5. 前端门禁 `pnpm abis:check`

在我动手之前它就是红的：`src/config/abis/manifest.json` 记录的 anvil `head=cda5908…`，而 anvil
`HEAD` 已经是 `b529685…`（前任 docs-only 的 `export/VERIFIED.md` 重新生成提交没同步前端）。
**内容层完全一致**：只把 manifest 的 anvil `head` 一行改成本次提交 `f8d6e99…` 后复跑 →
`[abis:check] ABIs, manifest, address book and airdrop snapshot match ../anvil/export.`（随后已把该行
还原，未提交任何前端代码 —— 遵守「前端仓只提交台账/文档」）。要让门禁长期绿，合并本提交后执行
`pnpm sync:anvil` 并把 `src/config/abis/manifest.json` 这 1 行 provenance 一并提交。

### 遗留风险

1. `SEED_LIQUIDITY_MEMBER_INDEX=0`（deployer 兼 liquidity member）+ 均匀低 `--balance` 仍红，见 §3b；
   需要 owner 决定是否改成「从其它种子账户盈余回补」。
2. `SEED_GAS_ALLOWANCE=0.2 ether` 基于本地广播 gas price ≈99 gwei 实测 1,335,352 gas；若 gas price
   翻倍以上，余量会被吃掉（本次低余额 run 质押后仅余 0.0723 ETH）。改 gas price / 增加交易时要重新量。
3. top-up 依赖 deployer 余额；不足时代码报 `ETH top-up failed`（原有行为），而 §3b 那种「自己补自己」
   的情况会在最后以 `seeded account is under-funded` 暴露，信息不够直白（可选：加一条可行动的 require）。
4. `forge fmt --check` 在 `script/DeployLibraries.s.sol:50` 有既有缩进漂移（与本任务无关，未动）。
5. 前端仓 `export/VERIFIED.md` 相关的既有脏改动、`ledger/owners/*.json` 的既有改动都保持原样未提交。

## Conclusion

N-01 已按语义修计算而非删断言：`SeedFlow` 现在把 liquidity member 补到
`SEED_ETH_PER_ACCOUNT + SEED_LIQUIDITY_PARENT_TOKEN_AMOUNT + SEED_GAS_ALLOWANCE(0.2 ETH)`，其余账户仍是
`SEED_ETH_PER_ACCOUNT`；`_assertSeedState` 与 `verify.sh:350` 的断言逐字保留，且在「余额不足的
liquidity member + 付得起的 deployer」场景下低余额 bootstrap 全绿（`ALL CHECKS PASSED`）。默认 profile
两次 clean bootstrap 的导出 24 文件 sha256 一致、183 个键与上一提交逐键相同，修复对默认链零影响。

交付物：../anvil `f8d6e99`（`script/SeedFlow.s.sol`、`params/anvil31337_dev/seed.params`、`README.md`、
`test/SeedFlowFunding.t.sol`，`forge test` 4/4、`forge fmt --check` 对本改动无差异）、本台账。

遗留问题（需决策/后续）：① index 0 + 均匀低 `--balance` 结构性无法绿（补款来源=deployer 自身），
见 §3b；② 前端 `abis:check` 的既有红只需 `pnpm sync:anvil` 提交 1 行 manifest provenance 即转绿。

## Execution Log

<!-- Maintained by the script: appended by new / claim / set / release / log / close. Do not edit.
     Backfill with: progress log --id 20261114-0608-7c7e-anvil-修复-seedflow-种子资金补齐与最终-eth-余额断言矛盾-n --note "...". -->
- 2026-11-14 06:08:01 · new · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d · created
- 2026-11-14 06:08:39 · claim · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d · claimed → doing
