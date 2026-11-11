import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NAME_DEBOUNCE_MS, useMemberNameRecipient } from './use-member-name-recipient';

const { readContract, client } = vi.hoisted(() => {
  const readContract = vi.fn();
  return { readContract, client: { readContract } };
});

vi.mock('wagmi', () => ({
  usePublicClient: () => client,
}));

const MEMBER_NFT = '0xdC64a140Aa3E981100a9becA4E685f962f0cF6C9';
const SELF = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const OTHER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

/** Chain reads the hook issues, keyed by the contract function name. */
function stubChain(): void {
  readContract.mockImplementation(async (call: { functionName: string; args: readonly unknown[] }) => {
    const name = call.args[0];
    if (call.functionName === 'memberId') {
      return name === 'Testdev-member-1' ? 2n : name === 'Testdev-member-2' ? 3n : 0n;
    }
    if (call.functionName === 'memberName') {
      return call.args[0] === 2n ? 'Testdev-member-1' : 'Testdev-member-2';
    }
    if (call.functionName === 'ownerOf') return OTHER;
    throw new Error(`unexpected call ${call.functionName}`);
  });
}

function callCount(functionName: string): number {
  return readContract.mock.calls.filter(
    ([call]) => (call as { functionName: string }).functionName === functionName,
  ).length;
}

describe('useMemberNameRecipient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    readContract.mockReset();
    stubChain();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it(`waits ${NAME_DEBOUNCE_MS} ms after the last keystroke before reading the chain`, async () => {
    const { result, rerender } = renderHook(
      ({ input }) => useMemberNameRecipient(MEMBER_NFT, input, true, SELF),
      { initialProps: { input: 'Testdev-member' } },
    );

    await act(async () => {
      vi.advanceTimersByTime(NAME_DEBOUNCE_MS - 1);
    });
    expect(result.current.status).toBe('reading');
    expect(readContract).not.toHaveBeenCalled();

    // A keystroke restarts the timer: the partial name never reaches the chain.
    rerender({ input: 'Testdev-member-1' });
    await act(async () => {
      vi.advanceTimersByTime(NAME_DEBOUNCE_MS - 1);
    });
    expect(readContract).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(callCount('memberId')).toBe(1);
    expect(readContract.mock.calls.map(([call]) => (call as { functionName: string }).functionName))
      .toEqual(['memberId', 'memberName', 'ownerOf']);
    expect(result.current).toMatchObject({
      status: 'ok',
      memberId: 2n,
      name: 'Testdev-member-1',
      address: OTHER,
    });
  });

  it('reuses the session cache for case variants so the second lookup skips the getter', async () => {
    const first = renderHook(() =>
      useMemberNameRecipient(MEMBER_NFT, 'Testdev-member-2', true, SELF),
    );
    await act(async () => {
      vi.advanceTimersByTime(NAME_DEBOUNCE_MS);
    });
    expect(first.result.current.status).toBe('ok');
    expect(callCount('memberId')).toBe(1);
    first.unmount();

    const second = renderHook(() =>
      useMemberNameRecipient(MEMBER_NFT, 'TESTDEV-MEMBER-2', true, SELF),
    );
    await act(async () => {
      vi.advanceTimersByTime(NAME_DEBOUNCE_MS);
    });
    expect(second.result.current.status).toBe('ok');
    // Cached id/name, but ownership is always read fresh for the new lookup.
    expect(callCount('memberId')).toBe(1);
    expect(callCount('memberName')).toBe(1);
    expect(callCount('ownerOf')).toBe(2);
  });
});
