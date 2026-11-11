# CI-004 MemberNFT 测试前缀：报价/查重与实际铸造不一致

- 严重级别：**High**
- 影响模块：铸造 MemberNFT
- 状态：已修复（core@72a1604）
- 关联文件：`core/src/MemberNFT.sol`、`core/src/interfaces/IMemberNFT.sol`、`core/test/MemberNFT.t.sol`、`core/script/network/anvil31337_dev/core.params`

## 修复内容

`core` 已在 `72a1604 refactor(member-nft): stop prefixing names with Test on testnets`（2026-11-11 08:46，工作区干净）修复。采用的方案不是把前缀扩散到全部公开函数，而是**停止在测试网改写名字**：

```solidity
// core/src/MemberNFT.sol（修复后）
function mint(
    string calldata name
) external returns (uint256 tokenId, uint256 mintCost) {
    string memory normalizedName = _checkName(name);

    mintCost = calculateMintCost(name);
    tokenId = _mintMember(msg.sender, name, normalizedName, mintCost);
    return (tokenId, mintCost);
}
```

- 删除 `_addTestPrefixIfNeeded` 与 `TEST_PREFIX_BYTES`；`mint` 不再调用任何前缀逻辑。
- `mint`、`calculateMintCost`、`isNameUsed`、`memberId` 现在都使用用户提交的原始 `name`，报价、查重与铸造的字符串域一致。
- `core/test/MemberNFT.t.sol` 同步改为断言链上 `memberName(id)` 等于提交的原始名字（`abc` 存 `abc`，`Testxyz` 存 `Testxyz`，短名 `Tes` 不再被改写成 `TestTes`）。
- 长度上限回到完整的 `MAX_NAME_LENGTH`（当前部署 32 字节）；原来的“有效上限 = 32 − 4”不再存在。

## 前端义务变更

修复落地后，**旧的前端前缀垫片必须删除**：

```ts
// 必须删除，不得再对 calculateMintCost / isNameUsed / mint 传改写后的名字
const finalName = symbol.startsWith('Test') && !name.startsWith('Test') ? 'Test' + name : name;
```

取而代之的是 owner 确认的界面命名规则。理由：让 dev / test 身份在视觉上与真实身份分开，同时恢复 `Test` 命名约定；合约不再改写用户输入，规则只存在于前端。

- **dev / test 变体**：铸造身份时，`name` 必须以 `Test` 开头，`T` **大小写敏感**（`testfoo`、`tesTfoo` 都不合格）；不满足时输入框下方显示一行原因并禁用提交按钮，属阻断式行内校验，不是可忽略的警告。判断依据是构建变体（dev / test / prod），不是支付代币 `symbol()` 是否以 `Test` 开头。
- **prod 变体**：没有前缀约束，名字按用户输入原样提交；界面也不显示这条规则。
- 字节上限在三个变体都使用完整的 `MAX_NAME_LENGTH()`（当前部署 32 字节），**不再做 `-4` 调整**；字节计数器直接对用户输入计数。
- 这条规则是**前端校验，不是合约行为**：合约不会再改写名字，绕过前端直接调用合约仍可铸造不带 `Test` 的名字。任何界面文案都不得写成“链上会自动加 `Test`”。

## 现象（修复前）

`MemberNFT.mint` 会先给名字加一个 `Test` 前缀（当支付代币的 symbol 以 `Test` 开头时），**然后**才做校验和计价。但同名字符串域的另外三个公开函数——`calculateMintCost`、`isNameUsed`、`memberId`——**都不加前缀**，直接对用户传入的原始字符串做计算/查表。

于是同一个名字在“报价/查重”和“实际铸造”两条路径上对应两个不同的字符串：

- 报价算的是 `abc` 的价格，实际扣的是 `Testabc` 的价格；
- 查重查的是 `abc` 是否被占用，实际占的是 `Testabc`；
- 长度校验也是按加前缀后的字符串做的，所以有效长度上限比 `MAX_NAME_LENGTH` 小 4。

这条不是理论问题：仓库自带的 dev 部署参数里 symbol 就是 `TestLOVE20`，**该分支在所有 dev/测试环境默认生效**。

