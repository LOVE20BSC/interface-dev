import type { EnvVariant } from '@/config/variant';
import {
  isMemberNameCharacterValid,
  isTestPrefixedName,
  utf8ByteLength,
} from '@/domain/member-name';

/**
 * Dev/test builds require the identity name to start with `Test`; prod has no
 * prefix rule at all. The switch is the build variant (the environment package),
 * never the payment token's symbol(): core@72a1604 removed the chain-side prefix.
 */
export function requiresTestNamePrefix(variant: EnvVariant): boolean {
  return variant !== 'prod';
}

export type LocalNameStatus =
  'empty' | 'too-long' | 'invalid' | 'prefix-required' | 'waiting' | 'ok';

export interface LocalNameRuleInput {
  readonly name: string;
  readonly variant: EnvVariant;
  readonly maxNameLength: number | undefined;
  readonly isConfigReady: boolean;
}

/**
 * The browser-decidable part of the §3.3 check line, in precedence order:
 * empty → chain config not ready → dev/test `Test` prefix → characters → length.
 * Length uses the full MAX_NAME_LENGTH; the prefix is not subtracted from it.
 */
export function localNameStatus({
  name,
  variant,
  maxNameLength,
  isConfigReady,
}: LocalNameRuleInput): LocalNameStatus {
  if (name.length === 0) return 'empty';
  if (!isConfigReady || maxNameLength === undefined) return 'waiting';
  if (requiresTestNamePrefix(variant) && !isTestPrefixedName(name)) return 'prefix-required';
  if (!isMemberNameCharacterValid(name)) return 'invalid';
  if (utf8ByteLength(name) > maxNameLength) return 'too-long';
  return 'ok';
}
