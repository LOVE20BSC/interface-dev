# CI-007 “轮次未开始”有三种答复：回滚 / 空数组+0 / 静默 0

- 严重级别：**Medium**
- 影响模块：全部读链层（Multicall 批量读取、空态渲染）
- 状态：Open
- 关联文件：`core/src/Stake.sol`、`core/src/Phase.sol`、`action/src/ActionTarget.sol`、`action/src/LpExecutor.sol`、`action/src/GroupServiceExecutor.sol`、`action/src/ExecutorBase.sol`、`action/src/GroupActionVerify.sol`

## 现象

同一个语义——“你问的这个轮次还没开始”——在四个合约族里有三种互不兼容的答复：

| 答复 | 出现位置 |
| --- | --- |
| **回滚** `RoundNotStarted` / `PhaseNotStarted` | `Stake.validGovVotes` 等 8 个 round 读函数、`Phase.phaseInfo(0)`、`Phase.currentPhaseBlocks()`、`ExecutorBase.currentJoinRound/currentMintRound`、`GroupActionVerify.currentVerifyRound` |
| **空数组 + 0** | `ActionTarget.memberIdsByActionId`、`ActionTarget.isJoinedByRound` |
| **静默 0** | `LpExecutor.joinedAmountByActionId/ByMemberId`、`GroupServiceExecutor.joinedAmountByActionId/ByMemberId`、各 `memberReward` |

`CONTEXT.md:28` 明确规定的是**回滚**：“结果小于 `1` 表示该阶段尚未开始，查询回滚而不返回 `0`”。行动层两个返回空/0 的实现直接违反这条。

另有一处更细的偏差：`Stake._checkRoundStarted` 只拦 `round > currentRound`，`round = 0` 不进回滚分支，会一路读到历史索引返回 0（`RoundHistoryUint256.value(0)` 无键时返回 0）。

## 证据

回滚派：

```solidity
// core/src/Stake.sol:489-492
function _checkRoundStarted(uint256 round) private view {
    uint256 currentRound = _currentRound();
    if (round > currentRound) revert RoundNotStarted(round, currentRound);
}
// 调用者：validGovVotes(354)、totalValidGovVotes(363)、totalValidGovVotesAdded(368)、
//        totalValidGovVotesRemoved(373)、validBoostShares(461)、totalValidBoostShares(470)、
//        totalValidBoostSharesAdded(475)、totalValidBoostSharesRemoved(480)
```
```solidity
// core/src/Phase.sol:51-54 / 60-61
if (phase == 0) revert PhaseNotStarted();      // currentPhaseBlocks / phaseInfo
```
```solidity
// action/src/ExecutorBase.sol:91-106
function currentJoinRound() public view override returns (uint256) {
    uint256 round = _joinRound();
    if (round == 0) { revert IActionExecutorErrors.RoundNotStarted(1, 0); }
    return round;
}
function currentMintRound() external view override returns (uint256) { ... if (round == 0) revert ... }
```
```solidity
// action/src/GroupActionVerify.sol:528-534
function currentVerifyRound(address phaseAddress) internal view returns (uint256) {
    uint256 round = GroupActionRoundAxis.verifyRound(phaseAddress);
    if (round == 0) { revert IActionExecutorErrors.RoundNotStarted(1, 0); }
    return round;
}
```

空数组 + 0 派：

```solidity
// action/src/ActionTarget.sol:244-257
function memberIdsByActionId(
    address tokenAddress, uint256 actionId, uint256 round, uint256 offset, uint256 limit, bool reverse
) external view returns (uint256[] memory memberIds, uint256 totalCount) {
    if (round > _joinRound()) {
        return (new uint256[](0), 0);        // ← 看起来像“没人加入”
    }
    (memberIds, totalCount) = _memberIdsByActionId[tokenAddress][actionId].valuesByRound(round, offset, limit, reverse);
}
```
```solidity
// action/src/ActionTarget.sol:201-214
function isJoinedByRound(...) external view returns (bool) {
    if (round > _joinRound()) { return false; }
    ...
}
```

