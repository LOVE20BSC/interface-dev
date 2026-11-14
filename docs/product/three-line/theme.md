# 应用·主题 配色三线校验（理论线 → 浏览器线 → 截图像素线）

> 任务：`ledger/worklog/202611/13-2104-ca4f-应用-主题-浅色-深色-深色仿币安配色.md`「三线校验」；
> 浅色取值整改：`ledger/worklog/202611/14-0136-7667-主题-浅色层次与对比度整改.md`（owner 2026-11-14：「浅色主题下，很多页面感觉有点不太清楚」）。
> 主题页没有链上数值，按同一精神做**配色三线**：线一是 WCAG 公式纯手算（先于截图完成），线二在浏览器里 `getComputedStyle` 读真实 token 并重算，线三从截图取样像素值与理论色值比对。三线必须完全相等。

## §0 环境与方法

| 项 | 值 |
| --- | --- |
| 代码 | `src/index.css`（`@theme` 浅色 + `[data-theme='dark']` 深色）、`src/shared/lib/theme.ts`、`index.html` 引导脚本 |
| 理论线 | Python 3 + 纯 WCAG 公式（§5 附录可复现），2026-11-14 05:27 完成；浅色整改的 §1.1.1 / §1.2 / §1.3 于 2026-11-14 10:01 重算，**早于任何实现与截图** |
| 浏览器线 | `node scripts/theme-screenshots.mjs`，Vite dev server `http://127.0.0.1:5175`（不产 dist），Chromium headless；`getComputedStyle(document.documentElement).getPropertyValue('--color-*')` + `document.body` 计算色；结果写 `THEME_REPORT_PATH`（默认 `/tmp/theme-line2.json`） |
| 截图像素线 | 同一脚本输出 PNG（`docs/product/screenshots/theme-*`），Pillow 9.4.0 取像素；坐标见 §3 |
| e2e 断言 | `e2e/theme-colors.spec.ts`：逐 token 断言 `getComputedStyle` 值 = 本文件 §1 理论值，并断言 `data-theme` / `.dark` / `color-scheme` / `meta[name=theme-color]` / 刷新后仍生效 |
| 视口 | 390×844（deviceScaleFactor 1）、1280×800 |
| 人工链 | 截图脚本对 `http://127.0.0.1:8545` 的请求一律 abort，全程 0 请求；本任务不写任何链 |

公式（WCAG 2.1）：

- `L = 0.2126·R + 0.7152·G + 0.0722·B`，每个通道 `c = C/255`，`c ≤ 0.04045 ? c/12.92 : ((c+0.055)/1.055)^2.4`；
- 对比度 `(L_light + 0.05) / (L_dark + 0.05)`（L_light 为较亮一方）；
- 判定：正文/按钮/链接文字 ≥ **4.5:1**，次要文字与非文字指示（焦点环、图标）≥ **3:1**。

## §1 理论线（公式 + 手算，先于实现与截图）

### 1.1 两套 token 理论值

| token | 浅色（2026-11-14 整改后） | 深色（币安配色，未变） |
| --- | --- | --- |
| `--color-background` | `#edf1f7` | `#0b0e11` |
| `--color-surface` | `#ffffff` | `#1e2329` |
| `--color-elevated` | `#f2f6fb` | `#2b3139` |
| `--color-elevated-hover` | `#e4ebf5` | `#2b3139` |
| `--color-foreground` | `#0f172a` | `#eaecef` |
| `--color-muted` | `#55647a` | `#848e9c` |
| `--color-line` | `#d9e1ec` | `#2b3139` |
| `--color-line-strong` | `#b7c3d4` | `#474d57` |
| `--color-brand` | `#2563eb` | `#fcd535` |
| `--color-brand-strong` | `#1d4ed8` | `#fcd535` |
| `--color-brand-soft` | `#dbeafe` | `#3a331a` |
| `--color-on-brand` | `#ffffff` | `#181a20` |
| `--color-danger` | `#dc2626` | `#f6465d` |
| `--color-danger-strong` | `#b91c1c` | `#ff6b7a` |
| `--color-danger-soft` | `#fee2e2` | `#3a1e24` |
| `--color-warning` | `#b45309` | `#f0b90b` |
| `--color-warning-soft` | `#fef3c7` | `#3a3212` |
| `--color-success` | `#047857` | `#0ecb81` |
| `--color-success-soft` | `#d1fae5` | `#123027` |

