import { lazy } from 'react';

/**
 * Wallet dialogs are only mounted on demand. Keeping Radix Dialog (and its
 * scroll-lock / focus-scope code) out of the entry chunk is worth ~10 kB gzip on
 * a mobile first paint; the fallback is an empty node because the dialog is
 * opened by a user action that already gave feedback (the button enters its busy
 * or error state).
 */
export const LazyNoWalletDialog = lazy(async () => {
  const module = await import('@/features/connect-wallet/ui/no-wallet-dialog');
  return { default: module.NoWalletDialog };
});

export const LazyWalletErrorDialog = lazy(async () => {
  const module = await import('@/features/connect-wallet/ui/wallet-error-dialog');
  return { default: module.WalletErrorDialog };
});

export const preloadWalletDialogs = (): void => {
  void import('@/features/connect-wallet/ui/no-wallet-dialog');
  void import('@/features/connect-wallet/ui/wallet-error-dialog');
};
