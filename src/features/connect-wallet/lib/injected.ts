import type { InjectedProvider } from '@/shared/types/ethereum';

/** The one wallet transport M0 supports: an injected EIP-1193 provider. */
export function getInjectedProvider(): InjectedProvider | null {
  if (typeof window === 'undefined') return null;
  return window.ethereum ?? null;
}

export function hasInjectedProvider(): boolean {
  return getInjectedProvider() !== null;
}
