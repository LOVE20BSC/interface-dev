import { lazy, useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { BASENAME } from '@/app/router/base-path';
import { AppShell } from '@/app/shell/app-shell';
import { HomePage } from '@/pages/home/home-page';
import { MyNftPage } from '@/pages/my-nft/my-nft-page';
import { MintPage } from '@/pages/mint/mint-page';
import { NotFoundPage } from '@/pages/not-found/not-found-page';

// ADR-0001 §3: identity and mint stay in the first-screen bundle; secondary
// routes (including the M0 placeholders) are split out.
const AirdropPage = lazy(async () => {
  const module = await import('@/pages/airdrop/airdrop-page');
  return { default: module.AirdropPage };
});
const SwapPage = lazy(async () => {
  const module = await import('@/pages/swap/swap-page');
  return { default: module.SwapPage };
});
const GovPage = lazy(async () => {
  const module = await import('@/pages/gov/gov-page');
  return { default: module.GovPage };
});
const ActPage = lazy(async () => {
  const module = await import('@/pages/act/act-page');
  return { default: module.ActPage };
});
const GroupPage = lazy(async () => {
  const module = await import('@/pages/group/group-page');
  return { default: module.GroupPage };
});
const MePage = lazy(async () => {
  const module = await import('@/pages/me/me-page');
  return { default: module.MePage };
});
import { pageTitleFor } from '@/app/navigation/navigation';
import { copy } from '@/shared/config/copy';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);
  return null;
}

function DocumentTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    const page = pageTitleFor(pathname);
    document.title = page !== null ? `${page} · ${copy.brand.wordmark}` : copy.brand.wordmark;
  }, [pathname]);
  return null;
}

export function AppRouter() {
  return (
    <BrowserRouter {...(BASENAME !== '/' ? { basename: BASENAME } : {})}>
      <ScrollToTop />
      <DocumentTitle />
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="my-nft" element={<MyNftPage />} />
          <Route path="mint" element={<MintPage />} />
          <Route path="airdrop" element={<AirdropPage />} />
          <Route path="swap" element={<SwapPage />} />
          <Route path="gov" element={<GovPage />} />
          <Route path="act" element={<ActPage />} />
          <Route path="group" element={<GroupPage />} />
          <Route path="me" element={<MePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
