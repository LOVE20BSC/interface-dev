# CI-014 空投没有「按账户查已铸造金额」的只读方法，已铸造态无法显示数量

- 严重级别：**High**（按「能否做出正确界面」口径可判 Blocker，理由见文末）
- 影响模块：空投铸造（`/airdrop`）
- 状态：已修复（`LOVE20TKM/burn@5f3b733`，2026-11-11 已推送；**需重新部署空投合约才生效**，已部署实例不带该方法）
- 关联文件：`anvil/src/vendor/Airdrop.sol`、`anvil/src/vendor/IAirdrop.sol`（合约源在 LOVE20TKM 旧库，本仓以 vendor 形式引入）、前端 `src/config/abis/airdrop.ts`、`src/features/claim-airdrop/`

## 现象

产品负责人 2026-11-11 的要求是：空投页把「铸造空投份额」改名为「空投铸造」，并且**已经铸造过的钱包要显示实际铸造到的数量**。

合约侧目前**没有任何方法能在铸造完成后按账户读出这笔金额**：

| 现有接口 | 返回 | 能不能用来显示「已铸造量」 |
| --- | --- | --- |
| `isClaimed(address token, address account) view returns (bool)` | 是否铸造过 | 只有布尔，没有金额 |
| `claimedShare(address token) view returns (uint256)` | **按 token 累计**的已消耗份额 | 是全局累计，不是某个账户拿到的金额 |
| `claimableAmount(address token, address account, uint256 share, bytes32[] proof) view returns (uint256)` | 可铸造金额 | 铸造后 `_isClaimable` 为 false，**返回 0** |
| `remainingShare(address token) view returns (uint256)` | 剩余份额 | 与金额无关 |

唯一的金额来源是事件：

```solidity
// anvil/src/vendor/Airdrop.sol:150
emit AirdropClaimed({
    token: token,          // indexed
    account: account,      // indexed
    share: share,
    amount: amount,        // ← 实际铸造到的数量
    remainingShare: remaining - share
});
```

金额本身是**动态按比例**算出来的（`Airdrop.sol:96`）：

```solidity
amount = Math.mulDiv(IERC20(token).balanceOf(address(this)), share, remaining);
```

也就是说金额取决于「那一刻池子里还有多少」，**不能事后用当前状态反推**：`remainingShare(token)` 会随别人铸造持续下降，同一个 `share` 在不同时间铸造拿到的数量不同。

## 前端后果

本项目**无后端、无索引器**，审计口径明确「`eth_getLogs` 不计为可用手段」（BSC 公开 RPC 对区块范围有限制，见本目录 README 的审计口径）。因此：

- **同一台设备刚铸造完**：金额来自交易回执，本地缓存得住 → 能显示。
- **换设备 / 清缓存 / 重装钱包**：只能显示「已铸造」，**金额显示不出来**——正是负责人提出的那个场景。
- 现有文案就是这个缺陷的写照：

```
copy-pages.ts:235  noRecordBody: '这次空投份额已经铸造过。这台设备没有留下这次的铸造记录，所以不显示金额。'
```

对非加密原生用户来说，「我到底拿到了多少」是空投页最核心的信息；让用户自己去区块浏览器数事件，等于这个功能没做完。

## 修复（已落地，`burn@5f3b733`）

```solidity
// storage：token => account => 实际铸造到的数量
mapping(address => mapping(address => uint256)) public claimedAmount;

// claim() 内，transfer 之后（Airdrop.sol:104 附近）
claimedAmount[token][account] = amount;
```

- 新增 ABI：`claimedAmount(address token, address account) view returns (uint256)`（`public` mapping 自动生成的 getter），一次 `eth_call` 即可，不需 `eth_getLogs`。
- 落地情况：`src/Airdrop.sol` 新增 mapping 并在 `claim()` 中紧挨 `_claimed[...] = true`（CEI 不变）写入 `amount`；`IAirdrop` 补声明；测试 5 条（成功=返回值=事件=余额增量、重复铸造不变、未铸造为 0、跨 token 隔离、proof 失败回滚为 0）+ 1 条回滚断言。`forge test` 61 → **66 passed**。`anvil` 的 vendor 副本同步于 `2337909`。
- 与 `claimableAmount` 互补：前者答「已经拿到多少」，后者答「还能拿到多少」，刚好覆盖空投页的两个状态。
- 若还想要「铸造时间」，可同时 `mapping(address => mapping(address => uint256)) public claimedAtBlock` 存 `block.number`；不强制，前端目前只需要金额。
- **部署影响**：新增 storage 变量会改变存储布局，所以这一条只能随**下一次部署**带上；如果某个环境的空投合约已经部署且不可升级，需要在那个环境重新部署空投合约（或另部署一个只读查询合约）。请负责人决定是否需要为已部署环境重建。

## 为什么不降级为 Low / 临时绕过

- **本机记录**（现在的做法）只在同一浏览器有效，与「换设备也要看到」直接冲突。
- **事件 + `eth_getLogs`** 在本地 anvil 可行（块高只有几百，`deployment.blockNumber = 32`），但 BSC 上不可靠，属于把「一定失败」留到生产。
- **事后反推**不可行：金额是铸造那一刻的动态比例，前已说明。

按本目录的严重级别定义，「无后端即无法计算目标界面所需的正确值，绕过只能靠少显示/猜/信任本地缓存」属于 **Blocker** 分支；这里记 **High** 的原因是：铸造当下金额可以从回执拿到并本地缓存，只有跨设备场景会丢，因此不是整页做不出来。若负责人坚持「任何设备打开都必须显示数量」，这一条应升级为 Blocker。

## 前端在修复前的处理（已排期）

1. 改名「铸造空投份额」→「空投铸造」（无需合约变更）。
2. 已铸造态：**本地 anvil / 快照块高可用的环境**用 `AirdropClaimed` 事件读出金额并显示，作为开发与验收路径；test/prod 在 CI-014 修好前只显示「已铸造」状态，文案说明「本机没有留下记录，金额需在区块浏览器查看」，并把读取封装成一处适配层——合约加上 `claimedAmount` 后只改一行 + 同步 ABI。
