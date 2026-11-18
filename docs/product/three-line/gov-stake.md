# 治理·质押 三线校验（理论线 → 合约线 → 前端线）

> 任务来源：owner 本轮要求——`/gov` 治理页要覆盖**流动性质押**（把社区代币 + 包装原生币按池子比例存入、铸流动性凭证、按「承诺解锁期」放大治理票）与**加速激励质押**（社区代币单独存入、按治理票占比拿到加速上限）。规范：`docs/product/three-line-verification.md`。
>
> **理论线先于实现完成**：本文件 §0/§1 写于 **2026-11-17 12:40（Asia/Taipei）**，代码基线 `git rev-parse --short HEAD` = **`ace6042`**，早于 `scripts/verify/gov-stake-contract.mjs`、`src/domain/gov-stake.ts`、`/gov` 页面实现与 `e2e/gov-stake-numbers.spec.ts` 的任何代码。实现、合约脚本、前端 spec 都**按本文件写，不反向修改理论值**。
>
> 三条线相互独立：§1 只用「§0 初始状态快照 + 页面输入 + `Stake.sol` 的整数公式」手算；§2 只用 viem 直接打链（脚本不读前端任何计算结果）；§3 只读页面文字。三线同一用例的数值必须逐 wei 相等。
>
> **基线更正（2026-11-17 13:12，Lead 复核后重算）**：§1 初稿用的初始状态快照来自 **8545 人工链**的只读 dump，但 8545 不是 clean bootstrap 态（多一个手工铸造的身份、`TestLOVE20.totalSupply()` 也不同，证据见 §0.4）。理论线的**公式与 C1/C3 数值不变**，只有吃 `token.totalSupply()` 的 **C2（`mintedShare/baseCap/memberCap/boostAmount`）与 C4 的加速退还额/撤出总额**按 **8555 clean bootstrap 基线**重算；旧数字已全部替换，作废值只在 §0.4 与 §2「基线敏感性」里作为反例保留。
>
> **§1 的数值不来自链上返回**：`boostStakeCap` / `memberStake` / `totalStake` / `govVotes` 这些 view 在 §2 里只作为**交叉核对**出现（第 4 列「链上交叉核对」），期望值由 §1.2 的公式独立算出。

## §0 环境与初始状态

### §0.1 验证链与代码基线

| 项 | 值 |
| --- | --- |
| 验证链 | **专用链 `http://127.0.0.1:8566`**（`chainId = 31337`）；跑 §2 时临时切 automine（一个交易一个块，块号可复现），跑完切回套件口径 `automine = false` + interval mining 1s |
| §0 采样点 | **block = 25231，current phase = 211**（`phaseInfo(211) = (25201, 120)`，即阶段 211 覆盖块 25201–25320；`currentPhaseBlocks() = 120`，`lastSyncPhase = 0`） |
| 链上状态来源 | **8555（e2e 套件链）的 clean bootstrap 状态**：对 8555 做**只读** `anvil_dumpState`，再用 `anvil --load-state` 在 8566 起独立链（8555 全程只读、未写；8545 未碰）。**不使用 8545 人工链的 dump**——它带手工写入，基线不等价，证据见 §0.4。子代理会话的沙箱不能写 `../anvil`（且 `python3` 被执行器 SIGKILL），所以 `make bootstrap PORT=8566` 无法在本会话内运行，改用 dump/load 等价复现 clean bootstrap 的**状态**。 |
| 地址簿 | `../anvil/export/deployments/anvil31337_dev.json`（前端副本 `src/config/network/anvil31337_dev/network.json` 同源；端口不影响地址） |
| ABI | `../anvil/export/abis/Stake.json`（前端副本 `src/config/abis/stake.ts` 同源） |
| 协议参数（dev） | `PROMISED_WAITING_PHASES_MIN = 1`、`PROMISED_WAITING_PHASES_MAX = 100`、`BOOST_STAKE_SUPPLY_FACTOR = 2`、`BOOST_STAKE_MULTIPLIER = 5`、`LIQUIDITY_TOKEN_EQUIVALENCE_FACTOR = 2`、`FEE_SETTLEMENT_RATIO = 2500000000000000`（2.5e15）、`SWAP_FEE_FOR_LP_RATIO = 3000000000000000`（0.30%）、`SWAP_FEE_FOR_PROTOCOL_RATIO = 0`、pair `feeTo = 0x0`（**无协议费**，`_pendingProtocolFeeLp ≡ 0`） |
| 核心合约 | `core/src/Stake.sol`（1280 行）@ `ace6042`；`_govVotesOf` 在第 1277 行、`_optimalAmounts` 在第 1091 行、`_boostStakeBaseAndMemberCap` 在第 655 行、`_creditLiquidity` 在第 820 行、`_withdrawLiquidity` 在第 1124 行 |

### §0.2 地址簿

| 合约 | 地址 |
| --- | --- |
| Stake（质押/治理） | `0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e` |
| MemberNFT（身份） | `0x610178dA211FEF7D417bC0e6FeD39F05609AD788` |
| 首币 TestLOVE20（社区代币） | `0x8aCd85898458400f7Db866d53FCFF6f0D49741FF`，`symbol = TestLOVE20`，`decimals = 18` |
| TestWETH（包装原生币/父代币） | `0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9`，`symbol = TestWETH`，`decimals = 18`，WETH9（`deposit()` 用 ETH 换包装币） |
| 首币 pair | `0x3FC12a5abAe69C8Eee58C37cEDC266751507620D`（`token0 = TestLOVE20`、`token1 = TestWETH`） |
| Phase（阶段时钟） | `0xa513E6E4b8f2a923D98304ec87F64353C4D5C853`（`ORIGIN_BLOCKS = 1`、`ORIGIN_PHASE_BLOCKS = 120`、`TARGET_SECONDS = 120`） |
| Vote / Submit | `0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82` / `0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0` |

> 注：派单文字里的 pair 地址写成 `0x3FC12a5abA69…`（少一位），**正确值是 `0x3FC12a5abAe69C8Eee58C37cEDC266751507620D`**（`export/deployments` 与 `getPair(TestLOVE20, TestWETH)` 一致）。

### §0.3 种子状态（8566，block 25231 / phase 211 实测）

| 项 | 值（wei） | 备注 |
| --- | --- | --- |
| pair `getReserves()` | `reserve0 = 200000000000000000000000`（TestLOVE20）、`reserve1 = 100000000000000000000`（TestWETH） | 价格 1 TestWETH = 2,000 TestLOVE20 |
| pair `totalSupply` | `4472135954999579392818` | `= isqrt(2e23·1e20)`；其中 `1000` 永久锁在 pair 地址（`balanceOf(pair) = 0`，LP 全在 Stake） |
| pair LP @ Stake | `4472135954999579391818` | `= totalSupply − 1000` |
| pair 代币余额 | TestLOVE20 `200000000000000000000000`、TestWETH `100000000000000000000` | 无捐赠（余额 = 储备，`pendingProtocolFeeLp = 0`） |
| `stake.totalStake(TestLOVE20)` | `(totalLiquidityShares=4472135954999579391818, totalLp=4472135954999579391818, withdrawableLp=4472135954999579391818, feeLp=0, totalBoostShares=0, tokenAmountForLiquidity=199999999999999999955278, parentTokenAmountForLiquidity=99999999999999999977, firstGovVoteRound=2)` | 种子把**全部 LP** 记在 memberId #1 |
| `stake.liquidityTokenAmount(TestLOVE20)` | `200000000000000000000000` | 累计存入的社区代币本金 = 2e23 |
| `stake.memberStake(TestLOVE20, 1)` | `(liquidityShares=4472135954999579391818, boostShares=0, promisedWaitingPhases=1, unlockRequestPhase=0, tokenAmountForLiquidity=199999999999999999955278, parentTokenAmountForLiquidity=99999999999999999977, firstGovVoteRound=2)` | 治理票 `= 4472135954999579391818 × 1` |
| `stake.memberStake(TestLOVE20, 5)` | 全 `0`（未质押） | 本文件 C1–C4 的操作对象 |
| `stake.govVotes(TestLOVE20, 211, 1)` / `totalGovVotes(211)` / `totalGovVotesAdded(211)` | `4472135954999579391818` / `4472135954999579391818` / `4472135954999579391818` | `totalGovVotesRemoved(211) = 0` |
| `stake.totalValidBoostShares(211)` | `0` | 尚无加速质押 |
| TestLOVE20 `totalSupply()` / `MAX_SUPPLY()` | `999995499999099999909999997` / `10000000000000000000000000000` | 加速上限的唯一供应量输入（`totalSupply` 只在空投铸造与销毁时变化；本链无 swap → 无销毁）。**这个数就是基线错误的敏感点**（旧 8545 口径是 `999994599998649999819999988`，差 `900000450000090000009 wei`） |
| MemberNFT `totalSupply()` | `5` | 只有 memberId 1–5（`ownerOf(6)` revert `ERC721NonexistentToken(6)`）；owner 见 §0.5 |