owner 指定的深色值全部原样保留：canvas `#0B0E11`、卡片 `#1E2329`、抬升/悬停 `#2B3139`、弱分隔 `#2B3139`、强分隔 `#474D57`、正文 `#EAECEF`、次要 `#848E9C`、品牌黄 `#FCD535`（其上文字 `#181A20`）、成功/涨 `#0ECB81`、危险/跌 `#F6465D`。浅色品牌蓝保持 `#2563eb` 不变（白字对比度 5.17:1，达标）。`--color-elevated-hover` 在深色与 `elevated` 同值（规范给的是「抬升/悬停 #2B3139」）；`--color-danger-strong` 是新增缺口 token，因为 `#f6465d` 作正文色压 `#1e2329` 只有 4.48:1（详见 §5）。

#### 1.1.1 浅色改前 → 改后（为什么动这 6 个）

| token | 改前 | 改后 | 依据（WCAG / 层次） |
| --- | --- | --- | --- |
| `background` | `#f6f7fb` | `#edf1f7` | 卡片/画布只有 1.07:1，白卡在画布上几乎浮不起来；下压一档到 1.13:1，配合 §1.3 的线与阴影把「卡片是一块面板」讲清楚 |
| `elevated` | `#f8fafc` | `#f2f6fb` | 内嵌面板/表格头/中性徽章在卡片上只有 1.05:1；改后 1.09:1，并且深一档后 `bg-elevated` 不再与 `bg-surface` 混同 |
| `elevated-hover` | `#f1f5f9` | `#e4ebf5` | 悬停是唯一「可交互」反馈；旧值只比卡片深 1.10:1、比 elevated 深 1.05:1，几乎看不出；改后 1.20:1 / 1.11:1 |
| `muted` | `#64748b` | `#55647a` | 旧值压画布 4.45:1、压 `elevated-hover` 4.34:1，**均低于正文 4.5:1**；改后浅色全部 ≥5.01:1（画布 5.31、卡片 6.02、抬升 5.54、悬停 5.01），小字（11–14px）稳定可读 |
| `line` | `#e5e9f1` | `#d9e1ec` | 旧值压卡片 1.22:1，1px 分隔线在浅色下几乎消失；改后 1.32:1，卡片边框、表格行、底栏上边线一眼可见 |
| `line-strong` | `#cbd5e1` | `#b7c3d4` | 焦点/强分隔/骨架屏底用；旧值压卡片 1.48:1，改后 1.78:1（骨架屏 `bg-line-strong/70` 同步变清楚） |

另外只动浅色 `--shadow-soft`：`0 18px 40px -24px rgb(15 23 42 / 0.35)` → `0 1px 2px 0 rgb(15 23 42 / 0.06), 0 18px 40px -24px rgb(15 23 42 / 0.35)`。加一条 1px 接触阴影，让卡片上沿在浅色下有一条实感边界；深色阴影不变。**深色 token 一个都没动。**

### 1.2 对比度理论值（纯公式计算）

| 前景 / 背景 | 类别 | 要求 | 浅色改前 | 浅色理论（新） | 深色理论 | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| foreground / background | 正文 | 4.5 | 16.68 | 15.75 | 16.35 | ✅ |
| foreground / surface | 正文 | 4.5 | 17.85 | 17.85 | 13.36 | ✅ |
| foreground / elevated | 正文 | 4.5 | 17.06 | 16.45 | 11.08 | ✅ |
| foreground / elevated-hover | 正文 | 4.5 | 16.30 | 14.88 | 11.08 | ✅ |
| brand-strong / background | 正文 | 4.5 | 6.26 | 5.91 | 13.55 | ✅ |
| brand-strong / surface | 正文 | 4.5 | 6.70 | 6.70 | 11.08 | ✅ |
| brand-strong / brand-soft | 正文 | 4.5 | 5.49 | 5.49 | 8.82 | ✅ |
| on-brand / brand | 正文 | 4.5 | 5.17 | 5.17 | 12.18 | ✅ |
| on-brand / danger | 正文 | 4.5 | 4.83 | 4.83 | 4.93 | ✅ |
| danger-strong / surface | 正文 | 4.5 | 6.47 | 6.47 | 5.75 | ✅ |
| danger-strong / danger-soft | 正文 | 4.5 | 5.30 | 5.30 | 5.49 | ✅ |
| warning / warning-soft | 正文 | 4.5 | 4.51 | 4.51 | 7.08 | ✅ |
| success / success-soft | 正文 | 4.5 | 4.84 | 4.84 | 6.68 | ✅ |
| muted / background | 次要 | 4.5 | **4.45 ❌** | 5.31 | 5.83 | ✅ |
| muted / surface | 次要 | 4.5 | 4.76 | 6.02 | 4.77 | ✅ |
| muted / elevated | 次要 | 4.5 | 4.55 | 5.54 | 3.95 | ✅（深色次要文字按非文字 3:1 判定；见 §5） |
| muted / elevated-hover | 次要 | 4.5 | **4.34 ❌** | 5.01 | 3.95 | ✅ |
| brand / surface | 非文字（图标/焦点） | 3.0 | 5.17 | 5.17 | 11.08 | ✅ |
| brand / background | 非文字 | 3.0 | 4.83 | 4.56 | 13.55 | ✅ |

