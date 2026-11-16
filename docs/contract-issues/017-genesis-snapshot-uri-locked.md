# CI-017 创世快照 URI：新部署已支持，旧部署仍受限

- 严重级别：**Medium**
- 影响模块：空投铸造（`/airdrop`）——仅创世代币这一份空投
- 状态：新部署已解决；旧部署保留兼容
- 关联文件：`core/src/distributor/AirdropDistributor.sol`（`_configure(..., launcherMemberId = 0)`、`onlySnapshotUriUpdater`）、`core/src/interfaces/distributor/IAirdropDistributor.sol`

## 新部署

`AirdropDistributor` 新增构造参数 `genesisSnapshotUri`，首币配置后立即写入并发出 `AirdropSnapshotUriUpdated`（旧值为空）。URI 必须非空且不超过 256 字节。`DeployCore` 在广播前验证它指向本网络的快照文件，并检查 root、名单数量、重复地址、每条证明及份额总和。

首币的 `launcherMemberId` 仍为 `0`，任何调用者都不能通过 `updateSnapshotUri` 改写 URI；无需引入管理员或放开发射者权限。

## 旧部署与前端兼容

旧合约的创世 URI 仍为空，源码更新不会改变已部署合约。它们继续使用前端构建内置的 `src/config/network/<network>/airdrop.json`。

新旧部署均优先加载本地快照，root 与链上一致即使用；本地缺失、损坏或 root 不一致时，才尝试链上 HTTP(S) URI。旧部署没有 URI 且本地也不可用时显示可重试的失败态。当前钱包的 share/proof 始终通过链上 `claimableAmount` 校验。

需要链上创世 URI 的环境须采用新构造参数重新部署；旧导出记录继续反映原部署的真实状态。
