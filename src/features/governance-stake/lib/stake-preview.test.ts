import { describe, expect, it } from 'vitest';
import { computeStakePreview, type StakePreviewInput } from './stake-preview';

/** 与 dev 链 clean bootstrap 的种子状态同源：储备 / LP 总供应 / 质押记账 LP。 */
const SEEDED: Omit<
  StakePreviewInput,
  'tokenAmount' | 'parentTokenAmount' | 'promisedWaitingPhases'
> = {
  reserveToken: 200_000n * 10n ** 18n,
  reserveParent: 100n * 10n ** 18n,
  lpTotalSupply: 4_472_135_954_999_579_392_818n,
  totalLiquidityShares: 4_472_135_954_999_579_391_818n,
  withdrawableLp: 4_472_135_954_999_579_391_818n,
  currentLiquidityShares: 0n,
  currentGovPower: 0n,
};

describe('computeStakePreview', () => {
  it('estimates the LP, the shares and the governance power for a proportional stake', () => {
    const preview = computeStakePreview({
      ...SEEDED,
      tokenAmount: 1000n * 10n ** 18n,
      parentTokenAmount: 10n ** 18n,
      promisedWaitingPhases: 10n,
    });

    expect(preview.status).toBe('ready');
    // 1000 + 0.5 WETH 是本例实际能进池的两侧（按池子比例截断父币一侧）。
    expect(preview.optimalTokenAmount).toBe(1000n * 10n ** 18n);
    expect(preview.optimalParentAmount).toBe(5n * 10n ** 17n);
    // LP = 0.5% of the pair supply; shares are 1:1 with LP on the seeded pool.
    expect(preview.govPowerAdded).toBe(223_606_797_749_978_969_640n);
  });

  it('adds to the existing governance power instead of replacing it', () => {
    const preview = computeStakePreview({
      ...SEEDED,
      currentLiquidityShares: 1_000n * 10n ** 18n,
      currentGovPower: 3_000n * 10n ** 18n,
      tokenAmount: 1000n * 10n ** 18n,
      parentTokenAmount: 10n ** 18n,
      promisedWaitingPhases: 10n,
    });
    expect(preview.status).toBe('ready');
    // (1000e18 + sharesAdded) × 10 − 3000e18, truncated exactly like the EVM:
    // 1022360679774997896964 × 10 − 3000e18.
    expect(preview.govPowerAdded).toBe(7_223_606_797_749_978_969_640n);
  });

  it('is idle until both amounts are valid', () => {
    expect(
      computeStakePreview({
        ...SEEDED,
        tokenAmount: undefined,
        parentTokenAmount: 10n ** 18n,
        promisedWaitingPhases: 1n,
      }).status,
    ).toBe('idle');
    expect(
      computeStakePreview({
        ...SEEDED,
        tokenAmount: 0n,
        parentTokenAmount: 10n ** 18n,
        promisedWaitingPhases: 1n,
      }).status,
    ).toBe('idle');
  });

  it('never fabricates a number when a read is missing', () => {
    const preview = computeStakePreview({
      ...SEEDED,
      withdrawableLp: undefined,
      tokenAmount: 1000n * 10n ** 18n,
      parentTokenAmount: 10n ** 18n,
      promisedWaitingPhases: 10n,
    });
    expect(preview.status).toBe('unavailable');
    expect(preview.govPowerAdded).toBeUndefined();
  });
});
