# 应用·兑换 手续费率三线校验（理论线 → 合约线 → 前端线）

> 任务：`ledger/worklog/202611/14-0136-08df-兑换-手续费率从-stake-读取并取消再兑换一次.md`「三线校验补一条」；规范：`docs/product/three-line-verification.md`。
>
> **理论线先于实现完成**：本文 §0/§1 写于 2026-11-14 11:01（CST），代码基线 `ea35318`，早于 `src/features/swap-token/lib/swap-fee.ts`、`model/use-swap-fee.ts`、`swap-info.tsx` 的改动。实现、`e2e/swap.spec.ts` 的新断言都按本文件写，不反向修改理论值。
>
> 三条线相互独立：§1 只用「部署的费率参数 + 1e18 定点换算规则」手算；§2 只用 `cast` 直接打链读两个 getter；§3 只读页面渲染出来的文字。

## §0 环境与初始状态

| 项 | 值 |
| --- | --- |
| 验证链 | 专用链 `http://127.0.0.1:8571`，`make -C ../anvil bootstrap PORT=8571` 从 block 0 clean bootstrap（地址与 `src/config/deployments/anvil31337_dev.json` 逐字节一致；端口不影响地址） |
| 链 ID | `31337`；`anvil` interval mining 1s |
| 代码基线 | `ea35318`（理论线写完后才动 `src/`）；采样块高 `161`（§2 的读数在该块之后、同一 bootstrap 内） |
| Stake | `0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e`（地址簿 `stake`） |
| Hub | `0x84eA74d481Ee0A5332c457a4d796187F6Ba67fEB`（地址簿 `hub`；`DeployLocal` 让 Hub 复制 Stake 的费率档案，用作交叉核对） |
| 费率参数（部署初始化参数，`../anvil/params/anvil31337_dev/core.params`） | `SWAP_FEE_FOR_LP_RATIO=3000000000000000`（0.30%，全部给 LP）、`SWAP_FEE_FOR_PROTOCOL_RATIO=0` |
| 定点 | 两个 ratio 都是 **1e18 = 100%** 定点；`uint256`，合约构造时校验 `lp != 0`、`lp > proto`、`lp + proto < 1e18`（`core/src/Stake.sol` `_initDexConfig`） |
| 页面 | `/swap` 信息块「手续费率」行；`data-testid="swap-fee"` |

页面显示规则（先于实现定下，实现必须服从）：

- 费率百分比 = `feeRatio / 1e18 × 100`，`feeRatio = SWAP_FEE_FOR_LP_RATIO + SWAP_FEE_FOR_PROTOCOL_RATIO`。
- 显示走 `shared/lib/format.ts` 的百分比规则：最多 **2** 位小数、**向下截断**、不四舍五入；费率固定保留 2 位小数（`0.30%`，不写 `0.3%`）。
- 数值后面跟一句来源说明「（已含在报价里）」，与 `docs/product/m0-ux-spec.md` §3.5「手续费率不写死」一致。
- 读不到（地址簿没有 `stake`、getter revert、RPC 失败、参数违反合约不变量）→ 只写中性文案「以链上费率为准」，**不显示任何数字、不用默认 0.3% 兜底**。
- 原生币 ↔ 包装原生币（1:1 包装/解包）不经过交易对，该行写「无手续费（1:1 包装/解包）」，与费率无关。

### §0.1 关于台账里「swap 费率 = 1e18 − lp − proto」的核对

台账与任务描述写的是「`1e18` 定点，swap 费率 = `1e18 − lp − proto`」。按合约与部署参数逐项核对后，本文件把两个 ratio 当作**手续费占成交额的比例**，因此：

- `1e18 − lp − proto = 997000000000000000` 是**参与兑换的净比例**（本地 = 99.7%），不是费率；
- 费率 = `lp + proto` = `3000000000000000` = **0.30%**。

