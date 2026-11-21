import { describe, expect, it } from 'vitest';
import {
  PRECISION,
  govRewardPools,
  isGovRewardMintable,
  isProposalRewardEligible,
  isProposalTargetValid,
  minProposalVoteAmount,
  mintableRounds,
  proposalRewardShare,
  remainingVotes,
  requiredSubmitVotes,
  utf8ByteLength,
  validateProposalDraft,
  validateVoteAllocation,
  type ProposalLimits,
} from './gov-core';

/**
 * 这些期望值全部按合约公式手算，函数注释里给了行号：
 * - `Mint.sol:311-318`（提案激励份额）
 * - `Mint.sol:416-419`（门槛，向上取整）
 * - `Mint.sol:359-360`（治理激励两池拆分）
 * - `Submit.sol:84`（推举门槛，向上取整）
 * - `Vote.sol:282-286`（累计票数不得超过上限）
 */

describe('minProposalVoteAmount', () => {
  it('按 PRECISION 向上取整（合约 Rounding.Ceil）', () => {
    // 5% of 100 = 5
    expect(minProposalVoteAmount(100n, 5n * 10n ** 16n)).toBe(5n);
    // 5% of 101 = 5.05 → 6（ceil）
    expect(minProposalVoteAmount(101n, 5n * 10n ** 16n)).toBe(6n);
    // 0 票时门槛为 0（合约允许，但 isProposalRewardEligible 还要求 > 0）
    expect(minProposalVoteAmount(0n, 5n * 10n ** 16n)).toBe(0n);
  });

  it('整除时不额外加一', () => {
    expect(minProposalVoteAmount(20n, PRECISION / 2n)).toBe(10n);
  });
});

describe('requiredSubmitVotes', () => {
  it('0.5% 的推举门槛向上取整', () => {
    // 4472135954999579391818 * 5e15 / 1e18 = 22360679774997896959.09 → 22360679774997896960
    expect(requiredSubmitVotes(4472135954999579391818n, 5n * 10n ** 15n)).toBe(
      22360679774997896960n,
    );
  });
});

describe('proposalRewardShare', () => {
  it('按票数占比向下取整', () => {
    expect(proposalRewardShare(1000n, 30n, 100n)).toBe(300n);
    expect(proposalRewardShare(1000n, 1n, 3n)).toBe(333n);
  });

  it('总票数为 0 时份额为 0（不除零）', () => {
    expect(proposalRewardShare(1000n, 0n, 0n)).toBe(0n);
  });
});

describe('isProposalRewardEligible', () => {
  it('票数必须大于 0 且不低于门槛', () => {
    expect(isProposalRewardEligible(0n, 0n)).toBe(false);
    expect(isProposalRewardEligible(1n, 0n)).toBe(true);
    expect(isProposalRewardEligible(4n, 5n)).toBe(false);
    expect(isProposalRewardEligible(5n, 5n)).toBe(true);
  });
});

describe('govRewardPools', () => {
  it('投票池半、加速池补齐余数', () => {
    expect(govRewardPools(1000n, 2n)).toEqual({ votePool: 500n, boostPool: 500n });
    // 奇数时余数进加速池（合约 boostPool = gov - votePool）
    expect(govRewardPools(1001n, 2n)).toEqual({ votePool: 500n, boostPool: 501n });
  });

  it('除数为 0 时全部进加速池（防御，不崩）', () => {
    expect(govRewardPools(1000n, 0n)).toEqual({ votePool: 0n, boostPool: 1000n });
  });
});

describe('remainingVotes', () => {
  it('上限减已投，不够时归零', () => {
    expect(remainingVotes(100n, 30n)).toBe(70n);
    expect(remainingVotes(100n, 100n)).toBe(0n);
    expect(remainingVotes(100n, 130n)).toBe(0n);
  });
});

describe('validateVoteAllocation', () => {
  it('空分配、零票、超额都要拦', () => {
    expect(validateVoteAllocation([], 10n)).toBe('empty');
    expect(validateVoteAllocation([{ proposalId: 1n, amount: 0n }], 10n)).toBe('zero-amount');
    expect(
      validateVoteAllocation(
        [
          { proposalId: 1n, amount: 6n },
          { proposalId: 2n, amount: 5n },
        ],
        10n,
      ),
    ).toBe('exceeds-remaining');
  });

  it('合计正好等于剩余时通过', () => {
    expect(
      validateVoteAllocation(
        [
          { proposalId: 1n, amount: 6n },
          { proposalId: 2n, amount: 4n },
        ],
        10n,
      ),
    ).toBeNull();
  });
});

describe('isGovRewardMintable / mintableRounds', () => {
  const rows = [
    { round: 5n, voteReward: 0n, boostReward: 0n, minted: false },
    { round: 4n, voteReward: 10n, boostReward: 0n, minted: false },
    { round: 3n, voteReward: 1n, boostReward: 2n, minted: true },
  ];

  it('只有金额大于 0 且未铸造的轮次可铸', () => {
    expect(isGovRewardMintable(0n, 0n, false)).toBe(false);
    expect(isGovRewardMintable(1n, 0n, false)).toBe(true);
    expect(isGovRewardMintable(1n, 1n, true)).toBe(false);
  });

  it('批量数组按轮次升序且不含不可铸轮次', () => {
    expect(mintableRounds(rows)).toEqual([4n]);
  });
});

describe('utf8ByteLength / isProposalTargetValid', () => {
  it('按 UTF-8 字节数算，中文字符 3 字节', () => {
    expect(utf8ByteLength('abc')).toBe(3);
    expect(utf8ByteLength('中文')).toBe(6);
    // emoji 是 4 字节（代理对）
    expect(utf8ByteLength('🙂')).toBe(4);
  });

  it('目标地址必须是 0x + 40 位十六进制且非零地址', () => {
    expect(isProposalTargetValid('0x0000000000000000000000000000000000000001')).toBe(true);
    expect(isProposalTargetValid('0x0000000000000000000000000000000000000000')).toBe(false);
    expect(isProposalTargetValid('0x1234')).toBe(false);
    expect(isProposalTargetValid('not-an-address')).toBe(false);
  });
});

describe('validateProposalDraft', () => {
  const limits: ProposalLimits = {
    maxTitleLength: 8n,
    maxDetailsLength: 16n,
    maxTargetDataCount: 16n,
    maxTargetDataBytes: 16384n,
  };
  const base = {
    title: '标题',
    details: '详情',
    target: '0x0000000000000000000000000000000000000001',
    targetDataCount: 0,
    targetDataBytes: 0,
  };

  it('合法草稿通过', () => {
    expect(validateProposalDraft(base, limits)).toBeNull();
  });

  it('标题空 / 超字节 / 目标非法逐项报出', () => {
    expect(validateProposalDraft({ ...base, title: '' }, limits)).toBe('title-empty');
    // 3 个中文 = 9 字节 > 8
    expect(validateProposalDraft({ ...base, title: '中文标题' }, limits)).toBe('title-too-long');
    expect(validateProposalDraft({ ...base, target: '0xzz' }, limits)).toBe('target-invalid');
  });
});