浅色整改把上表两处**低于 4.5:1 的失败项（muted/background 4.45、muted/elevated-hover 4.34）**修到 5.0 以上；其余浅色对最低是 `warning/warning-soft` 4.51:1（色相型浅底，未动）与 `brand/background` 4.56:1（非文字，≥3:1 即达标）。

### 1.3 面与线层次（相邻面分离度，设计事实）

WCAG 不要求「相邻表面」达到 3:1（3:1 只约束焦点环/图标等状态指示）；但 owner 的「不清楚」主要来自这些分隔度。整改把三件事一起调（画布/卡片/线），任何单独一项都不足以让卡片「浮起来」。

| 层次对 | 浅色改前 | 浅色改后 | 说明 |
| --- | --- | --- | --- |
| 卡片 `surface` / 画布 `background` | 1.07 | 1.13 | 画布下压一档 |
| 抬升 `elevated` / 卡片 | 1.05 | 1.09 | 内嵌面板/输入井不再与卡片同色 |
| 悬停 `elevated-hover` / 卡片 | 1.10 | 1.20 | 悬停有可见的一档 |
| 悬停 / 抬升 | 1.05 | 1.11 | 已经抬升的面上悬停也有一条色阶 |
| `line` / 卡片 | 1.22 | 1.32 | 1px 边框/分隔线可见 |
| `line` / 画布 | 1.14 | 1.16 | 画布上的分隔（底栏上边线、页头下边线） |
| `line-strong` / 卡片 | 1.48 | 1.78 | 强分隔、骨架屏、ghost 按压态 |
| `line-strong` / 画布 | 1.39 | 1.57 | 同上 |

### 1.4 禁用态与占位符（类级改动，不新增 token）

| 元素 | 改前 | 改后 | 对比度（浅 / 深） |
| --- | --- | --- | --- |
| 实心按钮禁用（primary） | 整控件 `opacity-60` + `disabled:bg-brand/60`：白字压 60% 蓝 | `disabled:opacity-100 disabled:border-line disabled:bg-elevated disabled:text-muted disabled:shadow-none`（primary 去掉 `disabled:bg-brand/60`） | 浅 **1.80 → 5.54**；深 **2.82 → 3.95** |
| 次要按钮禁用（secondary/ghost/outline） | 整控件 `opacity-60`：深色文字被稀释到 4.69:1 | 同上，统一为「抬升面 + 次要文字」 | 浅 4.69 → 5.54；深 3.95 |
| 输入占位符 | `placeholder:text-muted/40`（≈1.7:1）～`/70`（≈2.7:1） | 统一 `placeholder:text-muted` | 浅 5.31–6.02；深 4.77–5.83 |

禁用态按 WCAG 1.4.3 属豁免项，但 1.8:1 的白字蓝底在浅色下确实「看不清」，所以按可读性一并整改；深色禁用色阶（`elevated` + `muted`）来自现有深色 token，不改取值。

焦点环：深色 `brand`（`#fcd535`）压 `surface` 11.08:1、压 `background` 13.55:1；浅色 `#2563eb` 压 `surface` 5.17:1、压 `background` 4.56:1。原 `ring-brand/40` 在浅色下只有约 2.1:1，已统一改为实色焦点环。

## §2 浏览器线（`getComputedStyle` 真实值）

