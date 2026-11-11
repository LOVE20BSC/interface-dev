import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AirdropReminder } from '@/pages/home/airdrop-reminder';
import { useAirdropEligibility } from '@/entities/airdrop/model/use-airdrop-eligibility';
import { useFirstToken } from '@/entities/community-token/model/use-first-token';
import type { AirdropEligibility } from '@/entities/airdrop/model/use-airdrop-eligibility';
import type { FirstToken } from '@/entities/community-token/model/use-first-token';

vi.mock('@/entities/airdrop/model/use-airdrop-eligibility', () => ({
  useAirdropEligibility: vi.fn(),
}));

vi.mock('@/entities/community-token/model/use-first-token', () => ({
  useFirstToken: vi.fn(),
}));

const eligibility = vi.mocked(useAirdropEligibility);
const firstToken = vi.mocked(useFirstToken);

const TOKEN: FirstToken = {
  status: 'ready',
  address: '0x8aCd85898458400f7Db866d53FCFF6f0D49741FF',
  symbol: 'TestLOVE20',
  name: 'TestLOVE20@TestWETH',
  decimals: 18,
  balance: undefined,
  refetch: () => {},
};

const ELIGIBLE: AirdropEligibility = {
  status: 'eligible',
  isEligible: true,
  share: 1n,
  claimableAmount: 100_000_000n * 10n ** 18n,
  refetch: () => {},
};

function renderReminder(props: { primary?: boolean; onStatusChange?: () => void } = {}) {
  const onStatusChange = vi.fn();
  const view = render(
    <MemoryRouter initialEntries={['/?symbol=TestLOVE20']}>
      <AirdropReminder
        primary={props.primary ?? true}
        onStatusChange={onStatusChange}
        search="?symbol=TestLOVE20"
      />
    </MemoryRouter>,
  );
  return { ...view, onStatusChange };
}

beforeEach(() => {
  eligibility.mockReturnValue(ELIGIBLE);
  firstToken.mockReturnValue(TOKEN);
});

describe('AirdropReminder', () => {
  it('shows the claimable amount and links to /airdrop with the current search', () => {
    renderReminder();

    expect(screen.getByRole('heading', { name: '你有空投资格，可铸造 100,000,000 TestLOVE20' }))
      .toBeVisible();
    const cta = screen.getByRole('link', { name: '空投铸造' });
    expect(cta).toHaveAttribute('href', '/airdrop?symbol=TestLOVE20');
    expect(cta.className).toContain('bg-brand');
  });

  it('drops the amount clause instead of printing 「—」 inside the sentence', () => {
    eligibility.mockReturnValue({ ...ELIGIBLE, claimableAmount: undefined });
    renderReminder();

    expect(screen.getByRole('heading', { name: '你有空投资格' })).toBeVisible();
    expect(screen.queryByText(/—/)).toBeNull();
  });

  it('drops the amount clause when the genesis decimals are unknown', () => {
    firstToken.mockReturnValue({ ...TOKEN, decimals: undefined });
    renderReminder();

    expect(screen.getByRole('heading', { name: '你有空投资格' })).toBeVisible();
  });

  it('uses the secondary style when the identity reminder already owned the filled button', () => {
    renderReminder({ primary: false });

    expect(screen.getByRole('link', { name: '空投铸造' }).className).not.toContain('bg-brand');
  });

  it('renders nothing and reports other when the wallet is not eligible', async () => {
    eligibility.mockReturnValue({ ...ELIGIBLE, status: 'ineligible', isEligible: false });
    const { onStatusChange } = renderReminder();

    expect(screen.queryByRole('heading')).toBeNull();
    await waitFor(() => expect(onStatusChange).toHaveBeenCalledWith('other'));
  });

  it('reports pending while the snapshot is still loading', async () => {
    eligibility.mockReturnValue({ ...ELIGIBLE, status: 'loading', isEligible: false });
    const { onStatusChange } = renderReminder();

    expect(screen.queryByRole('heading')).toBeNull();
    await waitFor(() => expect(onStatusChange).toHaveBeenCalledWith('pending'));
  });
});
