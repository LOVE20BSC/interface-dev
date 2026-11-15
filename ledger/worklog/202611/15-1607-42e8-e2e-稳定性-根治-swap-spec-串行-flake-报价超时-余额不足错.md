# 20261115-1607-42e8-e2e-稳定性-根治-swap-spec-串行-flake-报价超时-余额不足错: e2e 稳定性：根治 swap.spec 串行 flake（报价超时 / 余额不足错误未渲染）

- **Tags**: e2e, flaky, swap
- **Status**: doing · 2026-11-15 16:08:36 · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d
- **Created**: 2026-11-15 16:07:44 · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d

<!-- Header lines are maintained by the script, fixed order: Tags → Status → Created → Sealed.
     The `- **Tags**: …` line is inserted at the top by new --tags; omitted when there are no tags
     (category goes to the ledger and history only, never into this document).
     The `- **Sealed**: …` line is appended on close. -->

## Background

本仓 e2e 长期有一个已知 flake（台账历史记为 task-14，一直没根治）：`e2e/swap.spec.ts` 在**全量**运行时偶发失败，但单跑必绿。2026-11-16 00:00 左右两轮全量复现了两种不同表现：

- 第 1 轮（commit `7dcf573`，live 8555）：`swap.spec.ts:627`「a >10% price impact requires an explicit second confirmation」→ `getByTestId('swap-to-amount')` 持续 30 s 为 `—`（报价一直没出来），随后 `4 did not run`。
- 第 2 轮（fresh 8555）：`swap.spec.ts:536`「insufficient balance explains the shortfall and disables the action」→ `swap-amount-error` 20 s 内根本没渲染（DOM 里余额已是 `ETH 0`），随后 `8 did not run`。

两次失败都**单跑即过**；`swap.spec.ts` 用了 `test.describe.configure({ mode: 'serial', timeout: 180_000 })`，所以一条失败会连带同文件其余用例 `did not run`，掩盖全量结果。

历史旁证：`swap.spec.ts` 依赖 `beforeAll` 建两个测试币 + 深池夹具（`TestEMPTY1/TestEMPTY2`），并在文件级 snapshot 内串行跑；上一轮 `bump-3` 与 `copy-slim` 的两次全量有 130/130 绿的记录，说明是**间歇性**而非恒定失败。

目标：**根治**（不是把超时调大了事），并留下可重复的稳定性证据。

通用纪律：PATH 带 foundry+node24+pnpm；**8545 绝对不能碰**（用 8555；需要重建时 `cd ../anvil && make stop PORT=8555 && make clean PORT=8555 && make bootstrap PORT=8555`）；**不要 git add/commit**；不 reset/checkout；不跑 `pnpm format`。

## To Do

1. **稳定复现**：在 8555 上用 `--repeat-each` 与全量循环复现（建议 `E2E_ANVIL_RPC=http://127.0.0.1:8555 pnpm e2e --grep "swap" --repeat-each=3`，以及全量 2–3 轮）；失败时保留 trace（`--trace retain-on-failure` 或 `PLAYWRIGHT_TRACE=on`），记录：当时的报价请求是否发出/返回、RPC 延迟、夹具是否就绪（两个测试币的 pair 储备、深池 reserve）、以及失败时的 DOM 与网络时序。
2. **根因判定**（必须给证据，不是猜）：
   - 报价 `—` 持续 30 s：是 `beforeAll` 夹具未就绪（token 创建/加池慢）、RPC 在并发负载下超时、还是 app 的报价 hook 在某个状态下不重试？
   - `swap-amount-error` 不渲染：是 app 要等报价先 settle 才显示余额不足，还是余额读取状态机在 0 余额/慢 RPC 下漏了渲染？若是产品原因，**修产品**（用户应尽快看到「还差多少」）。
3. **修复**：按根因改（app 侧时序/重试/条件渲染，或 test 侧夹具就绪屏障/等待条件/独立账号），不要只把 30 s 调成 60 s；若确需调超时，用实测 p95 延迟证明。
4. **稳定性验收**：修复后至少
   - `swap.spec.ts --repeat-each=3` 全绿（串行文件 3 次全过）；
   - **全量 e2e 连跑两遍 0 failed / 0 did not run**；
   - 若发现根因涉及共享夹具时序，顺带检查其它串行文件（`mint-identity`/`transfer`/`batch-transfer` 等）有没有同类风险，列出结论（不一定要改）。
5. **文档**：在 `e2e/README.md` 记录 flake 根因与夹具就绪约定（后来人不再踩）；worklog `## Process`/`## Conclusion` 写复现命令、trace 证据、根因、修复点、两遍全量结果、以及「为什么不是靠调超时」。
6. 门禁：`typecheck`/`lint`/`test`/`VITE_ENV=dev pnpm build`。

## Next

先跑 `E2E_ANVIL_RPC=http://127.0.0.1:8555 pnpm e2e --grep "swap" --repeat-each=3` 抓复现，同时在 `beforeAll` 夹具里加临时日志（token 地址、pair 储备、加池 tx 哈希）确认夹具就绪时序；拿到 trace 后再决定修 app 还是修测试。

## Process

<!-- Pitfalls and evidence: with revision + file:line or symbol names -->

## Conclusion

<!-- What got done, what got left behind -->

## Execution Log

<!-- Maintained by the script: appended by new / claim / set / release / log / close. Do not edit.
     Backfill with: progress log --id 20261115-1607-42e8-e2e-稳定性-根治-swap-spec-串行-flake-报价超时-余额不足错 --note "...". -->
- 2026-11-15 16:07:44 · new · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d · created
- 2026-11-15 16:08:36 · claim · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d · claimed → doing
