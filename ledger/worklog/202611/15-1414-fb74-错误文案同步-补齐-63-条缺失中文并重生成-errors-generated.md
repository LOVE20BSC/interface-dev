# 20261115-1414-fb74-错误文案同步-补齐-63-条缺失中文并重生成-errors-generated: 错误文案同步：补齐 63 条缺失中文并重生成 errors.generated

- **Tags**: 错误文案, registry, 门禁
- **Status**: doing · 2026-11-15 14:14:57 · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d
- **Created**: 2026-11-15 14:14:22 · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d

<!-- Header lines are maintained by the script, fixed order: Tags → Status → Created → Sealed.
     The `- **Tags**: …` line is inserted at the top by new --tags; omitted when there are no tags
     (category goes to the ledger and history only, never into this document).
     The `- **Sealed**: …` line is appended on close. -->

## Background

owner 2026-11-15 22:09：「1. 做」——同步协议错误文案目录并补齐缺失中文。

现状（已核实）：
- 生成器 `scripts/gen-errors.mjs` 读 `../matt-gov/registry/errors.json`（248 个选择器）与 `scripts/error-messages.zh.json`（189 个名字），生成 `src/config/errors.generated.ts`（当前是旧快照，190 选择器）。
- `pnpm gen:errors` 现在**直接失败**：`missing Chinese copy for 63 error name(s)`，名单已打印（ApplicationOverdue…ZeroRecipient，覆盖 action verifier、空投/AirdropDistributor、Stake、Launch、Hub、ERC20/BatchTransfer 六组）。
- 影响：这些新错误在 UI 上只能落到 feature 级 mapper 或兜底文案；`DeadlineExpired` 现由 feature mapper 覆盖（话术正确），但很多新错误没有中文。

通用纪律：PATH 带 foundry+node24+pnpm；**8545 绝对不能碰**；**不要 git add/commit**（Lead 统一提交）；不 reset/checkout；不跑 `pnpm format`；中文文案进 `scripts/error-messages.zh.json`（这就是文案源），界面用语按 `GLOSSARY.md`。

**包体红线**：`errors.generated.ts` 进首屏 bundle，当前 dev 首屏 160.8 kB / 预算 161 kB，空间很小。若补文案后 `VITE_ENV=dev pnpm build` 超 161 kB，**不要改预算、不要偷偷删文案**，先把数字与体积增量报给 Lead，再讨论是否按需懒加载错误表。

## To Do

1. 先跑 `pnpm gen:errors` 拿到 63 个缺失名字；再读 `../matt-gov/registry/errors.json` 里每条 name/signature/参数含义（必要时看 core/action/periphery 源码里的 `revert` 上下文）。
2. 为 63 条逐个写**用户可执行、无术语**的中文文案，风格与现有 189 条一致（例如「这笔操作已经过期，请重新发起。」而不是「DeadlineExpired」）；同一组内保持措辞一致（空投组/质押组/Hub 加池组/ERC20 批转组/验证者组）。
   - 原则：能说清「为什么失败 + 用户下一步做什么」；不出现函数名、allowance、revert、hex、RPC 等词；不承诺合约没有的行为。
3. `pnpm gen:errors` 通过，`src/config/errors.generated.ts` 更新（选择器 190→248、hash 更新）；确认生成物头部 registry hash（`registry@sha256:…`）与新 registry 一致。
4. 加一条**防回归单测**（例如 `src/config/errors.generated.test.ts` 或现有测试里）：registry 里每个 name 都有中文文案、`getContractErrorMessage` 对每个 selector 都能返回非兜底文案；若 registry 缺失则跳过（干净 checkout 无 sibling）。
5. 检查与 feature 级 mapper 的冲突/重复：`liquidity-errors.ts`、`swap-errors.ts`、`batch-errors.ts`、`transfer-errors.ts` 里已有映射的错误，确认通用表与它们不矛盾（优先 feature mapper，通用表兜底）。
6. 门禁：`pnpm gen:errors`、`pnpm typecheck`、`pnpm lint`、`pnpm test`、`VITE_ENV=dev pnpm build`（报 gzip 数字）；e2e 可在 8555 上跑 `--grep "错误|error"` 之类相关子集（可选，全量由 Lead 统一跑）。
7. 文档：`README.md` 错误处理小节补「新增合约错误要同步 `error-messages.zh.json` 并跑 gen:errors」；worklog `## Process`/`## Conclusion` 写：63 条清单与分组、文案风格说明、体积变化、门禁输出。

