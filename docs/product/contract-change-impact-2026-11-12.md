# 合约库近 24 小时变更 → 前端影响分析（2026-11-12）

审计基线：`core@141c931`、`tools@505cb31`、`action@8ae0a23`、`group-chat@0ea1606`（`libs` / `dex` 无变更）。
目的：确认「BSC 前端只使用 LOVE20BSC 里的合约」这条约束在代码层的落点，并列出前端必须做/可延后的调整。

## 1. 变更清单

### core（3 个提交）

| 提交 | 内容 | 是否影响前端 |
| --- | --- | --- |
| `a9a5ac6` | 新增 `AirdropDistributor`（作为 Launch 的 distributor，按 merkle 快照分发创世代币）；`ILaunchDistributor` 移到 `src/interfaces/distributor/`；`Launch` 改为按 distributor 注册 | **是，重构空投页** |
| `f209300` | `DeployCore` 自己部署 `AirdropDistributor`（`CoreConfig` 不再有 `distributor` 字段，改为 `genesisMerkleRoot` + `genesisClaimDelayRounds`；`DeploymentAddresses` 增加 `airdropDistributor`） | **是，anvil 部署脚本必须迁移** |
| `141c931` | launcher 可在链上登记快照 URI：`updateSnapshotUri` / 快照 URI 只读视图（`0cdbe44` 后并入 `airdropInfo(...).snapshotUri`） / `AirdropSnapshotUriUpdated` | **是，快照不再随前端打包** |

`AirdropDistributor` 关键接口（`core/src/interfaces/distributor/IAirdropDistributor.sol`）：

```solidity
struct AirdropInfo {
    address tokenAddress; bytes32 merkleRoot; uint256 claimableFromRound;
    uint256 totalClaimedShare; uint256 totalRemainingShare;
    uint256 totalClaimedAmount; uint256 remainingAmount; string snapshotUri;
}
function airdropInfo(address tokenAddress) external view returns (AirdropInfo memory);
function airdropInfos(uint256 offset, uint256 limit, bool reverse) external view returns (AirdropInfo[] memory, uint256);
function isClaimed(address tokenAddress, address claimer) external view returns (bool);
function claimedAmount(address tokenAddress, address claimer) external view returns (uint256);
function claimableAmount(address tokenAddress, address claimer, uint256 share, bytes32[] calldata proof) external view returns (uint256);
function claim(address tokenAddress, uint256 share, bytes32[] calldata proof) external returns (uint256);
```

新增错误里与前端文案直接相关的：`ClaimRoundNotReached(token, currentRound, claimableFromRound)`、`SnapshotUriEmpty`、`SnapshotUriTooLong`、`AirdropAlreadyClaimed`、`InvalidProof`、`TokenNotConfigured`、`NotSnapshotUriUpdater`。

### tools（新仓，2 个合约）

| 合约 | 用途 | 是否影响前端 |
| --- | --- | --- |
| `BatchTransfer` | 批量 ERC20 转账，每收款人带 gas 预算 | 面向上层「发射者/管理者工具页」，**非 M0** |
| `UniswapV2Zap` | 单边或双边入金 → 加流动性（带 swap 腿一致性界与退款开关），有 `ZapQuote` / `ZapNativeQuote` 报价视图 | 可用于「为社区注入流动性」，**M1/M2** |

两者都声明「不依赖协议合约、不持有协议状态」，因此**不进入 M0 身份/空投漏斗**。

### action / group-chat

仅依赖 bump。`group-chat@62d47dc` 起托管群名不再加 `Test` 前缀——前端目前没有群名生成逻辑（M2），但 M2 实现时不要再补前缀。

### stake（`core@48cfd49`，稍早）

`firstGovVoteRound` 等视角字段已进 ABI，为 M1「我的激励」的轮次枚举提供了起点；CI-001 是否解除仍待 core 定稿后重审。

## 2. 前端必须做的调整

### A. anvil：本地链迁移（阻塞一切本地验证）

1. 删掉 `src/vendor/Airdrop.sol` / `IAirdrop.sol`（当初因为 burn 不在 remapping 范围才 vendor；现在空投在 core 里，不再需要）。
2. 改为用 core 的 `DeployCore` 部署 body：`CoreConfig` 用 `genesisMerkleRoot` + `genesisClaimDelayRounds`（`params/anvil31337_dev/core.params` 里已有 `GENESIS_AIRDROP_MERKLE_ROOT` / `GENESIS_AIRDROP_CLAIM_DELAY_ROUNDS`），部署产物里取 `airdropDistributor`。
3. seed 流程改为：种子成员铸造身份后，由 launcher 成员调用 `updateSnapshotUri(genesisToken, <本地快照地址>)`，把快照 URI 登记到链上（本地可用 `http://127.0.0.1:5180/airdrop/anvil31337_dev.json`，dev server 已托管该文件）。
4. `verify.sh` 改为校验 `AirdropDistributor`：一次 `cast call --json airdropInfo(token)` 同时取 `merkleRoot` = 参数值、`claimableFromRound` 计算正确、总计字段一致，再用 `claimedAmount(seed[0])` = 预期值、`isClaimed` 与 `totalRemainingShare` 一致。
5. `export.py` 输出新增 `airdropDistributor` 地址与 ABI；地址确定性（deployer nonce 0）必须保持。
6. 前端 `pnpm sync:anvil` → 新 ABI + 地址簿新增 `airdropDistributor`，`abis:check` 通过。

