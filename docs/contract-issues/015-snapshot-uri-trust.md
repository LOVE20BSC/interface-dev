# CI-015 空投快照改为链上 URI：外部资源信任、可用性与被篡改风险

- 严重级别：**Medium**
- 影响模块：空投铸造（`/airdrop`）
- 状态：Open（设计取舍待定）
- 关联文件：`core/src/distributor/AirdropDistributor.sol`、`core/src/interfaces/distributor/IAirdropDistributor.sol`（`updateSnapshotUri` / `snapshotUriByTokenAddress` / `SnapshotUriEmpty` / `SnapshotUriTooLong` / `NotSnapshotUriUpdater`）

## 现象

`core@141c931` 起，空投快照不再内置在合约里，而是 launcher 在链上登记一个 **URI**：

```solidity
function updateSnapshotUri(address tokenAddress, string calldata snapshotUri) external;
function snapshotUriByTokenAddress(address tokenAddress) external view returns (string memory);
```

前端要拿到 `share` + `proof` 就必须**在运行时去取这个 URI 指向的 JSON**。带来三个新问题：

1. **信任**：URI 可被 launcher 修改（`AirdropSnapshotUriUpdated`），服务端也可能悄悄改内容。合约本身只校验 `proof` 对 `merkleRootByTokenAddress` 成立，所以用户资产安全；但界面上的「预计可得」会随 URI 内容而变，**前端必须用链上 root 校验快照 root，不一致就拒绝使用该快照**，否则界面可能长期显示错误金额。
2. **可用性**：URI 若是普通对象存储/HTTP 站点，可能被 CORS 拒绝、被墙或失效；静态站没有后端，只能给「资格暂时读不到 + 重试」。
3. **隐私**：从第三方 URI 加载会向该域暴露访问者 IP/UA（空投名单本身是公开的，但请求行为不是）。

## 前端应对（已写入影响分析）

- 快照来源顺序：链上 URI → （仅 dev/e2e）随构建打包的同名快照 → 失败态；两条来源都**必须**校验 `keccak(merkleRoot)` 与链上一致。
- 「预计可得」在 root 校验失败时不显示数字（只显示「资格暂时读不到」），避免误导。
- 若未来 URI 需要鉴权/签名，建议合约侧增加快照哈希（`snapshotHash`）随 URI 一起登记，前端可直接比对内容哈希而不只是 root。

## 建议

短期按上面的前端兜底实现；中期请合约侧考虑在 `updateSnapshotUri` 时同时登记 `bytes32 snapshotContentHash`（内容哈希）或直接把快照根与内容哈希绑定，让「链上 URI + 链下内容」的组合可验证。
