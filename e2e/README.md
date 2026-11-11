# e2e — Playwright 套件

针对**套件自有的**本地 anvil（chain 31337，`http://127.0.0.1:8555`）跑生产构建产物（`vite preview`，ADR-0001 §3.4）。浏览器里注入 EIP-1193 stub，读写都走 anvil 的 unlocked 账户，测试里没有私钥。

> **两条链的硬边界（2026-11-11 事故后）**
>
> - `http://127.0.0.1:8545` = **人工链**：开发者浏览器钱包连着的链，自动化运行**永不触碰**。
> - `http://127.0.0.1:8555` = **自动化链**：`pnpm e2e` 自己启动 / bootstrap / 快照 / 回滚的链。
>
> 事故经过：套件原先直接跑在共享的 8545 上，每个 spec 文件做 `anvil_snapshot`/`anvil_revert`。产品负责人在浏览器里手工测 /mint 时，一次自动化运行在 8545 上重新 bootstrap/回滚，导致账户 #1（`0x70997970C51812dc3A010C7d01b50e0d17dc79C8`）的链上 nonce 从 68 变回 3，他签名的 `approve(...)`（tx `0x94071607…ec6cb1`）永远进不了块，页面卡在「确认中…」；期间 `anvil_getAutomine` 还一度被留成 `false`、块高从 943 回退到 936。**快照/回滚只保证「同一条链可重复」，并不能阻止自动化运行去动人工链**——隔离必须靠独立链。

## 运行

```bash
# 自给自足：确保 8555 上有一条 bootstrapped 链（首次启动 + bootstrap，之后复用），再跑 Playwright
pnpm e2e

# 同一条 8555 链连跑两遍（不需要中间 bootstrap；两遍都应全绿）
pnpm e2e && pnpm e2e

# 只确保/查看 e2e 链，不跑测试（给人工确认用）
pnpm e2e:ensure-chain

# 停掉 8555 并从 block 0 重新 bootstrap（链脏了、被强杀过、或改过部署脚本时用）
pnpm e2e:reset-chain
```

首次运行会执行 `make -C ../anvil bootstrap PORT=8555`（约 1 分钟，地址与提交的
`src/config/deployments/anvil31337_dev.json` 相同——clean bootstrap 从 deployer nonce 0 开始，
端口不影响地址）。之后每次 `pnpm e2e` 检测到 8555 已有完整部署就直接复用。

`playwright.config.ts` 的 `webServer` 会先跑 `pnpm build`（`VITE_ENV=dev`）再起 preview；它会把本次解析出的 RPC 作为 `VITE_ANVIL_RPC` 烘进构建，页面里的 viem 和 spec 的直连 RPC 因此永远指向同一条链。`reuseExistingServer` 默认关闭（`E2E_REUSE_PREVIEW=1` 才复用已有 preview），避免复用一份用别的 RPC 构建的旧产物。其它可选环境变量：`E2E_PORT`（默认 4173）、`E2E_BASE_PATH`（默认 `/`）。

### 覆盖端点 / 使用别人的链

`E2E_ANVIL_RPC` 显式设置时，脚本**不管理**该链（不启动、不 bootstrap），只做两件事：

1. 若解析出的端点指向本机 `:8545`，**立即硬失败**（`pnpm e2e` 和 `playwright.config.ts` 双层拦截，连请求都不会发）；退出信息会说明为什么（上面的 2026-11-11 事故）。
2. 检查端点可达且 `eth_chainId == 31337`，否则给出明确报错而不是让 spec 在浏览器里神秘超时。

```bash
# 例：手动起一条 8556 的链，然后让 e2e 用它（不会被套件管理）
make -C ../anvil bootstrap PORT=8556
E2E_ANVIL_RPC=http://127.0.0.1:8556 pnpm e2e
```

## 链上状态隔离

每个 spec 文件在 `beforeAll` 之前调用一次 `isolateChain()`（[`chain.ts`](chain.ts)）：

