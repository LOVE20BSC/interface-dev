# CI-001 没有按 `memberId` 的轮次/行动索引，待铸造激励无法枚举

- 严重级别：**Blocker**
- 影响模块：首页“下一步”、激励铸造、验证者任务
- 状态：Open
- 关联文件：`core/src/Mint.sol`、`core/src/Vote.sol`、`core/src/Stake.sol`、`action/src/ActionTarget.sol`、`action/src/ExecutorBase.sol`

## 现象

所有“我的激励/我的行动/我的投票”读取都是 **(tokenAddress, round, memberId)** 三维键，必须由调用方先知道 `round` 才能取。链上没有任何 `roundsByMemberId` / `tokenAddressesByMemberId` / `actionIdsByMemberId` 的**历史**索引：

- 想知道“我这个身份在哪些轮投过票、还有哪些轮激励没铸造” → 只能把 `round` 从 `1` 扫到 `currentPhase`，每个 `(community, round)` 至少 2 次调用。
- 想用批量铸造入口“一次铸完” → 它要的正是那个数组，而链上给不出这个数组。
- 主页“下一步该做什么”是对上述集合的聚合，因此同样不可算。

`currentPhase` 只增不减（`Phase` 每 `phaseBlocks` 个区块 +1），所以这个扫描成本**随时间单调恶化**，不是“先忍一忍、以后数据多了再说”的问题。

## 证据

`round` 是必需入参，且没有反向索引：

```
// core/src/Mint.sol:417-430
function govRewardByMemberId(
    address tokenAddress,
    uint256 round,
    uint256 memberId
) external view returns (uint256 voteReward, uint256 boostReward, bool minted) {
    IMemberNFT(MEMBER_NFT_ADDRESS).ownerOf(memberId);
    return _govRewardCalculation(tokenAddress, round, memberId);
}
```

```
// core/src/Vote.sol:167-181
function votedProposalIdsByMemberId(
    address tokenAddress,
    uint256 round,
    uint256 memberId,
    uint256 offset,
    uint256 limit,
    bool reverse
) external view returns (uint256[] memory proposalIds, uint256[] memory voteAmounts, uint256 totalCount)
```

```
// core/src/Stake.sol:354-361
function validGovVotes(address tokenAddress, uint256 round, uint256 memberId)
    external view returns (uint256)
{
    _checkRoundStarted(round);
    return _validGovVotesByMember[tokenAddress][memberId].value(round);
}
```

批量写入入口存在，但它的入参在链上无法构造：

```
// core/src/Mint.sol:253-271
function mintGovRewards(
    address tokenAddress,
    uint256[] calldata rounds,
    uint256 memberId,
    address recipient
) external onlyMemberOwner(memberId) returns (uint256[] memory voteRewards, uint256[] memory boostRewards) {
    uint256 length = rounds.length;
    ...
    for (uint256 i = 0; i < length; i++) {
        (voteRewards[i], boostRewards[i]) = _mintGovReward(tokenAddress, rounds[i], memberId, recipient);
    }
```

```
// action/src/ExecutorBase.sol:71-94（节选）
function mintMemberRewards(
    address tokenAddress,
    uint256[] calldata actionIds,
    uint256[] calldata rounds,
    uint256 memberId
) external ... {
    ...
    for (uint256 i = 0; i < length; i++) {
        (mintAmounts[i], burnAmounts[i]) = _mintMemberReward(tokenAddress, actionIds[i], rounds[i], memberId);
    }
}
```

行动层唯一的按成员索引是**当前加入集合**，退出即删，拿不到历史：

```
// action/src/ActionTarget.sol:233-242
function actionIdsByMemberId(address tokenAddress, uint256 memberId, uint256 offset, uint256 limit, bool reverse)
    external view returns (uint256[] memory actionIds, uint256 totalCount)
{
    (actionIds, totalCount) = _actionIdsByMemberId[tokenAddress][memberId].values(offset, limit, reverse);
}
// 该集合在 clearJoinState / forceClearJoinState 中被移除（ActionTarget.sol:150-155、177-182）
```

反查确认：`core/src/interfaces/*` 与 `action/src/interfaces/*` 中不存在 `roundsByMemberId`、`roundsBy`、`tokenAddressesByMemberId` 任何形态（全目录 grep 无命中）；`IMint` 只有 `launchCredit(tokenAddress, memberId)` 这一个成员级聚合，且不含轮次。

