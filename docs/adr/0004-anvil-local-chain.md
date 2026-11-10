# 0004 本地链（anvil）：可复现部署与集成夹具

`anvil/` 是独立的兄弟仓，唯一职责是为前端提供**可复现的本地链部署与集成夹具**：一条 `make bootstrap` 在 chainId 31337 上拉起 anvil，部署 Multicall3、WETH/UniswapV2、Airdrop、core、action、group-chat，按真实协议路径 seed，导出地址簿/ABI，并逐项验证（约 75 秒）。它只读兄弟合约仓，不修改它们；`export/deployments/anvil31337_dev.json` + `export/abis/*.json` 是前端 anvil 变体**唯一**的地址来源。

- **Status**: Accepted
- **Date**: 2026-11-11

## Context

前端需要一个不依赖公开测试网、可反复重建、地址确定的链来跑 E2E 与手工验收。身份、空投、兑换与治理流水线都需要真实的合约状态；公开测试网目前没有可用的部署参数（合约仓的 `script/network/` 只有 `anvil31337_dev`），而本地链可以把“部署 → seed → 验证”压缩到一条命令。

证据是 `anvil/README.md` 与 `anvil/export/deployments/anvil31337_dev.json`（2026-11-11 的验证产物；`export/VERIFIED.md` 记录全部断言通过）。

约束：

- 兄弟仓 `core/`、`action/`、`group-chat/`、`libs/`、`dex/` 是**只读输入**；本仓只编译与读取产物（`core/out`、`action/out`、`group-chat/out`、`dex/build`），不在兄弟仓里执行 `forge build`。
- `dex/build/` 是外部前置；缺失时 preflight 直接报错并给出自行构建的命令，不代劳。
- 地址在全新链上确定，**块高不确定**：`--block-time 1` 按墙钟出块，同一命令重跑的块高会略有不同。

## Decision

### 1. 仓边界：只读兄弟仓，产物单向流入

`anvil/` 不修改任何合约仓，也不复制它们的源码（唯一例外是从 `LOVE20TKM/burn` vendored 的 `Airdrop`，见 §4）。WETH 从 `dex/script/WETH9Configurable.sol` 编译；UniswapV2 的 Factory/Router/Pair 直接读取 `dex/build` 的已发布产物并按 `dex` 脚本中的 init-code hash 校验，不在本地重编译。core/action/group-chat 通过 `.siblings/*` 符号链接以只读方式编译。`make preflight` 检查工具链、兄弟仓、`dex/build` 与 Multicall3 交易校验和，并重建缺失的符号链接。

### 2. 一条命令，一条验证

`make bootstrap` 的顺序固定为：preflight → airdrop fixture → anvil → Multicall3 → build → linked libraries → deploy → seed → export → verify。产出一份新的本地栈与 `export/`。`make verify` 独立于部署脚本，对**每个导出的地址**做 `cast` 断言（有代码 + 关键 wiring），任一失败即非零退出；它不复制部署日志里的值。

### 3. Seed 走真实协议路径

seed 不使用 `deal`、`anvil_setStorageAt` 或任何状态伪造；每个测试账户用自己的私钥签交易，顺序是：

**空投 claim → 用领到的 LOVE20 铸造 MemberNFT → `Stake.stakeLiquidity` 注入首个池子**。

原因：`Launch` 只 `createPair`，交易对按设计是**零储备**的，所以第一个可交易的池子只能由成员主动质押流动性产生。fixture 覆盖 10 个账户（各 1e17 share）；前 5 个领空投并铸造身份，member 0 再质押 2e23 首币 + 1e20 WETH，得到 200,000 token / 100 WETH 的初始池。这条路径同时证明“空投 → 身份 → 流动性 → 治理权重”的 onboarding 漏斗可达：`Stake` 把 `liquidityShares` 记为 `govVotes`，seed 出的成员可以直接投票/提交。

### 4. Airdrop 必须先于 core

Airdrop 是 `Launch` 构造函数的 `distributor` 参数，`LOVE20Token` 在构造函数里把 `LAUNCH_AMOUNT` 全部铸给它，**没有 setter**；因此 Airdrop 必须在 `Launch` 之前部署，地址由部署脚本直接传入，绝不从参数文件读取。

