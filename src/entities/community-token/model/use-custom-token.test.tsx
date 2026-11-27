import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useBytecode, useReadContracts } from 'wagmi';
import { useCustomToken } from '@/entities/community-token/model/use-custom-token';

/**
 * §5.2 回归：`refetch()` 无视 `enabled: false`。
 *
 * 这个 hook 的两个读都被 `enabled: address !== undefined` 门住；`retry` 曾经无条件
 * `void code.refetch()`，而转账 / 授权面板把「重新读取」渲染在**所有**自定义代币错误
 * 旁（包括地址格式不对）。点一下等于对 disabled 查询发空参数请求——什么也不会发生，
 * 还可能在日志里留下一次无意义失败。现在：禁用态绝不重读，且面板只对读失败渲染按钮。
 */

vi.mock('wagmi', () => ({
  useBytecode: vi.fn(),
  useReadContracts: vi.fn(),
}));

const TOKEN = '0x8aCd85898458400f7Db866d53FCFF6f0D49741FF';
const MALFORMED = '0x1234';

const bytecode = vi.mocked(useBytecode);
const readContracts = vi.mocked(useReadContracts);

function mockBytecode(overrides: { isError?: boolean; refetch?: () => void } = {}): () => void {
  const refetch = overrides.refetch ?? vi.fn();
  bytecode.mockReturnValue({
    data: '0x6080',
    isLoading: false,
    isError: overrides.isError ?? false,
    refetch,
  } as unknown as ReturnType<typeof useBytecode>);
  return refetch;
}

function mockMetadata(refetch: () => void = vi.fn()): () => void {
  readContracts.mockReturnValue({
    data: [
      { status: 'success', result: 'TestLOVE20' },
      { status: 'success', result: 18 },
    ],
    isLoading: false,
    refetch,
  } as unknown as ReturnType<typeof useReadContracts>);
  return refetch;
}

describe('useCustomToken.retry（§5.2 enabled 守卫）', () => {
  beforeEach(() => {
    bytecode.mockReset();
    readContracts.mockReset();
  });

  it('地址格式不对时 retry 不重读（两个读都是 disabled）', () => {
    const codeRefetch = mockBytecode();
    const metaRefetch = mockMetadata();

    const { result } = renderHook(() => useCustomToken(MALFORMED));

    expect(result.current.status).toBe('malformed');
    expect(bytecode).toHaveBeenCalledWith(
      expect.objectContaining({ address: undefined, query: { enabled: false } }),
    );

    act(() => {
      result.current.retry();
    });

    expect(codeRefetch).not.toHaveBeenCalled();
    expect(metaRefetch).not.toHaveBeenCalled();
  });

  it('空输入时同样不重读', () => {
    const codeRefetch = mockBytecode();
    const metaRefetch = mockMetadata();

    const { result } = renderHook(() => useCustomToken(''));

    expect(result.current.status).toBe('empty');
    act(() => {
      result.current.retry();
    });

    expect(codeRefetch).not.toHaveBeenCalled();
    expect(metaRefetch).not.toHaveBeenCalled();
  });

  it('地址合法但读失败时，retry 重读 bytecode 与元数据各一次', () => {
    const codeRefetch = mockBytecode({ isError: true });
    const metaRefetch = mockMetadata();

    const { result } = renderHook(() => useCustomToken(TOKEN));

    expect(result.current.status).toBe('unreadable');

    act(() => {
      result.current.retry();
    });

    expect(codeRefetch).toHaveBeenCalledTimes(1);
    expect(metaRefetch).toHaveBeenCalledTimes(1);
  });
});
