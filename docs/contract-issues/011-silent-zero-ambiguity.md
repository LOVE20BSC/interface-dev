# CI-011 静默 0 / 歧义 0：分不清“没有”与“未开始/不可铸造”

- 严重级别：**Medium**
- 影响模块：激励铸造、质押/解锁、行动加入
- 状态：Open
- 关联文件：`action/src/ActionTarget.sol`、`action/src/LpExecutor.sol`、`action/src/GroupActionExecutor.sol`、`action/src/GroupServiceExecutor.sol`、`action/src/GroupActionJoin.sol`、`core/src/Stake.sol`

## 现象

多个“我会拿到多少 / 我参没参加”的读函数在**失败原因不同**的情况下返回同一个零值元组。前端拿到 0 无法判断该显示“暂无”、 “还没开始”、 “你没资格”、还是“会被销毁”，只能全部渲染成“0”，或者自己把合约里的条件重新实现一遍。

同类问题还有两处更严重的“安静换结果”：

- `Stake.memberStake` 的“可取回资产”在两个前置不满足时返回 0，但份额仍然非 0；
- `Stake.withdraw` 在 `_canBurn` 为 false 时**不发代币，改发 LP**，而视图里没有任何字段预示这一点。

## 证据

**1) 行动激励：5 种原因 → 同一个 `(0,0,false)`**

```solidity
// action/src/LpExecutor.sol:389-406
minted = _memberMinted[tokenAddress][actionId][round][memberId];
if (minted) { ... return (mintAmount, burnAmount, minted); }
uint256 createdRound = _createdRoundByActionId[tokenAddress][actionId];
if (createdRound != 0 && round >= createdRound && round <= _mintRound()) {
    (mintAmount, burnAmount) = _pendingMemberReward(tokenAddress, actionId, round, memberId);
}
// 其余情况全部落到 (0, 0, false)：
//   ① createdRound == 0（行动不存在）
//   ② round < createdRound（轮次早于行动）
//   ③ round > mintRound（已过铸造窗口）
//   ④ totalEffectiveAmount == 0（_pendingMemberReward 内 return (0,0)，LpExecutor.sol:447-451）
//   ⑤ 本轮 actionReward == 0（_calculateReward 里 theoreticalReward = 0，LpExecutor.sol:312-327）
```

```solidity
// action/src/GroupActionExecutor.sol:652-670
uint256 createdRound = _layout.createdRoundByActionId[tokenAddress][actionId];
if (createdRound == 0 || round < createdRound || round > _mintRound()) { return (0, 0, false); }
uint256 totalFinal = _layout.totalFinalScore[tokenAddress][actionId][round];
if (totalFinal == 0 || !GroupActionVerify.isRoundVerified(_layout, tokenAddress, actionId, round)) {
    return (0, 0, false);        // ← “本轮还没验证完”与“行动不存在”同形
}
uint256 memberFinalScore = _memberFinalScore(...);
if (memberFinalScore == 0) { return (0, 0, false); }   // ← “你没参与”与“分数还没算”同形
```

```solidity
// action/src/GroupServiceExecutor.sol:301-308
if (!_isSettleableRound(tokenAddress, actionId, round)) {
    return (0, 0, false);        // ← SettlementCause 不返回
}
Settlement memory settlement = _settlement(tokenAddress, actionId, round, memberId);
return (settlement.verifierReward + settlement.ownerReward, settlement.ownerBurned, false);
```

```solidity
// action/src/ActionTarget.sol:280-289
function actionReward(...) external view returns (uint256 amount, bool minted) {
    bool isBound = _executorByActionId[tokenAddress][actionId] != address(0);
    if (isBound) { (amount, minted) = IMint(MINT_ADDRESS).proposalRewardByProposalId(...); }
    // 未绑定 → (0, false)：与“本轮没有提案激励”同形
}
```

**2) 加入信息：零结构体**

```solidity
// action/src/GroupActionJoin.sol:245-259
info.ownAmount = self.ownAmountHistoryByMemberId[...].value(round);
info.providerAmount = self.providerAmountHistoryByMemberId[...].value(round);
if (info.ownAmount + info.providerAmount == 0) {
    return info;        // ← 全 0 结构体：没加入 / 轮次未开始 / 已退出，三者同形
}
```

**3) 验证者申请：零结构体**（另见 CI-009）

```solidity
// action/src/GroupActionVerify.sol:240-243
uint256 applicationId = self.applicationIdHistory[tokenAddress][actionId][verifierId].value(round);
if (applicationId == 0) {
    return VerifierApplication({applicationId: 0, verifierId: 0, description: ""});
}
```

**4) 质押：视图给“代币金额”，提现可能给 LP**

