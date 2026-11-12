# CI-005 “没币用户”的入网路径缺失：mint 只收 ERC20，空投合约不在任何仓库

- 严重级别：**High**
- 影响模块：铸造 MemberNFT、空投
- 状态：已修复（`core@f209300` 起空投随 core 交付：`AirdropDistributor` 由 `DeployCore` 部署，`claimDelayRounds` 控制可铸造轮次，创世代币首供铸给 distributor；2026-11-12 复核）
- 关联文件：`core/src/MemberNFT.sol`、`core/src/LOVE20Token.sol`、`core/src/interfaces/ILOVE20Token.sol`、`core/src/Launch.sol`、`core/src/interfaces/ILaunchDistributor.sol`、`interface-dev-dsh/docs/product/m0-scope.md`

## 现象

M0 的铸造分支要求回答“用户没有可支付的代币怎么办 → 空投或购买”。链上现状是：

1. **铸造 MemberNFT 只接受一种 ERC20**，没有 `payable` 路径，也没有“用父币/原生币直接铸”的入口。
2. **这个 ERC20 是“创世代币”，不是用户当前浏览的社区代币**。`LOVE20_TOKEN_ADDRESS` 在构造期一次性固定，指向 `Launch` 铸造的第一个代币。
3. **空投合约不在本工作区的任何一个合约仓里**（`core` / `action` / `group-chat` / `libs` 全目录无 Merkle/Airdrop 实现），而 M0 范围文档要求一键部署里包含 Airdrop。
4. **无法从链上发现“谁应当发空投”**：代币合约没有存 `distributor`，`Launch` 也没有存；只有事件里有。

也就是说，“买”这条腿是通的（有 UniswapV2 交易对 + router 地址可读），但“空投”这条腿**完全没有链上落点**，而且“用哪个币买”这件事在前端很容易讲错。

## 证据

只收 ERC20、无 payable：

```solidity
// core/src/MemberNFT.sol:78-83
if (mintCost > 0) {
    totalBurnedForMint += mintCost;
    IERC20(LOVE20_TOKEN_ADDRESS).safeTransferFrom(memberOwner, address(this), mintCost);
    ILOVE20Token(LOVE20_TOKEN_ADDRESS).burn(mintCost);
}
_safeMint(memberOwner, tokenId);
```

`IMemberNFT` 的全部写入口只有 `mint(string)`（`core/src/interfaces/IMemberNFT.sol:44-46`），没有 `mintWithNative` / `mintWithParentToken` / 任何 `payable` 函数；`MemberNFT.sol` 也没有 `receive`/`fallback`。

支付代币在构造期固定，且是创世代币：

```solidity
// core/src/MemberNFT.sol:20 + 42-54
address public LOVE20_TOKEN_ADDRESS;          // 非 immutable，但全文无第二个写入口
constructor(..., address firstTokenAddress) ERC20("LOVE20 Member NFT", "Member") {
    ...
    LOVE20_TOKEN_ADDRESS = firstTokenAddress;
}
```
```solidity
// core/src/Launch.sol:65-70
address firstToken = _createToken(params.rootParentTokenAddress, params.name, params.symbol, params.distributor);
FIRST_TOKEN_ADDRESS = firstToken;
_tokens.push(firstToken);
```

代币合约不记录 `distributor`：

```solidity
// core/src/interfaces/ILOVE20Token.sol:40-46
function MAX_SUPPLY() external view returns (uint256);
function MINTER() external view returns (address);
function PARENT_TOKEN_ADDRESS() external view returns (address);
function mint(address to, uint256 amount) external;
function burn(uint256 amount) external;
```

`Launch` 的存储也不记录 `distributor`（`core/src/Launch.sol:40-51` 只有 `_tokens`、`_parentTokenByTokenAddress`、`_tokenAddressBySymbol`、`_childTokens`、`_remainingLaunchCount`、`_issuedLaunchCount`）；`distributor` 只出现在事件 `TokenLaunched` / `GenesisTokenCreated` / `TokenMinted` 里（`Launch.sol:75-81`、`134-142`，`LOVE20Token.sol:27-30`）。

空投合约缺席（全仓 grep `Merkle` 只命中 OpenZeppelin 的 mock）：

```
core/lib/openzeppelin-contracts/contracts/mocks/MerkleProofCustomHashMock.sol
```

而 M0 范围要求：

```
# interface-dev-dsh/docs/product/m0-scope.md:15
WETH + Uniswap V2（…）+ core/action/group-chat + Airdrop + Multicall3 … 
Airdrop 必须是 share + Merkle 语义（claim(token, account, share, proof) …）
```

