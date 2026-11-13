# ADR-0005：语义颜色 token 与浅色 / 深色主题

- 状态：已接受（2026-11-14）
- 关联任务：`ledger/worklog/202611/13-2104-ca4f-应用-主题-浅色-深色-深色仿币安配色.md`
- 关联文档：[m0-ux-spec](../product/m0-ux-spec.md) §3.9、[配色三线校验](../product/three-line/theme.md)

## 背景

到 2026-11-13，本仓只有浅色一套颜色，且颜色散落在两处：`src/index.css` 的 `@theme`（约 14 个语义 token）和组件里的硬编码 Tailwind 色类（49 处 `bg-slate-50` / `text-white` / `bg-slate-950/45` / `from-brand-strong to-indigo-600` 等）。owner 要求新增「主题」应用：浅色 / 深色两套，深色采用币安风格配色。硬编码色类在深色下会直接穿帮，且没有「品牌色上的文字」token（浅色品牌蓝上要白字，深色品牌黄上必须是深色字）。

## 决策

### 1. 颜色只经语义 token 表达

`src/index.css` 的 `@theme` 定义浅色默认值，`[data-theme='dark']` 覆盖为深色值；组件只用 token 派生的 Tailwind 类（`bg-surface`、`text-muted`、`border-line`…）。**禁止**在 `src/` 里出现 `slate/white/black/indigo/red` 等调色板类或 `#rrggbb` 字面量（主题页的两张「配色小样」除外：它必须同时展示两套调色板，颜色是纯数据，位于 `shared/lib/theme.ts` 的 `THEMES[].preview`）。

新增/补齐的 token：

| token | 用途 | 浅色 | 深色 |
| --- | --- | --- | --- |
| `background` | 画布 | `#f6f7fb` | `#0b0e11` |
| `surface` | 卡片/弹层 | `#ffffff` | `#1e2329` |
| `elevated` / `elevated-hover` | 内嵌面板 / 悬停 | `#f8fafc` / `#f1f5f9` | `#2b3139` / `#2b3139` |
| `foreground` / `muted` | 正文 / 次要 | `#0f172a` / `#64748b` | `#eaecef` / `#848e9c` |
| `line` / `line-strong` | 弱 / 强分隔 | `#e5e9f1` / `#cbd5e1` | `#2b3139` / `#474d57` |
| `brand` / `brand-strong` / `brand-soft` | 品牌填充 / 文字 / 浅底 | `#2563eb` / `#1d4ed8` / `#dbeafe` | `#fcd535` / `#fcd535` / `#3a331a` |
| `on-brand` | 品牌/危险填充上的文字 | `#ffffff` | `#181a20` |
| `danger` / `danger-strong` / `danger-soft` | 危险填充 / 文字 / 浅底 | `#dc2626` / `#b91c1c` / `#fee2e2` | `#f6465d` / `#ff6b7a` / `#3a1e24` |
| `warning` / `warning-soft` | 警示 | `#b45309` / `#fef3c7` | `#f0b90b` / `#3a3212` |
| `success` / `success-soft` | 成功/涨 | `#047857` / `#d1fae5` | `#0ecb81` / `#123027` |
| `overlay` | sheet/弹层遮罩 | `rgb(15 23 42 / .45)` | `rgb(0 0 0 / .62)` |

`danger-strong` 是必要缺口：`#f6465d` 作正文色压 `surface` 只有 4.48:1（差 0.02），所以危险**文字**统一用 `#ff6b7a`（5.75:1），`danger` 只作填充/边框。浅色主题的品牌蓝不变。

### 2. 主题状态三处同步 + 首帧前应用

根元素同时写 `data-theme="light|dark"`、`.dark`（深色）、`style.colorScheme`；`<meta name="theme-color">` 跟随画布色。选择持久化在 **`love20:theme`**（全局、不按链/钱包命名空间；经 `shared/lib/cache.ts` 的 `readPreference`/`writePreference`，它是唯一允许碰 localStorage 的模块）。`index.html` 的内联引导脚本在样式与 React 之前读同一键并应用，避免刷新时白闪/浅色闪。默认浅色；非法值回落浅色；localStorage 抛错时当前页仍生效。

不做「跟随系统」（owner 2026-11-14），与旧库 TKM 一致；要做得 owner 另定。

### 3. 顺序与数量

主题只有两套显式调色板；「主题」是独立页面（`/theme`，应用目录「设置」分类，`requires: null`），不放进钱包弹层或页头。新增主题页只加一条目录数据 + 一个路由，不改导航代码（沿用 §3.6 的目录模型）。

## 后果

- 深色下所有页面复用同一组 token，逐页只需核对、不需要第二套类名；`e2e/theme-colors.spec.ts` 把「计算样式 = 理论色值」固化为断言。
- 对比度以下限写死：正文/按钮文字 ≥4.5:1、次要文字与非文字指示 ≥3:1，三线校验见 [three-line/theme.md](../product/three-line/theme.md)。
- 代价：深色 `elevated` 与 `elevated-hover` 同值（规范值），已抬升面上的次级按钮悬停无颜色变化；如需更亮一档要新增 `elevated-pressed` 并重跑配色三线。
- 代价：主题页两张小样的颜色是 TS 数据里的字面量，不受「禁止硬编码色」约束，但新增第三套配色必须同时改 `THEMES`、CSS 与三线文档。