1. `anvil_snapshot` 取快照，拿到 id（anvil 1.8.1；`evm_snapshot` 是同义别名）；
2. 该文件的测试和 `beforeAll` 夹具照常改链（空投 claim、铸造、approve、swap、launch 子币、加流动性……）；
3. 文件最后一个测试结束后 `anvil_revert(id)`，把链恢复成文件开始前的状态（交易、余额、nonce、事件、区块头一起回滚）。

因此**每次运行结束后自动化链与运行前完全一致**：空投份额不会被耗尽，第二次 `pnpm e2e` 的 `beforeAll` 仍能找到未铸造的快照账户。快照/回滚现在只作用于套件自己的 8555 链，**与人工链无关**；保留它是为了同一环境内的可重复性，而不是为了「保护共享链」。

刻意选择**按文件**而不是按测试回滚：

- 文件内测试共享夹具（例如 `mint-identity.spec.ts` 先铸造、随后用同一收据去 my-nft 断言），按测试回滚会把下一个测试依赖的状态也抹掉；
- 快照/回滚作用于整条链，多个 worker 并发时 A 的回滚会覆盖 B 的写入。所以 `playwright.config.ts` 固定 `workers: 1`、`fullyParallel: false`，同一时刻只有一个文件在改链。

不隔离的东西：浏览器 local storage（每个测试有独立 context）、`docs/product/screenshots/` 里的截图文件、构建产物。截图是幂等覆盖写，不会跨运行累积。

## 中断与脏链

- 正常失败/超时：Playwright 仍会执行 `afterAll`，链会回滚。
- 进程被强杀、8555 anvil 被重启或快照 id 失效：该文件的 `afterAll` 会报 `anvil_revert ... returned false`，链上可能留下该文件的写入。用 `pnpm e2e:reset-chain`（或 `make -C ../anvil stop PORT=8555 && make -C ../anvil bootstrap PORT=8555`）重建自动化链即可。
- **8555 被未知进程占用**：脚本拒绝 attach（没有 `.anvil/8555/anvil.pid` 证明这条链是本仓的），也不会 kill 它；报错会让人先停掉那个进程或改 `E2E_ANVIL_RPC`。
- **人工链（8545）自身重启过**：浏览器钱包缓存的 nonce 会失效，已签名未上链的交易可能永远 pending（2026-11-11 事故的另一半原因）。重启任何 anvil（包括 8545）后，先在钱包里「重置账户活动」/清掉 pending，再重新发交易。
- 手工验证快照可用（只对自动化链）：`cast rpc anvil_snapshot --rpc-url http://127.0.0.1:8555`，再 `cast rpc anvil_revert <id>`。

## 隔离验收记录（2026-11-11）

| 项                           | 命令                                                                          | 结果                                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 第一遍                       | `pnpm e2e`                                                                    | **33 passed (1.3m)**；快照 `0x0`–`0x3` 全在 `http://127.0.0.1:8555`                       |
| 第二遍（同链，无 bootstrap） | `pnpm e2e`                                                                    | **33 passed (1.3m)**；快照 `0x4`–`0x7`（id 未重置 = 链未重启）                            |
| 自愈                         | `make -C ../anvil stop PORT=8555 && pnpm e2e`                                 | 自动 bootstrap 新链（pid 从 38606 变 46275），**33 passed (1.3m)**，快照重新从 `0x0` 开始 |
| 人工链不被触碰               | 两遍运行前后 `cast block-number` / `cast nonce 0x7099…` / `anvil_getAutomine` | 969 → 969、69 → 69、true → true（全程只读查询）；8545 pid 始终 13323                      |
| 8545 硬拒绝                  | `E2E_ANVIL_RPC=http://127.0.0.1:8545 pnpm e2e`                                | 立即 exit 1，`[e2e-chain] REFUSING TO RUN ...`，不发起任何 RPC                            |
| 发布包不泄漏自动化端点       | `unset E2E_ANVIL_RPC; pnpm build`                                             | 产物 grep `8555` = 0 命中（dev 变体构建同理）                                             |

## 产物

失败时 trace 在 `test-results/`；通过的用例会把 390×844 截图写进 `docs/product/screenshots/`（可用作验收证据）。