```solidity
// core/src/Stake.sol:396-410（memberStake）
address pair = _pairAddressByTokenAddress[tokenAddress];
if (pair != address(0) && totals.totalLiquidityShares != 0) {
    PairSnapshot memory snapshot = _pairSnapshot(pair, tokenAddress);
    (, uint256 withdrawableLp, ) = _previewReclassification(totals, snapshot);
    uint256 lpAmount = (liquidityShares * withdrawableLp) / totals.totalLiquidityShares;
    tokenAmountForLiquidity = (lpAmount * snapshot.reserveToken) / snapshot.pairTotalSupply;
    parentTokenAmountForLiquidity = (lpAmount * snapshot.reserveParent) / snapshot.pairTotalSupply;
}
// pair 未被任何写路径缓存（_pairFor 只在写时调用）→ 两个金额恒为 0，但 liquidityShares 非 0
```

```solidity
// core/src/Stake.sol:865-875（withdraw）
if (lpAmount > 0) {
    PairSnapshot memory snapshot = _pairSnapshot(pair, tokenAddress);
    if (_canBurn(lpAmount, snapshot)) {
        withdrawableLpBurned = lpAmount;
        _push(pair, pair, lpAmount);
        (tokenAmount, parentTokenAmount) = _burnLp(IUniswapV2Pair(pair), tokenAddress, msg.sender);
    } else {
        withdrawableLpToMember = lpAmount;                 // ← 用户拿到的是 LP
        _push(pair, msg.sender, lpAmount);
    }
}
```
`_canBurn` 的条件（`Stake.sol:916-919`）是 `lpAmount * reserve >= pairTotalSupply`（两侧都要满足），池子越小越容易走到“发 LP”分支。

## 对前端的影响

1. **空态文案必须靠猜。** “暂无待铸造激励”这句话在 5 种原因下都可能出现，其中“还没验证完”需要引导用户等待、“行动不存在”需要报错、“你没参与”需要引导参与——三种完全不同的下一步，UI 只能给一句模糊文案。
2. **金额显示 0 但份额非 0。** 质押页如果把 `tokenAmountForLiquidity` 当“可取回”展示，在 pair 未被缓存时会显示 0；用户以为资产没了。必须同时展示 shares 并说明“按当前池子折算”。
3. **提现确认页可能承诺错资产。** 视图说“你将收到 X 社区币 + Y 父币”，实际链上可能只给 LP 代币（`withdrawableLpToMember`）。这是**资产类型级别**的误导，不是小数误差。
4. **每个 0 都要额外 3～5 次调用去消歧**（`createdRound`、`isRoundVerified`、`totalFinalScore`、`joinedAmount*`、`isJoined`），首屏调用量翻倍。

## 建议修复方案（最小改动）

1. **给 `memberReward` 加原因**。三个执行器统一成：
   ```solidity
   enum RewardStatus { None, NotCreated, BeforeCreatedRound, AfterMintWindow, NotVerified, PoolEmpty, NoWeight, RoundedToZero, Minted }
   function memberReward(address tokenAddress, uint256 actionId, uint256 round, uint256 memberId)
       external view returns (uint256 mintAmount, uint256 burnAmount, bool minted, RewardStatus status);
   ```
   若不想加枚举（ABI 兼容顾虑），最少也要返回 `bool poolReady` 与 `bool verified`。`GroupServiceStorage.SettlementCause` 枚举已经存在，直接返回它即可。
2. **`Stake.memberStake` 加一个 `bool pairReady`**，或把 `pairAddress` 未缓存时的 `tokenAmountForLiquidity` 改为按 `getPair` 现取（`_pairFor` 是 `private` 且写缓存；可加一个 `view` 版本 `_pairForView` 用 `PAIR_FACTORY_ADDRESS.getPair` 现查，一次 `eth_call` 成本可接受）。
3. **提现前可判定**：新增
   ```solidity
   function withdrawPreview(address tokenAddress, uint256 memberId)
       external view returns (uint256 tokenAmount, uint256 parentTokenAmount, uint256 lpToMember, bool willReturnLp);
   ```
   让 UI 能在签名前告诉用户“本次将直接发 LP”。
4. `GroupActionJoin.joinInfo` 返回 `(JoinInfo info, bool exists)`；`verifierApplication` 返回 `(VerifierApplication, bool exists)`（见 CI-009）。

## 临时前端绕过方案

- 为每个零值建立“消歧查询链”，并在 UI 上真正区分四种状态：
  ```
  isJoined / joinedAmountByMemberId → 没参与
  isRoundVerified + totalFinalScore → 等待验证结算
  createdRound（靠 CI-003 的绕过）+ mintRound → 未开始 / 已过窗口
  memberReward.minted → 已铸造
  ```
- 质押：同时展示 `liquidityShares`（原始份额）与“按当前池子折算”的两种资产；提现按钮前用 `simulateContract`，从模拟结果里的 `StakeWithdrawn` 事件读 `withdrawableLpToMember`，若非 0 就把确认页改成“本次发放 LP 代币”。
- 代价：① 消歧链让首屏调用数翻倍（每个行动 4～6 次）；② 模拟提现需要 `from = owner` 且 gas 足够，弱网下易失败；③ 消歧逻辑必须随合约条件同步维护，漏一个就回到“显示 0”。
