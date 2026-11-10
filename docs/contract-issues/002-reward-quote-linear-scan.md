# CI-002 激励报价每次都线性扫描本轮全部已投票提案

- 严重级别：**High**
- 影响模块：行动激励铸造、流水线（每个行动的“可铸金额”）
- 状态：Open
- 关联文件：`core/src/Mint.sol`、`core/src/Submit.sol`、`core/src/Vote.sol`、`action/src/ActionTarget.sol`、`action/src/GroupServiceExecutor.sol`、`action/src/LpExecutor.sol`

## 现象

`Mint` 在“本轮激励尚未 `prepare`”时，会用一次全量扫描现算 `eligibleProposalVoteAmount`：先以 `limit = type(uint256).max` 取出本轮**所有**已投票提案 id，再对每个 id 发起一次跨合约调用读票数。

这段逻辑同时位于：

- **视图路径** `proposalRewardByProposalId`（未 prepare 时）；
- **写路径** `prepareRewardIfNeeded`、`mintProposalReward`。

行动层的每个“可铸金额”最终都走这条路径（`ActionTarget.actionReward → Mint.proposalRewardByProposalId`），所以它不是冷门接口，而是**行动激励报价的唯一入口**。

## 证据

```solidity
// core/src/Mint.sol:273-313
function _calculateEligibleProposalVoteAmount(
    address tokenAddress, uint256 round, uint256 minVoteAmount
) internal view returns (uint256 eligibleVoteAmount) {
    (uint256[] memory proposalIds, uint256 totalProposalCount) = IVote(VOTE_ADDRESS).votedProposalIds(
        tokenAddress, round, 0, 0, false
    );
    if (totalProposalCount > 0) {
        (proposalIds, ) = IVote(VOTE_ADDRESS).votedProposalIds(
            tokenAddress, round, 0, totalProposalCount, false   // ← limit = totalCount
        );
        for (uint256 i = 0; i < proposalIds.length; i++) {
            uint256 voteAmount = IVote(VOTE_ADDRESS).voteAmountByProposalId(   // ← 每项一次外部调用
                tokenAddress, round, proposalIds[i]
            );
            if (voteAmount > 0 && voteAmount >= minVoteAmount) {
                eligibleVoteAmount += voteAmount;
            }
        }
    }
}
```

调用点：

```
// core/src/Mint.sol:123           _prepareRewardIfNeeded（写）
// core/src/Mint.sol:342           _proposalRewardCalculation 的未 prepare 分支（读）
// core/src/Mint.sol:355-364       proposalRewardByProposalId → 视图
// core/src/Mint.sol:205           mintProposalReward → 写
```

上游入口：

```solidity
// action/src/ActionTarget.sol:280-289
function actionReward(address tokenAddress, uint256 actionId, uint256 round)
    external view returns (uint256 amount, bool minted)
{
    bool isBound = _executorByActionId[tokenAddress][actionId] != address(0);
    if (isBound) {
        (amount, minted) = IMint(MINT_ADDRESS).proposalRewardByProposalId(tokenAddress, round, actionId);
    }
}
```

`actionReward` 的调用点包括 `GroupActionExecutor.memberReward`（`action/src/GroupActionExecutor.sol:667`）、`GroupServiceExecutor._settlement`（`action/src/GroupServiceExecutor.sol:529`）、`LpExecutor._pendingMemberReward`（`action/src/LpExecutor.sol:452`）。也就是说：**每个成员、每个行动的金额报价都会触发同一段扫描**（同一 `(社区, 轮)` 在 prepare 之后才是 O(1)）。

规模上界（这是实测口径，不是“无限循环”）：一轮的已投票提案集合 ≤ 本轮提交数，而 `Submit` 硬上限 `SUBMIT_ROUND_LIMIT = 1000`：

```solidity
// core/src/Submit.sol:16
uint256 private constant SUBMIT_ROUND_LIMIT = 1000;
// core/src/Submit.sol:292-294
if (_submits[tokenAddress][round].length >= SUBMIT_ROUND_LIMIT) {
    revert SubmitRoundFull(tokenAddress, round, SUBMIT_ROUND_LIMIT);
}
```

`vote` 只能投本轮已推举的提案（`core/src/Vote.sol:224-227`），所以上界确实是 1000。按每次迭代约 1 次冷 `CALL`（2600）+ 1 次冷 `SLOAD`（2100）估算，最坏一次扫描 ≈ **5M gas**。

## 对前端的影响

1. **报价页在“治理热轮”上直接不可用。** 若一个轮次有 300+ 提案，单次报价 ≈ 1.5M+ gas；一个“我的行动激励”列表 10 个行动 × 5 个轮次 = 50 次报价 ≈ 75M gas，必然超 RPC 的 `eth_call` gas cap，Multicall 聚合会整笔失败（不是单项失败）。
2. **必须先付一笔前置交易。** `_isRewardPrepared == false` 时金额是现算的（还叠加 CI-006 的 live pool），要拿到稳定值只能先发 `prepareRewardIfNeeded`——每个 `(社区, 轮)` 一笔，且这笔交易本身要付上面那 5M gas 的扫描。
3. **首页“可铸金额”无法批量预览。** 任何“把所有轮次金额列出来”的界面都会退化成 N 次高 gas 调用 + N 笔 prepare 交易。
4. 轮次越热闹（提案越多），前端越慢/越容易失败——恰好是用户最需要看的时候。

## 建议修复方案（最小改动）

1. **把扫描从读路径挪走**：新增
   ```solidity
   function proposalRewardPrepared(address tokenAddress, uint256 round, uint256 proposalId)
       external view returns (uint256 amount, bool minted, bool prepared);
   ```
   未 prepare 时返回 `(0, minted, false)` 并且**不**重算；前端据此提示“尚未结算，请先准备激励”，再走一笔 prepare。这样报价恒为 O(1)。
2. **批量准备**：`prepareRewardsIfNeeded(address tokenAddress, uint256[] calldata rounds)`，把 N 笔交易并成 1 笔（仍然是每轮一次扫描，但只付一次交易开销）。
3. **中期**：`eligibleProposalVoteAmount` 的本质是“超过阈值的票数之和”，阈值 `minVoteAmount` 随 `totalVoteAmount` 增长而变，所以无法增量维护。可选方案是在 prepare 时就把结果定死（现在已存 `_eligibleProposalVoteAmountByRound`），并且**让所有读路径只读存值**；再给 `proposalRewardByProposalId` 增加 `prepared` 标志。这是本条的核心：**读路径永远不要重算**。

## 临时前端绕过方案

- 启动时对每个 `(社区, 轮)` 先调 `isRewardPrepared(tokenAddress, round)`（`core/src/Mint.sol:64-66`，O(1)）；
  - `true` → 直接读 `proposalRewardByProposalId`（此时 O(1)）；
  - `false` → 不报价，显示“待准备”，并提供“准备本轮激励”按钮（发 `prepareRewardIfNeeded`）。
- 代价：① 每个 `(社区, 轮)` 多 1 次调用；② 用户要多签一笔交易才能看到金额；③ prepare 交易在提案多的轮次 gas 高，需要在 UI 上提示；④ 如果没人 prepare，前端永远显示“待准备”，用户会误以为系统坏了——文案必须写清这是链上结算步骤。
- **不接受**的绕过：在浏览器里本地重算 `eligibleVoteAmount`（那等于把 Mint 的公式和 1000 次读复制到前端，且结果会与链上不一致）。