## 对前端的影响

1. **“我的待铸造激励”无法给出总量。** 每次进入首页，只能对 `round ∈ [max(1, currentPhase-N), currentPhase]` 做窗口扫描。取 N=30、3 个社区、每 `(社区,轮)` 2 次调用 ≈ 180 次 `eth_call`；这还只是“最近 30 轮”，历史未铸造的激励直接看不见。N 取到全历史时，1 年（每天 1 phase）就是 3 × 365 × 2 ≈ 2190 次调用，移动端不可接受，且随天数线性增长。
2. **批量铸造入口不可用。** `mintGovRewards` 对数组里任一“没投过票”的轮次回滚 `MemberHasNoVote`（`core/src/Mint.sol:531-533`），对已铸造轮次回滚 `MemberRewardAlreadyMinted`（`524-526`）——整笔原子回滚。要安全调用它，前端必须先对每一轮做 3 次判断（`voteAmountByMemberId != 0`、`!minted`、`round` 已结束），反而比单轮铸造更贵。
3. **“下一步”只能靠猜。** 首页要么显示“请去投票”（用户可能已经投过），要么显示“有激励可铸造”（可能为 0），二者都会让新用户第一次操作就撞回滚。
4. **验证者任务面同样不可枚举**（细化见 CI-009）。

## 建议修复方案（最小改动）

按“先给治理激励，再给行动激励”的顺序做，两处都是**新增 view + 写入路径 O(1) 记账**，不改现有签名：

1. `Vote` 增加成员级轮次索引（这是治理激励的唯一缺口）：
   ```solidity
   // tokenAddress => memberId => rounds（每成员每轮首次投票时 push，和 _votedProposalIdsByMemberId 同批写）
   mapping(address => mapping(uint256 => uint256[])) internal _votedRoundsByMemberId;
   function votedRoundsByMemberId(address tokenAddress, uint256 memberId, uint256 offset, uint256 limit, bool reverse)
       external view returns (uint256[] memory rounds, uint256 totalCount);
   ```
   在 `_vote` 里 `isFirstVoteByMember` 分支（`Vote.sol:258-264`）顺手 push，写入成本 +1 SSTORE/成员/轮。
2. `Mint` 增加派生读取（不新增存储，直接吃上一条）：
   ```solidity
   function claimableRoundsByMemberId(address tokenAddress, uint256 memberId, uint256 offset, uint256 limit, bool reverse)
       external view returns (uint256[] memory rounds, uint256[] memory voteRewards, uint256[] memory boostRewards, bool[] memory minted);
   ```
   前端一次调用拿到“可铸/已铸/金额”，`mintGovRewards` 的入参也从这里来。
3. 行动层同理：`ActionTarget` 增加 `joinedRoundsByMemberId(tokenAddress, memberId, ...)`（按 `registerJoinState` 记录，`clearJoinState` 不删历史），或在 `ExecutorBase` 增加 `memberRewardRounds(tokenAddress, actionId, memberId, ...)`。
4. 若这轮只想做一件事：**先做第 1 条**。M0 只承诺身份与铸造，但 `votedRoundsByMemberId` 是 M1 所有“我的激励”页面的地基，且是纯加法。

## 临时前端绕过方案

- 只扫最近窗口（默认 30 轮，最多 90 轮），用 Multicall3 `aggregate3` + `allowFailure` 批量取；超出窗口显示“更早的记录需继续扫描”按钮，结果按 `(chainId, memberNFT, memberId, tokenAddress, round)` 缓存在 `localStorage`，增量只补新轮。
- 代价：① 首次加载 100～300 次调用，弱网下 3～8 秒；② 永远算不出“历史未铸造总量”，只能给“最近 N 轮”；③ 缓存键必须含身份与社区，切换身份即失效（否则会把 A 的待铸造金额显示给 B）；④ 用户可能因为看不到旧轮次而永久漏铸——这是**资金级**后果，必须在 UI 上明写“仅显示最近 N 轮”。
- **不接受**的绕过：把“最近 1 轮”当成“全部待铸造”，或把估算值写成“可得金额”。
