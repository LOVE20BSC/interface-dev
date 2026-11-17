import { DEPLOYMENT } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { formatPercent } from '@/shared/lib/format';
import { Card, CardTitle } from '@/shared/ui/card';

/** 部署参数是 1e18 定点比例（1e18 = 100%），转成百分数用于文案。 */
function ratioPercent(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  try {
    const scaled = Number(BigInt(value)) / 1e16;
    if (!Number.isFinite(scaled)) return undefined;
    return formatPercent(scaled);
  } catch {
    return undefined;
  }
}

/**
 * TKM 旧版「治理票的作用」卡（`GovernorIntroCard`）：三条产品级说明，数字来自
 * 部署参数（不写死）。旧版用的是 `` env 常量与「治理票」；这里换成协议参数与
 * 「治理权」口径。
 */
export function GovIntro() {
  const rewardPercent = ratioPercent(DEPLOYMENT.params.PROPOSAL_REWARD_MIN_VOTE_RATIO);
  const submitPercent = ratioPercent(DEPLOYMENT.params.SUBMIT_MIN_RATIO);

  return (
    <Card data-testid="gov-intro">
      <CardTitle>{copy.gov.governorIntro.title}</CardTitle>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-muted">
        <li>{copy.gov.governorIntro.itemOwner}</li>
        {rewardPercent !== undefined ? (
          <li>{copy.gov.governorIntro.itemReward(rewardPercent)}</li>
        ) : null}
        {submitPercent !== undefined ? (
          <li>{copy.gov.governorIntro.itemSubmit(submitPercent)}</li>
        ) : null}
      </ul>
    </Card>
  );
}

/** 旧版每个质押页底部的「提示」信息框（不折叠，直接给规则）。 */
export function GovTips() {
  return (
    <Card data-testid="gov-tips" className="border-line bg-elevated/50">
      <p className="text-sm font-semibold text-foreground">{copy.gov.tips.title}</p>
      <ul className="mt-2 space-y-1 text-xs leading-5 text-muted">
        <li>{copy.gov.rules.votes}</li>
        <li>{copy.gov.rules.boost}</li>
        <li>{copy.gov.rules.unlock}</li>
        <li>{copy.gov.rules.fees}</li>
      </ul>
    </Card>
  );
}