## Next

先 `pnpm gen:errors` 复现失败并导出 63 个名字，再按注册表分组（action verifier / 空投 / stake / launch / hub / erc20 批转）逐组补文案；每补一组就重跑 gen:errors 看剩余，最后加防回归单测并跑门禁。

## Process

**1. 复现（2026-11-15 22:16，PATH = node v24.12.0 + pnpm 11.5.1 + foundry）**

`pnpm gen:errors` 直接失败，名单与台账一致：

```text
Error: [errors] missing Chinese copy for 63 error name(s): ApplicationOverdue, ApplicationStillResponsible, ApplicationStopped, DuplicateVerificationKey, InexactJoinTokenTransfer, InvalidVerifierPunishmentRatio, ReapplicationInStoppedRound, VerificationKeyEmpty, VerifierNotElected, AirdropAlreadyClaimed, ClaimDelayRoundsExceeded, ClaimRoundNotReached, DeadlineExpired, InexactTokenTransfer, InvalidDistributorDataCount, InvalidDistributorDataLength, InvalidProof, MergeWaitingPeriodNotElapsed, NotLaunchContract, NotSnapshotUriUpdater, NotVoteContract, PromisedWaitingPhasesRewritten, ProtocolFeeRatioNotBelowLpRatio, RoundNotCurrent, ShareExceedsRemaining, SnapshotUriEmpty, SnapshotUriTooLong, SwapFeeRatiosConsumeTheWholeAmount, TokenAlreadyConfigured, TokenNotConfigured, ZeroLpFeeRatio, ZeroMerkleRoot, AmountExceeded, IdenticalTokens, InsufficientLiquidity, InsufficientLiquidityShares, NativeInputUnsupported, NativeRefundFailed, NativeTokenSenderRejected, PairWithoutLiquidity, PromisedWaitingPhasesMismatch, SwapFeeSumBreaksTheClosedForm, WrappedNativeAsToken, ZeroDesiredAmounts, ZeroNativeTokenAmount, ZeroSwapOutput, ZeroTokenAAddress, ZeroTokenAddress, ZeroTokenBAddress, ArrayLengthMismatch, ERC20AllowanceQueryFailed, ERC20BalanceQueryFailed, ERC20InsufficientAllowance, ERC20InsufficientBalance, ERC20InvalidReturn, ERC20TransferFailed, EmptyBatch, NativeTransferFailed, NativeValueMismatch, TokenNotContract, ZeroAmount, ZeroGasLimit, ZeroRecipient
```

**2. 依据与口径**

- `scripts/gen-errors.mjs:58-73`：registry 每条 `signature` 取名字（`replace(/\(.*$/,'')`）→ `scripts/error-messages.zh.json` 取文案；缺任何一条即 throw。
- `../matt-gov/registry/errors.json`：267 条声明 → 248 个唯一 selector（17 个 selector 被多仓共享，生成器 `:84-88` 按 selector 去重）。
- 语义逐条回看 revert 上下文（`action/src/GroupActionVerify.sol:592`、`core/src/distributor/AirdropDistributor.sol:103`、`periphery/src/LOVE20Hub.sol:737`、`tools/src/BatchTransfer.sol:105` 等），确认“为什么失败 + 下一步做什么”，不承诺合约没有的行为。
- 术语按 `GLOSSARY.md`：空投只写「空投铸造/份额」，不写领取；`Phase` 不叫“轮”；merge 写「融合」；`LAUNCH` 写「发射合约」；原生币/包装原生币/流动性凭证/承诺解锁期沿用既有词。
- 风格对齐既有 189 条：一句话（15–34 字）+ 句号；配置/合约侧失效统一「请联系管理员。」；用户可纠正的给「请调低数量 / 请等下一轮 / 请刷新后重试」；无函数名、allowance、revert、hex、RPC、gas、nonce（`src/shared/lib/errors.test.ts` 的 `BANNED_IN_MESSAGE` 全量守护）。

