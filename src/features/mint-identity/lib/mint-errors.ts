import { CONTRACT_ERROR_NAMES } from '@/config/errors.generated';
import { copy } from '@/shared/config/copy';
import {
  extractRevertData,
  getContractErrorMessage,
  isUserRejection,
  toUserMessage,
} from '@/shared/lib/errors';

export interface MintErrorContext {
  readonly paymentSymbol?: string | undefined;
}

/**
 * OpenZeppelin v5 ERC20 custom errors are not in registry/errors.json (it only
 * carries protocol errors), so the two that matter to the approve → mint ladder
 * are mapped here by selector. `cast sig` of the signatures in the ABI:
 *   ERC20InsufficientAllowance(address,uint256,uint256) → 0xfb8f41b2
 *   ERC20InsufficientBalance(address,uint256,uint256)   → 0xe450d38c
 */
const ERC20_INSUFFICIENT_ALLOWANCE = '0xfb8f41b2';
const ERC20_INSUFFICIENT_BALANCE = '0xe450d38c';

/**
 * UX spec §4.4: write the result and the next step, never the mechanism.
 * Protocol custom errors go through the generated registry; the handful the
 * mint page needs a specific next step for are overridden below.
 */
export function describeMintError(error: unknown, context: MintErrorContext = {}): string {
  if (isUserRejection(error)) return copy.mintIdentity.errors.rejected;

  const data = extractRevertData(error);
  const selector = data !== null ? data.slice(0, 10).toLowerCase() : null;

  if (selector !== null) {
    if (selector === ERC20_INSUFFICIENT_ALLOWANCE) {
      // §4.1: keep the name and page, ask for one more approval.
      return copy.mintIdentity.errors.allowanceShort;
    }
    if (selector === ERC20_INSUFFICIENT_BALANCE) {
      return context.paymentSymbol !== undefined
        ? copy.mintIdentity.errors.balanceShort(context.paymentSymbol)
        : copy.mintIdentity.errors.generic;
    }

    switch (CONTRACT_ERROR_NAMES[selector]) {
      case 'NameAlreadyExists':
        return copy.mintIdentity.errors.nameTaken;
      case 'NameTooLong':
        return copy.mintIdentity.errors.nameTooLong;
      case 'NameInvalidCharacters':
        return copy.mintIdentity.errors.nameInvalid;
      case 'NameEmpty':
        return copy.mintIdentity.errors.nameEmpty;
      default:
        break;
    }

    const mapped = getContractErrorMessage(selector);
    if (mapped !== null) return mapped;
  }

  return toUserMessage(error);
}
