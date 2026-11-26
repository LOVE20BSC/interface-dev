# ADR-0014 · 治理准入阶梯 = 一个纯判定，两域只给输入与文案

- 状态：Accepted
- 日期：2026-11-26
- 关联：候选 B（第二轮架构评审 L1126-3）；[ADR-0010](0010-page-route-registry.md)（它把治理域 if 链列为未收口，本 ADR 处理的是门禁阶梯，两者不冲突）

## Context

「我现在能不能操作这个治理页面、不能的话下一步点哪」是一条阶梯：未部署 → 未连接 → 身份 NFT 三态 → 社区读不到 → 就绪。它在两个域各写一遍：

- `entities/gov-core/model/use-gov-access.ts`（7 个 core 页面消费）
- `features/governance-stake/model/use-gov-context.ts`（6 个 stake 页面 + `/me` 面板）

两份文件顶部的注释逐字写着「两个域的门禁阶梯文案与顺序保持一致」——**靠注释同步**。门禁卡也写了两遍（`widgets/gov-access-gate` 与 `features/governance-stake/ui/gov-gate`），9 个分支各一份。结果：

- 同一个「身份 NFT 读取中」：core 页用 `copy.wallet.identityReading`、质押页用 `copy.gov.stats.loading`。
- 同一个「身份 NFT 合约未部署」：core 页用了 `copy.gov.gates.unconfiguredTitle`（文案是「这个环境还没有部署**质押**合约」——core 域根本没有质押，语义就错了）、质押页用 `copy.identity.notDeployedTitle`（「这个环境还没有部署身份 NFT 合约」）。
- 阶梯本身零单测：判定埋在 React hook 的 IIFE 里，要测只能渲染整页。

## Decision

1. **判定收进 `src/shared/lib/gov-gate.ts`**：`govGateState({ unconfigured, connected, identityStatus, communityKnown })` → `unconfigured | connect | identity-loading | identity-unconfigured | identity-error | no-identity | needs-selection | community-unknown | ready`。顺序即规则：未部署 → 未连接 → 身份六态 → 社区未知 → 就绪。
2. **两个 hook 只提供输入**：core 算 `requiredAddresses`、stake 算「质押地址 / 父币 / 阶段钟」，其余交给共享判定；两个 hook 对外的状态类型与消费者不变。
3. **文案统一（owner 2026-11-26 拍）**：
   - `identity-loading`：两侧都用 `copy.wallet.identityReading`（原质押页用的 `copy.gov.stats.loading` 退役）。
   - `identity-unconfigured`：两侧都用 `copy.identity.notDeployedTitle/Body`（说「身份 NFT 合约」，不是「质押合约」）。`copy.gov.gates.unconfigured*` 留给真正的 `unconfigured` 门禁。
4. **门禁卡的合并本轮不做**：两张卡的排版、按钮组与 testId 不同（core 用 `GateCard`、质押用 `StakeStateCard`），合并要动 13 个页面的渲染契约。判定已经同源，卡片的收敛留作下一刀。

## Consequences

- 阶梯顺序、9 个态、每态的下一步只有一处；今天改顺序要动两个 hook。
- 新增 6 条表驱动单测（含一条「整条阶梯顺序」的回归），此前零覆盖。
- 两处文案漂移被消除；顺带修正了 core 域 `identity-unconfigured` 用「质押合约未部署」文案的语义错误。
- 首屏包体不变（`shared/lib` 只被懒侧引用）。
