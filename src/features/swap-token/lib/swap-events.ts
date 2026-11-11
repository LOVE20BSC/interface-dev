import { parseAbiItem, parseEventLogs, type Log } from 'viem';
import { uniswapV2PairAbi, weth9Abi } from '@/config/abis';
import type { HexAddress } from '@/config/networks';
import { sameAddress } from './swap-types';
import type { SwapRecordKind } from './swap-receipt-record';
import type { SwapPairRead } from './swap-route';

const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

export interface SwapReceiptParseInput {
  readonly kind: SwapRecordKind;
  readonly path: readonly HexAddress[];
  readonly pairs: readonly SwapPairRead[];
  readonly logs: readonly Log[];
  readonly account: HexAddress;
  readonly amountIn: bigint;
  readonly minOut: bigint;
}

export interface SwapReceiptParseResult {
  readonly actualOut: bigint | undefined;
  readonly paidIn: bigint | undefined;
  readonly belowMinOut: boolean;
  /** True when the pair Swap ledger (or the WETH wrap event) was not found. */
  readonly missingLedgerEvent: boolean;
}

function parseSwapEvents(logs: readonly Log[]) {
  try {
    return parseEventLogs({ abi: uniswapV2PairAbi, logs: [...logs], eventName: 'Swap' });
  } catch {
    return [];
  }
}

function parseDeposits(logs: readonly Log[]) {
  try {
    return parseEventLogs({ abi: weth9Abi, logs: [...logs], eventName: 'Deposit' });
  } catch {
    return [];
  }
}

function parseWithdrawals(logs: readonly Log[]) {
  try {
    return parseEventLogs({ abi: weth9Abi, logs: [...logs], eventName: 'Withdrawal' });
  } catch {
    return [];
  }
}

function amountsForDirection(
  pair: SwapPairRead,
  tokenIn: HexAddress,
  tokenOut: HexAddress,
  args: {
    readonly amount0In: bigint;
    readonly amount1In: bigint;
    readonly amount0Out: bigint;
    readonly amount1Out: bigint;
  },
): { readonly amountIn: bigint; readonly amountOut: bigint } | null {
  const inputIsToken0 = sameAddress(pair.token0, tokenIn);
  const outputIsToken0 = sameAddress(pair.token0, tokenOut);
  if (inputIsToken0 === outputIsToken0) return null;
  return {
    amountIn: inputIsToken0 ? args.amount0In : args.amount1In,
    amountOut: outputIsToken0 ? args.amount0Out : args.amount1Out,
  };
}

/** ERC20 input: the exact amount the wallet actually sent to the first pair. */
function transferToPair(
  logs: readonly Log[],
  token: HexAddress,
  from: HexAddress,
  to: HexAddress,
): bigint | undefined {
  try {
    const parsed = parseEventLogs({
      abi: [TRANSFER_EVENT],
      logs: [...logs],
      eventName: 'Transfer',
    });
    const match = parsed.find(
      (event) =>
        event.address.toLowerCase() === token.toLowerCase() &&
        sameAddress(event.args.from, from) &&
        sameAddress(event.args.to, to),
    );
    return match?.args.value;
  } catch {
    return undefined;
  }
}

/**
 * Uniswap V2 receipts do not carry `amounts`; the pair Swap ledger does. For a
 * native leg the WETH9 Deposit/Withdrawal events are the actual native amount,
 * so a quote is never rendered as the result (spec §3.5/§4.3).
 */
export function parseSwapReceipt(input: SwapReceiptParseInput): SwapReceiptParseResult {
  const { kind, path, pairs, logs, account, minOut } = input;

  if (kind === 'wrap') {
    const wad = parseDeposits(logs).find((event) => sameAddress(event.args.dst, account))?.args.wad;
    return {
      actualOut: wad,
      paidIn: wad,
      belowMinOut: wad !== undefined && wad < minOut,
      missingLedgerEvent: wad === undefined,
    };
  }

  if (kind === 'unwrap') {
    const wad = parseWithdrawals(logs).find((event) => sameAddress(event.args.src, account))?.args
      .wad;
    return {
      actualOut: wad,
      paidIn: wad,
      belowMinOut: wad !== undefined && wad < minOut,
      missingLedgerEvent: wad === undefined,
    };
  }

  const swapEvents = parseSwapEvents(logs);
  let firstIn: bigint | undefined;
  let lastOut: bigint | undefined;
  let missingSwap = false;

  for (let index = 0; index < path.length - 1; index += 1) {
    const pair = pairs[index];
    const tokenIn = path[index];
    const tokenOut = path[index + 1];
    if (pair === undefined || tokenIn === undefined || tokenOut === undefined) {
      missingSwap = true;
      continue;
    }
    const event = swapEvents.find(
      (candidate) => candidate.address.toLowerCase() === pair.address.toLowerCase(),
    );
    if (event === undefined) {
      missingSwap = true;
      continue;
    }
    const amounts = amountsForDirection(pair, tokenIn, tokenOut, event.args);
    if (amounts === null) {
      missingSwap = true;
      continue;
    }
    if (index === 0) firstIn = amounts.amountIn;
    lastOut = amounts.amountOut;
  }

  const deposit = parseDeposits(logs).find((event) => sameAddress(event.args.dst, account))?.args
    .wad;
  const withdrawal = parseWithdrawals(logs).find((event) => sameAddress(event.args.src, account))
    ?.args.wad;

  const firstPair = pairs[0];
  const firstToken = path[0];
  const paidIn =
    firstIn !== undefined && firstPair !== undefined && firstToken !== undefined
      ? (transferToPair(logs, firstToken, account, firstPair.address) ?? deposit ?? firstIn)
      : (deposit ?? undefined);

  // The final hop can be WETH; the actual native received is the Withdrawal wad.
  const actualOut = withdrawal ?? lastOut;

  return {
    actualOut,
    paidIn,
    belowMinOut: actualOut !== undefined && actualOut < minOut,
    missingLedgerEvent: missingSwap && actualOut === undefined,
  };
}
