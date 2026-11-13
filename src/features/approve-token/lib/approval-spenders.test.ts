import { describe, expect, it } from 'vitest';
import type { AddressBook } from '@/config/networks';
import {
  APPROVAL_SPENDER_SLOTS,
  buildApprovalSpenders,
  checkSpenderInput,
} from '@/features/approve-token/lib/approval-spenders';

const ZERO = '0x0000000000000000000000000000000000000000';
const A = '0x0000000000000000000000000000000000000001';
const B = '0x0000000000000000000000000000000000000002';
const C = '0x0000000000000000000000000000000000000003';
const D = '0x0000000000000000000000000000000000000004';

function book(overrides: Partial<Record<keyof AddressBook, string>>): AddressBook {
  const base = Object.fromEntries(
    (
      [
        'tokenAddress',
        'memberNFT',
        'stake',
        'submit',
        'vote',
        'mint',
        'phase',
        'launch',
        'actionTarget',
        'groupActionExecutor',
        'groupServiceExecutor',
        'lpExecutor',
        'groupChat',
        'groupChatMember',
        'groupChatAdmin',
        'weth',
        'factory',
        'router',
        'multicall3',
        'airdropDistributor',
        'firstTokenAddress',
        'pair',
        'batchTransfer',
        'hub',
      ] as const
    ).map((key) => [key, ZERO]),
  ) as unknown as AddressBook;
  return { ...base, ...(overrides as Partial<AddressBook>) } as AddressBook;
}

describe('buildApprovalSpenders', () => {
  it('returns the configured rows in the reviewed page order', () => {
    const spenders = buildApprovalSpenders(book({ stake: A, router: B, groupChat: C, vote: D }));

    expect(spenders.map((spender) => spender.id)).toEqual(['router', 'stake', 'vote', 'groupChat']);
    expect(spenders.map((spender) => spender.address)).toEqual([B, A, D, C]);
  });

  it('skips zero and missing slots instead of rendering dead rows', () => {
    const spenders = buildApprovalSpenders(book({}));

    expect(spenders).toEqual([]);
  });

  it('keeps one row per address when two slots hold the same contract', () => {
    const spenders = buildApprovalSpenders(book({ router: A, stake: A, vote: B }));

    expect(spenders).toEqual([
      { id: 'router', address: A },
      { id: 'vote', address: B },
    ]);
  });

  it('compares addresses case-insensitively when de-duplicating', () => {
    const spenders = buildApprovalSpenders(
      book({
        router: '0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa',
        stake: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      }),
    );

    expect(spenders).toHaveLength(1);
    expect(spenders[0]?.id).toBe('router');
  });

  it('declares every slot exactly once', () => {
    const slots = APPROVAL_SPENDER_SLOTS.map((entry) => entry.slot);
    expect(new Set(slots).size).toBe(slots.length);
  });
});

describe('checkSpenderInput', () => {
  const WALLET = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

  it('reports empty and malformed input immediately', () => {
    expect(checkSpenderInput('', WALLET)).toBe('empty');
    expect(checkSpenderInput('   ', WALLET)).toBe('empty');
    expect(checkSpenderInput('0x1234', WALLET)).toBe('invalid');
    expect(checkSpenderInput('hello', WALLET)).toBe('invalid');
    expect(checkSpenderInput('0x' + 'g'.repeat(40), WALLET)).toBe('invalid');
  });

  it('rejects the zero address and the wallet itself', () => {
    expect(checkSpenderInput('0x0000000000000000000000000000000000000000', WALLET)).toBe('zero');
    expect(checkSpenderInput(WALLET.toLowerCase(), WALLET)).toBe('self');
    expect(checkSpenderInput(WALLET, WALLET)).toBe('self');
  });

  it('accepts any other 20-byte address (EOA or contract)', () => {
    expect(checkSpenderInput('0x0000000000000000000000000000000000000001', WALLET)).toBe('ok');
    expect(checkSpenderInput('0x0165878A594ca255338adfa4d48449f69242Eb8F', WALLET)).toBe('ok');
  });
});
