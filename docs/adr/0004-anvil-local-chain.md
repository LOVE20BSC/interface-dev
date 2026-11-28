# 0004 本地链（anvil）：可复现部署与集成夹具

`anvil/` 是独立的兄弟仓，负责为前端提供**可复现的本地链部署与集成夹具**。`make bootstrap` 从空链、deployer nonce 0 开始部署协议，写入种子数据，导出地址簿和 ABI，并逐项验证。它只读取兄弟仓的合约源码。前端通过 `pnpm sync:anvil` 从选定的部署导出同步地址簿和 ABI。

- **Status**: Accepted
- **Date**: 2026-11-11

## Context

前端需要一个不依赖公开测试网、可反复重建、地址确定的链来跑 E2E 与手工验收。身份、空投、兑换与治理流水线都需要真实的合约状态；公开测试网目前没有可用的部署参数（合约仓的 `script/network/` 只有 `anvil31337_dev`），而本地链可以把“部署 → seed → 验证”压缩到一条命令。

证据是 `anvil/README.md` 与 `anvil/export/deployments/anvil31337_dev.json`（2026-11-11 的验证产物；`export/VERIFIED.md` 记录全部断言通过）。

约束：

- 兄弟仓 `core/`、`action/`、`group-chat/`、`libs/`、`dex/` 是**只读输入**。Anvil 编译部署所需的 ABI，并读取 `dex/build` 中的发布产物。
- `dex/build/` 是外部前置；缺失时 preflight 直接报错并给出自行构建的命令，不代劳。
- **全新链 + nonce 0** 下地址与导出块高都确定：bootstrap 期间 anvil 用 automine（一笔交易一个块），结束后才切回 `--block-time 1`；两次 `make stop && make clean && make bootstrap` 的 `export/deployments/anvil31337_dev.json` 字节相同。
- 历史教训：曾经在一条已经用过的链上重跑 bootstrap，导出被写成 nonce 43 的地址，随后又反过来手工设置 nonce 去迎合地址簿；地址簿因此不可复现。该做法已被代码禁止（见 §6）。

## Decision

### 1. 仓边界：只读兄弟仓，产物单向流入

`anvil/` 不修改任何合约仓，也不复制它们的源码（唯一例外是从 `LOVE20TKM/burn` vendored 的 `Airdrop`，见 §4）。WETH 从 `dex/script/WETH9Configurable.sol` 编译；UniswapV2 的 Factory/Router/Pair 直接读取 `dex/build` 的已发布产物并按 `dex` 脚本中的 init-code hash 校验，不在本地重编译。core/action/group-chat 通过 `.siblings/*` 符号链接以只读方式编译。`make preflight` 检查工具链、兄弟仓、`dex/build` 与 Multicall3 交易校验和，并重建缺失的符号链接。

### 2. 一条命令，一条验证

`make bootstrap` 的顺序固定为：preflight → airdrop fixture → build → anvil（automine）→ fresh 断言 → Multicall3 → linked libraries → deploy → seed → export → verify → 开启 1 秒出块。产出一份新的本地栈与 `export/`。

- **fresh 断言**：开始部署前必须同时满足 block 0、deployer nonce 0、Multicall3 地址无代码；任一不满足直接失败并打印 `make stop && make clean && make bootstrap`，绝不“接着用”一条旧链。
- **bootstrap 不复用链**：发现 8545 上已有链（哪怕 `.anvil/anvil.pid` 证明是本仓启动的）即拒绝；`make anvil` 单独使用时才允许复用自己启动的链。
- **export 再校验**：`script/export.py` 从 broadcast 里读取 DeployLibraries / DeployLocal 的 nonce 序列，第一笔必须是 0 且连续；否则拒绝写导出。即使有人绕过 fresh 断言，也不可能把脏链地址提交成地址簿。
- `make verify` 独立于部署脚本，对**每个导出的地址**做 `cast` 断言（有代码 + 关键 wiring），任一失败即非零退出；它不复制部署日志里的值。

### 3. Seed 走真实协议路径

seed 不使用 `deal`、`anvil_setStorageAt` 或任何状态伪造；每个测试账户用自己的私钥签交易，顺序是：

**铸造空投份额（合约 `claim`）→ 用铸造到的 LOVE20 铸造 MemberNFT → `Stake.stakeLiquidity` 注入首个池子**。

`Launch` 创建零储备的交易对。种子快照覆盖 10 个账户，每个账户有 `1e17` 空投份额。前 5 个账户铸造空投并铸造身份，Anvil 账户 #0（身份 NFT #1）再质押 `2e23` 首币和 `1e20` WETH，得到 200,000 首币和 100 WETH 的初始池。种子仓位尚未申请解锁，承诺解锁期为 1 个阶段，所以 `Stake.govPower` 等于其流动性质押份额。该身份可以用这笔治理权推举提案和投出治理票。

### 4. Airdrop 必须先于 core

Airdrop 是 `Launch` 构造函数的 `distributor` 参数，`LOVE20Token` 在构造函数里把 `LAUNCH_AMOUNT` 全部铸给它，**没有 setter**；因此 Airdrop 必须在 `Launch` 之前部署，地址由部署脚本直接传入，绝不从参数文件读取。

