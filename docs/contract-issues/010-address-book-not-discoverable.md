# CI-010 地址簿不可链上发现，错误地址静默返回 0

- 严重级别：**Medium**
- 影响模块：全部模块（启动引导）
- 状态：Open
- 关联文件：`core/src/Mint.sol`、`core/src/Vote.sol`、`core/src/Stake.sol`、`core/src/Launch.sol`、`action/src/ActionTarget.sol`、`action/src/ExecutorBase.sol`、`interface-dev-dsh/docs/product/m0-scope.md`

## 现象

core 的依赖图是**可链上遍历**的：从一个地址出发，能走到 Phase / MemberNFT / Stake / Submit / Vote / Mint / Launch / Router / PairFactory。

但 action 层是**断头路**：

- 任何 core 合约都不指向 `ActionTarget`；
- 任何合约都不指向三个执行器（Lp / GroupAction / GroupService）；
- 执行器只**向上**指 `ACTION_TARGET_ADDRESS`，所以“从执行器验证 ActionTarget”可以，“从 ActionTarget 找到执行器集合”不行。

因此前端必须把 `ActionTarget + 3 个执行器` 作为构建期常量写死（M0 文档也是这么假设的：地址来自导出的 `addresses.json`）。问题在于**地址错/版本错时没有任何链上报错**：`executorByActionId` 返回 0，`actionReward` 返回 `(0, false)`，`memberReward` 返回 `(0,0,false)`，界面表现为“这个行动没有任何内容”，而不是“配置错误”。

## 证据

core 侧的可遍历面（这条是好的，作为对照）：

```solidity
// core/src/Mint.sol:31-35
address public VOTE_ADDRESS;
address public SUBMIT_ADDRESS;
address public LAUNCH_ADDRESS;
address public MEMBER_NFT_ADDRESS;
address public PHASE_ADDRESS;
```
```solidity
// core/src/Vote.sol:15-18   STAKE_ADDRESS / SUBMIT_ADDRESS / PHASE_ADDRESS / MEMBER_NFT_ADDRESS
// core/src/Stake.sol:52-62  PHASE / MEMBER_NFT / VOTE / LAUNCH / ROUTER / PAIR_FACTORY
// core/src/Launch.sol:15-19 MINT / MEMBER_NFT / ROOT_PARENT_TOKEN / FIRST_TOKEN / PAIR_FACTORY
```

action 侧只有向上的边：

```solidity
// action/src/ExecutorBase.sol:14
address public immutable ACTION_TARGET_ADDRESS;
// action/src/ExecutorBase.sol:20-25（从 ActionTarget 反推 Stake / MemberNFT / Phase）
```
```solidity
// action/src/ActionTarget.sol:56-63（ActionTarget 只从 Mint 派生 core 地址，不记录执行器集合）
constructor(address mintAddress) {
    IMint mint = IMint(mintAddress);
    PHASE_ADDRESS = mint.PHASE_ADDRESS();
    MEMBER_NFT_ADDRESS = mint.MEMBER_NFT_ADDRESS();
    SUBMIT_ADDRESS = mint.SUBMIT_ADDRESS();
    VOTE_ADDRESS = mint.VOTE_ADDRESS();
    MINT_ADDRESS = mintAddress;
}
```

全仓 grep `ACTION_TARGET_ADDRESS` 的写侧只有执行器构造函数（`LpExecutor.sol:33`、`GroupActionExecutor.sol:31`、`GroupServiceExecutor.sol:77`），core 中零命中。

地址错误时的静默路径：

```solidity
// action/src/ActionTarget.sol:101-106
function executorByActionId(address tokenAddress, uint256 actionId) external view returns (address) {
    return _executorByActionId[tokenAddress][actionId];      // 未知 → 0
}
```
```solidity
// action/src/ActionTarget.sol:280-289
function actionReward(...) external view returns (uint256 amount, bool minted) {
    bool isBound = _executorByActionId[tokenAddress][actionId] != address(0);
    if (isBound) { ... }                                     // 未绑定 → (0, false)，无错误
}
```
```solidity
// action/src/LpExecutor.sol:396-405
minted = _memberMinted[...];
if (minted) { ... }
uint256 createdRound = _createdRoundByActionId[tokenAddress][actionId];
if (createdRound != 0 && round >= createdRound && round <= _mintRound()) { ... }   // 地址/行动不对 → (0,0,false)
```