静默 0 派：

```solidity
// action/src/LpExecutor.sol:408-425
function joinedAmountByActionId(address tokenAddress, uint256 actionId, uint256 round) external view returns (uint256 amount) {
    if (round > _joinRound()) { return 0; }
    ...
}
function joinedAmountByMemberId(...) external view returns (uint256 amount) {
    if (round > _joinRound()) { return 0; }
    ...
}
```
```solidity
// action/src/GroupServiceExecutor.sol:193-218 同上（round > _joinRound() → 0）
```

规范原文：

```
# matt-gov/CONTEXT.md:28（节选）
… GroupAction 和 GroupService 的投票、加入、验证、铸币 Round 分别为 p、p-1、p-2、p-3。
结果小于 1 表示该阶段尚未开始，查询回滚而不返回 0。
```

## 对前端的影响

1. **Multicall 不能“一把梭”。** 同一页要同时读 `Stake`（回滚）和 `ActionTarget`（空）时，必须用 `aggregate3` + `allowFailure`，并把“revert”也当成有效数据解析；用 `aggregate` 的实现在遇到一个未开始轮次时会整笔失败，页面白屏。
2. **空态会撒谎。** “本轮还没有人加入”与“本轮还没开始”在 UI 上是两句完全不同的话：前者要显示“来当第一个”，后者要显示“加入将于 X 开放”。`memberIdsByActionId` 对两者都返回 `([], 0)`，前端只能靠自己算 `phase − 1` 来区分（又把偏移表复制一遍，见 CI-008）。
3. **风控隐患。** 静默 0 让“轮次参数写错”变成“金额为 0”，前端不会报错，用户看到的是“暂无”。这类 bug 只能靠人眼发现。
4. **`round = 0` 是漏网值。** `Stake.validGovVotes(token, 0, memberId)` 不回滚、返回 0；而 `Phase.id 0` 又是“未开始”的哨兵。前端若把 0 当作合法轮次传下去，会得到“0 票”这种看起来正常的结果。

## 建议修复方案（最小改动）

**统一成一个约定**，优先选“全部回滚”，因为它符合 `CONTEXT.md:28` 且能被 `try/catch` 与 Multicall `allowFailure` 明确识别：

1. `ActionTarget.memberIdsByActionId`、`isJoinedByRound`、`LpExecutor.joinedAmountByActionId/ByMemberId`、`GroupServiceExecutor.joinedAmountByActionId/ByMemberId`：把 `if (round > _joinRound()) return 0;` 改成 `revert IActionExecutorErrors.RoundNotStarted(_joinRound() + 1, round)`（错误已在 `IActionExecutorErrors` 里，`IActionExecutor.sol:58-61`，无需新增）。
2. `Stake._checkRoundStarted` 补上 `round == 0`：`if (round == 0 || round > currentRound) revert RoundNotStarted(round, currentRound);`。零值按不存在处理是 `dev-standards.md` §5.2.1 的既有要求。
3. 若担心“回滚会让批量读取更难”，那就反过来统一成“所有 round 读函数都返回 `(value, bool roundStarted)`”，但**不能两种并存**。无论选哪种，都写进 `matt-gov/docs/specs/action/02-phase-model.md`，否则下一个实现者还会分叉。

## 临时前端绕过方案

- 读链层加一个 `assertRoundStarted(round, stage)` 前置：先用 `Phase.currentPhase()` + 偏移表本地算出该阶段的 `round`，若 `round < 1` 或 `round > currentPhase` 就**不发请求**，直接返回 `{status: "not-started"}`。
- 所有 Multicall 用 `aggregate3` + `allowFailure: true`，把失败项映射成 `{status: "reverted", selector}`，由上层决定渲染“未开始”还是“错误”。
- 代价：① 偏移表（LP 1/2、GroupAction 1/2/3、GroupService 3）被复制到 TS，合约一改就漂移；② 仍然无法区分“合约真的回滚了”与“网络失败”，错误文案可能误导；③ 每个 action 类型各写一份分支，容易漏。
