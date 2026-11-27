import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { copy } from '@/shared/config/copy';

/**
 * 一条路由 = 一行登记（C5 收口，2026-11-26）。
 *
 * 在此之前，同一个页面的事实散在三处：`app-router.tsx` 的 `<Route>` 列表、
 * `lazy-routes.ts` 的 loader 常量 + `ROUTE_LOADERS` 预取表（同一批 loader 登记两次）、
 * `navigation.ts` 的 `PAGE_TITLES`。新增一个页面要同步 3 个文件，漏一处就会出现
 * 「有路由没标题」或「能进入但不会预取」。
 *
 * 现在这里拥有三件事：path、chunk loader、页面标题。`app-router` 只负责把
 * `PAGE_ROUTES` 渲染成 `<Route>`，`navigation` 只负责按 path 查标题。
 *
 * ADR-0001 §3 的硬约束不变：**只有 shell + 首页在 eager 图**，本表只放 loader
 * 函数（`import()`），页面模块仍各自成 chunk；这张表本身是数据，不进任何页面代码。
 */

interface PageSpec {
  /** 路由路径，以 `/` 开头；`app-router` 负责去掉前导 `/`。 */
  readonly path: string;
  /** 页头 `<h1>` 与浏览器标签标题。 */
  readonly title: string;
  /** 动态 import；必须只返回 chunk，不引入页面模块的静态依赖。 */
  readonly load: () => Promise<Record<string, ComponentType>>;
  /** 页面模块的具名导出名。 */
  readonly exportName: string;
}

export interface PageRoute {
  readonly path: string;
  readonly title: string;
  readonly load: () => Promise<Record<string, ComponentType>>;
  readonly Page: LazyExoticComponent<ComponentType>;
}

/**
 * 登记表本体。导出给守卫测试：只有拿到 `exportName` 才能真去 `load()` 那个 chunk、
 * 断言模块里确实有这个名字。`Page` 只是 `lazy()` 壳，truthy 不代表导出名拼对了
 * ——拼错会在首次导航时白屏（`toRoute` 里的运行时检查只在真正加载时触发）。
 */
export const PAGE_SPECS: readonly PageSpec[] = [
  {
    path: '/my-nft',
    title: copy.pageTitles.myNft,
    load: () => import('@/pages/my-nft/my-nft-page'),
    exportName: 'MyNftPage',
  },
  {
    path: '/mint',
    title: copy.pageTitles.mint,
    load: () => import('@/pages/mint/mint-page'),
    exportName: 'MintPage',
  },
  {
    path: '/airdrop',
    title: copy.pageTitles.airdrop,
    load: () => import('@/pages/airdrop/airdrop-page'),
    exportName: 'AirdropPage',
  },
  {
    path: '/swap',
    title: copy.pageTitles.swap,
    load: () => import('@/pages/swap/swap-page'),
    exportName: 'SwapPage',
  },
  {
    path: '/liquidity',
    title: copy.pageTitles.liquidity,
    load: () => import('@/pages/liquidity/liquidity-page'),
    exportName: 'LiquidityPage',
  },
  {
    path: '/transfer',
    title: copy.pageTitles.transfer,
    load: () => import('@/pages/transfer/transfer-page'),
    exportName: 'TransferPage',
  },
  {
    path: '/batch-transfer',
    title: copy.pageTitles.batchTransfer,
    load: () => import('@/pages/batch-transfer/batch-transfer-page'),
    exportName: 'BatchTransferPage',
  },
  {
    path: '/approvals',
    title: copy.pageTitles.approvals,
    load: () => import('@/pages/approvals/approvals-page'),
    exportName: 'ApprovalsPage',
  },
  {
    path: '/apps',
    title: copy.pageTitles.apps,
    load: () => import('@/pages/apps/apps-page'),
    exportName: 'AppsPage',
  },
  {
    path: '/about',
    title: copy.pageTitles.about,
    load: () => import('@/pages/about/about-page'),
    exportName: 'AboutPage',
  },
  {
    path: '/act',
    title: copy.placeholders.act.title,
    load: () => import('@/pages/act/act-page'),
    exportName: 'ActPage',
  },
  {
    path: '/group',
    title: copy.placeholders.group.title,
    load: () => import('@/pages/group/group-page'),
    exportName: 'GroupPage',
  },
  {
    path: '/me',
    title: copy.placeholders.me.title,
    load: () => import('@/pages/me/me-page'),
    exportName: 'MePage',
  },
  {
    path: '/theme',
    title: copy.pageTitles.theme,
    load: () => import('@/pages/theme/theme-page'),
    exportName: 'ThemePage',
  },
  {
    path: '/not-found',
    title: copy.notFound.title,
    load: () => import('@/pages/not-found/not-found-page'),
    exportName: 'NotFoundPage',
  },
];

