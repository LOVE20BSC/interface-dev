# 团队角色手册（子代理专用）

> **给谁看**：lead 派活时创建的每一个子代理。开工前先读你被指派的角色手册，再读 lead 在任务里给的契约。
> **为什么要角色手册**：同一个仓库里，不同角色的「能改什么、不能改什么、跑什么命令、怎么回报」完全不同。写进手册，lead 只需在 spawn prompt 里贴一条路径 + 本轮契约，不用每次重复注意事项。
> **上位文档**：[agent-role.md](../agent-role.md)（lead 角色）、[lead-playbook.md](../lead-playbook.md)（lead 经验）、[AGENTS.md](../../../AGENTS.md)（硬规则）、[frontend-standards.md](../frontend-standards.md)（规范正文）。

## 角色一览

| 角色 | 手册 | 负责 | 写作用域（默认） | 典型触发 |
| --- | --- | --- | --- | --- |
| `e2e-runner` | [e2e-runner.md](e2e-runner.md) | 改 Playwright spec、跑目标链、出截图 | 指定的 `e2e/*.spec.ts` | 页面/交互改了 |
| `unit-tester` | [unit-tester.md](unit-tester.md) | 改/补 vitest 单测并单跑 | 指定的 `*.test.ts(x)` | 组件/纯函数改了 |
| `docs-writer` | [docs-writer.md](docs-writer.md) | 同步 UX spec / 三线 / STATUS | 指定的 2–4 份 md | 行为或口径变了 |
| `chain-operator` | [chain-operator.md](chain-operator.md) | 8555/8566 链健康、快照、重载 | 无源码（只跑命令） | 链假死/全量前 |
| `reviewer` | [reviewer.md](reviewer.md) | 只读复核 diff/契约/数值 | 无（只读） | 提交前把关 |

## lead 派活的最小契约（每次都必须给）

1. **角色手册路径** + 「开工先读」；
2. **本轮契约**：要改的 testid / 文案 / href / 数据来源 / 断言期望值；
3. **写作用域**：允许改的文件（精确路径或目录）+ 明确「不许碰 `src/`」或「不许碰 `e2e/`」；
4. **验证命令**：跑哪条、什么算通过（通过数 + EXIT + 耗时上限）；
5. **回报格式**：改了哪些断言/段落（分点）+ 命令输出摘要 + 契约不符项。

## 全员通用的硬禁令（每个角色手册都会重复）

- 不 `git commit` / `git push`（合并与提交只由 lead 做）；
- 不碰 **8545** 人工链；自动化只用 8555/8566；
- 不新增依赖、不改 `package.json`、不改 CI；
- 不同时跑会写 `src/config/build-id.generated.ts` 的命令（`pnpm typecheck/test/build/e2e` 都会写）；
- 不为了让测试变绿去改断言/放宽断言，发现实现与契约不符就停下回报；
- 不把未知值渲染成 `0`、不在组件里写中文（中文只进 `copy.ts` / `copy-pages.ts`）。
