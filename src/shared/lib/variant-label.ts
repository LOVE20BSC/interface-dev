import type { EnvVariant } from '@/config/variant';
import { copy } from '@/shared/config/copy';

/**
 * Environment label for UI. Kept out of config/variant.ts because config is a
 * leaf data package: user-visible Chinese must not live there (i18n door rule).
 */
export function variantLabel(variant: EnvVariant): string {
  return copy.build.variant[variant];
}
