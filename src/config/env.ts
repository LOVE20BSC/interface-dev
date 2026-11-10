import { resolveVariant, type EnvVariant } from './variant';

export interface AppEnvironment {
  readonly variant: EnvVariant;
  readonly mode: string;
  readonly isDev: boolean;
  readonly isTest: boolean;
  readonly isProd: boolean;
}

const variant = resolveVariant(import.meta.env.VITE_ENV, import.meta.env.MODE);

/**
 * Build-time environment package. Data only: no component may branch on
 * `import.meta.env` or on the variant. Divergence lives in deployments/*.json.
 */
export const APP_ENV: AppEnvironment = Object.freeze({
  variant,
  mode: import.meta.env.MODE,
  isDev: variant === 'dev',
  isTest: variant === 'test',
  isProd: variant === 'prod',
});