**3. 63 条分组与文案**（全部追加在 `scripts/error-messages.zh.json`，189 → 252 条）

- **行动验证人（action，9）**
  - `ApplicationOverdue`：这份申请已经逾期，不能再继续验证，请重新发起申请。
  - `ApplicationStillResponsible`：这份申请还有一轮验证没有结束，暂时不能取消，请等这一轮有结果后再试。
  - `ApplicationStopped`：这份申请已经停止，不能再继续验证。
  - `DuplicateVerificationKey`：验证项名称重复了，请改成不同的名称。
  - `InexactJoinTokenTransfer`：加入代币实际到账数量与提交数量不一致，这次没有加入，请联系管理员。
  - `InvalidVerifierPunishmentRatio`：验证人惩罚比例设置无效，请联系管理员。
  - `ReapplicationInStoppedRound`：这一轮停止过申请，本轮不能重新申请，请等下一轮再试。
  - `VerificationKeyEmpty`：验证项名称不能为空，请填写后再提交。
  - `VerifierNotElected`：当前身份 NFT 不是本轮选中的验证人，不能执行这个操作。
- **空投（AirdropDistributor，14）**
  - `AirdropAlreadyClaimed`：这次空投份额已经铸造过了，不需要重复铸造。
  - `ClaimDelayRoundsExceeded`：可铸造轮次的等待轮数超过上限，请联系管理员。
  - `ClaimRoundNotReached`：还没到可铸造轮次，暂时不能空投铸造。
  - `InvalidDistributorDataCount`：空投配置数据的条数不正确，这次发射没有完成，请联系管理员。
  - `InvalidDistributorDataLength`：空投配置数据的长度不正确，这次发射没有完成，请联系管理员。
  - `InvalidProof`：这份空投资格与链上快照没有对上，你的份额没有变化。
  - `NotLaunchContract`：当前合约不是发射合约，不能执行这个操作。
  - `NotSnapshotUriUpdater`：只有这次发射的发射者能修改空投快照地址，当前钱包没有这个权限。
  - `ShareExceedsRemaining`：你的空投份额超过了空投池的剩余份额，这次没有铸造。
  - `SnapshotUriEmpty`：空投快照地址不能为空，请填写后再提交。
  - `SnapshotUriTooLong`：空投快照地址太长了，请精简后重试。
  - `TokenAlreadyConfigured`：这个代币已经配置过空投了，不需要重复配置。
  - `TokenNotConfigured`：这个代币还没有配置空投，暂时不能铸造。
  - `ZeroMerkleRoot`：空投快照的校验数据不能为空，请联系管理员。
- **Stake / Mint（core 其余，9）**
  - `DeadlineExpired`：这笔操作已经过期，请重新发起。
  - `InexactTokenTransfer`：代币实际到账数量与提交数量不一致，这次操作没有完成，请联系管理员。
  - `MergeWaitingPeriodNotElapsed`：现在还不能融合，请等承诺解锁期结束后再试。
  - `NotVoteContract`：当前合约不是投票合约，不能执行这个操作。
  - `PromisedWaitingPhasesRewritten`：承诺解锁期已经设置过，只有本人可以修改。
  - `ProtocolFeeRatioNotBelowLpRatio`：手续费比例的高低顺序设置无效，请联系管理员。
  - `RoundNotCurrent`：这个轮次已经不是当前轮次，请刷新后重试。
  - `SwapFeeRatiosConsumeTheWholeAmount`：手续费比例加起来占满了全部金额，设置无效，请联系管理员。
  - `ZeroLpFeeRatio`：手续费比例不能为零，请联系管理员。
