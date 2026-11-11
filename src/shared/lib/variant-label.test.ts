import { describe, expect, it } from 'vitest';
import { variantLabel } from '@/shared/lib/variant-label';

describe('variantLabel', () => {
  it('maps every environment variant to copy, never to a literal in config/', () => {
    expect(variantLabel('dev')).toBe('本地开发');
    expect(variantLabel('test')).toBe('测试网');
    expect(variantLabel('prod')).toBe('主网');
  });
});
