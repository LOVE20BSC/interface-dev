import { Link } from 'react-router-dom';
import { copy } from '@/shared/config/copy-pages';
import { buttonStyles } from '@/shared/ui/button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';

/**
 * 治理动态（TKM 旧版 `GovPublicCard` 的等价块）：投票中的行动 / 验证中的行动 /
 * 推举 三个公开列表入口。本轮这些列表页是占位，但入口保留，IA 不断。
 */
export function GovPublicCard({ q }: { readonly q: string }) {
  return (
    <Card data-testid="gov-public-card">
      <CardTitle>{copy.gov.publicCard.title}</CardTitle>
      <CardDescription>{copy.gov.publicCard.hint}</CardDescription>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Link to={`/vote/actions${q}`} className={buttonStyles('secondary', 'sm')}>
          {copy.gov.publicCard.voteActions}
        </Link>
        <Link to={`/verify/actions${q}`} className={buttonStyles('secondary', 'sm')}>
          {copy.gov.publicCard.verifyActions}
        </Link>
        <Link to={`/submit/actions${q}`} className={buttonStyles('secondary', 'sm')}>
          {copy.gov.publicCard.submitActions}
        </Link>
      </div>
    </Card>
  );
}