- **Hub 加池 / 兑换（periphery，17）**
  - `AmountExceeded`：填写的数量超过池子能处理的上限，请调低数量。
  - `IdenticalTokens`：两侧选了同一个代币，请换成两种不同的代币。
  - `InsufficientLiquidity`：价格变化太大，实际拿到的流动性凭证少于最少数量，这次加池没有完成。
  - `InsufficientLiquidityShares`：价格变化太大，实际拿到的质押份额少于最少数量，这次操作没有完成。
  - `NativeInputUnsupported`：这个代币不支持用原生币加池，请改用两侧都填代币的方式。
  - `NativeRefundFailed`：多付的原生币退回失败，这次操作没有完成，你的资产没有变化。
  - `NativeTokenSenderRejected`：不能直接向这个合约转原生币，请从加池页面操作。
  - `PairWithoutLiquidity`：这个池子还没有流动性，单边加池暂时不可用，可以改用两侧都填。
  - `PromisedWaitingPhasesMismatch`：承诺解锁期与当前设置不一致，请刷新页面后重试。
  - `SwapFeeSumBreaksTheClosedForm`：手续费比例的组合超出允许范围，请联系管理员。
  - `WrappedNativeAsToken`：包装原生币不能当作社区代币加池，请换一个社区代币。
  - `ZeroDesiredAmounts`：两侧的数量都为零，请至少填写一侧数量。
  - `ZeroNativeTokenAmount`：没有填写原生币数量，请填写后再提交。
  - `ZeroSwapOutput`：这一笔换算后得到零，数量可能太小，请调高数量后再试。
  - `ZeroTokenAAddress`：没有选择第一个代币，请重新选择。
  - `ZeroTokenAddress`：没有选择社区代币，请重新选择。
  - `ZeroTokenBAddress`：没有选择第二个代币，请重新选择。
- **ERC20 批量转账（tools，14）**
  - `ArrayLengthMismatch`：收款方和金额的条数不一致，请检查后再提交。
  - `ERC20AllowanceQueryFailed`：这个代币暂时读不到授权额度，换一个代币再试。
  - `ERC20BalanceQueryFailed`：这个代币暂时读不到余额，换一个代币再试。
  - `ERC20InsufficientAllowance`：批量转账的授权额度不够这一批的总额，请先完成授权再提交。
  - `ERC20InsufficientBalance`：代币余额不够这一批的总额，整批没有转出。
  - `ERC20InvalidReturn`：这个代币的转账结果无法确认，整批没有转出，换一个代币再试。
  - `ERC20TransferFailed`：这一批里有代币转账没有成功，整批没有转出，你的资产没有变化。
  - `EmptyBatch`：还没有可以转账的收款方，请先填写名单。
  - `NativeTransferFailed`：这一批里有原生币转账没有成功，整批没有转出，你的资产没有变化。
  - `NativeValueMismatch`：金额合计和实际发送的数量对不上，请刷新页面后重试。
  - `TokenNotContract`：这个代币地址上没有合约，请确认代币后再试。
  - `ZeroAmount`：有一行的金额为零，请填写大于零的金额。
  - `ZeroGasLimit`：每行的执行预算不能为零，请调高后再提交。
  - `ZeroRecipient`：有一行没有填收款方，请补全后再提交。

**4. 重生成**

```text
$ pnpm gen:errors
[errors] wrote 248 selector(s) to src/config/errors.generated.ts (registry@sha256:7f0151cc500643ad)
```

- 独立核算 `sha256(../matt-gov/registry/errors.json 原文)[:16] = 7f0151cc500643ad`，与生成物头部 `// Source:` 一致。
- 旧生成物实际 189 个选择器（README 口径 189；台账写 190 是把 `readonly message: string;` 接口字段也算进去了），新 248 → 净增 59 个选择器。
- 新增 63 个名字只多出 59 个选择器：4 个旧选择器随合约删错误从 registry 消失（`RoundVerifierLocked`、`VerifierNotOpen`、`SlippageExceeded`、`VerifierNotRanked`），其文案仍留在 JSON 但不再进表；这些错误已不可达（`git -C action log` 可见 `cac06c7 fix(action): reject future queries and invalid verification keys` 等），无 UI 影响。
- 逐个核对：旧表 189 条在新表中 message 全部一致（`old changed: []`），248 个选择器的文案与 `error-messages.zh.json` 一一对应（mismatch 0）。

