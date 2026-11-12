# 合约侧问题清单（前端视角）

本目录记录**前端开发过程中发现、并已回到合约源码逐条核对的**协议问题。每一条都必须有 `file:line` 证据与可执行的前端后果；没有证据的猜测不入库。

- 审计时间：2026-11-11
- 审计基线：`core` @ `43d5344`、`action` @ `bceee40`、`group-chat` @ `62efe7f`、`libs` @ `65b1106`
- 审计口径：**无后端、无索引器**的静态站，只有 RPC `eth_call` + 合约 view 函数 + Multicall3。`eth_getLogs` 不计为可用手段（BSC 公开 RPC 对 `fromBlock..toBlock` 范围有限制，无法扫全历史；这是本目录的审计口径，与 [`../product/m0-scope.md`](../product/m0-scope.md) 的假设清单无关，旧版本此处误引「假设 1」）。
- 审计对象：M0 需要链上支撑的 6 个面（身份、铸造 MemberNFT、空投、代币兑换（任意代币 ↔ 任意代币，含原生币）、首页“下一步”、流水线/倒计时）。其中“首页下一步”“流水线”按 [`../product/m0-scope.md`](../product/m0-scope.md) 属于 M1+，因为项目负责人明确把它们列入了本次审计范围，所以仍然审。
- 规范基准：[`matt-gov/CONTEXT.md`](../../../matt-gov/CONTEXT.md)、[`matt-gov/docs/dev-standards.md`](../../../matt-gov/docs/dev-standards.md)、[`matt-gov/docs/naming-standards.md`](../../../matt-gov/docs/naming-standards.md)。

## 索引

