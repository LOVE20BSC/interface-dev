# CI-016 `airdropInfos` 返回结构体数组（含 string），批量读取成本与分页上限未定

- 严重级别：**Low**
- 影响模块：空投铸造（`/airdrop`）、将来的「多空投列表」
- 状态：Open（待压测）
- 关联文件：`core/src/interfaces/distributor/IAirdropDistributor.sol`

## 现象

```solidity
struct AirdropInfo {
    address tokenAddress; bytes32 merkleRoot; uint256 claimableFromRound;
    uint256 totalClaimedShare; uint256 totalRemainingShare;
    uint256 totalClaimedAmount; uint256 remainingAmount; string snapshotUri;
}
function airdropInfos(uint256 offset, uint256 limit, bool reverse)
    external view returns (AirdropInfo[] memory infos, uint256 totalCount);
```

每条记录含 6 个 word + 一个**动态 `string`**，`eth_call` 的返回体积随 `limit` 线性增长；BSC 公共 RPC 对单次 `eth_call` 的返回体与耗时都有限制。前端若要列「多份空投」，需要确定安全的分页上限（例如 10～20 条/次）并对超时做降级。

## 前端应对

- M0 只按当前社区 `tokenAddress` 读单条 `airdropInfo(token)`，**不调用** `airdropInfos`。
- 将来做列表时先压测 5/10/20/50 条的实际返回体积与耗时，再定分页常量；超时/体积超限时降级为「按 token 直查」。

## 建议

若列表是产品长期需求，建议合约侧提供一个轻量视图（只返回 `address[]` 或分页的 `bytes32 root + address token`），把 `snapshotUri` 留给单条查询。