### §0.4 基线复核：为什么**不用** 8545 的 dump（旧结论作废）

> **废止声明（2026-11-17 13:10，Lead 复核）**：本文件初稿用 **8545 人工链**的只读 `anvil_dumpState` 起 8566，并在这里写下「与 clean bootstrap 等价」。**该结论是错的**：8545 比 clean bootstrap 多了一个手工铸造的身份，且 `TestLOVE20.totalSupply()` 不同（见下表）。现在改用 **8555（e2e 套件链）** 的只读 dump 起新 8566（pid 36621）；§1/§2/§3/§4 里吃 `token.totalSupply` 的 **C2 全部中间量与 C4 撤出总额已按新基线重算**，C1/C3 不受影响。

| 核对项 | 8545 人工链（旧 8566，**错误基线**） | 8555 clean bootstrap（新 8566，**本文口径**） | 差 / 结论 |
| --- | --- | --- | --- |
| `MemberNFT.totalSupply()` | `6` | **`5`** | 8545 多 1 个手工铸造的身份（tokenId 6 → `0x7099…79C8`）；新链 `ownerOf(6)` revert `ERC721NonexistentToken(6)` |
| `TestLOVE20.totalSupply()` | `999994599998649999819999988` | **`999995499999099999909999997`** | 差 `900000450000090000009 wei`（≈0.9 币）；直接影响 `mintedShare = mulDiv(liquidityTokenAmount, totalSupply, MAX_SUPPLY)` |
| pair 储备 / pair `totalSupply` / Stake 记账 LP / `liquidityTokenAmount` | `2e23`/`1e20` / `4472135954999579392818` / `4472135954999579391818` / `2e23` | 同左 | 0 |
| memberId 1–5 状态、`ownerOf(5)` | `(4472…818, 0, 1, 0)` / `0x15d3…6A65` | 同左 | 0 |
| AirdropDistributor 余量 / 账户余额 | `5e26` / 同 §0.5 | 同左 | 0 |

结论：两条基线**只有** `token.totalSupply()` 与「成员 NFT 是否多一个」能区分开；`Stake` 的记账状态在两边完全一致，所以差值恰好只落在**吃 `totalSupply` 的加速上限**（C2 的 `mintedShare/baseCap/memberCap/boostAmount`）与**加速退还额/撤出总额**（C4）上，其余用例的数值不变。8545 只在 dump 时被只读读取，未写；8555 也只读 dump，未写（套件还要用它）。

### §0.5 账户、余额与成员身份

anvil 固定账户（mnemonic `test test … junk`）；本文件把「anvil 第 n 个账户」按**导出地址**写，避免序号歧义：

| 账户（索引） | 地址 | ETH（wei） | TestLOVE20（wei） | TestWETH（wei） | 持有哪些 MemberNFT |
| --- | --- | --- | --- | --- | --- |
| #0 | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | `9891813588600050032941` | `99799100000000000000000000` | 0 | tokenId **1** |
| #1 | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | n/a（未用） | n/a | n/a | tokenId **2** |
| #2 | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | n/a（未用） | n/a | n/a | tokenId **3** |
| #3 | `0x90F79bf6EB2c4f870365E785982E1f101E93b906` | n/a（未用） | n/a | n/a | tokenId **4** |
| **#4（本文件的操作账户）** | `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65` | `9999952933221930588388` | `99999099999639999945999997` | `0`（需先 `deposit()`） | **tokenId 5** |
| #5 | `0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc` | `10000000000000000000000` | `0` | `0` | 无 |

> **与派单文字的差异（重要）**：派单写「memberId #5 使用 anvil 账户 #5 `0x9965…A4dc`」。实测 `MemberNFT.ownerOf(5) = 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65`（导出地址簿里的第 5 个 anvil 账户，索引 4），而 `0x9965…A4dc` **不持有任何 MemberNFT**。`unstake` / `withdraw` / `increasePromisedWaitingPhases` 都是 `onlyMemberOwner`（`Stake.sol` 第 201–204、306–307、331、371 行），所以 C1–C4 一律用 **memberId 5 + 调用者 `0x15d3…6A65`**；`0x9965…A4dc` 只作为「无仓位账户」出现在 C5④ 的对照里。

### §0.6 页面显示规则（先于实现定下，前端线照此断言）

- 金额一律走 `src/shared/lib/format.ts` 的 `formatTokenAmount`：整数部分千分位分组、小数最多 **6** 位、**只截断不四舍五入**、去掉末尾 0；未知显示 `—`。
- 治理权、加速份额、流动性份额都是「18 位定点数」，页面按代币数量同样的规则显示（6 位截断）；**中文一律写「治理权」**（GLOSSARY：投票权 → 治理权，界面不出现「治理票 / 票数」）。
- 百分比走 `formatPercent`：最多 2 位、截断。
- 「承诺解锁期」单位是**阶段**，页面文案写「约 N 分钟」（1 阶段 ≈ 120 秒 = 2 分钟；本链 `TARGET_SECONDS = 120`，只能写「约」）。

## §1 理论线（手算，先于实现）

### §1.1 记号与舍入

| 记号 | 含义 |
| --- | --- |
| `t` / `p` | 本次流动性质押**实际采用**的两侧数量（社区代币 / 父代币，wei） |
| `R_T` / `R_P` | pair 按 `(社区代币, 父代币)` 定向的储备（`token0 = TestLOVE20`，所以 `R_T = reserve0`、`R_P = reserve1`） |
| `S` | pair `totalSupply()`（本次 `mint` 之前） |
| `L` | 本次 `pair.mint(stake)` 铸出的 LP |
| `TLS` | `totalStake.totalLiquidityShares`（质押合约记账的「流动性份额」） |
| `WLP` | `totalStake.withdrawableLp`（可分配 LP；本部署 `feeTo = 0`、无 swap，`feeLp ≡ 0`，所以 `WLP` 恒等于「记账 LP 总量 − 已分掉的份额」） |
| `V_m(m)` | 成员 `m` 的治理票 `= liquidityShares × promisedWaitingPhases`（`_govVotesOf`，`Stake.sol` 第 1277–1279 行） |
| `V_tot` | `totalGovVotesAt(token, round) = totalGovVotesAdded.value(round) − totalGovVotesRemoved.value(round)`；`RoundHistoryUint256.value(round)` 取「≤ round 的最近一次记录」的累计值 |
| `P` | 当前阶段（`Phase.currentPhase()`，合约里叫 `round`） |

舍入：Solidity 全整数运算，**每一步除法、`Math.sqrt`、`Math.mulDiv` 都向下取整**；本文件所有中间量按同一规则逐式代入，不先取整再回代。`Math.mulDiv(a,b,c) = floor(a·b/c)`（512 位中间量，不溢出）。

> 术语：合约字段/事件叫 `govVotes`、`totalGovVotes`（代码里保留「票」的说法）；**页面中文一律写「治理权」**（GLOSSARY「投票权 → 治理权」，界面不出现「治理票 / 票数」）。§1 下文的「治理票」只作为 `govVotes` 的合约口径别名，§3 的页面文本一律用「治理权」。

### §1.2 闭式公式（照 `Stake.sol` 的整数语义，独立于任何 view）

**① 流动性质押 `stakeLiquidity(token, tIn, pIn, phases, memberId, deadline)`**

