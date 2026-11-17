import { useLocation } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { copy } from '@/shared/config/copy-pages';
import { buttonStyles } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';

/**
 * 旧库 LOVE20TKM 的治理域页面（投票 / 验证 / 推举 / 行动）在本轮先作为占位存在：
 * 这些页面需要的 `Vote` / `Verify` / `Submit` / `Mint` ABI 尚未随 `sync:anvil`
 * 导出，页面不编造数据，只保留旧版的路由与入口，等 ABI 导出后逐页接入。
 */
const PLACEHOLDER_BY_PATH: Readonly<Record<string, keyof typeof copy.gov.placeholders>> = {
  '/vote': 'vote',
  '/vote/batch': 'vote',
  '/vote/actions': 'voteActions',
  '/vote/single': 'voteSingle',
  '/vote/records': 'voteRecords',
  '/verify': 'verify',
  '/verify/actions': 'verifyActions',
  '/verify/action': 'verifyAction',
  '/verify/detail': 'verifyDetail',
  '/submit/actions': 'submitActions',
  '/submit/submit': 'submitSingle',
  '/acting': 'acting',
  '/acting/join': 'actingJoin',
  '/action/new': 'actionNew',
  '/action/info': 'actionInfo',
  '/gov/rewards': 'govRewards',
};

export function GovPlaceholderPage() {
  const location = useLocation();
  const key = PLACEHOLDER_BY_PATH[location.pathname] ?? 'vote';
  const entry = copy.gov.placeholders[key] as { readonly title: string; readonly body: string };

  return (
    <Card data-testid="gov-placeholder">
      <div className="flex items-center gap-2">
        <CardTitle>{entry.title}</CardTitle>
        <Badge tone="warning">{copy.gov.placeholders.badge}</Badge>
      </div>
      <CardDescription>{entry.body}</CardDescription>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Link to="/gov" className={buttonStyles('secondary', 'md')}>
          {copy.gov.placeholders.backToGov}
        </Link>
        <Link to="/stake/stakelp" className={buttonStyles('primary', 'md')}>
          {copy.gov.placeholders.goStake}
        </Link>
      </div>
    </Card>
  );
}