M0 文档的口径（地址必须来自导出产物，不得硬编码）：

```
# interface-dev-dsh/docs/product/m0-scope.md:28
ABI 与地址由导出产物提供，前端不得硬编码地址
# :49
地址不可复现：本地部署地址依赖 nonce 与库链接顺序 … 因此前端必须只消费导出的地址簿
```

## 对前端的影响

1. **要硬编码 4 个地址**，且没有任何链上自检能证明“这 4 个是一套”。测试网换一次部署就要重新构建（M0 已经接受这一点），但**错配无法在运行时发现**。
2. **错误表现为“空”而不是“错”。** 如果 `GroupActionExecutor` 地址指向上一版部署，`executorByActionId` 返回 0，行动列表页会显示“该行动尚未绑定执行器”，用户不会报错，团队也不会收到信号。
3. **新部署 + 无行动时不可验证。** `votedActionIds` / `actions` 都返回空，`executorByActionId` 也无从查起；只有在有人创建了第一个行动之后，才能用 `ActionTarget.executorByActionId(...)` 反查。
4. **多环境切换是唯一必须的构建期输入。** dev/test/prod 三套构建的差异就在这几个地址上，错一个就整套界面空转。

## 建议修复方案（最小改动）

二选一，推荐第 1 条（纯加法、不需要新合约）：

1. **让 `ActionTarget` 记住执行器集合**（它在 `onProposalCreated` 里本来就知道 executor，只是没索引）：
   ```solidity
   // tokenAddress => executor 集合（或全局集合）
   mapping(address => mapping(address => bool)) internal _isExecutor;
   address[] internal _executors;   // 全局去重列表
   function executors(uint256 offset, uint256 limit, bool reverse)
       external view returns (address[] memory executorList, uint256 totalCount);
   function isExecutorBound(address tokenAddress, address executor) external view returns (bool);
   ```
   在 `onProposalCreated` 里首次见到某个 executor 时 push（`ActionTarget.sol:505-511` 附近），与 `_actionIdsByExecutor` 同批写。
2. **加一个只读注册表合约**（`ProtocolAddresses`），在部署脚本里一次性写入 core + action 全部地址，前端只读它一个地址：
   ```solidity
   function actionTarget() external view returns (address);
   function lpExecutor() external view returns (address);
   function groupActionExecutor() external view returns (address);
   function groupServiceExecutor() external view returns (address);
   ```
   好处是“前端只硬编码 1 个地址”，并且部署脚本的 `2x check` 可以直接断言这份注册表与真实绑定一致（`dev-standards.md` §6.1 的键集合断言可以复用）。

顺带修“静默 0”：`executorByActionId` 对未知 action 应回 `ActionNotCreated`，或至少提供 `isActionBound(tokenAddress, actionId) returns (bool)`，让前端能区分“没有奖励”和“地址错了”。

## 临时前端绕过方案

- 启动时做 4 条自检，任一失败就整站进入“配置错误”页（而不是空态）：
  1. `executor.LpExecutor.ACTION_TARGET_ADDRESS() == actionTarget`（三个执行器各一次）；
  2. `actionTarget.MINT_ADDRESS()` / `VOTE_ADDRESS()` / `MEMBER_NFT_ADDRESS()` / `PHASE_ADDRESS()` 与 core 导出一致；
  3. `mint.VOTE_ADDRESS()` → `vote.STAKE_ADDRESS()` → `stake.ROUTER_ADDRESS()` 的链路能走通；
  4. `phase.currentPhase() >= 1`（链已启动）。
- 代价：启动多 8～10 次 `eth_call`（可并行，首屏增加 ~200ms）；仍无法证明“执行器是当前 ActionTarget 认可的那一个”，只能证明“执行器认这个 ActionTarget”。
- 另外在 `addresses.json` 里带上部署区块号与 commit，构建时打印出来，出问题能对账。
- **不接受**的绕过：跳过自检、把空态当正常态。
