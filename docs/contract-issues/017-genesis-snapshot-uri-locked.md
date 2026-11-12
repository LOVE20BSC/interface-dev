# CI-017 创世空投的快照 URI 永远无法登记（launcherMemberId = 0），前端只能内置创世快照

- 严重级别：**Medium**
- 影响模块：空投铸造（`/airdrop`）——仅创世代币这一份空投
- 状态：Open（需产品决策）
- 关联文件：`core/src/distributor/AirdropDistributor.sol`（`_configure(..., launcherMemberId = 0)`、`onlySnapshotUriUpdater`）、`core/src/interfaces/distributor/IAirdropDistributor.sol`

## 现象

`AirdropDistributor` 构造函数对创世代币调用 `_configure(..., launcherMemberId = 0)`，而 `onlySnapshotUriUpdater` 在 `launcherMemberId == 0` 时对任何调用者都 revert `NotSnapshotUriUpdater(msg.sender, 0)`。core 自己的测试把这条固化成了预期行为：

```
core/test/AirdropDistributor.t.sol
  testGenesisSnapshotUriIsPermanentlyNonUpdatableForAnyCaller
  testGenesisTokenHasZeroLauncherMemberIdAndEmptySnapshotUri
```

即：**创世空投的 `snapshotUriByTokenAddress(genesisToken)` 永远是空字符串**，没有 setter、也没有 Launch 路径可以设置（只有后续经 Launch 发起的代币才有 `launcherMemberId` 从而可登记 URI）。

## 前端后果

- 后续Launch 出来的代币：快照按链上 URI 取（见 CI-015）。
- **创世代币**：链上没有 URI，前端只能把创世快照内置在构建产物里（`public/airdrop/<variant>.json`），并用链上 `merkleRootByTokenAddress` 校验内容。也就是「两套取快照路径」并存：创世用内置、后续 launch 用 URI。
- 若某个环境（例如生产首币）想在不重新发版的情况下更新创世快照，**当前合约无法支持**。

## 建议（三选一，需 owner 定）

1. **保持现状 + 前端内置创世快照**：不需要改 core；前端用链上 root 校验，root 不匹配就拒绝使用。代价是创世快照内容更新必须发一次前端版本。
2. **部署参数**：`DeployCore` 增加 `genesisSnapshotUri` 参数，构造时写入（不走 updater 权限），所有环境统一「链上取快照」。
3. **放开创世 updater 权限**：`launcherMemberId == 0` 时允许部署者/多签更新（需要额外所有者字段），保留链上可更新能力。

不影响「claim 的安全性」：合约始终用链上 `merkleRoot` 校验 `proof`，问题只在「前端去哪里拿 share/proof」以及「能否不发版更新创世名单」。
