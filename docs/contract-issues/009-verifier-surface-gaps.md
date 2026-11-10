# CI-009 验证者侧没有按人索引，待验证任务无法列出

- 严重级别：**Medium**
- 影响模块：验证者任务、流水线
- 状态：Open
- 关联文件：`action/src/GroupActionVerify.sol`、`action/src/interfaces/IGroupActionVerify.sol`、`action/src/interfaces/IVerificationInfo.sol`

## 现象

验证者要做的三件事——申请、被选中后提交分数、给别人投票——在链上都只能“按行动 id + 轮次”读，不能“按我这个身份”读：

1. `verifierApplications(tokenAddress, actionId, offset, limit, reverse)` **没有 `round` 参数**，返回的是该行动**当前活跃**的全部申请，不区分轮次、不区分验证者。
2. 返回结构 `VerifierApplication { applicationId, verifierId, description }` **没有 `round` 字段**，前端拿到 applicationId 也无法知道它属于哪一轮。
3. 要查“我这一轮的申请”，必须同时给出 `(round, verifierId)`：`verifierApplication(token, actionId, round, verifierId)`。
4. 唯一的 `ByVerifierId` 读函数是 `applicationVotersByVerifierId`（查“谁给我投了票”），不是“我申请了哪些”。
5. 交分数需要 `groupId` 与 `startIndex`，而这两个值只在“我是本轮被锁定的验证者”时才可用；查询入口 `lockedVerifierId(token, actionId, round)` 同样需要 round。

结果是：验证者打开 App 时，前端不知道“我有哪些待验证任务”，只能对每个行动、每个轮次逐个试探。

## 证据

```solidity
// action/src/interfaces/IGroupActionVerify.sol:145-157
function verifierApplications(
    address tokenAddress,
    uint256 actionId,
    uint256 offset,
    uint256 limit,
    bool reverse
) external view returns (VerifierApplication[] memory applications, uint256 totalCount);
```

```solidity
// action/src/interfaces/IGroupActionVerify.sol:6-10
struct VerifierApplication {
    uint256 applicationId;
    uint256 verifierId;
    string description;          // ← 没有 round
}
```

```solidity
// action/src/GroupActionVerify.sol:251-270
function verifierApplications(...) external view returns (VerifierApplication[] memory applications, uint256 totalCount) {
    uint256[] memory applicationIds;
    (applicationIds, totalCount) = self.activeApplicationIds[tokenAddress][actionId].values(offset, limit, reverse);
    applications = new VerifierApplication[](applicationIds.length);
    for (uint256 i = 0; i < applicationIds.length; i++) {
        uint256 applicationId = applicationIds[i];
        applications[i] = VerifierApplication({
            applicationId: applicationId,
            verifierId: self.applicationVerifierId[tokenAddress][actionId][applicationId],
            description: self.applicationDescription[tokenAddress][actionId][applicationId]
        });
    }
}
```

“我这轮的申请”必须三键定位：

```solidity
// action/src/GroupActionVerify.sol:233-249
function verifierApplication(
    GroupActionStorage.Layout storage self, address tokenAddress, uint256 actionId, uint256 round, uint256 verifierId
) external view returns (VerifierApplication memory application) {
    uint256 applicationId = self.applicationIdHistory[tokenAddress][actionId][verifierId].value(round);
    if (applicationId == 0) {
        return VerifierApplication({applicationId: 0, verifierId: 0, description: ""});   // ← 0 结构体，无“为什么”
    }
    ...
}
```

交分数的前置（只对锁定验证者有意义）：

```solidity
// action/src/interfaces/IGroupActionVerify.sol:82-90
function submitOriginScores(
    address tokenAddress, uint256 actionId, uint256 verifierId,
    uint256 groupId, uint256 startIndex, uint256[] calldata originScores
) external;
// 锁定验证者：IGroupActionVerify.sol:167-173  lockedVerifierId(tokenAddress, actionId, round)
```

接口里不存在 `verifierApplicationsByVerifierId`、`verifierApplicationsByRound`、`pendingVerification*` 任何形态（`action/src/interfaces/` 全目录 grep 无命中）。

## 对前端的影响

1. **“我的待验证任务”无法实现。** 需要的元组是 `(tokenAddress, actionId, round)`，而这三个维度里前端最多只知道 `tokenAddress`；`actionId` 要靠 `actionIdsByMemberId`（只有当前加入集合，见 CI-001），`round` 要靠猜。
2. **申请列表画不出来。** `applications` 没有 round，无法分组显示“第 N 轮申请”；同一个验证者跨轮重复申请时，`activeApplicationIds` 只保留最新的，历史被删（`_replaceApplication`），列表里看不到“我之前申请过”。
3. **投票界面无法定位。** 给验证者投票要用 `applicationId`（`Vote.vote` 的 `targetData` 里带 `verifierId`，见 `GroupActionVerify.onProposalVoted` 的 `SLOT_VERIFIER_ID`），前端必须先把“轮次 → 申请”对齐，缺少 round 字段就只能靠 `applicationIdHistory` 反查，而那个 history 没有按 applicationId 反查的入口。
4. **零值结构体无原因。** `verifierApplication` 在没申请时返回全 0 结构体，与“申请被替换掉了”“轮次还没开始”不可区分（CI-011 同类）。

## 建议修复方案（最小改动）

按加法顺序：

1. **给 `VerifierApplication` 加 `uint256 round`**（结构体是纯返回载荷，不改存储）。`GroupActionVerify.verifierApplications` 里从 `applicationIdHistory` 反查轮次成本高，建议改为直接读存储 `applicationRound[token][actionId][applicationId]`（在 `_replaceApplication` 里顺手记一个 mapping，1 次 SSTORE）。
2. **加按人索引**：
   ```solidity
   function verifierApplicationsByVerifierId(
       address tokenAddress, uint256 actionId, uint256 verifierId, uint256 offset, uint256 limit, bool reverse
   ) external view returns (VerifierApplication[] memory applications, uint256 totalCount);
   ```
3. **加“待办”聚合**（真正让 UI 一次调用就能渲染）：
   ```solidity
   function pendingVerification(address tokenAddress, uint256 actionId, uint256 verifierId)
       external view returns (uint256 round, uint256 groupId, uint256 startIndex, uint256 memberCount, bool open);
   ```
   内部用 `lockedVerifierId` + `verifiedMemberCount` + `_checkOpenVerifier` 的同一段逻辑，避免前端复刻开放窗口（CI-008）。
4. **让 `verifierApplication` 的零值可解释**：返回 `(VerifierApplication memory application, bool exists, bool roundStarted)`。

## 临时前端绕过方案

- 维护一个“我曾申请过的 (actionId, round)”本地清单：用户提交申请时写入 `localStorage`（按 `chainId + memberNFT + memberId` 分键），下次进入时用它去调 `verifierApplication`。代价：换设备/清缓存即丢失；只能覆盖“本设备申请过”的，运营空投式指定（如果未来有）完全看不到。
- 对“我是否能交分”做有限探测：对候选 `round ∈ [currentPhase-2, currentPhase-1]`、候选 `actionId`（来自 `ActionTarget.actions` 的分页 + `ActionTarget.votedActionIds(round)`）调 `lockedVerifierId`，只保留 `== myMemberId` 的项。代价：O(actions × rounds) 次调用，行动数一多就爆；且 `lockedVerifierId` 需要先知道 round。
- **不接受**的绕过：把 `verifierApplications` 全量拉下来在浏览器里按 `verifierId` 过滤——申请数无上限，且返回含 `string description`（最长 1024 字节），一页就能把移动端内存打满。
