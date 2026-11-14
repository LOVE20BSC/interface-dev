# 20261113-2117-7406-anvil-追加部署-batchtransfer-与-love20hub-导出: anvil 追加部署 BatchTransfer 与 LOVE20Hub（导出/地址簿/ABI 接入）

- **Tags**: anvil, BatchTransfer, LOVE20Hub, 地址簿, ABI
- **Status**: doing · 2026-11-13 21:19:05 · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d
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

### 2026-11-14 05:19–05:35 · 实现者 @anvil-hub

环境：`PATH=$HOME/.foundry/bin:/Users/BigPolarBear/.nvm/versions/node/v24.12.0/bin:$HOME/Library/pnpm/bin:$PATH`（forge 1.8.1 / node v24.12.0 / pnpm 11.5.1）。开工前 `git -C ../anvil status` 干净；全程只用 **PORT=8556**，8545 未部署、未发交易、未 snapshot、未 clean，收尾已 `make stop PORT=8556`。

1) 挂接兄弟仓（anvil 侧，兄弟仓只读）：
   - `ln -sfn ../../periphery .siblings/periphery`、`ln -sfn ../../tools .siblings/tools`（提交为符号链接，同既有 5 个）。
   - `remappings.txt` 追加 `periphery/=.siblings/periphery/`、`tools/=.siblings/tools/`；`foundry.toml` 的 `allow_paths` 加 `../periphery`、`../tools`；`script/local.sh` 的 `ensure_symlinks()` 与 preflight 兄弟仓清单同步加这两个仓（换 checkout 后能自愈）。
   - 证据：`cd ../anvil && forge build` → `Compiling 35 files with Solc 0.8.37` / `Compiler run successful!`。
   - creation bytecode keccak：`BatchTransfer 0xb03600383290c562556ebb1c15b37f3a7639235421edb2f93885faa49e4ca629`（3560 B，runtime 3532 B）；`LOVE20Hub 0xda89d7055685b0a0cf6b13fd6bc0cc33fae7bbcdccc74184c210eb24b255cb73`（17349 B，runtime 15638 B）。

2) 追加部署（`../anvil` commit `cda5908`）：
   - `script/DeployLocal.s.sol`：`TokenActionMainMgr` 之后、`vm.stopBroadcast()` 之前依次 `new BatchTransfer()` → `new LOVE20Hub(address(deployed.stake))`；`Deployed` 结构体加 `batchTransfer`/`hub`；新增 `_validatePeriphery()` 读回 Hub 从 Stake 派生的 ROUTER/PAIR_FACTORY/LAUNCH/MEMBER_NFT/WRAPPED_NATIVE 与费率；`_writeAddresses` 写 `BATCH_TRANSFER_ADDRESS`/`HUB_ADDRESS`；`_logSummary` 打印两行。
   - `script/export.py`：`CONTRACTS` 加 `BatchTransfer→(BATCH_TRANSFER_ADDRESS,"tools")`、`LOVE20Hub→(HUB_ADDRESS,"periphery")`；`ABI_SOURCES` 两项从**本仓 `out/`** 导出（跨仓编译，ABI 与真正部署的字节码一致；兄弟仓自己的 `out/` 属于另一个 checkout，可能过期或缺失）。
   - 关键不变量：两个 CREATE 在部署序列最末，既有 34 个地址的 nonce 不变。

3) 确定性（两次 `make clean PORT=8556 && make bootstrap PORT=8556`，各约 45 s，均以 `ALL CHECKS PASSED` 结束）：
   - `shasum -a 256` 两次导出完全相同：
     `9e811d4d719b96aaa51b707baef3bb9dbcd0a8118bf0e198aa5ca4e17fcbd44c  export/deployments/anvil31337_dev.json`
   - 与上一版导出逐键比对 `addresses`：`before keys: 34 after: 36`、`address diffs: 2`（只有 `BATCH_TRANSFER_ADDRESS`、`HUB_ADDRESS`）、`existing unchanged: 34 / 34`、`existing contract block diffs: []`。
   - 新增地址：BatchTransfer `0xc3e53F4d16Ae77Db1c982e75a937B9f60FE63690`（block 33）、LOVE20Hub `0x84eA74d481Ee0A5332c457a4d796187F6Ba67fEB`（block 34），`deployBlock` 32 → 34。

4) 前端接入（本前端仓本次提交）：
   - `scripts/lib/anvil-export.mjs`：`ADDRESS_KEYS` 加 `batchTransfer: 'BATCH_TRANSFER_ADDRESS'` / `hub: 'HUB_ADDRESS'`；`ABI_MODULES` 加 `batch-transfer.ts`/`love20-hub.ts`；`REPO_ABIS`/`repoPaths` 加 `periphery`、`tools`（manifest 因此记录两仓 HEAD）。
   - `src/config/deployments/types.ts` 的 `AddressBook` 与 `ADDRESS_KEYS`、`src/config/networks.ts` 的 `ADDRESS_BOOK_KEYS` 各加两个键；dev 地址簿由 `pnpm sync:anvil` 生成真实地址，test/prod 各加 2 个零地址槽（22 → 24）。
   - `pnpm sync:anvil` 生成 `src/config/abis/batch-transfer.ts`、`love20-hub.ts`、更新 `index.ts`/`manifest.json`/dev 地址簿；`pnpm abis:check` → `[abis:check] ABIs, manifest, address book and airdrop snapshot match ../anvil/export.`

