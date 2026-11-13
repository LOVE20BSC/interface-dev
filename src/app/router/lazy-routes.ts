import { lazy } from 'react';

// ADR-0001 §3 sets the first-screen budget; the owner's follow-up moves every
// secondary route out of the entry chunk (the earlier split left mint/my-nft
// eager, which is what pushed the entry to 195.8 kB). Only the app shell and the
// home page are first-screen code now. Each page keeps its sheets/dialogs in its
// own chunk, and prefetchRoute() warms the same loader on navigation intent.
const loadMyNftPage = () => import('@/pages/my-nft/my-nft-page');
const loadMintPage = () => import('@/pages/mint/mint-page');
const loadAirdropPage = () => import('@/pages/airdrop/airdrop-page');
const loadSwapPage = () => import('@/pages/swap/swap-page');
const loadLiquidityPage = () => import('@/pages/liquidity/liquidity-page');
const loadTransferPage = () => import('@/pages/transfer/transfer-page');
const loadBatchTransferPage = () => import('@/pages/batch-transfer/batch-transfer-page');
const loadApprovalsPage = () => import('@/pages/approvals/approvals-page');
const loadAppsPage = () => import('@/pages/apps/apps-page');
const loadAboutPage = () => import('@/pages/about/about-page');
const loadGovPage = () => import('@/pages/gov/gov-page');
const loadActPage = () => import('@/pages/act/act-page');
const loadGroupPage = () => import('@/pages/group/group-page');
const loadMePage = () => import('@/pages/me/me-page');
const loadThemePage = () => import('@/pages/theme/theme-page');
const loadNotFoundPage = () => import('@/pages/not-found/not-found-page');

export const MyNftPage = lazy(async () => {
  const module = await loadMyNftPage();
  return { default: module.MyNftPage };
});
export const MintPage = lazy(async () => {
  const module = await loadMintPage();
  return { default: module.MintPage };
});
export const AirdropPage = lazy(async () => {
  const module = await loadAirdropPage();
  return { default: module.AirdropPage };
});
export const SwapPage = lazy(async () => {
  const module = await loadSwapPage();
  return { default: module.SwapPage };
});
export const LiquidityPage = lazy(async () => {
  const module = await loadLiquidityPage();
  return { default: module.LiquidityPage };
});
export const TransferPage = lazy(async () => {
  const module = await loadTransferPage();
  return { default: module.TransferPage };
});
export const BatchTransferPage = lazy(async () => {
  const module = await loadBatchTransferPage();
  return { default: module.BatchTransferPage };
});
export const ApprovalsPage = lazy(async () => {
  const module = await loadApprovalsPage();
  return { default: module.ApprovalsPage };
});
export const AppsPage = lazy(async () => {
  const module = await loadAppsPage();
  return { default: module.AppsPage };
});
export const AboutPage = lazy(async () => {
  const module = await loadAboutPage();
  return { default: module.AboutPage };
});
export const GovPage = lazy(async () => {
  const module = await loadGovPage();
  return { default: module.GovPage };
});
export const ActPage = lazy(async () => {
  const module = await loadActPage();
  return { default: module.ActPage };
});
export const GroupPage = lazy(async () => {
  const module = await loadGroupPage();
  return { default: module.GroupPage };
});
export const MePage = lazy(async () => {
  const module = await loadMePage();
  return { default: module.MePage };
});
export const ThemePage = lazy(async () => {
  const module = await loadThemePage();
  return { default: module.ThemePage };
});
export const NotFoundPage = lazy(async () => {
  const module = await loadNotFoundPage();
  return { default: module.NotFoundPage };
});

/** Same loader functions the lazy components use: one definition per chunk. */
const ROUTE_LOADERS: Readonly<Record<string, () => Promise<unknown>>> = Object.freeze({
  '/my-nft': loadMyNftPage,
  '/mint': loadMintPage,
  '/airdrop': loadAirdropPage,
  '/swap': loadSwapPage,
  '/transfer': loadTransferPage,
  '/liquidity': loadLiquidityPage,
  '/batch-transfer': loadBatchTransferPage,
  '/approvals': loadApprovalsPage,
  '/apps': loadAppsPage,
  '/about': loadAboutPage,
  '/gov': loadGovPage,
  '/act': loadActPage,
  '/group': loadGroupPage,
  '/me': loadMePage,
  '/theme': loadThemePage,
});

/**
 * Warm a route chunk on navigation intent (hover/focus/touch). It is a no-op
 * for eager routes and for paths that do not own a chunk yet.
 */
export function prefetchRoute(pathname: string): void {
  const load = ROUTE_LOADERS[pathname];
  if (load !== undefined) void load();
}
