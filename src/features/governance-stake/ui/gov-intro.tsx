import { DEPLOYMENT } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { formatPercent } from '@/shared/lib/format-rates';

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

/**
 * 流动性质押页的「规则」卡（owner 2026-11-19）：把「治理权的作用」和「提示」合并成
 * 一张卡，避免同页多张说明卡把正文挤散。
 */
export function GovRulesCard() {
  const rewardPercent = ratioPercent(DEPLOYMENT.params.PROPOSAL_REWARD_MIN_VOTE_RATIO);
  const submitPercent = ratioPercent(DEPLOYMENT.params.SUBMIT_MIN_RATIO);
  return (
    <Card data-testid="gov-rules-card">
      <CardTitle>{copy.gov.rulesCard.title}</CardTitle>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-muted">
        <li>{copy.gov.governorIntro.itemOwner}</li>
        {rewardPercent !== undefined ? (
          <li>{copy.gov.governorIntro.itemReward(rewardPercent)}</li>
        ) : null}
        {submitPercent !== undefined ? (
          <li>{copy.gov.governorIntro.itemSubmit(submitPercent)}</li>
        ) : null}
        <li>{copy.gov.rules.unlock}</li>
        <li>{copy.gov.rules.fees}</li>
      </ul>
    </Card>
  );
}
