import { useLocation } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { copy } from '@/shared/config/copy-pages';
import { buttonStyles } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';

/**
 * 行动域（旧库 LOVE20TKM 的验证 / 行动页面）的占位页：`action` 合约的 ABI 与地址虽然在
 * 地址簿里，但页面（本轮行动 / 行动详情 / 加入 / 验证打分）还没接，页面不编造数据，
 * 只保留旧版路由与入口，并写清「为什么现在没有」。
 *
 * 治理域的四页（`/vote`、`/submit`、`/gov/rewards`、`/gov/proposal-rewards`）已于
 * 2026-11-21 实装、投票记录页 `/vote/records` 于同日拆出，因此这张表里不再有它们的条目
 * （2026-11-22 清理死配置：那条 `/vote/actions` 会把用户带进「没有找到这个提案」）。
 */
type PlaceholderEntry =
  | 'verify'
  | 'verifyActions'
  | 'verifyAction'
  | 'verifyDetail'
  | 'acting'
  | 'actingJoin'
  | 'actionNew'
  | 'actionInfo';

const PLACEHOLDER_BY_PATH: Readonly<Record<string, PlaceholderEntry>> = {
  '/verify': 'verify',
  '/verify/actions': 'verifyActions',
  '/verify/action': 'verifyAction',
  '/verify/detail': 'verifyDetail',
  '/acting': 'acting',
  '/acting/join': 'actingJoin',
  '/action/new': 'actionNew',
  '/action/info': 'actionInfo',
};

/** 未登记的二级路径按前缀回落到该段的代表页，避免落到别的域。 */
const DEFAULT_BY_PREFIX: Readonly<Record<string, PlaceholderEntry>> = {
  verify: 'verify',
  acting: 'acting',
  action: 'actionInfo',
};

export function GovPlaceholderPage() {
  const location = useLocation();
  const prefix = location.pathname.split('/')[1] ?? '';
  const key: PlaceholderEntry =
    PLACEHOLDER_BY_PATH[location.pathname] ?? DEFAULT_BY_PREFIX[prefix] ?? 'verify';
  const entry = copy.gov.placeholders[key];

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
        <Link to="/stake/liquidity" className={buttonStyles('primary', 'md')}>
          {copy.gov.placeholders.goStake}
        </Link>
      </div>
    </Card>
  );
}