vendored 的 Airdrop（来自 `LOVE20TKM/burn`）没有实现 `ILaunchDistributor`，所以在这条链上发射子币必须使用 `DistributorMode.NoCallback`。首币不受影响：它的 genesis supply 在 `LOVE20Token` 构造函数里已经铸给 Airdrop。`DeployLocal._validateCore` 用 `staticcall` 断言该接口**必须**失败，防止文档/实现漂移。

### 5. 端口策略

**8545** 是默认人工链，导出到 `export/`。**8555** 供全量浏览器测试，**8566** 供三线校验。其他端口的运行记录、Foundry 产物和导出均位于 `.anvil/<port>/`，因此各链可以并行部署。`make bootstrap` 需要该端口的全新链。`make anvil` 可以复用本仓启动且 PID 与端点都匹配的链。

### 6. Export 契约与单向同步

`export/deployments/anvil31337_dev.json` 与 `export/abis/*.json`（21 份 ABI）是前端 Anvil 变体的地址和 ABI 来源。

- **地址只认 JSON 的 `addresses` / `contracts`**；任何文档表格、README 示例、聊天记录里的地址都不算来源。
- **兄弟仓提交的 `script/network/anvil31337_dev/addresses.*.params` 永不读取**：它们与本地实际部署不一致，且彼此互相矛盾（README §4 已记录）。
- **地址永远由部署派生**。`pnpm sync:anvil` 默认读 `../anvil/export`。验证链可用 `ANVIL_EXPORT_DIR=../anvil/.anvil/8566/export` 指定同一次部署的产物。同步一次写入 `src/config/network/anvil31337_dev/network.json`、`src/config/abis/*.ts`、`src/config/abis/manifest.json` 和空投快照。重复同步相同产物时，文件内容不变。
- **禁止手改地址/Nonce**：不手工 pin 地址，不 `anvil_setNonce`，不为了“让链匹配地址簿”改部署顺序。地址簿跟随部署，不是部署跟随地址簿。结构性偏移（本仓没有）只能作为 `params/anvil31337_dev/*.params` 的显式参数。
- **`manifest.json` 记录部署来源**。Anvil 在部署时从本次 Foundry 产物和发布的 DEX 产物取得 ABI；部署 JSON 的 `provenance` 记录各来源仓的提交，或注明工作区、基线提交及变更指纹。同步校验 ABI 的 SHA-256，并在前端清单记录导出区块号、各 ABI 的条目数及哈希。
- **`pnpm abis:check`** 逐字节核对导出与前端生成物。正式检查要求来源为已提交源码，`--allow-working-tree` 供本地送审核对。缺少 `../anvil/export` 时跳过导出比对。
- **确定性证明**（两次输出必须同 hash）：

```bash
cd ../anvil
make stop && make clean && make bootstrap
cp export/deployments/anvil31337_dev.json /tmp/anvil-1.json
make stop && make clean && make bootstrap
sha256sum /tmp/anvil-1.json export/deployments/anvil31337_dev.json   # 两个 hash 相同
cd ../interface-dev-dsh && pnpm sync:anvil && pnpm abis:check
```

### 7. Dev 阶段时长

dev profile 以 **120 块/phase** 为准（`PHASE_ORIGIN_PHASE_BLOCKS=120`，`make verify` 逐次断言）；bootstrap 结束后 `--block-time 1`，一 phase ≈ **2 分钟**，这是治理/行动流水线 UI 能在一次验收里看到阶段切换的原因。Phase 以区块计量，不是时间戳：链冻结时 phase 也冻结。Bootstrap 的 automine 只影响部署/seed 期间的出块方式，结束后立即恢复 interval mining，页面看到的时序与之前一致。

## Consequences

**正面**：一条命令得到完整、已 seed、已验证的本地协议栈；E2E 与手工验收不依赖测试网；地址来源单一且可审计；onboarding 漏斗的每一步都在真实合约上走过一遍。

**代价与遗留**：

- 仅用于本地：没有 BSC profile，也不能替代 testnet/mainnet 的一次性部署；那些地址仍来自合约仓的 `addresses.*.params`（ADR-0002）。
- `dex/build` 必须先存在；`make bootstrap` 约 45–50 秒；`deploy` + `seed` 每个部署只能跑一次，重跑会得到新地址。
- 地址只在**全新链**上确定；重跑前必须 `make stop && make clean`，bootstrap 会拒绝复用旧链（见 §2、§5）。规范端口 8545 可能被别的 anvil 占用，先停掉占用者再 `make bootstrap`。
- 本地链无法可靠给手机钱包用（钱包拒绝 `http:` RPC），移动端验收仍走测试网或 HTTPS 隧道（ADR-0001）。
- **Pages 上的 dev 构建只能做 UI/文案预览**：HTTPS 页面里的浏览器会拦截对回环 RPC 的请求（2026-11-12 复现：`Permission was denied for this request to access the 'loopback' address space`，目标 `http://127.0.0.1:8545/`，来源 `https://love20bsc.github.io`）。交互测试必须用 `localhost` 本地服务（`pnpm dev`，如 `http://localhost:5180`），或换成可访问的链；界面在命中「HTTPS 页面 + 回环 RPC」时显示一次可关闭的说明（`src/app/shell/rpc-blocked-notice.tsx`），不要把浏览器拦截误报成「网络可能不稳」。
- 更新部署时，先在各源码仓提交对应变更，再用这些提交部署。在 Anvil 仓提交导出，并在前端仓提交同一部署生成的地址簿、ABI、清单和快照。