铸造金额与“买”的路径（这两条是通的，可作为绕过基础）：`Launch._ensurePair(tokenAddress, parentTokenAddress)` 为创世代币与根父币（WBNB）建了交易对（`Launch.sol:72`、`248-254`）；router 地址由 `Stake.ROUTER_ADDRESS()` 暴露（`core/src/Stake.sol:56`、`core/src/interfaces/IStake.sol:176`），而 `Stake` 可从 `Mint.VOTE_ADDRESS()` → `Vote.STAKE_ADDRESS()` 到达（`core/src/Mint.sol:31`、`core/src/Vote.sol:15`）。

## 对前端的影响

1. **新用户无法“从 0 到 1”。** 只有 BNB 的钱包在铸造页前无路可走：既没有可领取的空投合约可调，也没有“用 BNB 直接铸”的合约入口。前端只能给两条外部指引（去 DEX 买创世代币 / 等运营空投），转化漏斗在第一屏断掉。
2. **空投页没有任何合约可写。** 没有 `merkleRoot()`、没有 `isClaimed()`、没有 `claim()`。M0 范围里的空投快照 + 证明全部只能靠前端硬编码/外部服务，违背“无后端”的前提。
3. **“在哪个社区铸造”这件事会讲错。** 用户切到社区 X，铸造价格却以创世代币计。一个“诚实”的前端必须显示“铸造费用：900 TestLOVE20（创世代币），不是你正在看的社区代币”，并让用户去 X/创世代币 的交易对买币。任何直接把当前社区代币当作支付币的实现都会在 `approve` 之后回滚（`ERC20: insufficient allowance` 或余额不足）。
4. **无法向用户展示“空投来自哪里”。** 代币合约和 `Launch` 都不存 `distributor`，前端查不到“谁拿着 10 亿初始供应、谁负责分发”，只能读事件（被无索引器前提排除）。

## 建议修复方案（最小改动）

按“必须先有合约、才谈 UI”拆三步：

1. **把空投合约落进仓库**（缺的是代码，不是接口）：新建独立仓或用 `core` 之外的 `action`/新仓，实现最小 share+Merkle 语义并写进 `src/interfaces/IAirdrop.sol`：
   ```solidity
   function merkleRoot() external view returns (bytes32);
   function isClaimed(address tokenAddress, uint256 memberId) external view returns (bool);
   function claim(address tokenAddress, uint256 memberId, uint256 share, bytes32[] calldata proof) external;
   ```
   `share` 语义（而不是金额）必须按 M0 文档，因为金额随池子变化（见 CI-006 的同类问题）。
2. **让 `distributor` 可读**：`LOVE20Token` 增加 `immutable DISTRIBUTOR` + getter（构造入参已有，`LOVE20Token.sol:13-26`），或在 `Launch` 增加 `distributorByTokenAddress(address) returns (address)`。这是纯加法。
3. **给铸造加一条原生币/父币入口**（可选，但这是唯一能彻底消掉“先去买币”的改动）：
   ```solidity
   function mintWithParentToken(string calldata name, uint256 maxTokenAmount) external returns (uint256 tokenId, uint256 mintCost);
   ```
   内部用 `Stake.ROUTER_ADDRESS()` 的 `swapExactETHForTokens` / `swapExactTokensForTokens` 换到 `LOVE20_TOKEN_ADDRESS` 再 burn，滑点用 `maxTokenAmount` 保护；或者更保守：只加 `mintWithToken(address payTokenAddress, ...)`，把“怎么换”留给前端。

如果这一轮只想让 M0 能演示：**至少做第 1 步和第 2 步**，前端可以先用“运营方空投合约 + 展示 distributor”把分支讲圆。

## 临时前端绕过方案

- **空投**：在部署产物里额外导出一个仓库外的 Airdrop 合约地址与 Merkle 根（前端只读 `merkleRoot`/`isClaimed`，证明由构建期生成的快照文件内置），UI 上明确标注“空投合约由部署方提供，不在协议仓内”。代价：前端多一个不受合约仓约束的外部依赖；根一旦更换必须重新发版；`claim` 的语义（share vs 金额）取决于外部合约，容易写错。
- **没币用户**：铸造页做三步引导 —— ①显示“铸造费用 = N 创世代币”；②给出“用 BNB 兑换创世代币”的按钮（`Stake.ROUTER_ADDRESS()` + `getAmountsOut` 报价 + `swapExactETHForTokens`）；③兑换完成后回到铸造页 `approve` + `mint`。代价：3 笔交易、2 个 gas 峰值、移动端体验差；且用户必须理解“创世代币 ≠ 当前社区代币”，文案压力大。
- **不接受**的绕过：把 `LOVE20_TOKEN_ADDRESS` 写死成某个社区代币（该值由构造入参决定，不同部署不同）。
