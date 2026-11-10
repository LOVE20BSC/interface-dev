# CI-006 待铸造金额按“现在”现算，会变，甚至变成 0 或被销毁

- 严重级别：**High**
- 影响模块：激励铸造、首页“下一步”
- 状态：Open
- 关联文件：`action/src/LpExecutor.sol`、`action/src/GroupServiceExecutor.sol`、`action/src/GroupActionExecutor.sol`、`core/src/Mint.sol`

## 现象

行动层与核心层的“我能铸多少”视图，在**未铸造**状态下不是读一个已经定死的数，而是用**当前时刻**的治理质押状态和**当前时刻**的激励池余量重新算一遍：

- **LP 行动**：上限用 `IPhase.currentPhase()` 的治理票比例；如果那一刻社区总治理票为 0，直接返回“铸 0、烧掉全部”。
- **群服务**：owner 部分的上限同样用**当前** phase 的治理票比例，超出的部分记成 `ownerBurned`。
- **核心治理激励 / 提案激励**：本轮未 `prepare` 时，金额基于 `rewardAvailable()`（= 剩余供应 − 已预留 + 已铸/已烧）现算，而这个值会随任何其它轮次的 prepare/铸造而变动。

所以“待铸造金额”是一个**时间函数**，不是账户属性。同一个身份、同一轮、同一份历史，今天看到的值和明天按下按钮拿到的值可以不同；极端情况下前端显示 100，用户拿到 0。

## 证据

LP 行动：用当前 phase 的治理比例；总票为 0 时**全部销毁**：

```solidity
// action/src/LpExecutor.sol:330-344
uint256 currentPhase = IPhase(PHASE_ADDRESS).currentPhase();
if (IStake(STAKE_ADDRESS).totalValidGovVotes(tokenAddress, currentPhase) == 0) {
    return (0, theoreticalReward);          // ← mintAmount = 0, burnAmount = 全部
}
uint256 govRatioCap =
    Math.mulDiv(_calculateGovRatio(tokenAddress, currentPhase, memberId), govRatioMultiplierValue, PRECISION);
uint256 cappedRatio = effectiveLpRatio < govRatioCap ? effectiveLpRatio : govRatioCap;
mintAmount = cappedRatio == effectiveLpRatio ? theoreticalReward : Math.mulDiv(proposalReward, cappedRatio, PRECISION);
burnAmount = theoreticalReward - mintAmount;
```

且 `govRatio` 在未铸造时返回**实时**比例、已铸造时返回冻结比例，同一个函数返回值的语义随时间切换：

```solidity
// action/src/LpExecutor.sol:375-387
function govRatio(address tokenAddress, uint256 actionId, uint256 round, uint256 memberId)
    external view returns (uint256 ratio, bool minted)
{
    minted = _memberMinted[tokenAddress][actionId][round][memberId];
    if (minted) {
        ratio = _mintedGovRatioByMemberId[tokenAddress][actionId][round][memberId];
    } else {
        ratio = _calculateGovRatio(tokenAddress, IPhase(PHASE_ADDRESS).currentPhase(), memberId);
    }
}
```

群服务：同样的实时 cap + 销毁：

```solidity
// action/src/GroupServiceExecutor.sol:558-580（节选）
uint256 currentPhase = IPhase(PHASE_ADDRESS).currentPhase();
uint256 totalValidGovVotes = IStake(STAKE_ADDRESS).totalValidGovVotes(settlement.actionTokenAddress, currentPhase);
if (totalValidGovVotes != 0) {
    uint256 govRatio = Math.mulDiv(
        IStake(STAKE_ADDRESS).validGovVotes(settlement.actionTokenAddress, currentPhase, memberId),
        PRECISION, totalValidGovVotes
    );
    cap = Math.mulDiv(govRatio, settlement.govRatioMultiplier, PRECISION);
}
...
} else {
    settlement.ownerReward = Math.mulDiv(settlement.serviceReward, cap, PRECISION);
    settlement.ownerBurned = theoreticalOwnerReward - settlement.ownerReward;
}
```

核心：未 prepare 时用实时池子 + 实时扫描（扫描本身见 CI-002）：