1. 前置：`tIn > 0`（否则 `ZeroTokenAmount`）、`pIn > 0`（`ZeroParentTokenAmount`）、`phases ∈ [1, 100]`（`InvalidPromisedWaitingPhases`）、无在途解锁（`UnstakeAlreadyRequested`）、阶段 `P ≠ 0`、非 owner 不得改写已存在的 `phases`、`phases` 不得下降。
2. 最优两侧（`_optimalAmounts`，第 1091–1108 行）：`p* = floor(tIn·R_P/R_T)`；若 `p* ≤ pIn` 取 `(t, p) = (tIn, p*)`，否则取 `(floor(pIn·R_T/R_P), pIn)`。**只 `transferFrom` 采用的两侧**，多余部分留在用户钱包。
3. 铸 LP（pair 先收到两侧，再 `mint`）：`L = min(floor(t·S/R_T), floor(p·S/R_P))`（`S ≠ 0`）。
4. 记账份额：`sharesAdded = (TLS == 0 || WLP_before == 0) ? L : floor(TLS·L / WLP_before)`。
5. 治理票增量：`govVotesAdded = (shares_before + sharesAdded)·phases − shares_before·prevPhases`；随后 `shares += sharesAdded`、`phases = phases`、`TLS += sharesAdded`、`WLP += L`、`liquidityTokenAmount += t`、`firstGovVoteRound ??= P`。
6. 展平检查（本部署处处成立）：`_applyReclassification` 每次都用 `sqrtK(当前储备)·总LP/有效供应量` 与上一次基线比较，**本任务全程没有 swap**（储备比例恒定），所以 `currentSqrtKOfLp == lastSqrtKOfLp` → 不重分类，`feeLp = 0`、`WLP` 不缩水；`_settleFees` 的 `settlementUnit = floor(effectiveSupply·2.5e15/1e18) > feeLp = 0` → 不结算。**因此 `sharesAdded` 恒等于 `L`**（`TLS == WLP_before` 只在种子后的第一次质押成立；用例 C1 用它，C4 之后又回到相等）。

**② 加速质押 `stakeBoost(token, boostAmount, phases, memberId, deadline)`**

1. 前置：`boostAmount > 0`（`ZeroBoostAmount`）、`phases` 合法、**必须有流动性份额**（`liquidityShares > 0`，否则 `NoStakedLiquidity`）、无在途解锁、非 owner 不得改写/降低 `phases`。
2. 基础上限（`_boostStakeBaseAndMemberCap`，第 655–676 行）：
   ```
   mintedShare = mulDiv(liquidityTokenAmount(token), token.totalSupply(), token.MAX_SUPPLY())
   baseCap     = mintedShare × LIQUIDITY_TOKEN_EQUIVALENCE_FACTOR(2) × BOOST_STAKE_SUPPLY_FACTOR(2) = 4·mintedShare
   memberCap   = mulDiv(baseCap, V_m(memberId, P), V_tot(P)) × BOOST_STAKE_MULTIPLIER(5)
   ```
   注意 `liquidityTokenAmount` 是**全社区累计本金**（不是该成员的），`V_m/V_tot` 用**当轮**治理票。
3. 上限校验：`member.boostShares + boostAmount ≤ memberCap`，否则 `BoostCapExceeded(token, memberId, boostAmount, memberCap − boostShares)`（`allowed` 是**余量**，不是 `memberCap`）。
4. 效果：`boostShares += boostAmount`、`totalBoostShares += boostAmount`、`validBoostShares(memberId, P) += boostAmount`、`totalValidBoostSharesAdded(P) += boostAmount`；**若 `phases` 未变则治理票不变**（加速质押本身不产生治理票）；`phases` 抬高时才 `govVotesAdded = liquidityShares × (phases − prevPhases)`。

**③ 增加解锁期 `increasePromisedWaitingPhases(token, memberId, phases)`**（owner only）

`govVotesAdded = liquidityShares × (phases − prevPhases)`（新值必须 ≥ 旧值，否则 `PromisedWaitingPhasesDecreased`）；`member.phases = phases`。

**④ 申请解锁 `unstake(token, memberId)`**（owner only）

前置：有流动性、无在途申请、**本阶段该成员没投过票也没推举过**（否则 `StakeRightsUsed`）。
效果：`unlockRequestPhase = P`；`govVotesRemoved = V_m = shares × phases`（治理票清零）；`validBoostShares(memberId, P) −= boostShares`（`totalValidBoostSharesRemoved(P) += boostShares`）；**`member.liquidityShares` / `boostShares` 不清零**（撤出时才处理）。

**⑤ 撤出 `withdraw(token, memberId, deadline)`**（owner only）

前置：`P > unlockRequestPhase + promisedWaitingPhases`（**严格大于**），否则 `UnlockRoundNotReached(P, unlockRequestPhase + phases)`。
```
lpAmount  = floor(liquidityShares × WLP / TLS)        // 先 _settleFees，再按可分配 LP 分
WLP      -= lpAmount ; TLS -= liquidityShares
tokenOut  = floor(lpAmount × R_T / S)                 // pair.burn(msg.sender)
parentOut = floor(lpAmount × R_P / S)
liquidityTokenAmount -= floor(liquidityShares × liquidityTokenAmount / TLS_before)
boost 返还：transfer(msg.sender, boostShares)（社区代币），totalBoostShares -= boostShares
member 的 stake 状态整条删除
```
`_canBurn` 要求 `lpAmount·R_T ≥ effectiveSupply && lpAmount·R_P ≥ effectiveSupply`（本用例成立）。

### 用例 C1（正常路径 1：流动性质押，1,000 TestLOVE20 + 1 TestWETH，10 阶段）

- 账户 `0x15d3…6A65`（memberId **5**，owner）；输入 `tokenAmount = 1000000000000000000000`（1000e18）、`parentTokenAmount = 1000000000000000000000`（1e18）、`promisedWaitingPhases = 10`；先 `approve(Stake, 1e21)`（TestLOVE20）、`deposit()` 1e18 ETH 得 TestWETH、`approve(Stake, 5e17)`（TestWETH）。

| 量 | 公式 | 理论值（wei） | 页面文本 |
| --- | --- | --- | --- |
| `p*` | `floor(1e21·1e20/2e23)` | `500000000000000000` | — |
| 采用两侧 `t` / `p` | `p* ≤ pIn` → `(tIn, p*)`；多余的 `5e17` TestWETH 不转入 | `1000000000000000000000` / `500000000000000000` | `1,000 TestLOVE20` + `0.5 TestWETH` |
| token 侧 LP | `floor(1e21·S0/2e23)` | `22360679774997896964` | — |
| parent 侧 LP | `floor(5e17·S0/1e20)` | `22360679774997896964` | — |
| `L`（本次铸出 LP） | `min(两侧)` | `22360679774997896964` | `预计获得 22.360679 流动性凭证` |
| `WLP_before` | 种子 `withdrawableLp`（无 swap → 不重分类） | `4472135954999579391818` | — |
| `sharesAdded` | `floor(TLS0·L/WLP_before)` | `22360679774997896964` | — |
| `govVotesAdded` | `(0+L)·10 − 0` | `223606797749978969640` | `预计治理权 +223.606797` |
| `firstGovVoteRound` | `= P` | `211`（实测阶段） | — |

C1 执行后的终态（逐 wei）：

| 读取 | 理论值（wei） | 页面文本 |
| --- | --- | --- |
| `memberStake(t,5).liquidityShares` | `22360679774997896964` | `22.360679`（流动性份额） |
| `.boostShares` / `.promisedWaitingPhases` / `.unlockRequestPhase` | `0` / `10` / `0` | — / 约 `20 分钟` / 未申请 |
| `.tokenAmountForLiquidity` / `.parentTokenAmountForLiquidity`（**成员份额**折算） | `999999999999999999995` / `499999999999999999` | `999.999999 TestLOVE20` + `0.499999 TestWETH` |
| `.firstGovVoteRound` | `211` | — |
| `stake.memberStake(t,5)` 治理权（合约字段 `govVotes`） | `223606797749978969640` | `223.606797` |
| `stake.totalStake(t).totalLiquidityShares` | `4494496634774577288782` | `4,494.496634` |
| `.totalLp` = `.withdrawableLp` | `4494496634774577288782` | `4,494.496634` |
| `.feeLp` / `.totalBoostShares` | `0` / `0` | — |
| `.tokenAmountForLiquidity` / `.parentTokenAmountForLiquidity` | `200999999999999999955278` / `100499999999999999977` | `200,999.999999` + `100.499999` |
| `stake.liquidityTokenAmount(t)` | `201000000000000000000000` | `201,000` |
| `stake.govVotes(t,211,5)` | `223606797749978969640` | `223.606797` |
| `stake.totalGovVotes(211)` | `4695742752749558361458` | `4,695.742752` |
| pair `totalSupply` | `4494496634774577289782` | `4,494.496634`（LP 总量） |
| pair 储备 `R_T` / `R_P` | `201000000000000000000000` / `100500000000000000000` | `201,000` / `100.5` |
| 账户净变化 TestLOVE20 | `−1000000000000000000000` | — |
| 账户净变化 TestWETH（先 `deposit()` 1e18，再被质押转走 5e17） | `+500000000000000000` | — |

