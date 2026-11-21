import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ClaimAirdropPanel } from '@/features/claim-airdrop/ui/claim-airdrop-panel';

/**
 * 空投铸造 S5 card (owner 2026-11-17).
 *
 * The status card lost its 「本次空投：{symbol}」 meta line on every state, the
 * eligible card is exactly two lines (share sentence, then the amount), the CTA
 * says 「立即铸造」, and 规则 opens by default with the full eligibility
 * paragraph. The rest of the page's behaviour stays covered by e2e.
 */

const h = vi.hoisted(() => {
  const eligible = {
    status: 'eligible',
    errorKind: undefined as string | undefined,
    reason: undefined as string | undefined,
    airdropAddress: '0x00000000000000000000000000000000000000a1' as string | undefined,
    tokenAddress: '0x00000000000000000000000000000000000000b2' as string | undefined,
    tokenSymbol: 'TestLOVE20' as string | undefined,
    tokenDecimals: 18 as number | undefined,
    entry: null,
    share: 100000000000000000n as bigint | undefined,
    totalShare: 1000000000000000000n as bigint | undefined,
    sharePercent: '10%' as string | undefined,
    claimableAmount: (100000000n * 10n ** 18n) as bigint | undefined,
    poolBalance: (500000000n * 10n ** 18n) as bigint | undefined,
    remainingShare: 500000000000000000n as bigint | undefined,
    roundGate: { reached: true, minutes: null as number | null },
    localReceipt: null,
    refetch: () => {},
  };
  return {
    eligible,
    identity: { balance: 0n as bigint | undefined },
    claim: { ...eligible },
    tx: {
      stage: 'idle',
      receipt: null,
      pendingHash: null,
      error: null as string | null,
      errorKind: null as string | null,
      isHydrating: false,
      watch: {
        status: 'idle',
        hash: null,
        receipt: null,
        submittedNonce: undefined,
        remainingMs: 0,
        remainingSeconds: 0,
        isStuck: false,
        isSettled: false,
        refresh: () => {},
      },
      resubmit: () => {},
      claim: () => {},
      clearError: () => {},
    },
  };
});

vi.mock('@/features/claim-airdrop/model/use-airdrop-claim', () => ({
  useAirdropClaim: () => h.claim,
}));

vi.mock('@/features/claim-airdrop/model/use-airdrop-claim-transaction', () => ({
  useAirdropClaimTransaction: () => h.tx,
}));

vi.mock('@/features/claim-airdrop/model/use-claimed-amount', () => ({
  useClaimedAmount: () => ({ amount: undefined, isLoading: false }),
}));

vi.mock('@/entities/member-identity/model/use-member-identity', () => ({
  useMemberIdentity: () => ({ balance: h.identity.balance }),
}));

const RULES_BODY =
  '空投资格：从TKM链公平发射开始，参与或部分参与1年多的社群铸币实验，并参与资产销毁锁定活动的社群成员，基于每个人在每个社区的销毁锁定份额计算出本链创世代币的空投份额，具体份额计算规则详见销毁活动：';
const RULES_LINK = 'https://love20tkm.github.io/interface/apps/burn/';

function renderPanel(props: { isConnected?: boolean; isWrongChain?: boolean } = {}) {
  return render(
    <MemoryRouter>
      <ClaimAirdropPanel
        isConnected={props.isConnected ?? true}
        isWrongChain={props.isWrongChain ?? false}
        connectAction={<button type="button">连接钱包</button>}
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  h.identity.balance = 0n;
  Object.assign(h.claim, h.eligible);
  h.tx.stage = 'idle';
  h.tx.error = null;
  h.tx.errorKind = null;
});