function toRoute(spec: PageSpec): PageRoute {
  return {
    path: spec.path,
    title: spec.title,
    load: spec.load,
    Page: lazy(async () => {
      const module = await spec.load();
      const Page = module[spec.exportName];
      if (Page === undefined) throw new Error(`page module is missing export ${spec.exportName}`);
      return { default: Page };
    }),
  };
}

/** 所有独立成页的路由（不含首页与 `*` 兜底；`/not-found` 用于 `*`）。 */
export const PAGE_ROUTES: readonly PageRoute[] = PAGE_SPECS.map(toRoute);

/**
 * `*` 兜底的落点（复用注册表里那一行，不再多建一个 `lazy()`）。登记缺失是
 * **代码错误**，在模块初始化时直接抛——不要用 `?? (() => null)` 静默渲染成空白页。
 */
export const NOT_FOUND_ROUTE: PageRoute = (() => {
  const route = PAGE_ROUTES.find((entry) => entry.path === '/not-found');
  if (route === undefined) throw new Error("page-routes: missing '/not-found' registration");
  return route;
})();

const ROUTE_BY_PATH = new Map(PAGE_ROUTES.map((route) => [route.path, route]));

export function pageRouteFor(path: string): PageRoute | undefined {
  return ROUTE_BY_PATH.get(path);
}

/** 治理域的单入口：这七段前缀都渲染 `GovSectionPage`（内部 if 链在懒加载分区里）。 */
export const GOV_SECTION_ROOTS = [
  'gov',
  'stake',
  'vote',
  'verify',
  'submit',
  'acting',
  'action',
] as const;

export const GOV_SECTION_RE = new RegExp(`^/(${GOV_SECTION_ROOTS.join('|')})(/|$)`);

/** 治理域子路由的标题（页面在懒加载分区里，标题必须在这里，页头才能立刻显示）。 */
export const GOV_SUBROUTE_TITLES: Readonly<Record<string, string>> = Object.freeze({
  '/gov': copy.pageTitles.gov,
  '/gov/rewards': copy.pageTitles.rewards,
  '/gov/proposal-rewards': copy.pageTitles.proposalRewards,
  '/stake/liquidity': copy.pageTitles.stakeLiquidity,
  '/stake/staketoken': copy.pageTitles.stakeToken,
  '/stake/unstake': copy.pageTitles.unstake,
  '/stake/liquid': copy.pageTitles.stakeLiquid,
  '/vote': copy.pageTitles.vote,
  '/vote/records': copy.pageTitles.voteRecords,
  '/submit': copy.pageTitles.submit,
  '/submit/new': copy.pageTitles.submitNew,
  // 占位页也是真实页面（`gov-placeholder`），标题要与页面卡片一致。
  '/verify': copy.pageTitles.verify,
  '/verify/actions': copy.pageTitles.verifyActions,
  '/verify/action': copy.pageTitles.verify,
  '/verify/detail': copy.pageTitles.verifyDetail,
  '/acting': copy.pageTitles.acting,
  '/acting/join': copy.pageTitles.actingJoin,
  '/action/new': copy.pageTitles.actionNew,
  '/action/info': copy.pageTitles.actionInfo,
});