```solidity
// core/src/Mint.sol:336-343
if (_isRewardPrepared[tokenAddress][round]) {
    proposalRewardAmount = _proposalReward[tokenAddress][round];
    eligibleVoteAmount = _eligibleProposalVoteAmountByRound[tokenAddress][round];
} else {
    uint256 available = rewardAvailable(tokenAddress);
    proposalRewardAmount = Math.mulDiv(available, ROUND_REWARD_PROPOSAL_RATIO, PRECISION);
    eligibleVoteAmount = _calculateEligibleProposalVoteAmount(tokenAddress, round, minVoteAmount);
}
```
```solidity
// core/src/Mint.sol:465-468
function rewardAvailable(address tokenAddress) public view returns (uint256) {
    ILOVE20Token token = ILOVE20Token(tokenAddress);
    return (token.MAX_SUPPLY() - token.totalSupply()) - reservedAvailable(tokenAddress);
}
```

行动层的 `memberReward` 也走这条：`GroupActionExecutor.memberReward` → `IActionTarget.actionReward` → `Mint.proposalRewardByProposalId`（`action/src/GroupActionExecutor.sol:667-669`）。

## 对前端的影响

1. **不能承诺金额。** 铸造确认页写“你将获得 X”是错的；必须写“按当前治理比例估算 X，实际以交易执行时为准”。对一个面向非加密用户的产品，这是核心信任问题。
2. **金额会**降**到 0，且用户不知道为什么。** 如果社区在某一 phase 内治理票归零（例如所有人都在解锁），LP 行动的待铸造金额会整笔变 0 并全部销毁；`memberReward` 仍返回 `(0, 0, false)`，与“本来就没资格”长得一模一样（渲染后果见 CI-011）。
3. **“待铸造总额”每次刷新都在跳。** 首页把所有行动的待铸造金额加起来，这个数字会随别人的质押/铸造而变，用户会认为页面在随机抖动。
4. **无法离线缓存。** 任何缓存都是错的（缓存 1 分钟就可能与链上差出一个 cap），所以每次进入铸造页都必须重新 `eth_call` 全部金额。
5. **前后端一致性不可测。** 前端做不了“本地算一遍对不对”的自检，因为正确值取决于交易被打包的 phase。

## 建议修复方案（最小改动）

1. **把影响结果的状态在“轮次结算点”快照下来**，读路径只读快照。最小实现：在 `mintActionReward` / `mintProposalReward`（即本轮第一次结算）时，把当时的 `totalValidGovVotes` / `validGovVotes(memberId)` 或直接算出的 `govRatioCap` 写进 `(token, actionId, round, memberId)` 的存储，`memberReward` 优先返回快照值。LP 已有 `_mintedGovRatioByMemberId` 这个字段（`LpExecutor.sol:68-69`），只需**提前到验证/结算轮写入**，而不是铸造时写。
2. **让返回值带“是否会被销毁”与“为什么是 0”**：`memberReward` 应返回 `(mintAmount, burnAmount, minted, bool capped)`；`GroupServiceExecutor` 的两个视图 `memberReward`（`GroupServiceExecutor.sol:284-309`）与 `serviceRewardByMemberId`（`238-282`）对同一笔结算给出不同的拆解，而 `SettlementCause`（`NoEligibleWeight` / `PoolEmpty`）**两个视图都不返回**——前端拿不到“为什么是 0”。建议合并成一个返回 `(mintAmount, burnAmount, minted, cause)` 的视图。
3. **核心层**：若本轮未 prepare，视图不要用 `rewardAvailable()` 现算，而是返回 `(0, false, prepared=false)`，强制先 prepare；prepare 之后的金额才是稳定的（这条与 CI-002 是同一处改动）。
4. 如果“按领取时刻的治理比例”是**有意的经济设计**（惩罚不质押的参与者），那也必须在接口层把这件事说出来：加 `function rewardBasisRound(address tokenAddress, uint256 actionId, uint256 round) external view returns (uint256)`，让前端能显示“本金额按第 N 轮治理比例计算”。

## 临时前端绕过方案

- 铸造按钮前用 `simulateContract`（`eth_call`）取真实返回值，把模拟结果当作**确认页金额**；提交前再模拟一次，若两次金额不同（阈值 > 0.1%）就阻止提交并提示“治理比例刚变化，请确认新金额”。代价：① 每次确认多 1 次 `eth_call`；② 模拟与打包之间仍有窗口（几秒），金额仍可能变；③ 移动端弱网下模拟失败率高，要有降级文案。
- 首页“待铸造总额”改为显示范围或“约”，并标注计算依据（当前治理比例 / 未结算池子），绝不写成可提现金额。
- 对 LP 行动的 `totalValidGovVotes == 0` 分支单独做红色警告（“当前社区无人质押治理，本轮激励将全部销毁”），并把用户引导到质押页。
- **不接受**的绕过：用前端本地公式预算金额后展示（公式里有 `ceil`、`mulDiv`、当前 phase 三个变量，本地结果与链上必然偶发不一致）。