describe('ClaimAirdropPanel S5 card', () => {
  it('locks the owner 2026-11-17 spec in one pass', () => {
    renderPanel();

    // Line 1: 「我的份额 {percent}，预计可铸造空投 {symbol}：」
    expect(screen.getByTestId('airdrop-share-percent')).toHaveTextContent(
      '我的份额 10%，预计可铸造空投 TestLOVE20：',
    );
    // Line 2: the amount.
    expect(screen.getByTestId('airdrop-expected-amount')).toHaveTextContent('100,000,000');
    // CTA: 立即铸造.
    expect(screen.getByRole('button', { name: '立即铸造' })).toBeEnabled();
    // 规则: expanded by default.
    expect(screen.getByTestId('airdrop-rules')).toHaveAttribute('open');
  });

  it('renders two lines: the share sentence then the emphasized amount', () => {
    renderPanel();

    // Line 1: share (already carrying %) + the unit, ending in 「：」.
    expect(screen.getByTestId('airdrop-share-percent')).toHaveTextContent(
      '我的份额 10%，预计可铸造空投 TestLOVE20：',
    );

    // Line 2: the amount alone — the symbol is not repeated here.
    const amount = screen.getByTestId('airdrop-expected-amount');
    expect(amount).toHaveTextContent('100,000,000');
    expect(amount.textContent).not.toContain('TestLOVE20');
    // The accessible name still says what the number is, in one sentence.
    expect(amount).toHaveAttribute('aria-label', '预计可铸造空投 100,000,000 TestLOVE20');
    // Prominent line: the 2xl emphasis class lives on the amount, not the share.
    expect(amount.className).toContain('text-2xl');
    expect(screen.getByTestId('airdrop-share-percent').className).not.toContain('text-2xl');
  });

  it('labels the only CTA 「立即铸造」', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: '立即铸造' })).toBeEnabled();
  });

  it('drops the old meta line and the pool-balance note', () => {
    renderPanel();
    expect(screen.queryByText(/本次空投/)).toBeNull();
    expect(screen.queryByText(/按铸造时的池子余额/)).toBeNull();
  });
});

describe('ClaimAirdropPanel rules fold', () => {
  it('is expanded by default and shows the owner paragraph verbatim', () => {
    renderPanel();

    const rules = screen.getByTestId('airdrop-rules');
    expect(rules.tagName).toBe('DETAILS');
    expect(rules).toHaveAttribute('open');

    // The paragraph and its closing URL read as one verbatim sentence.
    expect(rules.textContent).toContain(`${RULES_BODY}${RULES_LINK}`);

    const link = screen.getByRole('link', { name: RULES_LINK });
    expect(link).toHaveAttribute('href', RULES_LINK);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });

  it('stays expanded on the states that also show the fold', () => {
    h.claim.status = 'ineligible';
    renderPanel();
    expect(screen.getByTestId('airdrop-rules')).toHaveAttribute('open');
  });
});

describe('ClaimAirdropPanel 已铸造态（S6）的主 CTA', () => {
  beforeEach(() => {
    Object.assign(h.claim, { status: 'claimed' });
  });

  it('钱包没有身份 NFT 时，主 CTA 是「去铸造身份 NFT」', () => {
    h.identity.balance = 0n;
    renderPanel();
    expect(screen.getByRole('link', { name: '去铸造身份 NFT' })).toBeVisible();
    expect(screen.queryByRole('link', { name: '去治理' })).toBeNull();
  });

  it('钱包已有身份 NFT 时，主 CTA 改成「去治理」（走查 2026-11-21 P2-1）', () => {
    h.identity.balance = 1n;
    renderPanel();
    expect(screen.getByRole('link', { name: '去治理' })).toBeVisible();
    expect(screen.queryByRole('link', { name: '去铸造身份 NFT' })).toBeNull();
  });
});

describe('ClaimAirdropPanel removed meta line', () => {
  const states = [
    { status: 'round-gated', extra: { roundGate: { reached: false, minutes: 5 } } },
    { status: 'ineligible' },
    { status: 'unavailable', extra: { reason: 'zero-amount' } },
    { status: 'claimed' },
    { status: 'loading' },
    { status: 'error', extra: { errorKind: 'read' } },
    { status: 'unconfigured' },
  ];

  for (const state of states) {
    it(`never renders 「本次空投」 in the ${state.status} state`, () => {
      Object.assign(h.claim, state.extra ?? {}, { status: state.status });
      renderPanel();
      expect(screen.queryByText(/本次空投/)).toBeNull();
    });
  }

  it('never renders 「本次空投」 while disconnected or on the wrong chain', () => {
    renderPanel({ isConnected: false });
    expect(screen.queryByText(/本次空投/)).toBeNull();
  });

  it('never renders 「本次空投」 on the wrong-chain card', () => {
    renderPanel({ isWrongChain: true });
    expect(screen.queryByText(/本次空投/)).toBeNull();
  });
});