## 证据（修复前）

> 以下证据保留用于历史记录，描述的是 `core@43d5344` 时的行为；`core@72a1604` 后不再成立。

```solidity
// core/src/MemberNFT.sol:56-66
function mint(string calldata name) external returns (uint256 tokenId, uint256 mintCost) {
    string memory prefixedName = _addTestPrefixIfNeeded(name);   // ← 先加前缀
    string memory normalizedName = _checkName(prefixedName);     // ← 按前缀后的名字校验（含长度上限）
    mintCost = calculateMintCost(prefixedName);                  // ← 按前缀后的名字计价
    tokenId = _mintMember(msg.sender, prefixedName, normalizedName, mintCost);
}
```

```solidity
// core/src/MemberNFT.sol:100-119
function calculateMintCost(string memory name) public view returns (uint256) {
    ...
    uint256 byteLength = bytes(name).length;       // ← 没有 _addTestPrefixIfNeeded
    if (byteLength >= BYTES_THRESHOLD) { return baseCost; }
    uint256 difference = BYTES_THRESHOLD - byteLength;
    return baseCost * (MULTIPLIER ** difference);
}
```

```solidity
// core/src/MemberNFT.sol:127-137
function isNameUsed(string calldata name) external view returns (bool) {
    return _tokenIdByNormalizedName[_toLowerCase(name)] != 0;   // ← 没有前缀，查不到 testabc
}
function memberId(string calldata name) external view returns (uint256) {
    return _tokenIdByNormalizedName[_toLowerCase(name)];        // ← 同上
}
```

```solidity
// core/src/MemberNFT.sol:151-174（前缀规则）
address[] ... symbolBytes = bytes(ILOVE20Token(LOVE20_TOKEN_ADDRESS).symbol());
if (symbolBytes.length >= 4 && symbolBytes[0]=="T" && ... ) {
    if (nameBytes.length < 4 || 不以 "Test" 开头) return string(abi.encodePacked("Test", name));
}
```

```solidity
// core/src/MemberNFT.sol:220-224（存储键是前缀后的名字）
normalizedName = _toLowerCase(name);
uint256 existingTokenId = _tokenIdByNormalizedName[normalizedName];
if (existingTokenId != 0) { revert NameAlreadyExists(existingTokenId); }
```

```solidity
// core/src/MemberNFT.sol:75-76
_memberNameByTokenId[tokenId] = name;
_tokenIdByNormalizedName[normalizedName] = tokenId;
```

部署参数（symbol 以 `Test` 开头，阈值 7，倍数 10）：

```
# core/script/network/anvil31337_dev/core.params
TOKEN_SYMBOL=TestLOVE20
MEMBER_BYTES_THRESHOLD=7
MEMBER_MULTIPLIER=10
MEMBER_MAX_NAME_LENGTH=32
```

具体偏差（以该参数集计算）：

| 输入 | `mint` 实际发生的 | `calculateMintCost` 显示 | `isNameUsed` |
| --- | --- | --- | --- |
| `abc`（3 字节） | 存 `Testabc`（7 字节）→ 价格 = `baseCost` | `baseCost * 10^4`（**10000 倍**） | `false`（永远，除非有人真叫 `testabc`） |
| `abcdefg`（7 字节） | 存 `Testabcdefg`（11 字节）→ `baseCost` | `baseCost`（恰好一致） | `false` |
| 29 字节名字 | `NameTooLong(33, 32)` 回滚 | 正常返回价格 | `false` |

（`baseCost = (MAX_SUPPLY − totalSupply) / BASE_DIVISOR`，见 `MemberNFT.sol:105-107`。）

## 对前端的影响（修复前）