5) 坑与外部影响（重要）：
   - **兄弟仓在本轮被别的任务改动**：`../core` 有未提交改动（`src/Stake.sol` 等，05:19–05:26 仍在写）、`../periphery` 有未提交改动（`src/LOVE20Hub.sol` 等）。按约定不动兄弟仓，但 anvil 编译的是它们当前工作区，所以 ABI 一律取本仓 `out/`。
   - `export/abis/Stake.json`（entries 64 → 69）与 `export/abis/LOVE20Hub.json`（47 → 50）一并刷新：committed 版本落后于两个兄弟仓的新提交（core `8d604a2` 拆分质押费率错误、构造函数改 `DexConfig` 元组；periphery `3b825a5` 镜像 Stake 收费守卫），这是 bootstrap 重新编译后自然追平真正部署的字节码，不是本任务的合约改动；部署地址与块号不变，导出 json sha256 仍是 `9e811d4d…fcbd44c`。
   - `export/VERIFIED.md` 被 bootstrap 在 8556 上重写；按 README「提交的报告必须描述规范 8545 链」，用 `git show HEAD:export/VERIFIED.md > export/VERIFIED.md` 还原（未用 `git checkout`）。因此该报告尚未包含两个新合约；下次在 8545 上 `make bootstrap`/`make verify` 后应重新提交它。
   - **前端两条门禁被并行「主题」任务在途文件染红**（非本任务改动）：`pnpm lint` 的 11 条全部落在未跟踪的 `scripts/theme-screenshots.mjs`；`pnpm test` 唯一失败是 `src/features/connect-wallet/ui/wrong-network-button.test.tsx` 期望 `text-danger`，而未提交的 `src/shared/ui/button.tsx` 把 `danger-outline` 改成 `text-danger-strong`。隔离证据：HEAD worktree 里同一测试 `1 passed`、`eslint . --max-warnings=0` exit 0；本任务改动路径单独 `npx eslint` 绿；其余 397/398 用例通过。修这两处会覆盖并行任务的在途编辑，故未改，留给该任务或 Lead 在其提交后复跑。


## Conclusion

<!-- What got done, what got left behind -->

- anvil 侧完成并提交 `cda5908`：periphery/tools 挂接、DeployLocal 末尾追加 `BatchTransfer` + `LOVE20Hub(stake)`、地址簿/导出/ABI、README。两次 8556 clean bootstrap 导出 sha256 相同（`9e811d4d…fcbd44c`），既有 34 个地址逐键不变、块号不变，仅新增两项。
- 前端侧完成：`sync-anvil` 键映射、`AddressBook`/`ADDRESS_BOOK_KEYS`、三个 deployment JSON、两个 ABI 模块 + manifest/index、`docs/STATUS.md` §3.2/§6.8；`pnpm sync:anvil` 与 `pnpm abis:check` 绿，`pnpm typecheck` 绿。
- 遗留风险：
  1. `core` 里在途的 Stake 改动若最终落盘与本次编译不同，`abis:check` 会红：需重跑 `make -C ../anvil bootstrap`（或 export）+ `pnpm sync:anvil` 再提交。
  2. `export/VERIFIED.md` 未按 36 个导出地址重生成（只在 8556 上验证过）；在 8545 上 bootstrap/verify 后应一并提交。
  3. `pnpm test`/`pnpm lint` 的两处红来自并行主题任务的未提交文件（`button.tsx`、`scripts/theme-screenshots.mjs`），需由该任务修或由 Lead 复跑；与本任务改动无关。
  4. 地址簿键名沿用 org 惯例的 UPPER_SNAKE（`BATCH_TRANSFER_ADDRESS`/`HUB_ADDRESS`）导出，前端映射为 `batchTransfer`/`hub`；台账里写的 `addresses.batchTransfer` 是前端键，不是 anvil 导出键。

**Lead 复核（2026-11-14 08:24）**：同一台 fresh 8566 链重跑四份合约线脚本 `transfer 26/26 · approvals 26/26 · batch-transfer 56/56 · liquidity 45/45`（共 153 项断言全绿）；权威 `pnpm e2e`（8555，合并构建）**87/87 passed**；`pnpm typecheck / lint / test(485) / build(prod 159.1 kB / dev 160.1 kB) / abis:check` 全绿；真实 8545 链（重建后）用注入钱包逐页 smoke，六个页面无 pageerror、文案齐全；已发布 `interface-dev` 与 `interface-test`（`9180f12`）。`pnpm test` 中曾出现的两处红均为并行任务中间态（`button.tsx` token 改名、`navigation.ts` 缺 `/liquidity` 标题），最终合并树已统一为绿。

## Execution Log

<!-- Maintained by the script: appended by new / claim / set / release / log / close. Do not edit.
     Backfill with: progress log --id 20261113-2117-7406-anvil-追加部署-batchtransfer-与-love20hub-导出 --note "...". -->
- 2026-11-13 21:17:08 · new · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d · created
- 2026-11-13 21:19:05 · claim · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d · claimed → doing
