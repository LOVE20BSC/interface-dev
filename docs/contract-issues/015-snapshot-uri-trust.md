# CI-015 空投快照改为链上 URI：外部资源信任、可用性与被篡改风险

- 严重级别：**Medium**
- 影响模块：空投铸造（`/airdrop`）
- 状态：本地优先已实现；远端回退的可用性风险仍适用
- 关联文件：`core/src/distributor/AirdropDistributor.sol`、`core/src/interfaces/distributor/IAirdropDistributor.sol`（`updateSnapshotUri` / `airdropInfo(...).snapshotUri` / `SnapshotUriEmpty` / `SnapshotUriTooLong` / `NotSnapshotUriUpdater`）

## 现象

`core@141c931` 起，空投快照不再内置在合约里，而是 launcher 在链上登记一个 **URI**：

```solidity
function updateSnapshotUri(address tokenAddress, string calldata snapshotUri) external;
function airdropInfo(address tokenAddress) external view returns (AirdropInfo memory); // .snapshotUri
```

前端优先使用本网络随构建打包的创世快照，只有本地失效时才访问 URI；后续 Launch 代币通过 URI 发现快照。远端访问仍有三个问题：

1. **信任**：URI 可被 launcher 修改（`AirdropSnapshotUriUpdated`），服务端也可能悄悄改内容。合约本身只校验 `proof` 对 `airdropInfo(token).merkleRoot` 成立，所以用户资产安全；但界面上的「预计可得」会随 URI 内容而变，**前端必须用链上 root 校验快照 root，不一致就拒绝使用该快照**，否则界面可能长期显示错误金额。
2. **可用性**：URI 若是普通对象存储/HTTP 站点，可能被 CORS 拒绝、被墙或失效；静态站没有后端，只能给「资格暂时读不到 + 重试」。
3. **隐私**：从第三方 URI 加载会向该域暴露访问者 IP/UA（空投名单本身是公开的，但请求行为不是）。

## 前端应对（已写入影响分析）

- 创世快照来源顺序：当前网络内置快照 → 本地缺失、损坏或 root 不一致时回退链上 HTTP(S) URI → 失败态，适用于所有前端环境。两条来源都比较文件 `merkleRoot` 与链上值；匹配本地文件时不发远端请求。
- 「预计可得」须由链上 `claimableAmount` 使用当前钱包的 share/proof 校验后给出；root 校验失败时不显示数字（只显示「资格暂时读不到」）。前端不重建整棵树，比较声明的 root 不能单独证明整份 JSON 完整。
- 完整快照的证明与份额总和在生成、同步和发布阶段校验；运行时远端缺项或失联仍可能影响可用性，但不能凭伪造证明获得代币。

## 建议

采用本地优先、root 比较与链上钱包证明校验的方案；远端回退失败时保留错误态和重试。当前方案不新增快照内容哈希或更新权限。
