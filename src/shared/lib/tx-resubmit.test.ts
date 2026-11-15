import { describe, expect, it } from 'vitest';
import { decideResubmit, type ResubmitSnapshot } from './tx-resubmit';

/**
 * 「重新提交」 decision table — the owner-reported P1 boundaries, as assertions.
 *
 * Owner review 2026-11-16 measured 「模拟对照 2 条通过、10 条边界断言失败」; the ten
 * boundaries below are exactly what a retry must not do (send while the original
 * is mined, send at a nonce that double-executes, or sign blind on a failed read).
 */

const base: ResubmitSnapshot = {
  receiptStatus: null,
  txNonce: 7,
  latestNonce: 7,
  pendingNonce: 7,
};

describe('decideResubmit · 原交易已成交', () => {
  it('never sends once the receipt is success (mined inside the nonce-read window)', () => {
    expect(decideResubmit({ ...base, receiptStatus: 'success' }, 7)).toEqual({
      action: 'settled',
      status: 'success',
    });
  });

  it('treats a reverted receipt as settled so the retry cannot re-execute', () => {
    expect(decideResubmit({ ...base, receiptStatus: 'reverted' }, 7)).toEqual({
      action: 'settled',
      status: 'reverted',
    });
  });
});

describe('decideResubmit · 读不到链上状态', () => {
  it('refuses to sign when the receipt read failed (the original may be mined)', () => {
    // txNonce still read as in-pool: a blind 「重新提交」 here is P2 replaced 误判 /
    // the double-send the whole card exists to prevent.
    expect(decideResubmit({ ...base, receiptStatus: undefined }, 7)).toEqual({
      action: 'unavailable',
    });
  });

  it('refuses to sign when the transaction read failed', () => {
    expect(decideResubmit({ ...base, txNonce: undefined }, 7)).toEqual({
      action: 'unavailable',
    });
  });

  it('refuses to sign when no nonce could be read for a dropped hash', () => {
    expect(
      decideResubmit(
        { receiptStatus: null, txNonce: null, latestNonce: undefined, pendingNonce: undefined },
        7,
      ),
    ).toEqual({ action: 'unavailable' });
  });
});

describe('decideResubmit · 仍 pending：用原 nonce 替换', () => {
  it('replaces at the original nonce, never at latest+1 (which would double-execute)', () => {
    expect(decideResubmit(base, 7)).toEqual({
      action: 'send',
      nonce: 7,
      mode: 'replace',
    });
  });

  it('replaces at the original nonce even when another transaction is queued ahead', () => {
    // latest=6, pending=9: naive 「read the next nonce」 would pick 9 and run the
    // action twice as soon as the pool drains.
    expect(decideResubmit({ ...base, txNonce: 7, latestNonce: 6, pendingNonce: 9 }, 7)).toEqual({
      action: 'send',
      nonce: 7,
      mode: 'replace',
    });
  });
});

describe('decideResubmit · nonce gap：用池里的下一个 nonce 重新发', () => {
  it('heals a wallet-cached gap by sending at the pending nonce', () => {
    // The original was signed with nonce 8 while the chain only reached 7: it is
    // in the pool but unreachable. Replacing it at 8 would stay dead forever.
    expect(decideResubmit({ ...base, txNonce: 8, latestNonce: 7, pendingNonce: 7 }, 8)).toEqual({
      action: 'send',
      nonce: 7,
      mode: 'new',
    });
  });
});

describe('decideResubmit · 已不在池里', () => {
  it('re-sends a dropped hash at the pool nonce', () => {
    expect(
      decideResubmit({ receiptStatus: null, txNonce: null, latestNonce: 7, pendingNonce: 7 }, 7),
    ).toEqual({ action: 'send', nonce: 7, mode: 'new' });
  });

  it('re-sends at the pool nonce when the wallet has a queue (pending > latest)', () => {
    expect(
      decideResubmit({ receiptStatus: null, txNonce: null, latestNonce: 7, pendingNonce: 9 }, 7),
    ).toEqual({ action: 'send', nonce: 9, mode: 'new' });
  });

  it('stops when another transaction mined the dropped hash’s nonce', () => {
    expect(
      decideResubmit({ receiptStatus: null, txNonce: null, latestNonce: 9, pendingNonce: 9 }, 7),
    ).toEqual({ action: 'replaced' });
  });

  it('stops when the pooled transaction’s nonce was mined by somebody else', () => {
    expect(decideResubmit({ ...base, txNonce: 7, latestNonce: 8, pendingNonce: 8 }, 7)).toEqual({
      action: 'replaced',
    });
  });
});
