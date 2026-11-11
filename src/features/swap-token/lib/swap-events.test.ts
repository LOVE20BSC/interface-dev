import { describe, expect, it } from 'vitest';
import { encodeAbiParameters, encodeEventTopics, parseAbiItem, type Log } from 'viem';
import { uniswapV2PairAbi, weth9Abi } from '@/config/abis';
import { parseSwapReceipt } from './swap-events';
import type { SwapPairRead } from './swap-route';

const ACCOUNT = '0x00000000000000000000000000000000000000aa';
const WETH = '0x0000000000000000000000000000000000000001';
const TOKEN = '0x0000000000000000000000000000000000000002';
const PAIR = '0x0000000000000000000000000000000000000010';
const HASH = `0x${'11'.repeat(32)}` as const;

const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

const pair: SwapPairRead = {
  address: PAIR,
  token0: TOKEN,
  token1: WETH,
  reserve0: 200_000n * 10n ** 18n,
  reserve1: 100n * 10n ** 18n,
};

function log(address: string, topics: readonly unknown[], data: string): Log {
  return {
    address,
    topics: topics as unknown as Log['topics'],
    data,
    blockHash: HASH,
    blockNumber: 1n,
    transactionHash: HASH,
    transactionIndex: 0,
    logIndex: 0,
    removed: false,
  } as unknown as Log;
}

function swapLog(
  amount0In: bigint,
  amount1In: bigint,
  amount0Out: bigint,
  amount1Out: bigint,
): Log {
  const topics = encodeEventTopics({
    abi: uniswapV2PairAbi,
    eventName: 'Swap',
    args: { sender: ACCOUNT, to: ACCOUNT },
  });
  const data = encodeAbiParameters(
    [{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }],
    [amount0In, amount1In, amount0Out, amount1Out],
  );
  return log(PAIR, topics, data);
}

function wethLog(eventName: 'Deposit' | 'Withdrawal', wad: bigint): Log {
  const topics =
    eventName === 'Deposit'
      ? encodeEventTopics({
          abi: weth9Abi,
          eventName: 'Deposit',
          args: { dst: ACCOUNT },
        })
      : encodeEventTopics({
          abi: weth9Abi,
          eventName: 'Withdrawal',
          args: { src: ACCOUNT },
        });
  return log(WETH, topics, encodeAbiParameters([{ type: 'uint256' }], [wad]));
}

function transferLog(token: string, value: bigint): Log {
  const topics = encodeEventTopics({
    abi: [TRANSFER_EVENT],
    eventName: 'Transfer',
    args: { from: ACCOUNT, to: PAIR },
  });
  return log(token, topics, encodeAbiParameters([{ type: 'uint256' }], [value]));
}

describe('receipt parsing', () => {
  it('reads the actual token output from the pair Swap event for a native buy', () => {
    const result = parseSwapReceipt({
      kind: 'swap',
      path: [WETH, TOKEN],
      pairs: [pair],
      logs: [
        wethLog('Deposit', 10n ** 16n),
        swapLog(0n, 10n ** 16n, 1994n * 10n ** 18n, 0n),
        transferLog(WETH, 10n ** 16n),
      ],
      account: ACCOUNT,
      amountIn: 10n ** 16n,
      minOut: 19n * 10n ** 18n,
    });
    expect(result.actualOut).toBe(1994n * 10n ** 18n);
    expect(result.paidIn).toBe(10n ** 16n);
    expect(result.belowMinOut).toBe(false);
    expect(result.missingLedgerEvent).toBe(false);
  });

  it('uses the WETH Withdrawal for a token → native sell', () => {
    const result = parseSwapReceipt({
      kind: 'swap',
      path: [TOKEN, WETH],
      pairs: [pair],
      logs: [
        transferLog(TOKEN, 100n * 10n ** 18n),
        swapLog(100n * 10n ** 18n, 0n, 0n, 5n * 10n ** 16n),
        wethLog('Withdrawal', 5n * 10n ** 16n),
      ],
      account: ACCOUNT,
      amountIn: 100n * 10n ** 18n,
      minOut: 4n * 10n ** 16n,
    });
    expect(result.actualOut).toBe(5n * 10n ** 16n);
    expect(result.paidIn).toBe(100n * 10n ** 18n);
    expect(result.belowMinOut).toBe(false);
  });

  it('flags a receipt below the minimum out instead of trusting the quote', () => {
    const result = parseSwapReceipt({
      kind: 'swap',
      path: [WETH, TOKEN],
      pairs: [pair],
      logs: [swapLog(0n, 10n ** 16n, 1994n * 10n ** 18n, 0n)],
      account: ACCOUNT,
      amountIn: 10n ** 16n,
      minOut: 2000n * 10n ** 18n,
    });
    expect(result.actualOut).toBe(1994n * 10n ** 18n);
    expect(result.belowMinOut).toBe(true);
  });

  it('reads the Deposit/Withdrawal amount for 1:1 wrap and unwrap', () => {
    const wrap = parseSwapReceipt({
      kind: 'wrap',
      path: [],
      pairs: [],
      logs: [wethLog('Deposit', 10n ** 16n)],
      account: ACCOUNT,
      amountIn: 10n ** 16n,
      minOut: 10n ** 16n,
    });
    expect(wrap.actualOut).toBe(10n ** 16n);
    expect(wrap.belowMinOut).toBe(false);

    const unwrap = parseSwapReceipt({
      kind: 'unwrap',
      path: [],
      pairs: [],
      logs: [wethLog('Withdrawal', 2n * 10n ** 16n)],
      account: ACCOUNT,
      amountIn: 2n * 10n ** 16n,
      minOut: 2n * 10n ** 16n,
    });
    expect(unwrap.actualOut).toBe(2n * 10n ** 16n);
    expect(unwrap.paidIn).toBe(2n * 10n ** 16n);
  });

  it('never fabricates an amount when the ledger event is missing', () => {
    const result = parseSwapReceipt({
      kind: 'swap',
      path: [WETH, TOKEN],
      pairs: [pair],
      logs: [],
      account: ACCOUNT,
      amountIn: 10n ** 16n,
      minOut: 0n,
    });
    expect(result.actualOut).toBeUndefined();
    expect(result.missingLedgerEvent).toBe(true);
  });
});
