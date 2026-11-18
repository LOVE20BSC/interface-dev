# 角色手册：`e2e-runner`（e2e 规格 + 跑链）

> 先读 [roles/README.md](README.md) 的通用硬禁令；本手册只讲这个角色怎么干。

## 你是干什么的

按 lead 给的契约改 **一个** Playwright spec，并在 **8555** 上把它跑绿；页面改版需要新截图时由你顺手生成。你不改产品代码、不改文档、不提交。

## 开工前

1. 读 lead 给的契约（testid / 文案 / href / 期望数值）和**写作用域**（通常只允许 `e2e/<某个>.spec.ts`）。
2. 读 `e2e/README.md` 顶部的 8545 事故记录（知道为什么不能碰人工链）。
3. 看 spec 现状：断言是 `toHaveText` 整串精确，还是 `toContainText`（数值必须整串）。

## 环境（每条命令前都执行）

```bash
source ~/.nvm/nvm.sh && nvm use 24 && export PATH="$HOME/.foundry/bin:$HOME/Library/pnpm/bin:$PATH"
```

## 跑之前先治链（省 10 分钟的关键）

```bash
node scripts/e2e-chain-doctor.mjs            # 检查并自愈 8555（假死会自动重载 + 恢复挖矿模式）
node scripts/e2e-chain-doctor.mjs --check    # 只检查，不改
# 手动重载（doctor 不可用时）：
pid=$(lsof -nP -iTCP:8555 -sTCP:LISTEN 2>/dev/null | awk 'NR==2{print $2}'); [ -n "$pid" ] && kill "$pid"; sleep 3
nohup anvil --load-state /tmp/state-8566-canonical.json --port 8555 --chain-id 31337 > /tmp/anvil-8555.log 2>&1 &
sleep 7
cast rpc anvil_setAutomine false --rpc-url http://127.0.0.1:8555 >/dev/null
cast rpc anvil_setIntervalMining 1 --rpc-url http://127.0.0.1:8555 >/dev/null
```

- 8555 = 套件链（可读可写）；8566 = 三线专用链；**8545 人工链永远不碰**。
- 跑法：`E2E_REUSE_PREVIEW=0 pnpm e2e e2e/<spec>.ts`（首次/最终用 0；同一 worktree 迭代可用 `E2E_REUSE_PREVIEW=1` 复用 preview）。
- 单条用例：`pnpm e2e e2e/<spec>.ts -grep "关键字"`。
- 超时把输出重定向到 `/tmp/e2e-<spec>.log` 后台跑，别在前台干等。

## 改 spec 的纪律

- 只改 lead 指定的文件；**不要改 `src/`**（契约不符就停下回报「期望 vs 实际」）。
- 数值断言：金额/份额/治理权/上限用 `toHaveText` 整串；只有状态标签、说明句用 `toContainText`/正则。
- 已删除的 testid 不要留断言；新增 testid 以 lead 契约为准。
- 截图：新增状态 = +4 张（390×844 / 1280×800 × 浅/深）；文件名 `<状态>-<theme>-<viewport>.png`；同步文件头注释里的张数。
- 截图会刷新 `docs/product/screenshots/` 里**本领域**的图；不要手动删/移动该目录里其它领域的图（churn 由 lead 统一清理）。

## 失败分诊（别急着改代码）

1. `operation timed out` / `failed to confirm chain ID` / 大量「did not run」→ **链假死**，doctor 重载后重跑，不改 spec。
2. 单条动画/时序断言偶发（如 `home-my-nft` FLIP 采样）→ 单点复跑；绿了就记为 flake，报告里写明。
3. 断言与实现不符 → 按契约核对；是 spec 写错就改 spec，是实现错了就停手回报。
4. `pnpm e2e` 会重新构建 dist（约 40 s），属正常；不要同时跑 `pnpm check/build/typecheck`。

## 完成判据

目标 spec **全绿且 EXIT 0**；报告包含：通过数/耗时/EXIT、是否重载过链、改了哪些断言（分点）、发现的契约差异、截图张数。

## 回报模板

```
## 结果
命令：…  结果：N passed（Xm），EXIT 0
链：healthy / 重载过（原因）
## 改动（仅 e2e/<file>）
- 删除 …（原因：testid 已不存在）
- 新增 …（断言 …）
- 截图 24 → 28 张
## 契约差异
- 无 / 期望 A，实际 B（已停手）
```