**5. 防回归单测**

新增 `src/shared/lib/errors.registry.test.ts`（3 例，`describe.skipIf(!registryAvailable)`；clean checkout 无 sibling registry 时整组 skip）：

1. registry 每个 name 都有中文文案（且含中文）；
2. `getContractErrorMessage` 对每个 registry selector 都返回具体文案，不等于 `copy.errors.contractGeneric`，也不等于生成器占位句「操作没有完成，请稍后重试。」，且与生成表一致；
3. `ERROR_REGISTRY_SOURCE` 等于当前 registry 原文的 `sha256[:16]` —— registry 更新但忘记重跑 `pnpm gen:errors` 时会在这里失败。

放在 `shared/lib` 而非 `src/config`：`pnpm lint` 的 `src/config is a leaf package` 规则禁止 config 引 shared（第一次 lint 报 2 个 `no-restricted-imports`，移动后通过）。已验证 `LOVE20_ERRORS_JSON=/tmp/missing.json` 时 3 例全部 skipped。

**6. 与 feature mapper 冲突核对（feature 优先，通用表兜底）**

- `src/features/claim-airdrop/lib/airdrop-errors.ts:36-39`：先查 6 个 selector 的页面文案（`AirdropAlreadyClaimed`/`InvalidProof`/`ClaimRoundNotReached`/`ShareExceedsRemaining`/`TokenNotConfigured`/`SafeERC20FailedOperation`），命中即返回；未命中才 `getContractErrorMessage`。新补的通用文案与页面文案同义（都写“已经铸造过了 / 与快照没对上 / 超过剩余份额 / 还没到可铸造轮次”），不矛盾。
- `src/features/batch-transfer/lib/batch-errors.ts:118-178`：按 `errorName` 覆盖 12 个 tools 错误（含 `NativeTransferFailed`/`ERC20TransferFailed`/`ERC20InsufficientBalance`/`ERC20InsufficientAllowance`/`ArrayLengthMismatch`/`EmptyBatch`/`TokenNotContract`/两条读取代币失败），页面文案优先；通用表只在 `default` 后 `toUserMessage` 兜底。`ERC20InvalidReturn`/`ZeroGasLimit` 无页面分支，由通用表兜底，文案与批转语义一致。
- `src/features/mint-identity/lib/mint-errors.ts:64-68`：先覆盖 4 个命名错误 + 2 个 OZ selector，再通用表；新增的 `NotVoteContract`/`RoundNotCurrent` 走通用表。
- `src/features/swap-token/lib/swap-errors.ts:57`、`src/features/transfer-token/lib/transfer-errors.ts:42`：文本规则命中即返回，否则 `toUserMessage`；`src/features/liquidity-pool/lib/liquidity-errors.ts:61` 自带兜底、从不进通用表。三者的优先级不变，通用表只做后备。
- 唯一文案改动在 feature 文件里：`airdrop-errors.ts` 顶部注释原写“AirdropDistributor custom errors are not part of the protocol error registry”，与现状不符（registry 早已收录），改为“页面级文案优先、生成表兜底”，只动注释。

**7. 门禁输出**

```text
$ pnpm gen:errors
[errors] wrote 248 selector(s) to src/config/errors.generated.ts (registry@sha256:7f0151cc500643ad)   # exit 0

$ pnpm typecheck
$ node scripts/gen-build-id.mjs && tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.node.json
[build-id] mwhxa6er-d1c85f6e                                                                    # exit 0

$ pnpm lint
$ eslint . --max-warnings=0                                                                      # exit 0（无输出）

$ pnpm test
Test Files  98 passed (98)
     Tests  633 passed (633)                                                                      # exit 0

$ VITE_ENV=dev pnpm build
dist/assets/index-DtTS6Dmg.js  548.82 kB │ gzip: 164.94 kB
✓ built in 9.92s
[postbuild] 404.html (0 path segment(s) kept), .nojekyll, build-id.json
[bundle] first-screen JavaScript (gzip):
    160.8 kB  /assets/index-DtTS6Dmg.js
    160.8 kB  TOTAL (536.0 kB raw, 1 file(s))
[bundle] budget: target ≤ 161 kB for VITE_ENV=dev (160 kB + 1 kB documented deployment-data allowance), hard limit 200 kB gzip
[bundle] wallet SDK check: injected-only (no WalletConnect/AppKit/MetaMask SDK).                  # exit 0
```

