import { describe, expect, it } from 'vitest';
import { formatBuildId } from './format';

/**
 * 走查 2026-11-21（P3-2）：截 12 位会切在时间戳与随机段中间（`mwqjfm06-6f2` 像乱码），
 * 改为只显示 8 位时间戳前缀；完整 id 由调用方放进 `title`。
 */
describe('formatBuildId', () => {
  it('只保留 8 位前缀', () => {
    expect(formatBuildId('mwqjfm06-6f2324d5')).toBe('mwqjfm06');
  });

  it('短于 8 位时原样返回', () => {
    expect(formatBuildId('abc')).toBe('abc');
  });

  it('恰好 8 位不截断', () => {
    expect(formatBuildId('12345678')).toBe('12345678');
  });
});
