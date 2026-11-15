# 20261115-2009-356e-收口-dev-首屏-bundle-压回-161-kb-内-status-截图计数: 收口：dev 首屏 bundle 压回 161 kB 内 + STATUS 截图计数核对

- **Tags**: bundle, 门禁
- **Status**: doing · 2026-11-15 20:10:16 · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d
- **Created**: 2026-11-15 20:09:45 · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d

<!-- Header lines are maintained by the script, fixed order: Tags → Status → Created → Sealed.
     The `- **Tags**: …` line is inserted at the top by new --tags; omitted when there are no tags
     (category goes to the ledger and history only, never into this document).
     The `- **Sealed**: …` line is appended on close. -->

## Background

收口两件小事：
1. **dev 首屏 bundle 161.3 kB > 161 kB 目标（WARN，硬限 200 未破）**，需要压回目标以内（至少 0.3 kB gzip，建议留 ~1 kB 余量）。入口 bundle 主要构成：`shared/config/copy.ts`（首屏文案）+ shell/widgets + wagmi/viem 相关。最可行的做法是把**只在二级页面/弹层用到**的文案或组件从入口移到懒加载 chunk（`copy-pages.ts` 已有这种模式）。
2. `docs/STATUS.md` 的截图计数与实际文件数不符（多轮 e2e 重拍后总数变了），核对并修正。

注意：不要改预算阈值、不要删文案来达标、不要为了小 1 kB 引入新依赖或复杂懒加载；优先「把入口里只有弹层/二级页用的字符串移到懒加载 copy」。



纪律：PATH 用 `export PATH="/Users/BigPolarBear/.nvm/versions/node/v24.12.0/bin:/opt/homebrew/bin:/Users/BigPolarBear/.foundry/bin:/Users/BigPolarBear/Library/pnpm/bin:$PATH"`（**必须 nvm node 在前**，否则 pnpm 会用到 homebrew 的 node20；python3 必须 homebrew 的 3.12，系统 /usr/local/bin/python3 已坏）；**8545 绝对不能碰**；链直接用已跑着的 8555（`E2E_ANVIL_RPC=http://127.0.0.1:8555`，**不要自己 bootstrap**——owner 的 core 工作树有未提交改动，PINNED=0 会失败）；**不要 git add/commit**；不 reset/checkout；不跑 `pnpm format`（只 prettier 自己文件）；中文进 copy；移动端/桌面、浅/深都要验。

## To Do

1. 先用 `VITE_ENV=dev pnpm build` 拿到当前首屏 gzip；分析入口 chunk 里哪些模块/文案不是首屏必需（可看 `dist/assets/index-*.js` 的 chunk 归属，或按 import 关系排查 `copy.ts` 里的分组）。
2. 做 1–2 处低风险拆分（例如把 `copy.wallet`/`copy.community` 菜单类文案、或 `about`/`theme` 专用文案从入口挪到 `copy-pages.ts`，由已懒加载的页面 import），确保**首屏功能与文案不变**、无闪烁回归。
3. 验收：`VITE_ENV=dev pnpm build` 首屏 **≤161 kB（无 WARN）**，`VITE_ENV=prod` 也跑一遍（≤160）；`pnpm typecheck`/`lint`/`test` 全绿；跑一次相关 e2e 子集（如 `--grep "首屏|首页|菜单"`）确认无回归。
4. 核对 `docs/STATUS.md` 的截图计数：`ls docs/product/screenshots/*.png | wc -l` 与文中数字对齐，并核对该表其它过时数字（e2e 条数应为 139）。
5. 报告：拆分点、首屏/ prod gzip 数字（前后对比）、门禁与 e2e 结果、STATUS 修正内容。

## Next

先 build 记基线，再按 import 关系找入口里非首屏必需的文案分组；拆完立即 build 对比 gzip，不要一次改太多导致定位困难。

## Process

<!-- Pitfalls and evidence: with revision + file:line or symbol names -->

## Conclusion

<!-- What got done, what got left behind -->

## Execution Log

<!-- Maintained by the script: appended by new / claim / set / release / log / close. Do not edit.
     Backfill with: progress log --id 20261115-2009-356e-收口-dev-首屏-bundle-压回-161-kb-内-status-截图计数 --note "...". -->
- 2026-11-15 20:09:45 · new · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d · created
- 2026-11-15 20:10:16 · claim · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d · claimed → doing
