# CI-012 名称同形可伪造身份（ASCII-only 折叠 + 宽松字符集）

- 严重级别：**Medium**
- 影响模块：身份、提案、群聊
- 状态：Open
- 关联文件：`core/src/MemberNFT.sol`、`core/src/interfaces/IMemberNFT.sol`

## 现象

`memberId` 的唯一性建立在“**仅 ASCII 小写折叠后的原始字节**”上：

- `_toLowerCase` 只把 `0x41–0x5A`（A–Z）转成小写，其它字节原样保留；
- `_isValidNameChars` 接受任意合法 UTF-8 字符，只拦控制符、零宽/双向控制符和少量黑名单码位；
- 归一化后 `keccak` 不同即视为不同名字。

于是 `Alice`、`Αlice`（希腊 Alpha U+0391）、`Аlice`（西里尔 A U+0410）、`ａlice`（全角 a U+FF41）、`AΙice`（希腊 Iota）在链上是**五个不同的身份**，在任何字体下几乎无法区分。这是身份型协议里最典型的钓鱼面：攻击者可以注册一个与真实成员视觉相同的 `memberId`，然后在提案、投票、群聊里冒充。

前端无法单独修复：合约接受的名字，UI 拒绝只会把问题变成“部分名字无法注册”；而“检查是否已有同形名字”需要枚举全部名字（无索引，见 CI-001 同类问题）。

## 证据

```solidity
// core/src/MemberNFT.sol:376-389
function _toLowerCase(string memory str) internal pure returns (string memory) {
    bytes memory bStr = bytes(str);
    bytes memory result = new bytes(bStr.length);
    for (uint256 i = 0; i < bStr.length; i++) {
        if (bStr[i] >= 0x41 && bStr[i] <= 0x5A) {          // ← 只有 ASCII 大写被折叠
            result[i] = bytes1(uint8(bStr[i]) + 32);
        } else {
            result[i] = bStr[i];
        }
    }
    return string(result);
}
```

```solidity
// core/src/MemberNFT.sol:212-225
function _checkName(string memory name) internal view returns (string memory normalizedName) {
    bytes memory nameBytes = bytes(name);
    uint256 len = nameBytes.length;
    if (len == 0) revert NameEmpty();
    if (len > MAX_NAME_LENGTH) revert NameTooLong(len, MAX_NAME_LENGTH);
    if (!_isValidNameChars(nameBytes)) revert NameInvalidCharacters();
    normalizedName = _toLowerCase(name);
    uint256 existingTokenId = _tokenIdByNormalizedName[normalizedName];   // ← 唯一性只看折叠后的字节
    if (existingTokenId != 0) { revert NameAlreadyExists(existingTokenId); }
}
```

```solidity
// core/src/MemberNFT.sol:246-261（多字节字符的接受条件：只要是合法 UTF-8 就放行）
if (byteValue < 0x80) { i++; continue; }
uint8 numBytes = 0;
if (byteValue >= 0xC2 && byteValue <= 0xDF) { numBytes = 2; }
else if (byteValue >= 0xE0 && byteValue <= 0xEF) { numBytes = 3; }
else if (byteValue >= 0xF0 && byteValue <= 0xF4) { numBytes = 4; }
else { return false; }
```

（黑名单只覆盖 `U+0080–U+009F`、`U+00A0`、`U+00AD`、`U+200B–U+200F`、`U+2028–U+202F`、`U+FEFF`、`U+FFA0` 等格式/控制码位，见 `MemberNFT.sol:267-368`；西里尔、希腊、全角字母均不在其中。）

## 对前端的影响

1. **身份页无法自证“这是谁”。** 界面上唯一的人类可读标识就是 `memberName`；同形名一多，用户无法凭名字判断提案作者/验证者是不是他以为的那个人。
2. **前端做“相似名提示”不可行。** 需要 `totalSupply()` + 逐 token `memberName()`，成员上千后是上千次调用；且没有“名字 → id”的批量接口。
3. **错误文案无法解释。** `NameAlreadyExists(existingId)` 只给 id（`IMemberNFT.sol:19`），用户看到“名字已存在”但自己输入的名字和已有名字视觉上一模一样，会认为系统坏了。
4. **群聊/提案里的 @ 与转发**同样以名字为锚点，同形名可以直接劫持对话上下文。

## 建议修复方案（最小改动）

按代价从低到高：

1. **限制字符集**（最小、最彻底）：只允许 ASCII `a–z 0–9 - _ .` 与单个内部空格，长度 1–32。合约侧改 `_isValidNameChars`，前端校验规则同步；一旦上线就再也改不了，所以这是**上线前必须定**的产品决策。
2. **若必须支持中文/Unicode**：做**骨架唯一性**（confusable skeleton）而不是原字节唯一性：
   ```solidity
   // NFKC 等价 + 同形映射（0/O、1/l/I、西里尔/希腊 → 拉丁）后的骨架
   mapping(string => uint256) internal _tokenIdBySkeleton;
   ```
   纯 Solidity 做完整 NFKC 不现实，可行折中是**按码位区间做映射**：只允许 CJK 统一汉字（`U+4E00–U+9FFF`）+ ASCII，拒绝其它文字系统（希腊/西里尔/全角/数学字母）。这能挡掉 95% 的同形攻击，且实现量可控。
3. **无论选哪种，都把 `NameAlreadyExists` 的载荷改成 `(string name, uint256 existingId)`**，让 UI 能直接显示“`Alice` 已被 #12 占用”。

## 临时前端绕过方案

- 校验规则比合约更严：只允许“ASCII 字母数字 + `-` `_`”与“纯 CJK 汉字”两类，混合脚本直接拒绝并给出原因。这样同形攻击面收敛到“纯西里尔/希腊名”，可以再用一条规则挡掉（非 CJK 的非 ASCII 一律拒绝）。
- 在身份卡、提案作者、验证者、群聊发言人处**始终把 `memberId` 与名字并排显示**（例如 `Alice · #42`），并在悬停/长按显示完整 id；这是唯一不依赖合约的缓解手段。
- 代价：① 前端拒绝的名字合约其实接受，用户可能绕过前端直接调合约注册；② 对既有同形名无能为力（只能显示 id 兜底）；③ 规则一改就要发版，且必须与合约规则保持“前端更严”的单向关系。
