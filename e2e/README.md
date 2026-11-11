# e2e — Playwright 套件

针对本地 anvil（chain 31337，`http://127.0.0.1:8545`）跑生产构建产物（`vite preview`，ADR-0001 §3.4）。浏览器里注入 EIP-1193 stub，读写都走 anvil 的 unlocked 账户，测试里没有私钥。

## 运行

```bash
# 一次性前置：干净链（bootstrap 会拒绝复用已部署过的链）
make -C ../anvil stop && make -C ../anvil clean && make -C ../anvil bootstrap

# 完整门禁 + e2e
pnpm typecheck && pnpm lint && pnpm test && pnpm e2e

# 同一条链上连跑两遍（不需要中间 bootstrap；两遍都应全绿）
pnpm e2e && pnpm e2e
```

`playwright.config.ts` 的 `webServer` 会先跑 `pnpm build`（`VITE_ENV=dev`）再起 preview；非 CI 下若 `127.0.0.1:4173` 已有服务会直接复用。可选环境变量：`E2E_PORT`（默认 4173）、`E2E_BASE_PATH`（默认 `/`）、`E2E_ANVIL_RPC`（默认取地址簿里的 RPC）。改了 `E2E_ANVIL_RPC` 时，构建期也要给同一个 `VITE_ANVIL_RPC`，否则页面里的 viem 仍连地址簿的 RPC。

## 链上状态隔离

每个 spec 文件在 `beforeAll` 之前调用一次 `isolateChain()`（[`chain.ts`](chain.ts)）：

1. `anvil_snapshot` 取快照，拿到 id（anvil 1.8.1；`evm_snapshot` 是同义别名）；
2. 该文件的测试和 `beforeAll` 夹具照常改链（空投 claim、铸造、approve、swap、launch 子币、加流动性……）；
3. 文件最后一个测试结束后 `anvil_revert(id)`，把链恢复成文件开始前的状态（交易、余额、nonce、事件、区块头一起回滚）。

因此**每次运行结束后链与运行前完全一致**：空投份额不会被耗尽，第二次 `pnpm e2e` 的 `beforeAll` 仍能找到未铸造的快照账户。

刻意选择**按文件**而不是按测试回滚：

- 文件内测试共享夹具（例如 `mint-identity.spec.ts` 先铸造、随后用同一收据去 my-nft 断言），按测试回滚会把下一个测试依赖的状态也抹掉；
- 快照/回滚作用于整条链，多个 worker 并发时 A 的回滚会覆盖 B 的写入。所以 `playwright.config.ts` 固定 `workers: 1`、`fullyParallel: false`，同一时刻只有一个文件在改链。

不隔离的东西：浏览器 local storage（每个测试有独立 context）、`docs/product/screenshots/` 里的截图文件、构建产物。截图是幂等覆盖写，不会跨运行累积。

## 中断与脏链

- 正常失败/超时：Playwright 仍会执行 `afterAll`，链会回滚。
- 进程被强杀、anvil 被重启或快照 id 失效：该文件的 `afterAll` 会报 `anvil_revert ... returned false`，链上可能留下该文件的写入。此时 `make -C ../anvil stop && make -C ../anvil clean && make -C ../anvil bootstrap` 重建即可；不要试图在已用过的链上继续跑空投用例。
- 手工验证快照可用：`cast rpc anvil_snapshot --rpc-url http://127.0.0.1:8545`，再 `cast rpc anvil_revert <id>`。

## 产物

失败时 trace 在 `test-results/`；通过的用例会把 390×844 截图写进 `docs/product/screenshots/`（可用作验收证据）。