> **§1 修正记录（2026-11-17 12:55，同一轮、合约线首次实跑之前）**：本表初稿把 `totalStake` 的折算口径（全社区 `withdrawableLp × 储备 / 有效供应量 = 200,999.999999`）误抄进了 `memberStake` 行。按 `Stake.memberStake` 的**成员口径**重算：`lpAmount = floor(liquidityShares × withdrawableLp / totalLiquidityShares) = 22360679774997896964`，再 `floor(lpAmount × R / effectiveSupply)`，得到 **`999999999999999999995` / `499999999999999999`**（= 1,000 TestLOVE20 与 0.5 TestWETH 的份额折算）。修正的是**公式的适用范围**，不是把预期值改成链上返回值；全社区口径 `200999999999999999955278` / `100499999999999999977` 仍然出现在 `totalStake` 行。
>
> **§1 基线更正（2026-11-17 13:12）**：C2 的 `mintedShare` 用的 `token.totalSupply()` 从 8545 的 `999994599998649999819999988` 改为 clean bootstrap 的 `999995499999099999909999997`，连带 `baseCap/memberCap/boostAmount` 与 C4 的 `boostShares` 退还额、账户 TestLOVE20 增加额全部重算（见 §0.4）。公式、C1、C3 的数值不变；`memberCap` 在新基线下是偶数，`boostAmount` 恰好是一半。
>
> **授权口径**：`approve(Stake, 额度)` 是逐笔消耗的。C1 用 `1e21`（正好用完），**C2 的加速质押要再 `approve(Stake, boostAmount)` 一次**，否则会 revert 在 ERC20 授权上（不是 `BoostCapExceeded`）——页面每笔都重新授权，脚本也照此发两笔 `approve`。

> 因为两侧恰好按池子比例（1e21/2e23 = 5e17/1e20 = 1/200），token 侧与 parent 侧的 LP 完全相等，`L` 没有取整损失。

### 用例 C2（正常路径 2：加速质押，取上限的一半）

在 C1 之后（同一成员、同一快照）。`liquidityTokenAmount = 201000000000000000000000`、`token.totalSupply() = 999995499999099999909999997`（8555 clean bootstrap 基线，见 §0.4）、`MAX_SUPPLY = 1e28`。

| 量 | 公式 | 理论值（wei） | 页面文本 |
| --- | --- | --- | --- |
| `mintedShare` | `mulDiv(201000000000000000000000, 999995499999099999909999997, 10000000000000000000000000000)` | `20099909549981909998190` | — |
| `baseCap` | `mintedShare × 2 × 2` | `80399638199927639992760` | — |
| `V_tot` | C1 后 `totalGovVotes` | `4695742752749558361458` | `4,695.742752` |
| `V_m(5)` | `22360679774997896964 × 10` | `223606797749978969640` | `223.606797` |
| `memberCap` | `mulDiv(baseCap, V_m, V_tot) × 5`（先 `floor(baseCap·V_m/V_tot) = 3828554199996554286170`） | `19142770999982771430850` | `加速上限 19,142.770999` |
| `boostAmount` | `floor(memberCap/2)`（clean bootstrap 基线下 `memberCap` 是偶数 → 恰好整除，余 0 wei） | `9571385499991385715425` | `9,571.385499` |
| 剩余额度 | `memberCap − boostAmount` | `9571385499991385715425` | `9,571.385499` |

C2 执行后：

| 读取 | 理论值（wei） | 页面文本 |
| --- | --- | --- |
| `memberStake(t,5).boostShares` | `9571385499991385715425` | `9,571.385499` |
| `stake.totalStake(t).totalBoostShares` | `9571385499991385715425` | `9,571.385499` |
| `stake.validBoostShares(t,211,5)` | `9571385499991385715425` | `9,571.385499` |
| `stake.totalValidBoostSharesAdded(t,211)` | `9571385499991385715425` | — |
| **治理权（不变）** | `223606797749978969640` / `totalGovVotes = 4695742752749558361458` | `223.606797` |
| 账户 TestLOVE20 扣款 | `9571385499991385715425` | — |

> 上限公式的 `allowed` 只用于 revert 参数的**余量**：本用例后余量 `9571385499991385715425`；再存 `9571385499991385715426` 就会 revert `BoostCapExceeded`（C5①/C6）。`memberCap` 为偶数时 `boostAmount` 恰好是上限的一半，C2 之后「本阶段还能加速」与「加速质押份额」**数值相同**（语义不同：余量 vs 已用）。

### 用例 C3（正常路径 3：承诺解锁期 10 → 25）

| 量 | 公式 | 理论值（wei） | 页面文本 |
| --- | --- | --- | --- |
| `govVotesAdded` | `22360679774997896964 × (25 − 10)` | `335410196624968454460` | `预计治理权 +335.410196` |
| `memberStake(t,5).promisedWaitingPhases` | `25` | `25` | 约 `50 分钟` |
| `govVotes(t,211,5)` | `22360679774997896964 × 25` | `559016994374947424100` | `559.016994` |
| `totalGovVotes(211)` | `4695742752749558361458 + 335410196624968454460` | `5031152949374526815918` | `5,031.152949` |

> 解锁期的单位是「阶段」；`increasePromisedWaitingPhases` 对同一成员**不**要求先解锁（只要求有新值 ≥ 旧值、无在途申请、有流动性）。

### 用例 C4（正常路径 4：申请解锁 → 等到期 → 撤出）

C4 从 C3 的状态出发。`unlockRequestPhase = P = 211`（实测，与 §0 同一阶段；C1–C3 共 7 笔交易只推进 7 个块，仍在阶段 211 的 25201–25320 区间内）。

| 量 | 公式 | 理论值（wei） | 页面文本 |
| --- | --- | --- | --- |
| `unstake` 移除治理权 | `22360679774997896964 × 25` | `559016994374947424100` | `我的治理权归 0` |
| `unlockRequestPhase` | `= P` | `211` | 「还要再等 26 个阶段（约 52 分钟）才能撤出」 |
| `canWithdraw`（未到期） | `211 ≤ 211 + 25` → `false` | `false` | 未到期 |
| `totalValidBoostSharesRemoved(t,211)` | `= boostShares` | `9571385499991385715425` | 加速份额归 0 |
| `validBoostShares(t,211,5)` | `0` | `0` | — |
| `totalGovVotes(211)`（unstake 后） | `5031152949374526815918 − 559016994374947424100` | `4472135954999579391818` | `4,472.135954`（社区总治理权） |

到期条件：`P_withdraw > 211 + 25 = 236` → **阶段 237**（`phaseInfo(212) = (25321, 120)`，阶段 n 起始块 `= 25201 + (n−211)×120`，故阶段 237 起始块 `= 25201 + 26×120 = 28321`）。`anvil_mine` 推块到 28321 后 `withdraw`：

> **边界说明（严格大于导致 +1）**：`withdraw` 要求 `当前阶段 > unlockRequestPhase + promisedWaitingPhases`，所以 `Q = unlockRequestPhase`、`phases = 25` 时**可撤出阶段 = `Q + 26`**（不是 `Q + 25`）；站在 `Q` 这一阶段看，还要再等 **26** 个阶段 ≈ **52 分钟**才能撤出（实测 `Q = 211` → 阶段 237 可撤，`237 > 236`）。`unlockRequestPhase = Q` 那一笔的 `canWithdraw` 是 `false`，页面在 `Q` 阶段写「还要再等 26 个阶段（约 52 分钟）才能撤出」。

| 量 | 公式 | 理论值（wei） | 页面文本 |
| --- | --- | --- | --- |
| `WLP` / `TLS`（结算后，无 swap → 不重分类） | 同 C1 终态 | `4494496634774577288782` / `4494496634774577288782` | `4,494.496634` |
| `lpAmount` | `floor(22360679774997896964 × WLP / TLS)` | `22360679774997896964` | — |
| 取回 TestLOVE20（LP 折算） | `floor(lpAmount·R_T/S)` | `999999999999999999995` | `999.999999` |
| 取回 TestWETH | `floor(lpAmount·R_P/S)` | `499999999999999999` | `0.499999` |
| 加速质押退还（TestLOVE20） | `boostShares` | `9571385499991385715425` | `9,571.385499` |
| **账户 TestLOVE20 增加** | `tokenOut + boost` | `10571385499991385715420` | `10,571.385499` |
| **账户 TestWETH 增加** | `parentOut` | `499999999999999999` | `0.499999` |

C4 执行后的链上终态：

