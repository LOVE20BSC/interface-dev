import { APP_ENV } from './env';
import type { EnvVariant } from './variant';

/**
 * Merkle snapshot the frontend bundles for airdrop eligibility.
 *
 * Only the local anvil export exists today; test/prod have no snapshot until a
 * deployment publishes one, so they expose `null` and the UI stays neutral
 * instead of inventing eligibility. Served as a static same-origin file (no
 * third-party service) and fetched after first paint, never imported eagerly.
 */
const SNAPSHOT_FILES: Readonly<Record<EnvVariant, string | null>> = Object.freeze({
  dev: 'airdrop/anvil31337_dev.json',
  test: null,
  prod: null,
});

export const AIRDROP_SNAPSHOT_PATH: string | null = SNAPSHOT_FILES[APP_ENV.variant];
