import { describe, expect, it } from 'vitest';
import { buildVoteDraft, parseVoteAmount } from './vote-form';

describe('parseVoteAmount', () => {
  it('空输入是 empty，不是错误', () => {
    expect(parseVoteAmount('')).toEqual({ kind: 'empty' });
    expect(parseVoteAmount('   ')).toEqual({ kind: 'empty' });
  });

  it('整数按 18 位小数展开', () => {
    expect(parseVoteAmount('1')).toEqual({ kind: 'ok', value: 10n ** 18n });
    expect(parseVoteAmount('1.5')).toEqual({ kind: 'ok', value: 15n * 10n ** 17n });
  });

  it('0 单独返回 zero（合约 ZeroVoteAmount 会拒）', () => {
    expect(parseVoteAmount('0')).toEqual({ kind: 'zero' });
    expect(parseVoteAmount('0.000')).toEqual({ kind: 'zero' });
  });

  it('非法字符与超精度都算 invalid', () => {
    expect(parseVoteAmount('1,000')).toEqual({ kind: 'invalid' });
    expect(parseVoteAmount('-1')).toEqual({ kind: 'invalid' });
    expect(parseVoteAmount('1.2.3')).toEqual({ kind: 'invalid' });
    expect(parseVoteAmount('0.1234567890123456789')).toEqual({ kind: 'invalid' });
  });
});

describe('buildVoteDraft', () => {
  it('空栏跳过（不投这个提案），全部空则 empty', () => {
    expect(buildVoteDraft([{ proposalId: 1n, raw: '' }])).toEqual({ kind: 'empty' });
  });

  it('只收填了数字的提案，顺序保持输入顺序', () => {
    expect(
      buildVoteDraft([
        { proposalId: 7n, raw: '2' },
        { proposalId: 8n, raw: '' },
        { proposalId: 9n, raw: '3.5' },
      ]),
    ).toEqual({
      kind: 'ok',
      allocations: [
        { proposalId: 7n, amount: 2n * 10n ** 18n },
        { proposalId: 9n, amount: 35n * 10n ** 17n },
      ],
    });
  });

  it('有一个非法输入就整体 invalid，并指出是哪一个提案', () => {
    expect(
      buildVoteDraft([
        { proposalId: 7n, raw: '1' },
        { proposalId: 8n, raw: 'abc' },
      ]),
    ).toEqual({ kind: 'invalid', proposalId: 8n });
  });
});
