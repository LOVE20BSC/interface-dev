export const VARIANTS = ['dev', 'test', 'prod'] as const;

export type EnvVariant = (typeof VARIANTS)[number];

/** One build variant maps to exactly one address book file. */
export const DEPLOYMENT_FILES: Readonly<Record<EnvVariant, string>> = Object.freeze({
  dev: 'anvil31337_dev.json',
  test: 'bscTestnet_test.json',
  prod: 'bscMainnet_prod.json',
});

const MODE_TO_VARIANT: Readonly<Record<string, EnvVariant>> = Object.freeze({
  development: 'dev',
  test: 'test',
  production: 'prod',
  // `vite --mode test` / `vite --mode prod` are also supported.
  dev: 'dev',
  prod: 'prod',
});

export function isEnvVariant(value: string | undefined): value is EnvVariant {
  return value !== undefined && (VARIANTS as readonly string[]).includes(value);
}

/**
 * The sole environment switch.
 * `VITE_ENV` wins when set; otherwise the standard Vite mode is mapped.
 * Anything else fails the build instead of silently shipping the wrong address book.
 */
export function resolveVariant(explicit: string | undefined, mode: string): EnvVariant {
  if (explicit !== undefined && explicit.length > 0) {
    if (isEnvVariant(explicit)) return explicit;
    throw new Error(`Unknown VITE_ENV="${explicit}". Expected one of: ${VARIANTS.join(', ')}.`);
  }
  const fromMode = MODE_TO_VARIANT[mode];
  if (fromMode !== undefined) return fromMode;
  throw new Error(
    `Cannot resolve environment: VITE_ENV is unset and mode="${mode}" is not one of ` +
      `${Object.keys(MODE_TO_VARIANT).join(', ')}.`,
  );
}