| 读取 | 理论值（wei） | 说明 |
| --- | --- | --- |
| `memberStake(t,5)` | 全 `0`（含 `unlockRequestPhase = 0`、`firstGovVoteRound = 0`） | 整条删除 |
| `stake.totalStake` 的 `totalLiquidityShares` / `withdrawableLp` / `totalBoostShares` | `4472135954999579391818` / `4472135954999579391818` / `0` | 回到种子份额 |
| `stake.liquidityTokenAmount` | `199999999999999999999782` | `= 201000000000000000000000 − floor(22360679774997896964×201000000000000000000000/4494496634774577288782)`；不是 `2e23`，差 `218 wei`（本成员本金按份额向下取整扣除，误差留在全社区本金里） |
| pair `totalSupply` | `4472135954999579392818` | 回到种子值 |
| pair 储备 `R_T` / `R_P` | `200000000000000000000005` / `100000000000000000001` | 比种子多 `5 wei` / `1 wei`（burn 的每一步向下取整把粉尘留给池子） |
| `stake.govVotes(t,211,5)` | `0` | 已清零 |

### 用例 C5（边界 4 组，全部静态调用，不发交易）

| # | 调用（`eth_call`，from = 该 memberId 的 owner） | 期望 revert | revert 参数（逐字） |
| --- | --- | --- | --- |
| ① | C2 状态后 `stakeBoost(t, 9571385499991385715426, 10, 5, deadline)` | `BoostCapExceeded`（selector `0x837ed964`） | `(0x8aCd…41FF, 5, 9571385499991385715426, 9571385499991385715425)` |
| ② | 任一时刻 `stakeLiquidity(t, 1e21, 5e17, 0, 5, deadline)` / `…, 101, …` | `InvalidPromisedWaitingPhases`（`0x50a046ad`） | `(0, 1, 100)` / `(101, 1, 100)` |
| ③ | `stakeLiquidity(t, 0, 5e17, 10, 5, deadline)` / `stakeLiquidity(t, 1e21, 0, 10, 5, deadline)` / `stakeBoost(t, 0, 10, 5, deadline)` | `ZeroTokenAmount`（`0x82c4a8c9`）/ `ZeroParentTokenAmount`（`0xe6e1b13a`）/ `ZeroBoostAmount`（`0xbbaa8875`） | 无参数 |
| ④ | §0 状态（memberId 5 无仓位）`stakeBoost(t, 1e18, 1, 5, deadline)` | `NoStakedLiquidity`（`0x42b29552`） | `(0x8aCd…41FF, 5)` |

### 用例 C6（失败回滚：超上限的加速质押真的发出去）

在 C1+C2 之后，用真实交易（不是 `eth_call`）提交 `stakeBoost(t, 9571385499991385715426, 10, 5, deadline)`：

| 断言 | 期望 |
| --- | --- |
| 交易回执 | `status = reverted`（gas 照扣，资产不动） |
| `totalStake.totalBoostShares` | 与提交前完全相同（`9571385499991385715425`） |
| `memberStake(t,5).boostShares` | 完全相同（`9571385499991385715425`） |
| `validBoostShares(t,current,5)` / `totalValidBoostShares(current)` | 完全相同 |
| 账户 TestLOVE20 / TestWETH / pair 储备 / `totalLiquidityShares` | 完全相同 |
| 治理票 / `liquidityTokenAmount` | 完全相同 |

## §2 合约线（`scripts/verify/gov-stake-contract.mjs`）

运行命令（链：`http://127.0.0.1:8566`；脚本默认 `VERIFY_RPC=http://127.0.0.1:8566`，可用 `VERIFY_RPC` 覆盖）：

```bash
export PATH="/Users/BigPolarBear/.foundry/bin:/Users/BigPolarBear/.nvm/versions/node/v24.12.0/bin:$PATH"
node scripts/verify/gov-stake-contract.mjs
```

**2026-11-17 13:14 在 8555-clean-bootstrap 基线的新 8566 上实测 161/161 PASS（退出码 0）**，§0 采样 `block = 25231 / phase = 211`；**连跑两遍，交易行逐字相同（`diff` 为空）**，说明同基线可复现。脚本对 C1–C4 用一次 `anvil_snapshot`、C5①/C5②③④/C6 各一次，跑完逐项 `anvil_revert`，**跑完链上仍是 block 25231 / phase 211、状态与跑前逐 wei 相同**，随后切回套件口径（`automine = false` + interval mining 1s）交给前端线。

| 用例 | 链上交易 / 读取 | 合约值（wei） | 与理论值差值 |
| --- | --- | --- | --- |
| §0 初始状态（37 项） | `pair.getReserves` / `pair.totalSupply` / `stake.totalStake` / `stake.memberStake(1)` / `stake.memberStake(5)` / `stake.liquidityTokenAmount` / `token.totalSupply` / `token.MAX_SUPPLY` / `MemberNFT.totalSupply`+`ownerOf(1)`+`ownerOf(5)` / 8 个协议参数 / 账户余额 | 逐字等于 §0.3–§0.5（含 `token.totalSupply = 999995499999099999909999997`、`MAX_SUPPLY = 1e28`、`MemberNFT.totalSupply = 5`、`ownerOf(5) = 0x15d3…6A65`） | 0 |
| C1 流动性质押 | tx `0xf442444543bff63eade3f1c2263fd493b0c57ecbfb6bf237f4e91749d20ac8e6`（`stakeLiquidity`，block 25235） | `memberStake(5)`：`liquidityShares = 22360679774997896964`、`phases = 10`、`firstGovVoteRound = 211`、`tokenAmountForLiquidity = 999999999999999999995`、`parentTokenAmountForLiquidity = 499999999999999999`；`totalStake`：`totalLiquidityShares = totalLp = withdrawableLp = 4494496634774577288782`、`feeLp = 0`、`tokenAmountForLiquidity = 200999999999999999955278`、`parent = 100499999999999999977`；`liquidityTokenAmount = 201000000000000000000000`；`govVotes = 223606797749978969640`；`totalGovVotes = totalGovVotesAdded = 4695742752749558361458`；pair `totalSupply = 4494496634774577289782`、储备 `201000000000000000000000` / `100500000000000000000`；扣款 TestLOVE20 `1e21`、TestWETH 净 `+5e17` | 0 |
| C2 加速质押 | tx `0x24b7780f968eadc0037e42be1b2a9c4425f3bf1a4d840d17adc53c6ab4c44a58`（`stakeBoost`，block 25237；前一笔 `approve` 在 25236） | `boostStakeCap` = `(19142770999982771430850, 0)` → 交易后 `(19142770999982771430850, 9571385499991385715425)`；`member.boostShares = totalStake.totalBoostShares = validBoostShares = totalValidBoostSharesAdded = 9571385499991385715425`；`totalValidBoostSharesRemoved = 0`；`lastMajorStakeRound = 211`（tx 所在阶段）；**治理票 `223606797749978969640` 与 `totalGovVotes 4695742752749558361458` 不变**；扣款 `9571385499991385715425` | 0 |
| C3 增加解锁期 | tx `0xffc74e1372a6f977fea59a83732ea8b7f7f757164093b7c99686738435b46430`（`increasePromisedWaitingPhases`，block 25238） | `phases = 25`；`govVotes = 559016994374947424100`；`totalGovVotesAdded = totalGovVotes = 5031152949374526815918` | 0 |
| C4 申请解锁 | tx `0x620dee58299a15c4520a4d1c54d4b428d0afa5c391288287bbe5a4d0dc3ff0cf`（`unstake`，block 25239，phase 211） | `unlockRequestPhase = 211`；`govVotes = 0`；`totalGovVotes = 4472135954999579391818`；`totalGovVotesRemoved = 559016994374947424100`；`validBoostShares = totalValidBoostShares = 0`；`totalValidBoostSharesRemoved = 9571385499991385715425`；`liquidityShares` / `boostShares` 不清零（`22360679774997896964` / `9571385499991385715425`）；`canWithdraw = false` | 0 |
| C4 到期判定 | `phaseInfo(237) = (28321, 120)`；`anvil_mine` 推到 block 28321 → `phaseAtBlock = 237` | `237 > 211 + 25 = 236` → `canWithdraw = true` | 0 |
| C4 撤出 | tx `0x22dc43434a3a076fca0042dd75d9851b8ad4aae7cd46a4134f1193a9b8a21d44`（`withdraw`，block 28322，phase 237） | 到账 `+10571385499991385715420 TestLOVE20`、`+499999999999999999 TestWETH`；`memberStake(5)` 全 0（含 `unlockRequestPhase`、`firstGovVoteRound`）；`totalLiquidityShares = withdrawableLp = 4472135954999579391818`、`totalBoostShares = 0`、`liquidityTokenAmount = 199999999999999999999782`；pair `totalSupply = 4472135954999579392818`、储备 `200000000000000000000005` / `100000000000000000001`；Stake 的代币/WETH 余额都回 0 | 0 |
| C5① 超上限 | C1+C2 状态后 `eth_call` `stakeBoost(t, 9571385499991385715426, 10, 5, deadline)` | revert `0x837ed964` = `BoostCapExceeded(0x8aCd…41FF, 5, 9571385499991385715426, 9571385499991385715425)`（参数逐个相等，`allowed` 是**余量**）；随后用满余量的真交易 tx `0x2a5885b9dcba6a447a82f2b4e755d61a7d5faf41107aee9969091fc54c800490` 成功，`boostShares = 19142770999982771430850 = memberCap` | 0 |
| C5② 解锁期越界 | `eth_call` `stakeLiquidity(t, 1e21, 5e17, {0,101}, 5, deadline)` | `0x50a046ad` = `InvalidPromisedWaitingPhases(0, 1, 100)` / `(101, 1, 100)` | 0 |
| C5③ 金额 0 | `eth_call` 三条 | `0x82c4a8c9` `ZeroTokenAmount()` / `0xe6e1b13a` `ZeroParentTokenAmount()` / `0xbbaa8875` `ZeroBoostAmount()` | 0 |
| C5④ 未质押就加速 | §0 状态 `eth_call` `stakeBoost(t, 1e18, 1, 5, deadline)` | `0x42b29552` = `NoStakedLiquidity(0x8aCd…41FF, 5)` | 0 |
| C6 失败回滚 | tx `0x1265155bb8fd4c5f149cc9c39621a06b223b5a286e9d75bd71e8878b797f4e7d`（C1+C2 之后发超上限 `stakeBoost`） | 回执 `status = reverted`；`totalBoostShares` / `member.boostShares` / `totalLiquidityShares` / `liquidityTokenAmount` / 治理票 / `validBoostShares` / 两侧余额 / pair 储备与 `totalSupply` 全部与提交前逐 wei 相同 | 0 |

