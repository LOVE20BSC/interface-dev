import { describe, expect, it } from 'vitest';
import { approvalStepState, type ApprovalStepInput } from '@/shared/lib/approval-step';

const BASE: ApprovalStepInput = {
  required: true,
  stage: 'idle',
  allowance: undefined,
  need: undefined,
};

const UNLIMITED = 2n ** 255n;

function state(patch: Partial<ApprovalStepInput>) {
  return approvalStepState({ ...BASE, ...patch });
}

describe('approvalStepState', () => {
  it('hides the row when the flow does not need a token approval', () => {
    expect(state({ required: false, allowance: 10n, need: 5n })).toBe('hidden');
  });

  it('hides the row in mint when the price is not known yet (walkthrough P1)', () => {
    expect(state({ hideWhenNeedUnknown: true, allowance: undefined, need: undefined })).toBe(
      'hidden',
    );
    // 价格算出来后才给结论
    expect(state({ hideWhenNeedUnknown: true, allowance: 0n, need: 5n })).toBe('needs-approval');
  });

  it('reports busy while the wallet/pending stages are in flight', () => {
    expect(state({ stage: 'wallet', allowance: 10n, need: 5n })).toBe('busy');
    expect(state({ stage: 'pending', allowance: 10n, need: 5n })).toBe('busy');
  });

  it('refuses to conclude while the allowance is unknown', () => {
    expect(state({ allowance: undefined, need: 5n })).toBe('checking');
  });

  it('marks a long-term allowance as long-term, whatever is needed', () => {
    expect(state({ allowance: UNLIMITED, need: 5n })).toBe('long-term');
    expect(state({ allowance: UNLIMITED, need: undefined })).toBe('long-term');
  });

  it('keeps the button visible but disabled while the amount is not filled in', () => {
    expect(state({ allowance: 0n, need: undefined })).toBe('input-pending');
    expect(state({ allowance: 0n, need: 0n })).toBe('input-pending');
  });

  it('compares allowance with need and never guesses', () => {
    expect(state({ allowance: 4n, need: 5n })).toBe('needs-approval');
    expect(state({ allowance: 5n, need: 5n })).toBe('approved');
    expect(state({ allowance: 6n, need: 5n })).toBe('approved');
  });

  it('treats the busy stage before the unknown-allowance check', () => {
    // 授权请求发出时 allowance 仍是旧值/未知，此时必须显示「授权中」而不是「读取中」。
    expect(state({ stage: 'wallet', allowance: undefined, need: 5n })).toBe('busy');
  });

  it('treats required=false before everything else', () => {
    expect(state({ required: false, stage: 'wallet' })).toBe('hidden');
  });
});