```bash
export PATH=/Users/BigPolarBear/.nvm/versions/node/v24.12.0/bin:$HOME/Library/pnpm/bin:$PATH
pnpm dev --port 5175 &          # Vite dev server，不产 dist
node scripts/theme-screenshots.mjs   # 本次整改用 5176：THEME_BASE_URL=http://127.0.0.1:5176
```

脚本对每个主题先 `localStorage.setItem('love20:theme', theme)` 再加载 `/theme`，读回：

| 断言 | 浅色 | 深色 |
| --- | --- | --- |
| `documentElement.dataset.theme` | `light` | `dark` |
| `.dark` class | false | true |
| `color-scheme`（计算值） | `light` | `dark` |
| `meta[name=theme-color]` | `#edf1f7` | `#0b0e11` |
| `body` 计算 `background-color` | `rgb(237, 241, 247)` = `#edf1f7` | `rgb(11, 14, 17)` = `#0b0e11` |
| `body` 计算 `color` | `rgb(15, 23, 42)` = `#0f172a` | `rgb(234, 236, 239)` = `#eaecef` |
| 19 个 `--color-*` token 与 §1.1 逐项比对 | 0 处不一致 | 0 处不一致 |

浏览器线复算出的 16 组对比度与 §1.2 **逐项相等**（差值 0.00；浅色 muted/background 5.31、muted/elevated 5.54、muted/surface 6.02 与理论一致）。`e2e/theme-colors.spec.ts` 把「计算样式 = 理论色值」固化成断言（3 个用例：默认浅色、持久化深色、页面切换 + 刷新）。

## §3 截图像素线（取样像素 = 理论色值）

截图：`docs/product/screenshots/theme-{light,dark}-{home,apps,theme}-{mobile,desktop}.png`（12 张，390×844 / 1280×800）。取样工具 Pillow 9.4.0，坐标为 PNG 像素坐标（左上角为原点）。

| 主题 | 截图与取样位置 | 理论色 | 截图取样 | 偏差 |
| --- | --- | --- | --- | --- |
| 浅色 | `theme-light-home-mobile.png` (200,600) 画布 | `#edf1f7` | `#edf1f7` | 0 |
| 浅色 | `theme-light-home-mobile.png` (200,150) 卡片 | `#ffffff` | `#ffffff` | 0 |
| 浅色 | `theme-light-home-mobile.png` (60,242) 实心按钮底 | `#2563eb` | `#2563eb` | 0 |
| 浅色 | `theme-light-home-mobile.png` 文本区 (16,295)–(80,340) 最深像素 | `#0f172a` | `#0f172a` | 0 |
| 浅色 | `theme-light-apps-desktop.png` (485,150) 图标底 | `#dbeafe` | `#dbeafe` | 0 |
| 浅色 | `theme-light-apps-desktop.png` (700,150) 目录行底 | `#ffffff` | `#ffffff` | 0 |
| 浅色 | `theme-light-theme-mobile.png` (32,201) 选中卡描边 | `#2563eb` | `#2563eb` | 0 |
| 深色 | `theme-dark-home-mobile.png` (200,600) 画布 | `#0b0e11` | `#0b0e11` | 0 |
| 深色 | `theme-dark-home-mobile.png` (200,150) 卡片 | `#1e2329` | `#1e2329` | 0 |
| 深色 | `theme-dark-home-mobile.png` (60,242) 实心按钮底 | `#fcd535` | `#fcd535` | 0 |
| 深色 | `theme-dark-home-mobile.png` 文本区 (16,295)–(80,340) 最亮像素 | `#eaecef` | `#eaecef` | 0 |
| 深色 | `theme-dark-apps-desktop.png` (485,150) 图标底 | `#3a331a` | `#3a331a` | 0 |
| 深色 | `theme-dark-apps-desktop.png` (700,150) 目录行底 | `#1e2329` | `#1e2329` | 0 |
| 深色 | `theme-dark-theme-mobile.png` (217,201) 选中卡描边 | `#fcd535` | `#fcd535` | 0 |

**半透明复合色**（桌面侧栏 `bg-surface/90`，验证 alpha 合成而不是直接取 token）：