复现单个用例的 `cast`（在手动跑到该状态的链上；脚本内部用 viem 发交易，等价）：

```bash
STAKE=0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e
TOKEN=0x8aCd85898458400f7Db866d53FCFF6f0D49741FF
PAIR=0x3FC12a5abAe69C8Eee58C37cEDC266751507620D
PHASE=0xa513E6E4b8f2a923D98304ec87F64353C4D5C853

# C1 / C2 / C3 / C4 的交易（deadline = 4000000000）
cast send $STAKE "stakeLiquidity(address,uint256,uint256,uint256,uint256,uint256)" \
  $TOKEN 1000000000000000000000 1000000000000000000000 10 5 4000000000 --rpc-url http://127.0.0.1:8566
cast send $STAKE "stakeBoost(address,uint256,uint256,uint256,uint256)" \
  $TOKEN 9571385499991385715425 10 5 4000000000 --rpc-url http://127.0.0.1:8566
cast send $STAKE "increasePromisedWaitingPhases(address,uint256,uint256)" $TOKEN 5 25 --rpc-url http://127.0.0.1:8566
cast send $STAKE "unstake(address,uint256)" $TOKEN 5 --rpc-url http://127.0.0.1:8566
cast rpc anvil_mine 0xbf6 --rpc-url http://127.0.0.1:8566   # 推到阶段 237 的起始块 28321（从 25239 → 28321 共 3082 块）
cast send $STAKE "withdraw(address,uint256,uint256)" $TOKEN 5 4000000000 --rpc-url http://127.0.0.1:8566

# 读回（每个用例的断言就是这些调用）
cast call $STAKE "memberStake(address,uint256)(uint256,uint256,uint256,uint256,uint256,uint256,uint256)" $TOKEN 5 --rpc-url http://127.0.0.1:8566
cast call $STAKE "totalStake(address)(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)" $TOKEN --rpc-url http://127.0.0.1:8566
cast call $STAKE "govVotes(address,uint256,uint256)(uint256)" $TOKEN 211 5 --rpc-url http://127.0.0.1:8566
cast call $STAKE "boostStakeCap(address,uint256)(uint256,uint256)" $TOKEN 5 --rpc-url http://127.0.0.1:8566
cast call $STAKE "validBoostShares(address,uint256,uint256)(uint256)" $TOKEN 211 5 --rpc-url http://127.0.0.1:8566
cast call $STAKE "canWithdraw(address,uint256)(bool)" $TOKEN 5 --rpc-url http://127.0.0.1:8566
cast call $PAIR "getReserves()(uint112,uint112,uint32)" --rpc-url http://127.0.0.1:8566
cast call $PHASE "phaseInfo(uint256)(uint256,uint256)" 237 --rpc-url http://127.0.0.1:8566
```

补充事实（供复核）：

- 脚本的期望值全部是 §1 的**常量**；`boostStakeCap` / `memberStake` / `totalStake` / `govVotes` / `validBoostShares` 只作为「交叉核对」行出现（标签里写明），不参与任何期望值推导。
- **基线敏感性**：C2 的 `mintedShare` 是唯一吃 `token.totalSupply()` 的量（`mulDiv(201000000000000000000000, 999995499999099999909999997, 1e28)`）。换回 8545 基线（`999994599998649999819999988`）会得到 `20099891459972864996381` / `memberCap 19142753771402728571985` / `boost 9571376885701364285992`——这正是本文件 13:10 前那一版的值，**已作废**。C1/C3 的数值与基线无关（不吃 `totalSupply`），两版逐 wei 相同。
- **授权是逐笔消耗的**：C1 的 `approve(Stake, 1e21)` 正好用完，C2 的加速质押必须再 `approve(Stake, boostAmount)`，否则会 revert 在 `ERC20InsufficientAllowance`（selector `0xfb8f41b2`）而不是 `BoostCapExceeded`。
- 阶段推进只用 `anvil_mine`：`phaseInfo(P + phases + 1)` 给出阶段起始块（`P = 211` → 阶段 237 起始块 `28321`），推到该块后 `withdraw` 落块 28322，`phaseAtBlock = 237 > 236`。全程没有 `evm_increaseTime`：dev 链一个阶段固定 120 个块（`lastSyncPhase = 0`，没有 `sync()` 调整）。
- `liquidityTokenAmount` 在 C4 之后不是 `2e23`：`201000000000000000000000 − floor(22360679774997896964×201000000000000000000000/4494496634774577288782) = 199999999999999999999782`，即 218 wei 的按份额取整误差留在全社区本金里；`withdrawableLp` / `totalLiquidityShares` / pair `totalSupply` 都精确回到种子值。
- pair 储备在 C4 之后比种子多 `5 wei` / `1 wei`：`pair.burn` 的 `amount = liquidity×balance/totalSupply` 向下取整，粉尘留在池子里；这是**预期行为**，理论线照实记录。

## §3 前端线（`e2e/gov-stake-numbers.spec.ts`，已回填）

> 前端线已落地（§3.1 是实际断言与实际页面文本，6/6 PASS × 两条链）。页面字符串按 §0.6 的规则、由 §1 的理论值渲染，前端**不得**另算一套；下列字符串就是前端线要**逐字断言**的文本（实现照此写，不允许反向改理论值）。单位后缀（`TestLOVE20` / `TestWETH` / `流动性凭证` / `治理权` 等）以 copy 里的写法为准，下表给出「数值部分」的逐字文本 + 建议的完整句子。

**C1 流动性质押之后（memberId 5，1,000 TestLOVE20 + 1 TestWETH，承诺 10 阶段）**

| 页面字段 | 应显示（逐字，数值部分） | 来源（§1 理论值 wei） |
| --- | --- | --- |
| 质押输入回显（两侧） | `1,000 TestLOVE20` + `0.5 TestWETH`（原生币按环境符号显示时写 `0.5 ETH`） | `1000000000000000000000` / `500000000000000000` |
| 预计获得流动性凭证 | `22.360679`（整句：`预计获得 22.360679 流动性凭证`） | `22360679774997896964` |
| 预计治理权增量 | `+223.606797` | `223606797749978969640` |
| **我的流动性质押份额** | `22.360679` | `22360679774997896964` |
| **我的治理权** | `223.606797` | `223606797749978969640` |
| 我的质押折算（两侧） | `999.999999 TestLOVE20` + `0.499999 TestWETH` | `999999999999999999995` / `499999999999999999` |
| **承诺解锁期** | `约 20 分钟`（10 阶段 × 120 秒；文案只能写「约」） | `phases = 10` |
| 社区总流动性份额 / 社区总治理权 | `4,494.496634` / `4,695.742752` | `4494496634774577288782` / `4695742752749558361458` |
| 本阶段还能加速（C2 之前） | `19,142.770999` | `19142770999982771430850 − 0` |

**C2 加速质押之后**

