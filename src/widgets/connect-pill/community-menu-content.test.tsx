import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommunityMenuContent } from '@/widgets/connect-pill/community-menu-content';
import type { CommunitySymbolSearch } from '@/features/switch-community/model/use-community-symbol-search';
import { useCommunitySymbolSearch } from '@/features/switch-community/model/use-community-symbol-search';
import { useRecentCommunities } from '@/features/switch-community/model/use-recent-communities';

vi.mock('@/features/switch-community/model/use-community-symbol-search', () => ({
  useCommunitySymbolSearch: vi.fn(),
}));

vi.mock('@/features/switch-community/model/use-recent-communities', () => ({
  useRecentCommunities: vi.fn(),
}));

const search = vi.mocked(useCommunitySymbolSearch);
const recent = vi.mocked(useRecentCommunities);

function searchState(overrides: Partial<CommunitySymbolSearch> = {}): CommunitySymbolSearch {
  return { query: '', matches: [], status: 'idle', ...overrides };
}

function renderMenu(onSwitch = vi.fn(), onNavigate = vi.fn()) {
  render(
    <CommunityMenuContent
      currentSymbol="TestLOVE20"
      onSwitch={onSwitch}
      onNavigate={onNavigate}
    />,
  );
  return { onSwitch, onNavigate };
}

beforeEach(() => {
  recent.mockReturnValue({
    recent: [
      { symbol: 'TestLOVE20', at: 2 },
      { symbol: 'TestEMPTY1', at: 1 },
    ],
    record: vi.fn(),
  });
  search.mockReturnValue(searchState());
});

describe('CommunityMenuContent symbol 搜索', () => {
  it('shows 最近访问 (excluding the current community) while the input is empty', () => {
    renderMenu();
    expect(screen.getByTestId('community-search')).toHaveAttribute(
      'placeholder',
      '输入代币 symbol',
    );
    expect(screen.getByText('最近访问')).toBeInTheDocument();
    expect(screen.getByText('TestEMPTY1')).toBeInTheDocument();
    expect(screen.queryByText('TestLOVE20')).not.toBeInTheDocument();
    expect(screen.queryByTestId('community-search-results')).not.toBeInTheDocument();
  });

  it('lists exact/prefix matches while typing and switches on click', () => {
    search.mockReturnValue(
      searchState({
        query: 'Test',
        status: 'found',
        matches: [
          { symbol: 'TestLOVE20', exact: true },
          { symbol: 'TestEMPTY1', exact: false },
        ],
      }),
    );
    const { onSwitch, onNavigate } = renderMenu();

    fireEvent.change(screen.getByTestId('community-search'), {
      target: { value: 'Test' },
    });
    expect(search).toHaveBeenLastCalledWith('Test');
    expect(screen.getByTestId('community-search-results')).toBeInTheDocument();
    expect(screen.getByText('精确匹配')).toBeInTheDocument();
    expect(screen.getByText('当前')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('community-search-result-TestEMPTY1'));
    expect(onSwitch).toHaveBeenCalledWith('TestEMPTY1');
    expect(onNavigate).toHaveBeenCalled();
  });

  it('Enter picks the first match', () => {
    search.mockReturnValue(
      searchState({
        query: 'TestL',
        status: 'found',
        matches: [{ symbol: 'TestLOVE20', exact: true }],
      }),
    );
    const { onSwitch } = renderMenu();
    fireEvent.keyDown(screen.getByTestId('community-search'), { key: 'Enter' });
    expect(onSwitch).not.toHaveBeenCalled(); // already the current community: no-op switch
  });

  it('gives honest loading / empty / error states instead of an empty box', () => {
    for (const [status, text] of [
      ['loading', '正在查找…'],
      ['empty', '没有找到这个 symbol 的社区。'],
      ['error', '社区列表暂时读不到。'],
    ] as const) {
      search.mockReturnValue(searchState({ query: 'zz', status }));
      const view = render(
        <CommunityMenuContent
          currentSymbol="TestLOVE20"
          onSwitch={vi.fn()}
          onNavigate={vi.fn()}
        />,
      );
      expect(screen.getByTestId('community-search-results')).toHaveTextContent(text);
      view.unmount();
    }
  });
});