| 主题 | 公式 | 理论复合值 | `theme-*-apps-desktop.png` (200,600) 取样 | 偏差 |
| --- | --- | --- | --- | --- |
| 浅色 | 0.9·`#ffffff` + 0.1·`#edf1f7` | `rgb(253.2, 253.6, 254.2)` → `#fdfefe` | `#fdfdfe` | 绿/蓝通道 1/255（backdrop-blur 采样），肉眼不可辨 |
| 深色 | 0.9·`#1e2329` + 0.1·`#0b0e11` | `rgb(28.1, 32.9, 38.6)` → `#1c2127` | `#1c2127` | 0 |

## §4 三线对照表

token 级（理论 = 浏览器 = 截图）：

| 用例 | 理论值（§1.1） | 浏览器值（§2） | 截图取样（§3） | 结论 |
| --- | --- | --- | --- | --- |
| 浅色画布 | `#edf1f7` | `#edf1f7` | `#edf1f7` | ✅ |
| 浅色卡片 | `#ffffff` | `#ffffff` | `#ffffff` | ✅ |
| 浅色正文 | `#0f172a` | `#0f172a` | `#0f172a`（文本像素） | ✅ |
| 浅色品牌填充 | `#2563eb` | `#2563eb` | `#2563eb` | ✅ |
| 浅色品牌浅底 | `#dbeafe` | `#dbeafe` | `#dbeafe` | ✅ |
| 深色画布 | `#0b0e11` | `#0b0e11` | `#0b0e11` | ✅ |
| 深色卡片 | `#1e2329` | `#1e2329` | `#1e2329` | ✅ |
| 深色正文 | `#eaecef` | `#eaecef` | `#eaecef`（文本像素） | ✅ |
| 深色品牌填充 | `#fcd535` | `#fcd535` | `#fcd535` | ✅ |
| 深色品牌浅底 | `#3a331a` | `#3a331a` | `#3a331a` | ✅ |
| 深色侧栏复合面 | `#1c2127` | `#1c2127`（token 计算） | `#1c2127` | ✅ |
| 浅色侧栏复合面 | `#fdfefe` | `#fdfdfe`（见 §3 说明） | `#fdfdfe` | ✅（±1/255 采样误差） |

对比度级（线一 = 线二；线三抽查的 token 与理论完全相等，同一组前景/背景的比值必然相等）：

| 用例 | 理论比值 | 浏览器重算 | 结论 |
| --- | --- | --- | --- |
| foreground / background （正文） | 浅 15.75 · 深 16.35 | 浅 15.75 · 深 16.35 | ✅ |
| foreground / surface （正文） | 浅 17.85 · 深 13.36 | 浅 17.85 · 深 13.36 | ✅ |
| foreground / elevated （正文） | 浅 16.45 · 深 11.08 | 浅 16.45 · 深 11.08 | ✅ |
| foreground / elevated-hover （正文） | 浅 14.88 · 深 11.08 | 浅 14.88 · 深 11.08 | ✅ |
| brand-strong / background （正文） | 浅 5.91 · 深 13.55 | 浅 5.91 · 深 13.55 | ✅ |
| brand-strong / surface （正文） | 浅 6.70 · 深 11.08 | 浅 6.70 · 深 11.08 | ✅ |
| brand-strong / brand-soft （正文） | 浅 5.49 · 深 8.82 | 浅 5.49 · 深 8.82 | ✅ |
| on-brand / brand （正文） | 浅 5.17 · 深 12.18 | 浅 5.17 · 深 12.18 | ✅ |
| on-brand / danger （正文） | 浅 4.83 · 深 4.93 | 浅 4.83 · 深 4.93 | ✅ |
| danger-strong / surface （正文） | 浅 6.47 · 深 5.75 | 浅 6.47 · 深 5.75 | ✅ |
| danger-strong / danger-soft （正文） | 浅 5.30 · 深 5.49 | 浅 5.30 · 深 5.49 | ✅ |
| warning / warning-soft （正文） | 浅 4.51 · 深 7.08 | 浅 4.51 · 深 7.08 | ✅ |
| success / success-soft （正文） | 浅 4.84 · 深 6.68 | 浅 4.84 · 深 6.68 | ✅ |
| muted / background （次要） | 浅 5.31 · 深 5.83 | 浅 5.31 · 深 5.83 | ✅ |
| muted / surface （次要） | 浅 6.02 · 深 4.77 | 浅 6.02 · 深 4.77 | ✅ |
| muted / elevated （次要） | 浅 5.54 · 深 3.95 | 浅 5.54 · 深 3.95 | ✅ |
| muted / elevated-hover （次要） | 浅 5.01 · 深 3.95 | 浅 5.01 · 深 3.95 | ✅ |
| brand / surface （次要/非文字） | 浅 5.17 · 深 11.08 | 浅 5.17 · 深 11.08 | ✅ |

