import { useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { BASENAME } from '@/app/router/base-path';
import { AppShell } from '@/app/shell/app-shell';
import { HomePage } from '@/pages/home/home-page';
import { GovSectionPage } from '@/app/router/lazy-routes';
import { GOV_SECTION_ROOTS, NOT_FOUND_ROUTE, PAGE_ROUTES } from '@/app/router/page-routes';
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

/** `*` 兜底：NotFound 也是一个懒加载 chunk（从注册表取，避免第二次登记）。 */
const NotFoundPage = NOT_FOUND_ROUTE.Page;

export function AppRouter() {
  return (
    <BrowserRouter {...(BASENAME !== '/' ? { basename: BASENAME } : {})}>
      <ScrollToTop />
      <DocumentTitle />
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          {/* 一行登记见 page-routes.ts；`/not-found` 只作为 `*` 的落点，不做独立路由。 */}
          {PAGE_ROUTES.filter((route) => route.path !== '/not-found').map((route) => {
            const Page = route.Page;
            return <Route key={route.path} path={route.path.slice(1)} element={<Page />} />;
          })}
          {GOV_SECTION_ROOTS.map((root) => (
            <Route key={root} path={`${root}/*`} element={<GovSectionPage />} />
          ))}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