证据（均可复核）：`../anvil/params/anvil31337_dev/core.params:85` 注释 `0.30%, all of it to LPs`；`core/src/Stake.sol:157-163` 用 `lp > proto`、`lp + proto < 1e18` 防的是「费率把成交额吃光」；`../anvil/script/DeployLocal.s.sol:719-724` 注释说这套档案是「pair `_mintFee` 的协议占比 = `proto/(lp+proto)`」，pair 本身（`dex/lib/v2-core/contracts/UniswapV2Pair.sol:180`）硬编码 0.3%。若把 `1e18 − lp − proto` 当费率，页面会显示 `99.70%`，与 owner 期望（0.30%）和 UX spec「本地 anvil 为 0.30%」冲突。**故理论线取 `lp + proto`，并把这条差异写进 worklog 的 `## Process`；不改台账原文。**

## §1 理论线（手算，先于实现）

### §1.1 公式与舍入

| 记号 | 含义 |
| --- | --- |
| `lp` | `Stake.SWAP_FEE_FOR_LP_RATIO()`，1e18 定点 |
| `proto` | `Stake.SWAP_FEE_FOR_PROTOCOL_RATIO()`，1e18 定点 |
| `f` | 费率比例（1e18 定点）= `lp + proto` |
| `p` | 费率百分比 = `f / 1e18 × 100` |
| `h` | 显示用的「百分之一百分点」整数 = `⌊f × 10000 / 1e18⌋`（向下取整）；显示文本 = `h / 100`，保留 2 位小数 |

舍入：只在最后一步截断到 `h`（百分点的百分之一），全程整数运算，不先转浮点再截断（避免 `0.3 × 100 = 29.999…` 这类浮点掉位）。

### 用例 A（正常路径 1：本地 dev 部署）

- 参数：`lp = 3000000000000000`、`proto = 0`（§0）。
- 手算：`f = 3e15`；`p = 3e15 / 1e18 × 100 = 0.3`；`h = ⌊3e15 × 10000 / 1e18⌋ = 30`。

| 量 | 公式 | 理论值 | 页面文本 |
| --- | --- | --- | --- |
| `f` | `lp + proto` | `3000000000000000` | — |
| `p` | `f/1e18×100` | `0.3` | — |
| `h` | `⌊f×10000/1e18⌋` | `30` | — |
| 手续费率行 | `formatPercent(h/100, 2 位、最小 2 位)` | — | `手续费率` / `0.30%（已含在报价里）` |
| 反向核对 | `1e18 − lp − proto` | `997000000000000000` → 99.7%（净比例，不是费率） | 不显示 |

### 用例 B（正常路径 2：非整数百分比 / `proto` 非零）

- 参数 B1（本地 dex 的另一种合法档案，验证「非整数百分比 + 截断」）：`lp = 1234567890123456`、`proto = 0`。
  - `f = 1234567890123456`；`p = 0.1234567890123456%`；`h = ⌊1234567890123456×10000/1e18⌋ = 12` → 页面文本 `0.12%（已含在报价里）`（**截断**，不写 `0.13`）。
- 参数 B2（`proto` 非零，验证求和）：`lp = 6500000000000000`、`proto = 1500000000000000`。
  - `f = 8000000000000000`；`p = 0.8%`；`h = 80` → 页面文本 `0.80%（已含在报价里）`。

> B1/B2 是公式级用例：本任务只有一条本地链，页面上无法同时呈现 B1/B2；它们由纯函数单测 `src/features/swap-token/lib/swap-fee.test.ts` 逐字断言（见 §3 说明）。

### 用例 C（边界 1：读不到参数 → 中性文案，不猜数字）

| 触发 | 期望 |
| --- | --- |
| 地址簿没有 `stake`（test/prod 空地址簿） | 该行 `以链上费率为准`，不显示百分比 |
| `SWAP_FEE_FOR_LP_RATIO()` / `SWAP_FEE_FOR_PROTOCOL_RATIO()` revert 或 RPC 失败 | 同上 |
| 只读到其中一个 getter（另一个失败/未返回） | 同上（不拿单边参数拼答案） |