### B. 空投页重写（M0 内的行为变化）— **已完成（2026-11-12）**

> 状态：**DONE**。前端已切到 `AirdropDistributor`：`claim(tokenAddress, share, proof)`（`msg.sender` 即账户）、`claimableAmount` / `isClaimed` / `claimedAmount` / `airdropInfo`；创世快照用内置 JSON 并以 `airdropInfo(genesisToken).merkleRoot` 校验，后续 Launch 代币走 `airdropInfo(token).snapshotUri`；新增「还没到可铸造轮次」门槛态（「约 X 分钟」，无绝对时间）；删除 CI-014 时代的 dev 事件扫描兜底。

| 现状 | 变更后 |
| --- | --- |
| 单一 `Airdrop` 合约 + 前端打包的快照 JSON | `AirdropDistributor`，**按 token 多份空投**；快照来自链上 `snapshotUri` |
| `claim(token, account, share, proof)` | `claim(tokenAddress, share, proof)`（`msg.sender` 即账户） |
| `isClaimed(token, account)` | `isClaimed(token, account)`（2026-11-12 重构回同名） |
| `claimedAmount(token, account)`（CI-014 我们加的） | `claimedAmount(token, account)`（2026-11-12 重构回同名） |
| 立即铸造 | **轮次门槛**：`claimableFromRound > currentRound` → `ClaimRoundNotReached`，页面需要「还没到可铸造轮次」状态 + 按 phase 块数估算「约 X 分钟」 |
| 只有一份空投 | `airdropInfos(offset, limit, reverse)` 可列多份；M0 仍只展示当前社区代币那一份，但读取路径按「按 token 查」 |
| 快照内置于产物 | **创世代币：仍内置**（链上 URI 永久为空，见 CI-017），使用前用 `airdropInfo(genesisToken).merkleRoot` 校验；**后续 Launch 的代币：运行时从链上 `airdropInfo(token).snapshotUri` 拉 JSON**（仅 http(s)、失败态 + 重试、**用链上 merkleRoot 校验快照 root**，不一致即拒用）——代码路径已实现 |

### B2. 2026-11-12 重构通过（refactor pass）

`core@0cdbe44`（+ `4200d35` 修正 deploy 读取）把六个按 token 的 getter 合并为一个 `airdropInfo(token)` 结构体，并把两个按账户的 getter 改回 `isClaimed` / `claimedAmount`。前端在 `c49eafd` 之后重导 anvil 导出并完成适配：

- `pnpm sync:anvil` 重生成 `airdrop-distributor.ts`（38 → 33 条目）与部署书；部署书新增 `airdropDistributor` 启动元数据块（uint256 以十进制字符串保存，避免 JSON number 精度丢失）。
- 空投页/首页资格卡都只读一次 `airdropInfo(token)`：`merkleRoot` 校验快照、`claimableFromRound` 做 S5-G 门槛、`snapshotUri` 选快照来源、`totalRemainingShare` / `remainingAmount` 显示份额与池额（不再 `balanceOf(distributor)` 重算）。
- S6「已铸造 X」与 e2e 的链上断言改用 `claimedAmount(token, account)`。
- 依次通过 `typecheck` / `lint` / `test` / `build` / `abis:check`，并在 8555 自动化链连跑两遍 e2e。

### C. 合约问题清单需要更新

- **CI-005**（空投合约不在任何仓库、入网路径缺失）→ **已修复**：空投随 `core` 交付。
- **CI-014**（没有按账户查已铸造金额）→ **已修复**：`claimedAmount`（前端已改为一次 view 调用，无日志扫描）。
- 新增候选问题：
  1. **快照 URI 的信任与可用性**：URI 由 launcher 设定且可被 `updateSnapshotUri` 修改；前端必须只信链上 `merkleRoot`，快照仅作为 proof 来源，root 不一致即拒用。另需确认主网 URI 是否可能被墙/CORS 拒绝——静态站对此只能用「失败态 + 重试」兜底。
  2. **`airdropInfos` 的返回成本**：返回结构体数组且含 `string snapshotUri`，分页大小需要压测（BSC 公共 RPC 的 `eth_call` 返回体积/耗时）。
  3. **claim 轮次门槛需要聚合视图**：前端要拿 `claimableFromRound` 与「当前轮」比较；`Phase` 现有视图是否足以在无索引器条件下算「当前轮」，需与 `Phase.sol` 再对一次（CI-008 相关）。

## 3. 可以延后的调整

| 项 | 建议 |
| --- | --- |
| `tools/BatchTransfer` | **已定（owner 2026-11-12）：先不做**，M2 再做「批量发币」工具页（应用目录里新增「工具」分类） |
| `tools/UniswapV2Zap` | **已定（owner 2026-11-12）：先不做**，与「社区流动性」一起做（M1/M2），需要 quote 视图 + 退款开关的 UI 表达 |
| `group-chat` 群名前缀 | M2 群聊实现时遵守「不再加 Test 前缀」 |
| `stake` 新字段 → M1「我的激励」 | core 定稿后重审 CI-001 / CI-003 |

## 4. 建议执行顺序

1. **anvil 迁移**（A）——恢复本地可部署、可验证的链，产出新 ABI/地址。
2. **空投页重写**（B）——按新接口、轮次门槛、URI 快照校验。
3. **合约问题清单更新**（C）+ `STATUS.md` 记录数据源变化。
4. M2 工具页 / M1 激励，等 core 与 action 的治理面定稿。
