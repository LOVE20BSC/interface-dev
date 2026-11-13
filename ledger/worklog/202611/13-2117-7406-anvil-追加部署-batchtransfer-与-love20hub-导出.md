# 20261113-2117-7406-anvil-追加部署-batchtransfer-与-love20hub-导出: anvil 追加部署 BatchTransfer 与 LOVE20Hub（导出/地址簿/ABI 接入）

- **Tags**: anvil, BatchTransfer, LOVE20Hub, 地址簿, ABI
- **Status**: open · 2026-11-13 21:17:08
- **Created**: 2026-11-13 21:17:08 · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d

<!-- Header lines are maintained by the script, fixed order: Tags → Status → Created → Sealed.
     The `- **Tags**: …` line is inserted at the top by new --tags; omitted when there are no tags
     (category goes to the ledger and history only, never into this document).
     The `- **Sealed**: …` line is appended on close. -->

## Background

owner 2026-11-14：新仓 `periphery`（`LOVE20Hub`，平替旧库 `UniswapV2Zap` 的「一键单边加池」）与 `tools`（`BatchTransfer`）里的合约可以直接用；批量转账、一键加流动性都要接这两个合约。

事实盘点（已核对）：
- `../periphery/src/LOVE20Hub.sol`：`addLiquidityWithToken(AddLiquidityWithTokenParams)` / `addLiquidityWithNative(AddLiquidityWithNativeParams)` 支持**单边输入**（另一侧 desired=0），`quoteLp` / `quoteLpWithNative` 是纯 view 报价（`hasLiquidity`、`amountToSwap`、`amountOutFromSwap`、`expectedLiquidity`、`suggested*Min`）；构造函数只吃 `STAKE_ADDRESS`，其余地址从 Stake 派生，费率从 Stake 读。部署脚本 `periphery/script/deploy/{11,21,31}_*hub*`，地址文件 `periphery/script/network/anvil31337_dev/addresses.hub.params` 当前为空（README 明确写「anvil bootstrap 不部署 Hub」）。
- `../tools/src/BatchTransfer.sol`：`batchTransferNative` / `batchTransferERC20` / `nativeBalances` / `erc20Balances`，无构造参数；`tools/script/network/anvil31337_dev/addresses.batch-transfer.params` 为空，且**没有 testnet/mainnet 的地址文件**。
- `../anvil/export/deployments/anvil31337_dev.json` 的 `contracts` / `addresses` 里两个合约都不存在 → 前端地址簿、ABI、`abis:check` 都拿不到它们，两个页面无法开工。
- `../anvil/remappings.txt` 只挂了 core/action/group-chat/libs/dex，没有 periphery/tools；`.siblings/` 下也没有对应软链。

通用要求（与页面任务相同）：中文字面量进 copy；不新增依赖；门禁全绿；**不要碰 8545 人工链**；不要改 `../periphery`、`../tools`、`../core` 等兄弟仓的源码（只读引用）。

### 任务内容

1. 挂接兄弟仓：`../anvil/.siblings/` 增加 `periphery -> ../../periphery`、`tools -> ../../tools` 软链；`remappings.txt` 增加 `periphery/=.siblings/periphery/`、`tools/=.siblings/tools/`（如 Hub 需要 `@core/`，anvil 现有 `@core/=.siblings/core/src/` 应可直接满足，若冲突先记录再决定）；`foundry.toml` 的 `allow_paths` 加 `.siblings/periphery`、`.siblings/tools`（必要时加 `../periphery`、`../tools`）。
2. 编译验证：`cd ../anvil && forge build`（不要广播）能编译 `BatchTransfer` 与 `LOVE20Hub`；记下两个合约的 creation bytecode hash。
3. **追加部署（关键：必须是部署序列末尾，既有地址一个都不能变）**：在 `../anvil/script/DeployLocal.s.sol` 既有合约全部部署完之后、`_writeAddresses` 之前，按 `new BatchTransfer()` → `new LOVE20Hub(address(deployed.stake))` 的顺序追加；把两个地址放进 `Deployed` 结构体。理由：clean bootstrap 从 deployer nonce 0 起算，追加在末尾才不会移动 MemberNFT/Vote/Mint/Phase/AirdropDistributor 等已提交地址。
4. 导出：改 `../anvil/script/export.py`（或 `script/local.sh` 调用链）让导出 json 的 `contracts` 与 `addresses` 都包含 `BatchTransfer`、`LOVE20Hub`，前端地址簿键用 `batchTransfer`、`hub`；ABI 导出到 `../anvil/export/abis/{BatchTransfer,LOVE20Hub}.json`。
5. 前端同步：`scripts/sync-anvil.mjs` 增加键映射；`src/config/deployments/types.ts` 的 `AddressBook` 加 `batchTransfer`、`hub`；`src/config/networks.ts` 的 `ADDRESS_BOOK_KEYS` 加两个键；三个 deployment JSON 里 dev 写真实地址、test/prod 写零地址（未配置）；ABI 落到 `src/config/abis/` 并更新 `manifest.json`；`pnpm abis:check` 绿。
6. 确定性验证：**clean bootstrap 两次**（`PORT=8556` 或任意非 8545 端口），两次导出哈希一致；并把新导出的 `addresses` 与当前提交的 `src/config/deployments/anvil31337_dev.json` 逐键比对，**除 `batchTransfer` / `hub` 外必须完全相同**（任何既有地址漂移都要停下来报告）。
7. e2e 链重建：`pnpm e2e:reset-chain` 后 `pnpm e2e` 必须 52 条全绿（地址簿变更后 e2e 不能挂）。
8. anvil 仓库 README/STATUS 更新：`../anvil/README.md` 写明新增两个模块与「追加在末尾」的理由；前端 `docs/STATUS.md` §3.2 地址清单补两个地址与导出哈希。
9. 交付给 Lead：两个地址、两次导出的 sha256、既有地址未变的证据（diff 输出）、`pnpm abis:check` 输出。

## To Do

见 Background 的「### 任务内容」清单 1–9。

## Next

先读 `../anvil/script/DeployLocal.s.sol` 的部署序列与 `_writeAddresses`/`export.py`，确认「末尾」到底在哪一行；再读 `../periphery/script/deploy/DeployHub.s.sol` 看它如何构造 Hub（构造函数只传 stake），照抄构造方式即可。

## Process

<!-- Pitfalls and evidence: with revision + file:line or symbol names -->

## Conclusion

<!-- What got done, what got left behind -->

## Execution Log

<!-- Maintained by the script: appended by new / claim / set / release / log / close. Do not edit.
     Backfill with: progress log --id 20261113-2117-7406-anvil-追加部署-batchtransfer-与-love20hub-导出 --note "...". -->
- 2026-11-13 21:17:08 · new · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d · created
