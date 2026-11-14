# 20261114-1335-0538-anvil-钉版-siblings-lock-make-bootstrap-pi: anvil·钉版 siblings.lock + make bootstrap PINNED=1（默认仍用软链）

- **Tags**: anvil, 钉版, 并行开发
- **Status**: doing · 2026-11-14 13:36:18 · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d
- **Created**: 2026-11-14 13:35:34 · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d

<!-- Header lines are maintained by the script, fixed order: Tags → Status → Created → Sealed.
     The `- **Tags**: …` line is inserted at the top by new --tags; omitted when there are no tags
     (category goes to the ledger and history only, never into this document).
     The `- **Sealed**: …` line is appended on close. -->

## Background

owner 2026-11-14 21:34 选方案 A：**给 anvil 加「钉版 siblings」机制**，默认仍用现有 `.siblings/` 软链（本地联调不变），需要时可 `make bootstrap PINNED=1` 用固定提交的只读 worktree 构建链。

动机（今天真实发生）：owner 在 `../core` 改 `IStake.stakeLiquidity`（加 deadline）、`../periphery`/`../anvil` 仍是旧调用 → 所有端口的 `make bootstrap` 编译失败，全部 e2e/真链验证停摆。钉版后：owner 改 core 不再打断我们，只有我们主动 bump 才暴露破坏；同时可用于 CI 复现。

已知可用基线（`../interface-dev-dsh/src/config/abis/manifest.json` 的 `sources.*.head`，即上次成功导出时的各仓提交）：
```
core       8d604a25406ba9abd2e2c7f8815cfe526d650ca0
action     66e2d65697581f78b40eb6959e03ebf621a0c18f
group-chat 45f196648d69848b327122ac57c1528de5c4fa47
libs       65b11063133e96a54cf028aa0268c292f0d2abda
dex        31464c0b455b33ff2201490ae5b042bcb4a5bd28
periphery  3b825a522d4ebca3cf31e1e377d420ca9cf6c575
tools      44d7f542452713a63b9865b58d4866bfd7c8c804
```
（anvil 自身不在钉版范围内。）

关键既有事实：
- anvil 用 `.siblings/<repo>` 相对软链 + `remappings.txt`；foundry.toml `allow_paths` 含 `.siblings`；历史上有「临时 pin core@48cfd49 走 `FOUNDRY_REMAPPINGS` + git worktree」的先例，说明这条机制可行。
- `../core/lib/{libs,openzeppelin-contracts,forge-std}` 是**真子模块**且本地已 checkout；`../dex/build/` 是 gitignored 产物（anvil 读它的 Factory/Router creation bytecode）；`../periphery`、`../tools` 是本轮新接的兄弟仓。
- 钉版 worktree 若走 `git worktree add`，其 `lib/` 子模块目录会为空 → 需要「校验 pinned SHA 的 `lib` gitlink 与当前 checkout 的 gitlink 完全一致后，用 `cp -al ../core/lib .../lib` 硬链复制」；不一致就失败并提示手工 `git submodule update --init --recursive`（不要静默用错版本）。

通用纪律：只改 `../anvil`；不碰 8545（验证用 `PORT=8580`，用完 stop）；不 `git reset/checkout/stash/clean`；`../anvil` 仓中文 commit；前端仓只提交台账/文档。

## To Do

1. **新增 `../anvil/siblings.lock`**（JSON，含 `comment` 说明生成方式）：记录上面 7 个仓的 `url` 与 `sha`。默认值取 manifest 的已知可用基线；文件头注释写明「bump 方法 = 在 `PINNED=0` 下 clean bootstrap 成功后，用 `make pin-lock` 重新生成」。
2. **新增脚本 `../anvil/script/pin-siblings.sh`**（能被 Makefile 调用）：
   - `pin`：对 lock 里每个仓 `git -C ../<repo> worktree add --detach .siblings-pinned/<repo> <sha>`（已存在且 HEAD 相同则跳过）；对含 `lib` 的仓校验 pinned SHA 的 `lib` gitlink 与当前 checkout 一致后用 `cp -al` 复制；`dex` 额外 `cp -al ../dex/build .siblings-pinned/dex/build`；`periphery`/`tools` 若也有 lib 同理。
   - `status`：打印每个仓 live HEAD / pinned SHA / 是否已 pin / 是否一致。
   - `clean`：`git worktree remove --force` 并清理 `.siblings-pinned/`。
   - 幂等、可重复执行；失败信息必须可执行（指出哪个仓、缺什么、下一条命令）。
3. **Makefile + `script/local.sh`**：
   - `make pin` / `make pin-status` / `make unpin` 目标；
   - `make bootstrap PINNED=1`：先确保 pin 存在（否则提示 `make pin`），然后 `export FOUNDRY_REMAPPINGS="<所有 remappings 指向 .siblings-pinned/*>"`；`PINNED=0`（默认）行为完全不变；
   - `foundry.toml` 的 `allow_paths` 增加 `.siblings-pinned`（和必要时 `../dex/build` 已有）；`.gitignore` 忽略 `.siblings-pinned/`。
4. **一致性证明（关键）**：`make bootstrap PINNED=1 PORT=8580` **在 owner 当前正在改的 core 之上**跑通（证明与 live 树解耦），且导出 `export/deployments/anvil31337_dev.json` 与本仓已提交版本**逐字节相同/逐键相同**；再跑第二次确认确定性。
5. **文档**：`../anvil/README.md` 新增「Pinned siblings」小节（何时用、命令、与软链的区别、bump 流程、`git worktree` 目录位置）；前端 `docs/STATUS.md` §3.3 补一句 pin 用法。
6. **交付报告**：`make pin` 与 `make pin-status` 输出、PINNED=1 bootstrap 日志摘要、导出哈希、PINNED=0 默认路径未受影响的证据（例如 `git diff --stat` 与一次默认 bootstrap 或 `make preflight` 通过）。

## Next

先读 `../anvil/{Makefile,script/local.sh,remappings.txt,foundry.toml,README.md}` 与 `.siblings/` 现状，确认 `FOUNDRY_REMAPPINGS` 与 `allow_paths` 的接线点；再读 `../core/lib` 的子模块形态与 `../dex/build` 的产物要求，然后写 `siblings.lock` + 脚本 + Makefile 分支。

## Process

<!-- Pitfalls and evidence: with revision + file:line or symbol names -->

## Conclusion

<!-- What got done, what got left behind -->

## Execution Log

<!-- Maintained by the script: appended by new / claim / set / release / log / close. Do not edit.
     Backfill with: progress log --id 20261114-1335-0538-anvil-钉版-siblings-lock-make-bootstrap-pi --note "...". -->
- 2026-11-14 13:35:34 · new · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d · created
- 2026-11-14 13:36:18 · claim · @tester · 47d39b07-9d74-4077-8a12-8ab9280ea25d · claimed → doing