**8. 包体**

- 首屏 JS：160.8 kB gzip（`dist/assets/index-DtTS6Dmg.js` gzip -9 = 164,649 B = 160.79 kB），**未超 161 kB**，未改预算、未删文案；与改前 160.8 kB 相比无变化。
- 原因：错误表编译进懒加载 chunk `dist/assets/use-tx-watch-ToKy52K5.js`（34.22 kB raw / 12.36 kB gzip），`dist/index.html` 只有入口 `<script type="module" src="/assets/index-DtTS6Dmg.js">`、无 modulepreload；新文案只在该懒 chunk 中可检索到（`grep` 验证）。
- 表本体增量：`src/config/errors.generated.ts` raw 50,876 → 70,273 B（+19,397 B），gzip -9 10,217 → 15,531 B（+5,314 B ≈ +5.2 kB），落在懒加载 chunk，不进首屏。

**9. 文档**

`README.md` “Storage and errors” 小节：选择器数 189 → 248，并补一句「新增合约错误时，要同步 `scripts/error-messages.zh.json`（这条中文文案就是界面用语），再跑 `pnpm gen:errors` 重新生成 `src/config/errors.generated.ts`；缺文案时生成器会直接失败并列出错误名。」

**10. 纪律**

未 `git add/commit`、未 reset/checkout、未跑 `pnpm format`；只对改动文件跑 `prettier --check`（`scripts/error-messages.zh.json`、`README.md`、新测试、`airdrop-errors.ts` 全部通过）；未接触 8545（本次不跑链上）。

## Conclusion

- 63 条缺失中文全部补齐（`scripts/error-messages.zh.json` 189 → 252 条），按 action 验证人 9 条 / 空投 14 条 / Stake-Mint 9 条 / Hub 加池兑换 17 条 / ERC20 批转 14 条分组，同组措辞统一，全部用户可执行、无术语。
- `pnpm gen:errors` 通过：`src/config/errors.generated.ts` 189 → 248 个选择器，`// Source: registry@sha256:7f0151cc500643ad` 与 `../matt-gov/registry/errors.json` 实算 hash 一致。
- 防回归：`src/shared/lib/errors.registry.test.ts` 3 例（每 name 有中文、每 selector 解析到非兜底且与生成表一致、hash 与 registry 一致），registry 缺失自动 skip；全量 `pnpm test` 98 文件 / 633 例通过。
- 门禁全绿：gen:errors、typecheck、lint、test、`VITE_ENV=dev pnpm build`（首屏 160.8 kB gzip ≤ 161 kB，未动预算未删文案；gzip 增量 +5.2 kB 落在懒加载 `use-tx-watch` chunk，首屏 0 增量）。
- 遗留风险：① 旧表 4 个 selector（`RoundVerifierLocked`/`VerifierNotOpen`/`SlippageExceeded`/`VerifierNotRanked`）因合约删错误已从 registry 消失，现落兜底；文案 JSON 里仍保留且不可达，后续可随 registry 清理。② 错误表本体 gzip +5.2 kB 在懒加载 chunk；若该 chunk 之后进首屏或首屏吃紧，可考虑把错误表按需异步加载（本次未做，等 Lead 决定）。③ 页面级 feature mapper 仍优先，若产品要更贴页面的措辞应改 `copy-pages.ts`，不要重复改通用表。④ 未提交 git，等 Lead 统一提交。

## Execution Log

<!-- Maintained by the script: appended by new / claim / set / release / log / close. Do not edit.
     Backfill with: progress log --id 20261115-1414-fb74-错误文案同步-补齐-63-条缺失中文并重生成-errors-generated --note "...". -->
- 2026-11-15 14:14:22 · new · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d · created
- 2026-11-15 14:14:57 · claim · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d · claimed → doing
