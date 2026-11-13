import { useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { BASENAME } from '@/app/router/base-path';
import { AppShell } from '@/app/shell/app-shell';
import { HomePage } from '@/pages/home/home-page';
import {
  AboutPage,
  ActPage,
  AirdropPage,
  ApprovalsPage,
  AppsPage,
  BatchTransferPage,
  GovPage,
  GroupPage,
  LiquidityPage,
  MePage,
  MintPage,
  MyNftPage,
  NotFoundPage,
  SwapPage,
  ThemePage,
  TransferPage,
} from '@/app/router/lazy-routes';
import { documentTitleFor } from '@/app/navigation/document-title';
import { useCommunityDisplay } from '@/entities/community-token/model/use-community-display';
import { useCommunityContext } from '@/features/switch-community/model/use-community-context';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);
  return null;
}

function DocumentTitle() {
  const { pathname } = useLocation();
  const { symbol } = useCommunityContext();
  const community = useCommunityDisplay(symbol);

  useEffect(() => {
    document.title = documentTitleFor(pathname, community);
  }, [community, pathname]);

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
          <Route path="liquidity" element={<LiquidityPage />} />
          <Route path="transfer" element={<TransferPage />} />
          <Route path="batch-transfer" element={<BatchTransferPage />} />
          <Route path="approvals" element={<ApprovalsPage />} />
          <Route path="apps" element={<AppsPage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="gov" element={<GovPage />} />
          <Route path="act" element={<ActPage />} />
          <Route path="group" element={<GroupPage />} />
          <Route path="me" element={<MePage />} />
          <Route path="theme" element={<ThemePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