| ID | 标题 | 严重级别 | 影响的前端模块 | 状态 | 关联文件 |
| --- | --- | --- | --- | --- | --- |
| [CI-001](001-no-member-round-index.md) | 没有按 `memberId` 的轮次/行动索引，待铸造激励无法枚举 | Blocker | 首页下一步、激励铸造、验证者任务 | Open | `core/src/Mint.sol`、`core/src/Vote.sol`、`core/src/Stake.sol`、`action/src/ActionTarget.sol`、`action/src/ExecutorBase.sol` |
| [CI-002](002-reward-quote-linear-scan.md) | 激励报价每次都线性扫描本轮全部已投票提案 | High | 行动激励铸造、流水线 | Open | `core/src/Mint.sol`、`action/src/ActionTarget.sol`、`action/src/GroupServiceExecutor.sol` |
| [CI-003](003-created-round-not-exposed.md) | 行动的创建轮次 `createdRound` 从未暴露 | High | 流水线/倒计时、行动参与、行动激励铸造 | Open | `action/src/ActionTarget.sol`、`action/src/ExecutorBase.sol`、`action/src/LpExecutor.sol`、`action/src/GroupActionManager.sol`、`action/src/GroupServiceExecutor.sol` |
| [CI-004](004-member-nft-test-prefix-mismatch.md) | MemberNFT 测试前缀：报价/查重与实际铸造不一致 | High | 铸造 MemberNFT | 已修复（core@72a1604） | `core/src/MemberNFT.sol`、`core/test/MemberNFT.t.sol`、`core/script/network/anvil31337_dev/core.params` |
| [CI-005](005-no-onboarding-path.md) | “没币用户”的入网路径缺失：mint 只收 ERC20，空投合约不在任何仓库 | High | 铸造 MemberNFT、空投 | 已修复（core@f209300：AirdropDistributor 随 core 交付） | `core/src/MemberNFT.sol`、`core/src/LOVE20Token.sol`、`core/src/Launch.sol`、`core/src/interfaces/ILaunchDistributor.sol` |
| [CI-006](006-claim-amounts-are-live.md) | 待铸造金额按“现在”现算，会变，甚至变成 0 或被销毁 | High | 激励铸造、首页下一步 | Open | `action/src/LpExecutor.sol`、`action/src/GroupServiceExecutor.sol`、`core/src/Mint.sol`、`action/src/GroupActionExecutor.sol` |
| [CI-007](007-round-not-started-inconsistent.md) | “轮次未开始”有三种答复：回滚 / 空数组+0 / 静默 0 | Medium | 全部读链层 | Open | `core/src/Stake.sol`、`action/src/ActionTarget.sol`、`action/src/LpExecutor.sol`、`action/src/GroupServiceExecutor.sol`、`action/src/GroupActionVerify.sol` |
| [CI-008](008-no-phase-timing-view.md) | 没有阶段时间/阶段偏移视图，倒计时与验证开放窗口要在 TS 重算 | Medium | 流水线/倒计时 | Open | `core/src/Phase.sol`、`core/src/interfaces/IPhase.sol`、`action/src/GroupActionVerify.sol`、`action/src/*RoundAxis.sol` |
| [CI-009](009-verifier-surface-gaps.md) | 验证者侧没有按人索引，待验证任务无法列出 | Medium | 验证者任务、流水线 | Open | `action/src/GroupActionVerify.sol`、`action/src/interfaces/IGroupActionVerify.sol` |
| [CI-010](010-address-book-not-discoverable.md) | 地址簿不可链上发现，错误地址静默返回 0 | Medium | 全部模块（启动引导） | Open | `action/src/ActionTarget.sol`、`action/src/ExecutorBase.sol`、`core/src/Mint.sol`、`core/src/Vote.sol` |
| [CI-011](011-silent-zero-ambiguity.md) | 静默 0 / 歧义 0：分不清“没有”与“未开始/不可铸造” | Medium | 激励铸造、质押、行动加入 | Open | `action/src/ActionTarget.sol`、`action/src/LpExecutor.sol`、`action/src/GroupActionExecutor.sol`、`action/src/GroupServiceExecutor.sol`、`core/src/Stake.sol` |
| [CI-012](012-name-homoglyph-spoofing.md) | 名称同形可伪造身份（ASCII-only 折叠 + 宽松字符集） | Medium | 身份、提案、群聊 | Open | `core/src/MemberNFT.sol` |
| [CI-013](013-member-nft-no-token-uri.md) | MemberNFT 没有 `tokenURI`/元数据，钱包里是空白 NFT | Low | 身份 | Open | `core/src/MemberNFT.sol` |
| [CI-014](014-airdrop-claimed-amount-not-readable.md) | 空投没有「按账户查已铸造金额」的只读方法 | High | 空投铸造 | 已修复（core@a9a5ac6：claimedAmountByTokenAddressByClaimer） | `anvil/src/vendor/Airdrop.sol`、`src/config/abis/airdrop.ts`、`src/features/claim-airdrop/` |
| [CI-015](015-snapshot-uri-trust.md) | 空投快照改为链上 URI：信任、可用性与被篡改风险 | Medium | 空投铸造 | Open | `core/src/distributor/AirdropDistributor.sol` |
| [CI-016](016-airdrop-infos-cost.md) | `airdropInfos` 返回结构体数组（含 string），分页与成本上限未定 | Low | 空投铸造（多空投列表） | Open | `core/src/interfaces/distributor/IAirdropDistributor.sol` |

数量：16 条（**11 Open / 5 已修复**）；Open 条目按严重级别为 **1 Blocker / 3 High / 7 Medium / 1 Low**；已修复：CI-004（core@72a1604，High）、CI-005（core@f209300，High）、CI-014（core@a9a5ac6，High）、以及此前记录的 CI-004/CI-014 早期版本。详见各行。

## 严重级别定义

| 级别 | 定义（按“能否在不改合约的前提下做出正确界面”判定） |
| --- | --- |
| **Blocker** | 无后端即**无法计算**目标界面所需的正确值；绕过只能靠“少显示/猜/信任本地缓存”，且随时间一定恶化。不修就必须砍功能或加索引器。 |
| **High** | 能算，但**算出来的值与链上实际结果会不一致**（价格、金额、窗口），或需要**每次额外 N 次调用/一笔前置交易**才能用；在真实规模下会超时、超 RPC 额度或误导用户。 |
| **Medium** | 能算且值正确，但接口形态迫使前端**复制合约算术、复制常量或做三重分支**，属于长期维护成本与静默错判来源；不改也能上线，但错误会以“按钮点了才回滚”的形式暴露。 |
| **Low** | 体验/元数据缺口或规范偏差，不改不影响正确性。 |