| 页面字段 | 应显示（逐字，数值部分） | 来源（§1 理论值 wei） |
| --- | --- | --- |
| 加速上限 / 已用 | `19,142.770999` / `9,571.385499` | `19142770999982771430850` / `9571385499991385715425` |
| **本阶段还能加速**（C2 之后） | `9,571.385499` | `memberCap − boostShares = 9571385499991385715425`（clean bootstrap 基线下与「加速质押份额」数值相同，语义不同） |
| **加速质押份额** | `9,571.385499` | `9571385499991385715425` |
| **我的治理权（必须不变）** | `223.606797` | `223606797749978969640`（加速不产生治理权） |

**C3 承诺解锁期 10 → 25**

| 页面字段 | 应显示（逐字，数值部分） | 来源（§1 理论值 wei） |
| --- | --- | --- |
| **承诺解锁期（改写后）** | `约 50 分钟`（25 阶段） | `phases = 25` |
| **我的治理权 / 治理权增量** | `559.016994` / `+335.410196` | `559016994374947424100` / `335410196624968454460` |
| 社区总治理权 | `5,031.152949` | `5031152949374526815918` |

**C4 申请解锁 → 到期 → 撤出**

| 页面字段 | 应显示（逐字，数值部分） | 来源（§1 理论值 wei） |
| --- | --- | --- |
| 申请解锁后：我的治理权 / 加速质押份额 | `0` / `0` | unstake 把两者清零（`0` 是**已知的零**；未知才写 `—`） |
| 解锁状态 | `解锁中` + `还要再等 26 个阶段（约 52 分钟）才能撤出`（严格大于 → `Q+26` 才可撤；实测阶段 211 → 237） | `unlockRequestPhase = 211`、`phases = 25` |
| 到期可用态 | 撤出按钮可点（`canWithdraw = true`，阶段 237） | `237 > 236` |
| **撤出回执两侧金额** | `10,571.385499 TestLOVE20` + `0.499999 TestWETH` | `10571385499991385715420` / `499999999999999999` |
| 回执明细（若页面展开）：LP 折算 + 加速退还 | `999.999999 TestLOVE20` + `9,571.385499 TestLOVE20`（合计即上一行） | `999999999999999999995` + `9571385499991385715425` |
| 撤出后：我的流动性质押份额 / 治理权 / 加速份额 | `0` / `0` / `0` | `memberStake(5)` 全 0 |
| 撤出后：社区总流动性份额 / 社区总治理权 | `4,472.135954` / `4,472.135954` | `4472135954999579391818` |
| 撤出后：我的质押折算 | 「你还没有质押」空态（不是 `0 TestLOVE20`） | 无仓位 |

**显示规则的三个边界（前端线要专门断言，容易踩）**

1. `999999999999999999995 wei`（0.999…e21）按 6 位截断显示为 **`999.999999`**，**不是** `1,000`——截断不四舍五入。
2. `499999999999999999 wei` 显示 **`0.499999`**，不是 `0.5`（同上）。
3. clean bootstrap 基线下 `memberCap = 19142770999982771430850` 是**偶数**，`boostAmount` 恰好是一半；于是 C2 之后「本阶段还能加速」（余量）与「加速质押份额」（已用）**同为 `9571385499991385715425`**、显示都是 `9,571.385499`——两个字段语义不同，前端线不要用一个去反推另一个，也不要断言「余量 = 上限 − 已用」之外的恒等关系（`19,142.770999 − 9,571.385499 = 9,571.385499` 只是在**显示截断**后近似成立）。

**C5 / C6 的错误与回滚文案（断言文案，不断言 revert 名）**

| 场景 | 应显示 |
| --- | --- |
| 加速超上限（C5①） | 「超过这个阶段的加速上限」（copy 定稿后以 `errors.generated.ts` 的映射为准） |
| 承诺解锁期越界（C5②） | 输入被夹到 `1`–`100` 阶段，或「承诺解锁期需要在 1 到 100 个阶段之间。」 |
| 金额为 0（C5③） | 余额/0 值校验：「金额必须大于 0。」，主按钮禁用（不发交易） |
| 未质押就加速（C5④） | 「先质押流动性才能加速。」，主按钮禁用 |
| 回滚（C6） | 「交易上链了，但没有成功。你的资产没有变化。」；页面所有数值不变 |

### §3.1 前端线的实际断言（Lead 回填，2026-11-17 14:20）

spec（**2026-11-17 晚按 TKM 多页面 IA 重写后为 8 条 `test()`**；下表 6 条是重写前的首版记录，数值口径完全一致，新结构见 §3.2）：两遍实跑、严格串行（每遍自己起/停 preview，`E2E_REUSE_PREVIEW=0`）：

| 链 | 命令 | 结果 | 快照 |
| --- | --- | --- | --- |
| 三线链 8566 | `E2E_ANVIL_RPC=http://127.0.0.1:8566 pnpm exec playwright test e2e/gov-stake-numbers.spec.ts` | **6 passed（1.5m），EXIT 0** | `snapshot 0x0 → reverted 0x0` |
| 套件链 8555 | `E2E_REUSE_PREVIEW=0 pnpm exec playwright test e2e/gov-stake-numbers.spec.ts` | **6 passed（1.5m），EXIT 0**（最终代码，2026-11-17 16:13） | `snapshot 0xa1 → reverted 0xa1` |

两遍跑完都回到种子态（`memberStake(5)` 全 0、pair 储备 `2e23`/`1e20`、interval mining = 1）。断言只读页面文字：数值一律 `toHaveText` 整串精确相等，只有「已申请解锁 / 正常质押中 / 已授权」这类状态标签用 `toContainText`。

| # | 用例 | 实际页面文本（逐字） |
| --- | --- | --- |
| 1 | C1 之前：稳态 + 授权阶梯 | `gov-boost-locked` 可见且没有 `gov-boost-card`；预览未知显示 `—`；两个授权按钮 `授权 TestLOVE20` / `授权 TestWETH` → 成交后原地变 `已授权 TestLOVE20` / `已授权 TestWETH`，两个都就绪前主按钮禁用 |
| 2 | C1 流动性质押 | 预览 `预计获得治理权` = `+223.606797`；`按池子比例实际存入 1,000 TestLOVE20 + 0.5 TestWETH。`；回执 `治理权 +223.606797` + `流动性质押份额 +22.360679`；我的 `223.606797` / `22.360679` / 加速 `0` / `10 个阶段（约 20 分钟）` / `999.999999` / `0.499999`；社区 `4,695.742752` / `4,494.496634` / `4.76%` |
| 3 | C2 加速质押 | 上限 `19,142.770999 TestLOVE20` → 加速后 `9,571.385499 TestLOVE20`；已用 `0` → `9,571.385499`；回执 `加速质押 9,571.385499 TestLOVE20`；我的加速份额 `9,571.385499`；**治理权不变** `223.606797`；社区加速 `9,571.385499` |
| 4 | C3 承诺解锁期 10 → 25 | 预览 `治理权 +335.410196`；回执 `承诺解锁期现在是 25 个阶段。` + `治理权 +335.410196`；`25 个阶段（约 50 分钟）` / `559.016994`；社区 `5,031.152949` / `11.11%` |
| 5 | C4 申请解锁 → 到期 → 撤出 | 申请解锁回执 `治理权已经清零，等承诺解锁期走完就可以撤出。`；`0` / `0`；份额仍 `22.360679`；加速可取回 `9,571.385499`；解锁状态 `已申请解锁还要再等 26 个阶段（约 52 分钟）才能撤出。`；社区 `4,472.135954` / `4,494.496634` / `0%`；推到可撤阶段后 `可以撤出了`；撤出回执 `已撤出 10,571.385499 TestLOVE20 + 0.499999 TestWETH`；撤出后 `gov-mine-empty` 与社区卡并存（社区总治理权 / 总份额都回到 `4,472.135954`） |
| 6 | 验收截图 | 三种状态 × 390×844 / 1280×800 × 浅色/深色，共 12 张 `gov-{stake,mine,boost-locked}-{light,dark}-{mobile,desktop}.png`（视口截图，不是 fullPage） |

**与上方「建议文本」的四处差异（以实现为准，数值不变）**：