1. **铸造页显示的价格是错的**，最坏差 4 个数量级。用户按 10000 倍价格去 `approve` 虽然不会多扣（`safeTransferFrom` 只划 `mintCost`，见 `MemberNFT.sol:81`），但“当前价格”这个核心信息不可信，且 `approve` 额度会留一堆垃圾授权。
2. **“这个名字可用”是假的。** 用户填了 3～6 字节的名字，`isNameUsed` 说可用，点下去回滚 `NameAlreadyExists(existingId)`——而 `existingId` 指向的是 `Testabc` 那个 NFT，用户会觉得“我明明查过没人用”。
3. **长度上限不一致。** 前端按 `MAX_NAME_LENGTH = 32` 校验通过的名字（29～32 字节）会在链上回滚 `NameTooLong(33, 32)`，错误文案里 `length` 比用户输入的还大 4，无法解释。
4. **`memberId(name)` 解析不了。** “按名字找身份”的功能在测试环境上对所有非 `Test` 开头的名字都返回 0。
5. 同一个 bug 会让 E2E 用例出现“报价与余额变化不一致”，把问题误判成前端算错。

## 建议修复方案（最小改动，未采用）

> 以下为修复前提出的候选方案，最终没有采用；实际修复选择了停止加前缀（见「修复内容」）。保留作为历史。

让前缀成为**字符串域的唯一入口**，所有公开函数都走它：

```solidity
function _resolveName(string memory name) internal view returns (string memory) {
    return _toLowerCase(_addTestPrefixIfNeeded(name));
}

function calculateMintCost(string memory name) public view returns (uint256) {
    return _calculateMintCost(_resolveName(name));   // 前缀后测字节数
}
function isNameUsed(string calldata name) external view returns (bool) {
    return _tokenIdByNormalizedName[_resolveName(name)] != 0;
}
function memberId(string calldata name) external view returns (uint256) {
    return _tokenIdByNormalizedName[_resolveName(name)];
}
```

同时把“有效长度上限”变成可读值，避免前端硬编码 32：

```solidity
function maxNameLength() external view returns (uint256);   // 有前缀时 = MAX_NAME_LENGTH - 4
```

若不想改语义，则至少加一个纯函数让前端复用规则：

```solidity
function finalName(string calldata name) external view returns (string memory);
```

（`normalizeName` 已存在但只做小写，不解决前缀，见 `MemberNFT.sol:139-143`。）

注意 `NameAlreadyExists(uint256 existingId)` 的载荷是 id 而不是名字（`IMemberNFT.sol:19`），修好查重后前端仍需要再查一次 `memberName(existingId)` 才能告诉用户“被谁占了”——建议同批把载荷改成 `(string name, uint256 existingId)`；合约未上线，可以一次改到位。

## 临时前端绕过方案（已作废）

> 本节是修复前的临时绕过，已随 `core@72a1604` 作废；保留用于说明当时为什么必须在前端复刻前缀。新的前端义务见「前端义务变更」。

- 前端复刻前缀规则：
  ```ts
  const finalName = symbol.startsWith('Test') && !name.startsWith('Test') ? 'Test' + name : name;
  const cost = await memberNFT.read.calculateMintCost([finalName]);   // 传前缀后的名字
  const used = await memberNFT.read.isNameUsed([finalName]);          // 传前缀后的名字
  ```
- 代价：① 把合约里的一段字符串规则复制到 TS，规则一改就漂移；② 展示给用户的名字和链上存的名字仍然不同（用户输入 `abc`，钱包里显示 `Testabc`），当时必须在铸造确认页明示链上名称会被改写；③ 长度上限要写死 28 或按 `symbol` 分支算，仍是硬编码；④ 需要额外读一次 `symbol()` 并缓存。

## 验证

修复前（dev 参数下）：

```
cast call $MEMBER_NFT "calculateMintCost(string)(uint256)" abc
cast call $MEMBER_NFT "mint(string)(uint256,uint256)" abc --from $OWNER   # 比对两者返回值
cast call $MEMBER_NFT "isNameUsed(string)(bool)" abc                      # false
cast call $MEMBER_NFT "memberId(string)(uint256)" abc                     # 0
```

修复后（`core@72a1604`）：`calculateMintCost("abc")` 与 `mint("abc")` 返回的 `mintCost` 相等，`isNameUsed("abc") == true`，`memberId("abc") != 0`，`memberName(tokenId) == "abc"`。
