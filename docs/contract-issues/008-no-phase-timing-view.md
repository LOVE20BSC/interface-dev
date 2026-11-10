# CI-008 没有阶段时间/阶段偏移视图，倒计时与验证开放窗口要在 TS 重算

- 严重级别：**Medium**
- 影响模块：流水线/倒计时
- 状态：Open
- 关联文件：`core/src/Phase.sol`、`core/src/interfaces/IPhase.sol`、`action/src/GroupActionVerify.sol`、`action/src/ActionRoundAxis.sol`、`action/src/LpRoundAxis.sol`、`action/src/GroupActionRoundAxis.sol`、`action/src/GroupServiceRoundAxis.sol`、`action/src/ExecutorBase.sol`

## 现象

界面要回答三类时间问题，链上只回答了半类：

1. **“这一轮什么时候结束”** —— 只能拿到 `(startBlock, phaseBlocks)`，结束区块要自己加；**没有任何时间戳**，也没有“每块多少秒”的估计值。`TARGET_SECONDS` 是**目标**，不是实际值，而且 `sync()` 会按 10% 阈值调整 `phaseBlocks`，所以“配置里的块时间”算出来的倒计时会漂。
2. **“验证阶段在什么时候对第 N 名验证者开放”** —— 这是**相位内部的区块偏移**：`ceil(phaseBlocks × SPLITS[rank-1] / 1e18)`。公式只存在于合约内部，接口只暴露 `SPLITS`，不暴露“某个 rank 的开放区块”。
3. **“阶段偏移”** —— `p / p-1 / p-2 / p-3` 分散在四个 `internal library` 里（LP 一个、GroupAction 两个、GroupService 一个），没有任何一个以数据形式暴露。

结论：倒计时可以用“区块数”精确表达，但墙钟时间与“开放/未开放”的边界判定必须在 TS 里**复刻合约算术**（含 `ceil`），复刻错一个单位就会出现“按钮亮着、点了回滚”。

## 证据

只有区块，没有时间：

```solidity
// core/src/Phase.sol:60-67
function phaseInfo(uint256 phaseNumber) public view returns (uint256 startBlock, uint256 phaseBlocks) {
    if (phaseNumber == 0) revert PhaseNotStarted();
    (bool found, uint256 key) = _segmentPhaseIndex.nearest(phaseNumber);
    assert(found);
    Segment memory segment = _segmentByPhase[key];
    startBlock = segment.startBlock + (phaseNumber - segment.phase) * segment.phaseBlocks;
    phaseBlocks = segment.phaseBlocks;
}
```
```solidity
// core/src/interfaces/IPhase.sol:17-30（全部可读面）
function ORIGIN_BLOCKS() ...
function ORIGIN_PHASE_BLOCKS() ...
function TARGET_SECONDS() ...
function ADJUST_THRESHOLD() ...
function SYNC_OBSERVATION_LIMIT() ...
function currentPhaseBlocks() ...
function currentPhase() ...
function lastSyncPhase() ...
function phaseInfo(uint256) returns (uint256 startBlock, uint256 phaseBlocks)
function phaseAtBlock(uint256) returns (uint256)
function observations(uint256 offset, uint256 limit, bool reverse)
    returns (uint256[] blockNumbers, uint256[] blockTimestamps, uint256 totalCount)
```

`phaseBlocks` 会被改：

```solidity
// core/src/Phase.sol:119-128
uint256 observed = Math.mulDiv(elapsedBlocks, TARGET_SECONDS, elapsedSeconds);
uint256 difference = observed > phaseBlocks ? observed - phaseBlocks : phaseBlocks - observed;
uint256 deviation = Math.mulDiv(difference, PRECISION, phaseBlocks);
if (deviation > ADJUST_THRESHOLD) {
    newPhaseBlocks = observed == 0 ? 1 : observed;
    _recordNextSegment(phase, phaseBlocks, newPhaseBlocks);
```

`observations` 的采样是“每 phase 最多一条”，且只在有人调 `sync()` 时才有：

```solidity
// core/src/Phase.sol:94-98
if (_lastSyncPhase == phase) {
    return (false, phaseBlocks);
}
_lastSyncPhase = phase;
```

验证者开放窗口的公式（合约内部、带 ceil）：

```solidity
// action/src/GroupActionVerify.sol:561-567
uint256 splitIndex = rank - 1;
(uint256 startBlock, uint256 phaseBlocks) = IPhase(protocol.phaseAddress).phaseInfo(round + 2);
uint256 openOffset =
    Math.mulDiv(phaseBlocks, self.SPLITS[splitIndex], GroupActionStorage.PRECISION, Math.Rounding.Ceil);
if (block.number < startBlock + openOffset) {
    revert IGroupActionVerifyErrors.VerifierNotOpen(verifierId, round);
}
```

阶段偏移分散在四个库：