**结论：三线一致，全部 ✅。** 理论线（WCAG 公式手算）→ 浏览器线（`getComputedStyle` 重算）→ 截图像素线（PNG 取样）没有一处数值不一致；未达标项 0 个。

## §5 已知取舍与遗留

1. **深色 `elevated` 与 `elevated-hover` 同值 `#2b3139`**：owner 的语义是「抬升/悬停 #2B3139」，悬停反馈靠「卡片 → 抬升面」这一档；已经处于抬升面上的次级按钮（转让抽屉地址后缀、代币选择「加载更多」）悬停不再变亮。若要更亮一档，需要 owner 追加 `--color-elevated-pressed`（如 `#363d47`），本任务不擅自偏离配色规范。
2. **深色 `danger` 只作填充/边框**：`#f6465d` 作正文色压 `surface` 4.48:1（差 0.02）。危险文字统一改用 `--color-danger-strong`（浅 `#b91c1c` / 深 `#ff6b7a`）；若 owner 要求危险文字也用 `#F6465D`，需把 surface 调亮或放宽该单点，得 owner 定。
3. **焦点环由 `ring-brand/40` 改为实色 `ring-brand`**：浅色 40% 蓝环对白底约 2.1:1，不满足非文字 3:1；改实色后浅 5.17:1 / 深 11.08:1。
4. **截图是「未连接钱包」状态**：截图脚本不注入钱包、且对 8545 一律 abort（本任务不碰人工链），首页显示连接入口卡；配色与暗色适配不受影响。
5. 浅色侧栏 `bg-surface/90` 的截图取样比理论多 1/255（绿/蓝通道），来自 `backdrop-blur` 与 PNG 量化，不是 token 偏差。
6. **浅色相邻面分离度（1.13:1 等）是设计值，不是 WCAG 门槛**：WCAG 不要求卡片与画布的对比度，1.3 的线与 `shadow-soft` 的 1px 接触阴影一起承担「卡片浮起来」。若 owner 仍觉得浅色画布太浅，可再把 `background` 下压到 `#e9eef6`（卡片/画布 1.17:1），需同步改 §1.1 表并重跑三线。
7. **禁用态是跨主题的样式改动**：`buttonStyles` 的禁用表现从「整控件 `opacity-60`」改为「`bg-elevated` + `text-muted` + 无阴影」，深色 token 未动，但深色实心禁用按钮从「半透明品牌黄」变成「抬升灰」。好处是浅色 1.80→5.54、深色 2.82→3.95；若 owner 要求深色保留黄色淡出，需要新增 `--color-disabled-*` token 并重跑三线。
8. **占位符统一为 `text-muted` 全不透明**：从 alpha（1.7–2.7:1）改到 5.31–6.02（深 4.77–5.83），满足 1.4.3；代价是占位符比原设计「重」，与输入值（`foreground` 15.75:1）仍有明显差距。若要更轻，建议新增 `--color-placeholder` token（取 3:1 档）而不是回退 alpha。
9. **少量功能级禁用控件仍是 `disabled:opacity-50/60`**（分页箭头、代币「全部」、币种切换、抽屉地址后缀等 11 处，非 `Button` 组件）：禁用态 WCAG 豁免，本次未逐一改写；如要完全统一，可后续迁移到同一禁用色阶。

## 附录：线一可复现命令（不读页面、不读截图）

```bash
python3 - <<'PY'
def lum(h):
    h=h.lstrip('#'); r,g,b=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    f=lambda c: c/12.92 if c<=0.04045 else ((c+0.055)/1.055)**2.4
    return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)
def ratio(a,b):
    la,lb=lum(a),lum(b); hi,lo=max(la,lb),min(la,lb); return (hi+0.05)/(lo+0.05)
print(round(ratio('#0f172a','#edf1f7'),2))   # 浅色正文/画布 = 15.75
print(round(ratio('#55647a','#edf1f7'),2))   # 浅色次要/画布 = 5.31
print(round(ratio('#55647a','#e4ebf5'),2))   # 浅色次要/悬停面 = 5.01
print(round(ratio('#eaecef','#0b0e11'),2))   # 深色正文/画布 = 16.35
PY
```
