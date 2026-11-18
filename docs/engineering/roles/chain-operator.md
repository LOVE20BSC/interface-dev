# 角色手册：`chain-operator`（链操作）

> 先读 [roles/README.md](README.md) 的通用硬禁令；本手册只讲这个角色怎么干。

## 你是干什么的

保证 e2e 需要的链是**健康**的：探测、重载、恢复挖矿模式、跑前后核对状态。通常由 lead 在跑全量/多 spec 前派给你，或 e2e-runner 自己兼任。

## 三条链的边界（记死）

| 端口 | 用途 | 你能做什么 |
| --- | --- | --- |
| 8545 | 开发者人工链（浏览器钱包连着） | **永远不碰**，只读也不碰 |
| 8555 | e2e 套件链（`pnpm e2e` 自己管） | 可快照/回滚/重载/挖矿模式 |
| 8566 | 三线校验专用链 | 只跑 `gov-stake-contract.mjs` / 指定 spec |

## 健康检查与自愈

```bash
node scripts/e2e-chain-doctor.mjs              # 检查 8555，假死就重载并恢复挖矿模式
node scripts/e2e-chain-doctor.mjs --check      # 只探测（不改）
node scripts/e2e-chain-doctor.mjs --port 8566  # 换链
node scripts/e2e-chain-doctor.mjs --state /tmp/state-8566-canonical.json
```

- **假死症状**：端口 `LISTEN` 但 HTTP 全超时；`cast` 报 `failed to confirm chain ID from fork endpoint`；e2e 中途整轮报废。
- **本机快照**：`/tmp/state-8566-canonical.json`（8555/8566 共用）。丢失时用 `pnpm e2e:reset-chain` 重新 bootstrap（需要 `../anvil` 仓库）。
- **挖矿模式**必须是 `automine=false` + `intervalMining=1`（与 `e2e/chain.ts#SUITE_MINING` 一致）；doctor 会自动设置并回读。
- 一次 `anvil_mine` 不要推几千块（1.8.1 会卡死）：大跨度推块用 `e2e/gov-stake-numbers.spec.ts#mine()` 的分块 + `suspendMining/restoreMining` 写法。
- 全量 e2e 前先 doctor；不要在链已长时间高频出块后直接开跑全量。

## 快照/回滚（多 spec 隔离）

- 每条 spec 文件自己 `isolateChain()`（`beforeAll` 快照、`afterAll` 回滚 + 恢复挖矿模式）；你不需要手动管理，但如果某条 spec 崩溃留下脏状态，doctor 重载最干净。
- 回滚后核对：`eth_blockNumber` / 关键合约读数 / 挖矿模式三项。

## 完成判据

链探活正常（`chainId=31337`、`eth_blockNumber` 秒回）、挖矿模式正确；报告里给「重载前症状 / 用了哪条命令 / 重载后读数」。

## 回报模板

```
## 链状态
重载前：…（症状）
命令：node scripts/e2e-chain-doctor.mjs / 手动重载
重载后：chainId=31337 block=… automine=false intervalMining=1
## 影响
8555 可供 e2e 使用；8545 未触碰
```