1. 页面**不显示**「预计获得流动性凭证」：`/gov` 只显示「按池子比例实际存入 X + Y」与「预计获得治理权 +X」；LP 数量是 `/liquidity` 的口径，治理页不重复。
2. 「承诺解锁期」显示 **`N 个阶段（约 X 分钟）`**（阶段数 + 约分钟），不是只写「约 X 分钟」——GLOSSARY 要求等待期以阶段计量，UX §4.5 要求估算写「约」。
3. **C5 / C6 不在前端线覆盖**：页面在提交前就拦掉这些输入（主按钮禁用 + 就地文案），不会走到 revert。实际文案：超上限 `超过本阶段还能加速的 9,571.385499 TestLOVE20。`；0 值 `数量要大于 0。` / `两侧数量都要大于 0。`；未质押时是锁定卡 `先完成流动性质押`；意外 revert 的兜底是 `交易上链了，但没有成功，代币没有变化。`（revert 本身由合约线 C5/C6 覆盖）。
4. 「我的质押折算」行只显示数值（单位在行标签「预计可取回社区代币 / 父币」里），断言按页面实际文本。

### §3.2 多页面 IA 重写（2026-11-17 晚，owner 要求复刻 TKM）

**为什么重写**：owner 要求「复刻 LOVE20TKM 旧版治理相关页面，同样的页面/功能/页面布局，只换样式；旧设计无法适配新协议才允许调整」。实现从「一个 `/gov` 两个页签」改回旧版的多页面 IA；**理论值口径（§1）与合约线（§2）一个 wei 都没变**，变的只是页面位置与交互路径：

| 旧路径 | 本仓路由 | 本轮 |
| --- | --- | --- |
| `/gov` | `/gov`（治理首页：我的 / 社区） | 实装 |
| `/stake/stakelp` | `/stake/stakelp` | 实装（含智能模式） |
| `/stake/staketoken` | `/stake/staketoken` | 实装（加速质押） |
| `/stake/unstake` | `/stake/unstake` | 实装（申请解锁 / 撤出 / 增加承诺解锁期） |
| `/stake/liquid` | `/stake/liquid` | 实装（只读数据页） |
| `/my/govrewards` | `/gov/rewards` | 占位（Mint ABI 未导出） |
| `/vote/*`、`/verify/*`、`/submit/*`、`/acting/*`、`/action/*` | 同名路径 | 占位（Vote/Verify/Submit ABI 未导出） |

**新 spec（8 条）**：24 张截图（6 状态 × 390×844 / 1280×800 × 浅/深）1 条 + 前端线 7 条——稳态（首页两个 tab、社区数据、按身份 NFT 编号查询、占位页）/ C1（stakelp 关闭智能模式，1,000 + 1 → 1,000 + 0.5 截断 → 治理权 223.606797）/ C2（staketoken，加速上限 19,142.770999 → 加速 9,571.385499）/ C3（unstake，+335.410196 → 559.016994）/ C4（unstake，解锁 26 阶段 52 分钟 → 撤出 10,571.385499 + 0.499999）/ **智能模式只填社区代币**（Hub token 变体，回执出现）/ **智能模式只填原生币**（Hub native 变体，无需代币授权即回执）。

**2026-11-18 变更（owner：承诺解锁期单独调整）**：新增流动性质押**不再选择承诺解锁期**——与 periphery `LOVE20Hub` 的语义一致（已有仓位时承诺解锁期必须保持当前值）。首次质押按 `PROMISED_WAITING_PHASES_MIN`（本链 1 个阶段）提交；质押后页面最上方出现「调整承诺解锁期」卡，点「调整」弹面板单独加大（`increasePromisedWaitingPhases`）。因此前端线把 C1 拆成两步：**首次质押**（回执 `治理权 +22.360679`、份额 `22.360679`）→ **调整 1→10**（增量 = 份额 × 9 = `201246117974981072676` wei → 显示 `治理权 +201.246117`）→ 末态 `223.606797`，与 §1 的 C1 终值完全一致。C3 的 10→25 也改由这张卡完成（`+335.410196`）。

**2026-11-18 前端线复跑（承诺解锁期单独调整之后）**：spec 8 条，8555 `E2E_REUSE_PREVIEW=0 pnpm e2e --grep "治理域"` → **8 passed（3.2m）EXIT 0**；8566 `E2E_ANVIL_RPC=… pnpm exec playwright test e2e/gov-stake-numbers.spec.ts` → **8 passed（2.7m）EXIT 0**（snapshot 0x0 → reverted 0x0）。C1 两步：首押回执 `治理权 +22.360679` → 顶部卡调整 1→10（`+201.246117`）→ 末态 `223.606797`；C3 由顶部卡完成 10→25（`+335.410196` → `559.016994`）。

**智能模式的合约依据（不在 §1 理论线里，属新增功能）**：单币质押由 periphery `LOVE20Hub` 完成——`stakeLiquidityWithNative`（必须带 value，只填社区代币时会 revert `ZeroNativeTokenAmount`）/ `stakeLiquidityWithToken`（两枚 ERC20，只填社区代币时用它）；页面按「有没有原生币输入」选入口，报价用 `quoteStakeLiquidity(WithNative)` 的 `willSwap / amountToSwap / amountOutFromSwap / prepared* / liquiditySharesAdded / govVotesAdded`，滑点折算后的 `minLiquidityShares` 作为最少份额。C1–C4 的理论值仍走**关闭智能模式**的直接 `Stake.stakeLiquidity` 路径，因此与前文逐 wei 对齐。

## §4 三线对照表

| 用例 | 理论值（wei） | 合约值（wei） | 前端值（页面字符串） | 结论 |
| --- | --- | --- | --- | --- |
| §0 初始 pair 储备 / `totalSupply` / 记账 LP | `2e23` / `1e20` / `4472135954999579392818` / `4472135954999579391818` | 同左（37 项全等） | `—` | ✅ |
| C1 采用两侧 `t` / `p` | `1000000000000000000000` / `500000000000000000` | 同左（扣款实测） | `按池子比例实际存入 1,000 TestLOVE20 + 0.5 TestWETH。` | ✅ |
| C1 `L` / `sharesAdded` / `govVotesAdded` | `22360679774997896964` / 同左 / `223606797749978969640` | 同左 | `22.360679`（我的流动性质押份额）/ `+223.606797`（预计治理权增量） | ✅ |
| C1 终态 `totalLiquidityShares` / `totalGovVotes` | `4494496634774577288782` / `4695742752749558361458` | 同左 | `4,494.496634` / `4,695.742752` | ✅ |
| C1 我的质押折算（成员口径） | `999999999999999999995` / `499999999999999999` | 同左 | `999.999999` / `0.499999` | ✅ |
| C2 `baseCap` / `memberCap` / `boostAmount` | `80399638199927639992760` / `19142770999982771430850` / `9571385499991385715425` | 同左（`boostStakeCap` 交叉核对同值） | `19,142.770999` / `9,571.385499` | ✅ |
| C2 治理权不变 | `223606797749978969640` | 同左 | `223.606797` | ✅ |
| C3 `govVotesAdded` / `govVotes` / `totalGovVotes` | `335410196624968454460` / `559016994374947424100` / `5031152949374526815918` | 同左 | `+335.410196` / `559.016994` / `5,031.152949` | ✅ |
| C4 unstake 移除票 / 归零 | `559016994374947424100` / `0` | 同左 | 治理权 `0`、加速份额 `0` | ✅ |
| C4 `lpAmount` / `tokenOut` / `parentOut` / boost 退还 | `22360679774997896964` / `999999999999999999995` / `499999999999999999` / `9571385499991385715425` | 同左（到账合计 `10571385499991385715420` / `499999999999999999`） | 回执 `已撤出 10,571.385499 TestLOVE20 + 0.499999 TestWETH` | ✅ |
| C4 撤出后 pair `totalSupply` / 储备 | `4472135954999579392818` / `200000000000000000000005` ∕ `100000000000000000001` | 同左 | 页面不显示 pair 口径；社区总流动性质押份额 `4,472.135954` 精确回到种子值 | ✅ |
| C4 撤出后 `liquidityTokenAmount` | `199999999999999999999782` | 同左 | `—`（页面不显示该量） | ✅ |
| C5 四组 revert selector | `0x837ed964` / `0x50a046ad` / `0x82c4a8c9`+`0xe6e1b13a`+`0xbbaa8875` / `0x42b29552` | 同左（参数逐个相等） | 前端线不覆盖（提交前拦截，见 §3.1 差异 3） | ✅ |
| C6 回滚后状态不变 | 全部相同 | 回执 `reverted`，12 项状态逐 wei 相同 | 前端线不覆盖（同上）；页面在回执 reverted 时显示兜底文案且数值不变 | ✅ |

**结论**：三线在 C1–C4 的每个数值上逐字相等（文档 §1 wei ↔ 合约读值 ↔ 页面 6 位截断字符串）；C5/C6 由合约线覆盖、前端以「提交前拦截 + revert 兜底文案」呈现。2026-11-17 交接时前端线两链各 6/6 PASS（§3.1）。