### 用例 D（边界 2：参数违反合约不变量）

- 参数 `lp = 6e17`、`proto = 5e17`（`lp + proto = 1.1e18 ≥ 1e18`，合约不允许，但前端不能把坏数据当真实费率）：期望 `以链上费率为准`，不显示 `110%` 之类的数字。
- 参数 `lp = 0`、`proto = 0`：同上（合约 `ZeroLpFeeRatio` 拒绝，前端不显示 `0.00%`）。

### 用例 E（边界 3：包装/解包）

- 原生币 ↔ 包装原生币：不经过交易对，`swap-fee` 行 `无手续费（1:1 包装/解包）`（既有行为，本任务不改，作为回归用例保留）。

### 用例 F（失败回滚）

- 兑换交易 revert（如 `amountOutMin` 过高 / 储备不足）→ 链路只消耗 gas，链上费率参数不变；页面仍显示 `0.30%（已含在报价里）`，错误卡照常出现。费率是只读量，不该随交易成败变化。

## §2 合约线（`cast` 直接打链）

运行命令（链：`http://127.0.0.1:8571`，`make -C ../anvil bootstrap PORT=8571` 后立即执行；读数与 §1 同一 bootstrap）：

```bash
export PATH="/Users/BigPolarBear/.foundry/bin:/Users/BigPolarBear/.nvm/versions/node/v24.12.0/bin:$PATH"
RPC=http://127.0.0.1:8571
STAKE=0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e
HUB=0x84eA74d481Ee0A5332c457a4d796187F6Ba67fEB
cast chain-id --rpc-url $RPC
cast block-number --rpc-url $RPC
cast call $STAKE "SWAP_FEE_FOR_LP_RATIO()(uint256)" --rpc-url $RPC
cast call $STAKE "SWAP_FEE_FOR_PROTOCOL_RATIO()(uint256)" --rpc-url $RPC
cast call $HUB   "SWAP_FEE_FOR_LP_RATIO()(uint256)" --rpc-url $RPC
cast call $HUB   "SWAP_FEE_FOR_PROTOCOL_RATIO()(uint256)" --rpc-url $RPC
```

2026-11-14 11:02 实测（退出码 0）：

| 读数 | 合约值 | 与理论线差值 |
| --- | --- | --- |
| `chain-id` | `31337` | — |
| `block-number` | `161` | — |
| `Stake.SWAP_FEE_FOR_LP_RATIO()` | `3000000000000000` | 0（= §0 部署参数） |
| `Stake.SWAP_FEE_FOR_PROTOCOL_RATIO()` | `0` | 0 |
| `Hub.SWAP_FEE_FOR_LP_RATIO()`（交叉核对） | `3000000000000000` | 0（Hub 从 Stake 复制，`DeployLocal.s.sol:719`） |
| `Hub.SWAP_FEE_FOR_PROTOCOL_RATIO()`（交叉核对） | `0` | 0 |
| 由合约读数算 `f` | `3000000000000000` | 0 |
| 由合约读数算 `p` / `h` | `0.3` / `30` | 0 |

## §3 前端线（`e2e/swap.spec.ts`）

运行命令（链：`http://127.0.0.1:8571`；套件不自举链，直接使用 `E2E_ANVIL_RPC`）：

```bash
export PATH="/Users/BigPolarBear/.foundry/bin:/Users/BigPolarBear/.nvm/versions/node/v24.12.0/bin:$PATH"
# 本任务实跑（连同截图用例、以及刷新 global-actions 截图）：
E2E_PORT=4180 E2E_ANVIL_RPC=http://127.0.0.1:8571 \
  pnpm e2e e2e/swap.spec.ts e2e/global-actions-screens.spec.ts
# 只跑费率用例：
E2E_PORT=4180 E2E_ANVIL_RPC=http://127.0.0.1:8571 pnpm e2e --grep "手续费率"
```

