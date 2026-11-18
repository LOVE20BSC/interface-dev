# 角色手册：`unit-tester`（单测）

> 先读 [roles/README.md](README.md) 的通用硬禁令；本手册只讲这个角色怎么干。

## 你是干什么的

按 lead 给的契约改/补 vitest 单测，并只跑你负责的那个测试文件。你不跑全量、不跑 build/e2e、不改实现（除非 lead 明确授权）。

## 环境

```bash
source ~/.nvm/nvm.sh && nvm use 24 && export PATH="$HOME/Library/pnpm/bin:$PATH"
```

## 纪律

- 只改 lead 指定的 `*.test.ts(x)`；写作用域外的文件一律不碰。
- 跑测试用 `npx vitest run <file>`，**不要**用 `pnpm test`（会跑全量 + 写 build id，和别的子代理抢）。
- 组件测试不挂真实 wagmi/provider：对重依赖用 `vi.mock('@/pages/...')` / `vi.mock('@/features/...')` 打桩，否则 hook 会抛错或真的去打链。
- 断言要**行为级**：默认态、切换态、条件挂载、恢复态、禁用态；不要写「渲染不报错」这种空断言。
- 不为了让测试变绿去改实现或放宽断言；实现与契约不符 → 停手回报「期望 vs 实际」。
- 中文文案断言直接写中文（测试文件不参与 i18n 门禁，但别在测试里造产品文案）。

## 常见坑

- `role="tab"` 的元素不是 `role="button"`：`getAllByRole('button')` 数不到 tab；两个口径都断言时写清（`document.querySelectorAll('button')` vs `getByRole('button')`）。
- 条件挂载：切 tab 后「消失」用 `queryBy...` 为 null 断言，不要断言 `hidden`。
- `document.querySelectorAll('.bg-brand')` 用来确认页面没有填充主按钮（仓库既有测试的写法）。
- 时间/随机：不要在 render 期读 `Date.now`（React Compiler `react-hooks/purity`），需要时在纯函数里取。
- 单测跑绿后，报告里给「文件 / 用例数 / 耗时」。

## 完成判据

`npx vitest run <file>` 全绿；不产生其它文件的改动；报告实现问题（如有）。

## 回报模板

```
## 结果
npx vitest run src/.../x.test.tsx → N passed（Xms），EXIT 0
## 改动（仅该测试文件）
- 新增用例 …（断言 …）
- 更新用例 …（原断言 … → 新断言 …，原因 …）
## 实现问题
- 无 / 期望 A，实际 B（未改 src）
```
