import { copy } from '@/shared/config/copy-pages';
import { Card, CardTitle } from '@/shared/ui/card';

/**
 * 规则折叠区：把「治理权怎么算 / 加速质押是什么 / 解锁怎么走 / 手续费去哪」
 * 收在一处，默认折叠——主界面先给结论与操作，细节按需展开（UX spec §0 原则 4）。
 */
export function StakeRules() {
  return (
    <Card data-testid="gov-rules">
      <details>
        <summary className="cursor-pointer text-base font-semibold text-foreground">
          {copy.gov.rules.title}
        </summary>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-muted">
          <li>{copy.gov.rules.votes}</li>
          <li>{copy.gov.rules.boost}</li>
          <li>{copy.gov.rules.unlock}</li>
          <li>{copy.gov.rules.fees}</li>
        </ul>
      </details>
      <CardTitle className="sr-only">{copy.gov.rules.title}</CardTitle>
    </Card>
  );
}