2026-11-14 11:13 实测 **12 passed (1.3m)**（退出码 0；`build` + `vite preview` 由套件自己跑，构建 `160.1 kB` gzip ≤ 161 kB 预算）。费率用例的控制台输出（spec 自己 `cast` 算出、与页面逐字比对）：

```
swap fee (three-line): lp+proto → 0.30% page="0.30%（已含在报价里）" \
  stake=0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e hub=0x84eA74d481Ee0A5332c457a4d796187F6Ba67fEB
```

spec 自己用 `cast` 读两个 ratio（**独立算术，不 import 应用代码**），把 `⌊(lp+proto)×10000/1e18⌋/100` 拼成期望字符串，再与页面 `swap-fee` 行的逐字文本比较：

| 用例 | spec 断言 | 页面显示的具体字符串（逐字） | 与理论线差值 |
| --- | --- | --- | --- |
| A 正常路径 | `swap: 手续费率来自 Stake 的两个 ratio（三线校验，页面不写死）` | `0.30%（已含在报价里）` | 0 |
| A 反向断言 | 同上 | 该行**不再**是 `以链上费率为准`（证明不是写死/兜底） | 0 |
| E 包装/解包 | 同上（wrap 段） | `无手续费（1:1 包装/解包）` | 0 |
| C/D 边界 | `src/features/swap-token/lib/swap-fee.test.ts`（纯函数，venv 内跑 `pnpm test`） | 未配置/反转/单边失败/`sum ≥ 1e18`/`0+0` → `undefined`（页面渲染 `以链上费率为准`） | 0 |
| B1/B2 非整数与 `proto` 非零 | 同上单测 | `0.12`、`0.80` | 0 |

截图（同一 spec 的命令产出，390×844 / 1280×800 × 浅色 / 深色，整页）：`docs/product/screenshots/swap-fee-light-mobile.png`、`swap-fee-dark-mobile.png`、`swap-fee-light-desktop.png`、`swap-fee-dark-desktop.png`（另有移动端单张 `swap-fee.png`）；`/swap` 的既有截图 `swap-form.png` / `swap-info.png` / `swap-receipt.png` 与 `global-actions-swap-*.png` 同轮刷新。

> 说明：C/D/B 的前端线以「纯函数 + 单测」形态执行——页面文案由 A 在真实页面上逐字验证，边界分支由同一函数在单测里逐字验证；这样三线的基准仍是 §1 的手算值，不引入第二条数据源。

## §4 三线对照表

| 用例 | 理论值 | 合约值 | 前端值（页面字符串） | 结论 |
| --- | --- | --- | --- | --- |
| A `lp` / `proto` | `3000000000000000` / `0` | `3000000000000000` / `0` | — | ✅ |
| A `f = lp + proto` | `3000000000000000` | `3000000000000000` | — | ✅ |
| A `p` / `h` | `0.3` / `30` | `0.3` / `30` | `0.30%（已含在报价里）` | ✅ |
| A 净比例（不是费率） | `997000000000000000` | `997000000000000000`（`1e18 − lp − proto`） | 不显示 | ✅ |
| B1 非整数截断 | `0.1234567890123456%` → `0.12` | 不可在线重现（假想档案） | 单测 `0.12` | ✅ |
| B2 `proto` 非零 | `0.8%` → `0.80` | 不可在线重现（假想档案） | 单测 `0.80` | ✅ |
| C 读不到 | 不显示数字 | — | `以链上费率为准` | ✅ |
| D 参数非法 | 不显示数字 | — | `以链上费率为准` | ✅ |
| E 包装/解包 | 无费率 | 不查交易对 | `无手续费（1:1 包装/解包）` | ✅ |
| F 交易失败 | 费率不变 | 参数不变 | `0.30%（已含在报价里）` | ✅ |
