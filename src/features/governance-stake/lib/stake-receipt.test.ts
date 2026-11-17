import { describe, expect, it } from 'vitest';
import { encodeAbiParameters, encodeEventTopics, parseAbiParameters, type Log } from 'viem';
import { stakeAbi } from '@/config/abis';
import type { HexAddress } from '@/config/networks';
import { parseStakeReceipt } from './stake-receipt';

/**
 * 回执解析是「回执里的数字」的唯一来源，所以单独测：用 viem 的
 * `encodeEventTopics`/`encodeAbiParameters` 造出与链上一字不差的 log，再解码。
 */

const TOKEN = '0x8aCd85898458400f7Db866d53FCFF6f0D49741FF' as HexAddress;
const MEMBER = 5n;
const ROUND = 211n;

function logOf(topics: readonly `0x${string}`[], data: `0x${string}`): Log {
  return { address: TOKEN, topics: [...topics], data, blockNumber: 1n, logIndex: 0 } as Log;
}

function receiptWith(logs: readonly Log[]) {
  return { status: 'success', logs: [...logs] } as never;
}

function liquidityStakedLog(values: { govVotesAdded: bigint; sharesAdded: bigint }): Log {
  const topics = encodeEventTopics({
    abi: stakeAbi,
    eventName: 'LiquidityStaked',
    args: { tokenAddress: TOKEN, round: ROUND, memberId: MEMBER },
  }) as readonly `0x${string}`[];
  const data = encodeAbiParameters(
    parseAbiParameters(
      'address, address, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256',
    ),
    [
      '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65', // caller
      '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65', // memberOwner
      1_000n * 10n ** 18n, // tokenAmount
      5n * 10n ** 17n, // parentTokenAmount
      10n, // promisedWaitingPhases
      0n, // prevPromisedWaitingPhases
      values.govVotesAdded,
      values.sharesAdded,
      22_360_679_774_997_896_964n, // liquidityShares
      4_494_496_634_774_577_288_782n, // totalLiquidityShares
      469_574_275_274_955_836_1458n, // totalGovVotes
      4_494_496_634_774_577_288_782n, // totalWithdrawableLp
    ],
  );
  return logOf(topics, data);
}

function withdrawnLog(values: {
  tokenAmount: bigint;
  parentAmount: bigint;
  boostAmount: bigint;
}): Log {
  const topics = encodeEventTopics({
    abi: stakeAbi,
    eventName: 'StakeWithdrawn',
    args: { tokenAddress: TOKEN, round: 237n, memberId: MEMBER },
  }) as readonly `0x${string}`[];
  const data = encodeAbiParameters(
    parseAbiParameters(
      'uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256',
    ),
    [
      25n, // promisedWaitingPhases
      22_360_679_774_997_896_964n, // liquidityShares
      values.tokenAmount,
      values.parentAmount,
      values.boostAmount, // boostShares（撤出时退还给成员）
      0n, // withdrawableLpBurned
      0n, // withdrawableLpToMember
      4_472_135_954_999_579_391_818n, // totalLiquidityShares
      0n, // totalBoostShares
      4_472_135_954_999_579_391_818n, // totalWithdrawableLp
    ],
  );
  return logOf(topics, data);
}

describe('parseStakeReceipt', () => {
  it('reads the 流动性质押 numbers from LiquidityStaked', () => {
    const detail = parseStakeReceipt(
      'stakeLiquidity',
      receiptWith([
        liquidityStakedLog({
          govVotesAdded: 223_606_797_749_978_969_640n,
          sharesAdded: 22_360_679_774_997_896_964n,
        }),
      ]),
    );
    expect(detail.govVotesAdded).toBe(223_606_797_749_978_969_640n);
    expect(detail.liquiditySharesAdded).toBe(22_360_679_774_997_896_964n);
    expect(detail.boostAmount).toBeUndefined();
  });

  it('reads the 撤出 numbers from StakeWithdrawn (LP side + boost refund)', () => {
    const detail = parseStakeReceipt(
      'withdraw',
      receiptWith([
        withdrawnLog({
          tokenAmount: 999_999_999_999_999_999_995n,
          parentAmount: 499_999_999_999_999_999n,
          boostAmount: 9_571_385_499_991_385_715_425n,
        }),
      ]),
    );
    expect(detail.tokenAmount).toBe(999_999_999_999_999_999_995n);
    expect(detail.parentTokenAmount).toBe(499_999_999_999_999_999n);
    // boostShares 是「撤出时退还的加速代币」，页面把两者相加才是实际到账。
    expect(detail.boostAmount).toBe(9_571_385_499_991_385_715_425n);
  });

  it('returns undefined fields for an unrelated log instead of inventing numbers', () => {
    const unrelated = logOf(
      ['0x0000000000000000000000000000000000000000000000000000000000000000'],
      '0x',
    );
    const detail = parseStakeReceipt('stakeLiquidity', receiptWith([unrelated]));
    expect(detail.govVotesAdded).toBeUndefined();
    expect(detail.liquiditySharesAdded).toBeUndefined();
  });

  it('keeps the action-specific mapping (a boost receipt never reads the stake event)', () => {
    const detail = parseStakeReceipt(
      'stakeBoost',
      receiptWith([
        liquidityStakedLog({
          govVotesAdded: 1n,
          sharesAdded: 2n,
        }),
      ]),
    );
    expect(detail.govVotesAdded).toBeUndefined();
    expect(detail.boostAmount).toBeUndefined();
  });
});