```solidity
// action/src/ActionRoundAxis.sol:9-12
function joinRound(address phaseAddress) internal view returns (uint256) {
    uint256 phase = IPhase(phaseAddress).currentPhase();
    return phase <= OFFSET_JOIN_ROUND ? 0 : phase - OFFSET_JOIN_ROUND;   // OFFSET_JOIN_ROUND = 1
}
// LpRoundAxis.sol:11-14（OFFSET_MINT_ROUND = 2）
// GroupActionRoundAxis.sol:12-21（OFFSET_VERIFY_ROUND = 2, OFFSET_MINT_ROUND = 3）
// GroupServiceRoundAxis.sol:9-14（OFFSET_SERVICE_MINT = 3）
```

## 对前端的影响

1. **倒计时只能是“约 X 分钟”。** 要显示墙钟时间必须：(a) 额外调 `observations(0, 2, true)` 取最近两个采样点算秒/块；(b) 接受这个值在 `sync()` 调整后失效。`observations` 是 `(offset, limit, reverse)` 分页，注意 `reverse=true` 才是“最新两条”。移动端多一次调用、多一次失败点。
2. **阶段徽章的“开放/未开放”判定要复刻 ceil。** dev 参数是 `GROUP_ACTION_SPLITS=1e17,4e17,7e17`（`action/script/network/anvil31337_dev/action.params:5`，即 rank 2 在 10%、rank 3 在 40%、rank 4 在 70%）。若 `phaseBlocks = 101`，开放偏移是 `ceil(10.1)=11`、`ceil(40.4)=41`、`ceil(70.7)=71`；TS 里写成 `Math.floor` 就是 `10/40/70`，早开 1 个区块 → 用户点了 `submitOriginScores` 回滚 `VerifierNotOpen`。
3. **偏移表要写 4 份分支。** LP 只有 join/mint，GroupAction 多一个 verify，GroupService 复用 GroupAction 的验证结果但自己的 mint 偏移是 3。任何一处写错，用户会在错误的时间看到按钮。
4. **`SPLITS` 的“前置 phase”是隐式的。** 公式里用的是 `phaseInfo(round + 2)`（`round` 是验证轮 = `p-2`，所以取的是**当前** phase `p` 的段）。接口上完全看不出这一点：如果前端按 `round` 直接取 `phaseInfo(round)`，就会拿到 `p-2` 所在段的 `phaseBlocks`——一旦中间发生过 `sync()` 调整，两段的长度不同，整个窗口的开放区块就会整体偏移。

## 建议修复方案（最小改动）

1. `IPhase` 增加三个派生读（都是 O(1)，不新增存储）：
   ```solidity
   function phaseEndBlock(uint256 phaseNumber) external view returns (uint256);
   function blockTimeSeconds() external view returns (uint256);   // 由最近两条 observation 估计，无采样时返回 TARGET_SECONDS / ORIGIN_PHASE_BLOCKS
   function phaseTimeRange(uint256 phaseNumber) external view returns (uint256 startBlock, uint256 endBlock, uint256 startTimestamp, uint256 endTimestamp);
   ```
2. `IActionExecutor` 增加：
   ```solidity
   function stageWindows(address tokenAddress, uint256 actionId)
       external view returns (uint256 voteRound, uint256 joinOpenBlock, uint256 joinCloseBlock, uint256 mintCloseBlock);
   ```
   GroupAction 版本再加 `verifyOpenBlock`。把 `ActionRoundAxis`/`GroupActionRoundAxis` 的偏移从库函数变成**返回值**，前端就不用再抄常量。
3. `IGroupActionVerify` 增加 `verifierOpenBlock(address tokenAddress, uint256 actionId, uint256 round, uint256 rank) returns (uint256)` 与 `isVerifierOpen(address tokenAddress, uint256 actionId, uint256 round, uint256 verifierId) returns (bool)`。后者是判定，前者是展示，二者共用同一段 ceil 逻辑，避免前端复刻。
4. 若只想改一处：**先加 `phaseEndBlock` + `isVerifierOpen`**，这两条覆盖了 90% 的倒计时与“按钮能不能点”。

## 临时前端绕过方案

- 倒计时：`const { startBlock, phaseBlocks } = await phase.phaseInfo([phaseNo]); const endBlock = startBlock + phaseBlocks;` 用 **区块数** 显示（“还剩 37 个区块”），墙钟时间用 `observations(0, 2, true)` 的最近采样算 `secondsPerBlock`，并标注“约”。`sync()` 调整后下一次轮询自动纠正。
- 开放窗口：在 TS 里用 `bigint` 精确复刻：
  ```ts
  const openOffset = (phaseBlocks * split + 10n**18n - 1n) / 10n**18n;  // ceil
  const openBlock = startBlock + openOffset;                            // startBlock 来自 phaseInfo(currentPhase)
  ```
  并在 `submitOriginScores` 前用 `simulateContract` 兜底，捕获 `VerifierNotOpen` 时重新拉取 `phaseInfo` 并刷新。
- 代价：① 合约公式一变就静默错位（无编译期保护）；② `observations` 在冷启动/无人 `sync` 的链上可能只有 1 条或 0 条，秒/块只能退回目标值，倒计时可能偏 10%+；③ 每个 action 类型各写一份阶段逻辑，测试成本高。