vendored 的 Airdrop（来自 `LOVE20TKM/burn`）没有实现 `ILaunchDistributor`，所以在这条链上发射子币必须使用 `DistributorMode.NoCallback`。首币不受影响：它的 genesis supply 在 `LOVE20Token` 构造函数里已经铸给 Airdrop。`DeployLocal._validateCore` 用 `staticcall` 断言该接口**必须**失败，防止文档/实现漂移。

### 5. 端口策略

默认 `127.0.0.1:8545`。`make anvil` 只在能确认“这是自己启动的链”时才复用（`.anvil/anvil.pid` 与端点匹配）；否则拒绝附着，并打印“停掉它”或“换端口”两条出路。`PORT=` / `HOST=` 会同时移动 anvil 进程与所有 RPC URL。

**已观察到的冲突（不是设计）**：一次验证运行时，一个更早的前端 checkout 留下的 anvil 占着 8545 已有一整天，因此实际验证在 8555 上完成。本仓不杀不是自己启动的进程；`export/deployments/anvil31337_dev.json` 仍写该 profile 的规范 `rpcUrl`（8545），地址与块高来自 8555 的那次运行，且在全新链上可复现。端口冲突应通过 `PORT=` 或停掉占用者解决，不能把 8555 当成默认值。

### 6. Export 契约

`export/deployments/anvil31337_dev.json`（`network`、`chainId`、`rpcUrl`、`contracts`、`addresses`、`libraries`、`uniswapV2`、`airdrop`、`params`）与 `export/abis/*.json`（19 份 ABI）是前端 anvil 变体**唯一**的地址/ABI 来源。

- **地址只认 JSON 的 `addresses` / `contracts`**；任何文档表格、README 示例、聊天记录里的地址都不算来源。
- **兄弟仓提交的 `script/network/anvil31337_dev/addresses.*.params` 永不读取**：它们与本地实际部署不一致，且彼此互相矛盾（README §4 已记录）。
- 需要新地址时重新 `make bootstrap` 并消费新导出，不要在代码里硬编码；地址在全新链上确定，但重建会改变当前值。

### 7. Dev 阶段时长

dev profile 以 **100 块/phase** 为准；`--block-time 1` 下一 phase ≈ **100 秒**，这是治理/行动流水线 UI 能在一次验收里看到阶段切换的原因。Phase 以区块计量，不是时间戳：链冻结时 phase 也冻结。

> 注：当前 `anvil/params/anvil31337_dev/core.params` 与 README 仍写 120 块/phase（≈2 分钟），而 `network.params` 的注释写 100；实现以本 ADR 的 100 块为准，并应在 `make verify` 中断言 `Phase.ORIGIN_PHASE_BLOCKS()` 的实际值。

## Consequences

**正面**：一条命令得到完整、已 seed、已验证的本地协议栈；E2E 与手工验收不依赖测试网；地址来源单一且可审计；onboarding 漏斗的每一步都在真实合约上走过一遍。

**代价与遗留**：

- 仅用于本地：没有 BSC profile，也不能替代 testnet/mainnet 的一次性部署；那些地址仍来自合约仓的 `addresses.*.params`（ADR-0002）。
- `dex/build` 必须先存在；`make bootstrap` 约 75 秒；`deploy` + `seed` 每个部署只能跑一次，重跑会得到新地址。
- 地址只在全新链上确定，块高不确定；端口 8545 可能被别的 anvil 占用（见 §5）。
- 本地链无法可靠给手机钱包用（钱包拒绝 `http:` RPC），移动端验收仍走测试网或 HTTPS 隧道（ADR-0001）。
- 当前导出文件的 `params` 与 `deployer` 是空/零，README §5 的示例却给了值；地址消费不受影响，但不要把它们当环境参数来源。
- 已知漂移：phase 块数 120 → 100 尚未落到 anvil 仓（§7）；修正前，`make verify` 报的 `Phase.ORIGIN_PHASE_BLOCKS()` 与本文档不一致。
