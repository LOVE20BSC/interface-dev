import { describe, expect, it } from 'vitest';
import {
  formatDeploymentBlock,
  formatIntegerSupply,
  formatPhaseValue,
  formatPoolBalance,
  formatRpcUrls,
  formatSupplyWithSymbol,
} from './about-format';

describe('about data formatting', () => {
  it('formats supplies with grouping and the chain symbol', () => {
    expect(formatIntegerSupply(6n)).toBe('6');
    expect(formatIntegerSupply(1_234_567n)).toBe('1,234,567');
    expect(formatSupplyWithSymbol(100_000_000n * 10n ** 18n, 18, 'TestLOVE20')).toBe(
      '100,000,000 TestLOVE20',
    );
    expect(formatSupplyWithSymbol(42n, 0, undefined)).toBe('42');
  });

  it('formats the airdrop pool balance with the shared token rule', () => {
    expect(formatPoolBalance(99_799_100_000_000_000_000_000_000n, 18, 'TestLOVE20')).toBe(
      '99,799,100 TestLOVE20',
    );
    expect(formatPoolBalance(1_500_000n, 6, 'USDT')).toBe('1.5 USDT');
  });

  it('renders honest `—` for unknown data', () => {
    expect(formatDeploymentBlock(null)).toBe('—');
    expect(formatDeploymentBlock(undefined)).toBe('—');
    expect(formatPhaseValue(undefined)).toBe('—');
    expect(formatRpcUrls([])).toBe('—');
  });

  it('formats the deployment block and RPC list without inventing values', () => {
    expect(formatDeploymentBlock(32)).toBe('32');
    expect(formatRpcUrls(['http://127.0.0.1:8545'])).toBe('http://127.0.0.1:8545');
    expect(formatRpcUrls(['https://a.example', 'https://b.example'])).toBe(
      'https://a.example\nhttps://b.example',
    );
    expect(formatPhaseValue(12n)).toBe('12');
  });
});