## 如何修复流程

1. **先看本目录有没有已登记条目**，不要重复开新条；同一根因只留一条，把新的 `file:line` 补进对应文件的“证据”。
2. **在合约仓开分支修，前端仓只消费**。本目录所在仓（`interface-dev-dsh`）不改任何合约；修复落在 `core` / `action` / `libs`，并遵守 `matt-gov/docs/dev-standards.md`（接口唯一来源是本仓 `src/interfaces/`、事件进 `I<Name>Events`、错误进 `I<Name>Errors`、集合读取按 §4.3 的分页签名）。
3. **ABI 形状变更 = 破坏性**。新增 `view` 是加法（可先做）；给已有返回值加字段、改参数顺序是破坏性变更（合约尚未上线，可以一次改到位，但必须同步 `matt-gov/registry/errors.json` 与前端 ABI 导出产物）。
4. **每条修复都要带一条“前端可复跑”的验证**：`cast call` 一行（或 `forge test` 用例）证明修复前失败/返回歧义、修复后返回明确值。把该命令写进对应条目的“验证”。
5. **修复后更新本文件的状态列**：`Open` → `已修复（<repo>@<commit>）`；若决定不修，写 `Won't fix（理由）`，不要静默删除条目。
6. **前端在修复落地前必须使用各条的“临时绕过”**，并在 `docs/` 里记录绕过的代价；绕过不得伪装成正确值（例如把估算金额写成“可得”）。修复落地后，对应绕过必须从代码与文档里删除，不得继续以“临时”名义留在主路径。

## 已核实、**不是**问题的点（避免重复劳动）

- **枚举钱包持有的 MemberNFT 可行**：`MemberNFT` 继承 OZ `ERC721Enumerable`（`core/src/MemberNFT.sol:14`），`balanceOf` + `tokenOfOwnerByIndex` 是 O(1) 且不需要事件。M0 假设 1 里“必须白名单 + 手填地址”的兜底**不成立于 MemberNFT 这一层**；真正必须硬编码的只有 MemberNFT 合约地址本身（见 CI-010）。
  另外 `holders(offset, limit, reverse)`（`MemberNFT.sol:145-149`）提供了持有人全量分页。
- **命名与错误目录当前是干净的**：`python3 matt-gov/script/check_naming.py --check` 输出 `total: 0`；`python3 matt-gov/script/check_errors.py --check` 输出 `violations: 0`（235 声明 / 199 签名 / 189 唯一签名）。所以本目录**不**登记命名或错误目录缺口。
- **所有多返回值元组都已具名**（逐个接口扫描确认），TS 侧不会出现只能按下标取的返回值。
- **事件覆盖基本完整**：写函数普遍有事件；`PhaseSynchronized`、`ActionRegistered`、`RewardPrepared`、`OriginScoresSubmitted`、`ApplicationVoteRecorded`、`ServiceJoined`、`RecipientPaid` 等都在。失败的观测价值缺口集中在“视图拿不到”，不在“事件没发”（唯一例外是 `createdRound` 只能从事件读到，见 CI-003）。
- **分页签名与 `totalCount` 约定基本统一**：绝大多数集合读取是 `(offset, limit, reverse) → (list, totalCount)`，`limit = 0` 可取总数。

## 与 `m0-scope.md` 的口径差异

[`../product/m0-scope.md`](../product/m0-scope.md) 把“三条行动流水线”和“治理投票”排除在 M0 之外，但本次审计任务明确要求覆盖流水线/倒计时与首页“下一步”。因此 CI-001、CI-003、CI-006、CI-008、CI-009 对 M0 是**前置风险**（M0 可以先只做身份与铸造），对 M1 是**硬阻塞**。README 索引里的“影响的前端模块”按功能面写，不按里程碑写。
