# CI-003 行动的创建轮次 `createdRound` 从未暴露

- 严重级别：**High**
- 影响模块：流水线/倒计时、行动参与（加入/退出）、行动激励铸造
- 状态：Open
- 关联文件：`action/src/ActionTarget.sol`、`action/src/ExecutorBase.sol`、`action/src/LpExecutor.sol`、`action/src/GroupActionManager.sol`、`action/src/GroupServiceExecutor.sol`

## 现象

每一个“这个阶段开没开”的判断都以**行动创建轮次** `createdRound` 为基准：

- 加入阶段：`currentPhase > createdRound` 才允许 `registerJoinState`；
- 铸造窗口：`createdRound ≤ round ≤ mintRound`；
- 结果视图：`createdRound == 0` 直接返回 0。

`createdRound` 被写进了 4 处状态，但**没有任何一个 view 函数把它读出来**。接口文件里它只出现在错误载荷中（`JoinNotOpen(..., createdRound)`、`RoundBeforeActionCreated(round, createdRound)`）。结果是：前端知道“现在第几轮”，却不知道“这个行动是从第几轮开始的”，于是无法判断阶段窗口。

## 证据

写入点（4 处，均为 `_createdRoundByActionId` / `createdRoundByActionId`）：

```solidity
// action/src/ActionTarget.sol:508-509
uint256 createdRound = _currentRound();
_createdRoundByActionId[tokenAddress][proposalId] = createdRound;
```
```solidity
// action/src/LpExecutor.sol:133
_createdRoundByActionId[tokenAddress][actionId] = IPhase(PHASE_ADDRESS).currentPhase();
```
```solidity
// action/src/GroupActionManager.sol:148
self.createdRoundByActionId[tokenAddress][actionId] = IPhase(protocol.phaseAddress).currentPhase();
```
```solidity
// action/src/GroupServiceExecutor.sol:445
_layout.createdRoundByActionId[tokenAddress][serviceActionId] = IPhase(PHASE_ADDRESS).currentPhase();
```

读取点全部是内部判定，没有一个是外部 view：

```solidity
// action/src/ActionTarget.sol:113-117
uint256 currentRound = _currentRound();
uint256 createdRound = _createdRoundByActionId[tokenAddress][actionId];
if (currentRound <= createdRound) {
    revert JoinNotOpen(tokenAddress, actionId, currentRound, createdRound);
}
```
```solidity
// action/src/ExecutorBase.sol:113-123
if (createdRound == 0) {
    revert IActionExecutorErrors.ActionNotCreated(tokenAddress, actionId);
}
if (round < createdRound) {
    revert IActionExecutorErrors.RoundBeforeActionCreated(round, createdRound);
}
```
```solidity
// action/src/GroupServiceExecutor.sol:695-697
uint256 createdRound = _layout.createdRoundByActionId[tokenAddress][actionId];
return createdRound != 0 && round >= createdRound && round <= _mintRound();
```

`createdRound` 在接口中的全部出现（仅错误载荷）：

```
action/src/interfaces/IActionTarget.sol:46-51     JoinNotOpen(address,uint256,uint256 currentRound,uint256 createdRound)
action/src/interfaces/IActionExecutor.sol:62-65   RoundBeforeActionCreated(uint256 round,uint256 createdRound)
```

`IActionTarget`（190 行）、`IActionExecutor`（120 行）、`IGroupActionExecutor`、`IGroupServiceExecutor`、`ILpExecutor` 中都没有返回 `createdRound` 的函数；`ActionTarget.actions()` / `votedActionIds()` 只返回 `actionIds + executors`（`ActionTarget.sol:306-334`、`336-371`），不含创建轮次。

对照组说明这不是“刻意的设计取舍”：同一个“轮次”概念在 `groupState` 里是暴露的——`activatedRound` / `deactivatedRound` 都在返回元组里（`action/src/interfaces/IGroupActionManager.sol:107-121`，结构体定义见 `action/src/GroupActionStorage.sol:25-30`），只有行动的 `createdRound` 没有出口。

## 对前端的影响

1. **流水线无法渲染。** “这个行动现在是投票期/加入期/验证期/铸造期”的判定式是 `phase − createdRound`（`CONTEXT.md:28`），缺 `createdRound` 就无法算，只能显示“进行中”这种无信息量的状态，或者干脆展示所有阶段按钮让用户去撞回滚。
2. **“我能铸哪些轮”无法确定。** `memberReward(token, actionId, round, memberId)` 在 `round < createdRound` 时静默返回 `(0,0,false)`（`LpExecutor.sol:402-405`、`GroupActionExecutor.sol:652-656`），与“已铸”无法区分（见 CI-011）。前端无法区分“这个轮次早于行动创建，永远不会有激励”和“还没到”。
3. **新建行动后首屏是空的。** 行动刚创建的那一轮（`currentPhase == createdRound`），加入还没开（要 `>` 才开），前端若不知道 `createdRound` 会把“加入按钮点了回滚”当成 bug 处理。
4. **每个行动多一次“试探性调用”。** 绕过得靠模拟交易解错误载荷（见下），每个 actionId 一次 `eth_call`，行动列表越长越慢。

## 建议修复方案（最小改动）

在 `IActionExecutor` 增加一个零风险的 getter，并让四个执行器/`ActionTarget` 都实现：

```solidity
// action/src/interfaces/IActionExecutor.sol
function createdRound(address tokenAddress, uint256 actionId) external view returns (uint256);

// action/src/ExecutorBase.sol（或各执行器，用已有的 _createdRoundByActionId / _layout）
function createdRound(address tokenAddress, uint256 actionId) external view returns (uint256) {
    return _createdRoundByActionId[tokenAddress][actionId];   // 未创建返回 0
}
```

同时给 `IActionTarget` 加 `createdRoundByActionId(address tokenAddress, uint256 actionId) returns (uint256)`（`ActionTarget` 自己那份 `_createdRoundByActionId` 目前完全不可读，而它正是 `registerJoinState` 的判据）。

命名遵循 `naming-standards.md` §七（键在名里）与 §九（`Round` 不是 `Phase`）；返回值 `0` 表示“未创建”，与 `_checkMintWindow` 的 `ActionNotCreated` 语义一致。若担心 0 歧义，再补一个 `isActionCreated(tokenAddress, actionId) returns (bool)`——但 `createdRound == 0` 已经是现有实现里的哨兵（`GroupServiceExecutor.sol:695`），保持一种口径即可。

## 临时前端绕过方案

- 对每个 `actionId` 用 `eth_call` 模拟 `mintMemberReward(token, actionId, round=1, memberId)`（`from` 设为该 member 的 owner），解析回滚数据：
  - `ActionNotCreated` → 行动不存在（`createdRound = 0`）；
  - `RoundBeforeActionCreated(1, createdRound)` → **载荷里就是 createdRound**；
  - 其它回滚 → 说明该轮已过窗口，需要换 `round` 再试。
- 代价：① 每个 actionId 1～3 次 `eth_call`，且依赖“错误载荷里带 createdRound”这一未被规范承诺的细节（`error-standards.md` 只承诺载荷形状，不承诺它可被当作查询接口）；② 一旦错误参数顺序调整，绕过静默失效，界面会退化成“不能加入”；③ 模拟交易需要正确的 `from`（member 的 owner），未连接钱包时不可用。
- **不接受**的绕过：把 `createdRound` 写死在前端配置里（每次新建行动都要发版）。
