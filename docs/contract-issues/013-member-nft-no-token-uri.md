# CI-013 MemberNFT 没有 `tokenURI`/元数据，钱包里是空白 NFT

- 严重级别：**Low**
- 影响模块：身份
- 状态：Open
- 关联文件：`core/src/MemberNFT.sol`、`core/src/interfaces/IMemberNFT.sol`

## 现象

`MemberNFT` 继承 OZ 的 `ERC721Enumerable`，但**没有覆写 `tokenURI`**，也没有 `contractURI`。因此：

- `tokenURI(id)` 返回空字符串；
- 代币没有名字、没有图片、没有描述；
- 唯一的身份信息是合约里的 `memberName(id)`（`MemberNFT.sol:121-125`），只有直接调合约才拿得到；
- 也没有 `mintBlock`/`createdAt` 之类的“成员起始时间”，身份页的“加入于”只能靠 `MemberMinted` 事件。

用户的 `memberId` 一旦被加进钱包（MetaMask / OKX / Trust），显示的是一个**没有图、没有名字**的 NFT——对“身份”这个产品概念是直接损失。

## 证据

继承与构造函数（`ERC721("LOVE20 Member NFT", "Member")` 是集合级元数据，代币级没有）：

```solidity
// core/src/MemberNFT.sol:14
contract MemberNFT is ERC721Enumerable, IMemberNFT {
```
```solidity
// core/src/MemberNFT.sol:42-54
constructor(
    uint256 baseDivisor, uint256 bytesThreshold, uint256 multiplier, uint256 maxNameLength, address firstTokenAddress
) ERC721("LOVE20 Member NFT", "Member") { ... }
```

全文没有 `tokenURI` / `_baseURI` / `contractURI`（对 `core/src/MemberNFT.sol` 与 `core/src/interfaces/IMemberNFT.sol` grep `tokenURI` 零命中）。`IMemberNFT` 也没有暴露任何元数据入口：

```solidity
// core/src/interfaces/IMemberNFT.sol:28-70（节选）
function memberName(uint256 tokenId) external view returns (string memory);
function totalBurnedForMint() external view returns (uint256);
function holders(uint256 offset, uint256 limit, bool reverse) external view returns (address[] memory holderList, uint256 totalCount);
```

代币本身也不记录铸造区块：`MemberMinted` 事件有 `memberId/owner/cost/totalBurnedForMint/name/normalizedName`（`IMemberNFT.sol:8-15`），但没有任何 `mintBlockByMemberId` 存储。

## 对前端的影响

1. **“我的 NFT”页只能靠自建卡片。** 名字来自 `memberName(id)`，头像只能前端生成（颜色/首字母/几何图形），无法与其它钱包/市场保持一致——同一个身份在不同钱包里长得完全不同。
2. **用户把身份加进钱包后看不到任何东西**，会怀疑“是不是没铸造成功”。M0 的核心路径是“连接 → 认出身份”，这一步的信任成本被放大。
3. **“加入时间”不可得。** 身份详情页想展示“成员自 2026-03”，只能读事件（被无索引器前提排除），或在前端用 `localStorage` 记“我第一次看到这个身份的时间”（不可靠）。
4. **转账后身份不可视。** MemberNFT 是可转移的（`ERC721._update`，`MemberNFT.sol:195-210`），新持有人拿到的是一个无元数据的 token，无法从钱包侧确认自己拿到了哪个名字。

## 建议修复方案（最小改动）

1. **覆写 `tokenURI` 返回链上 data URI**（无需 IPFS、无需后端，符合静态站前提）：
   ```solidity
   function tokenURI(uint256 tokenId) public view override returns (string memory) {
       _requireOwned(tokenId);
       string memory name = _memberNameByTokenId[tokenId];
       string memory json = string.concat(
           '{"name":"', name, ' #', Strings.toString(tokenId),
           '","description":"LOVE20 Member","image":"data:image/svg+xml;base64,', _svg(tokenId, name), '"}'
       );
       return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
   }
   ```
   `Base64` / `Strings` 在 OZ 里已有（`@openzeppelin/contracts/utils/Base64.sol`、`Strings.sol`），不需要新依赖。图片用确定性 SVG（按 `tokenId` 取色相 + 名字首字符），体积可控。
2. **加 `mintBlockByMemberId`**（1 个 mapping + 1 个 getter，`_mintMember` 里顺手写 `block.number`），或者干脆在 `MemberMinted` 事件之外再给一个 `createdAtBlock(uint256 memberId) returns (uint256)`。名字建议 `mintBlockByMemberId`（键在名里，`naming-standards.md` §七）。
3. **加 `contractURI()`** 可选（市场展示集合图），非必需。

注意 `tokenURI` 会进入 `IMemberNFT` 的 ABI（继承自 `IERC721Metadata`），但**不是新增 selector**——是覆写已有标准函数，前端不需要改调用方式，只是返回值从 `""` 变成 JSON。

## 临时前端绕过方案

- 完全自建身份卡：用 `memberName(id)` + `ownerOf(id)` + `totalBurnedForMint()` 渲染姓名、地址缩写、编号；头像用 `tokenId` 哈希生成（与链上无关，但至少稳定）。
- 在“添加到钱包”的引导里明写“本 NFT 暂无链上图片，钱包内显示为空白属正常”，并提供一个导出 PNG 的按钮（前端画好再下载）。
- 代价：① 与钱包/市场显示不一致；② 前端要维护一套头像生成逻辑（设计系统负担）；③ “加入时间”仍然缺失，只能不显示或用本地缓存。
