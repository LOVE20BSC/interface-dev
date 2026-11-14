import type { HexAddress } from '@/config/networks';
import { parseTransferAmount } from '@/features/transfer-token/lib/transfer-amount';

/**
 * Line parser for 批量转账 (pure, no React, no chain).
 *
 * Input is one recipient per line: `address amount`, with whitespace or a comma
 * as the separator (both `0x…,0.2` and `0x… , 0.2` work). Blank lines are
 * skipped but keep their original 1-based line number for error messages.
 *
 * owner 2026-11-14: a repeated address is **not** merged silently anymore. The
 * later line is reported as `duplicates` with its own line number and the line
 * the address first appeared on (`与第 N 行重复`), it contributes neither a row
 * nor to the total, and the page keeps 提交 disabled until the user deletes one
 * of the two lines themselves. Every invalid line is still reported with its
 * line number; valid lines are still parsed so the page can show a partial
 * total, but the page keeps 提交 disabled while any line is invalid or repeated.
 */

export type BatchParseErrorReason =
  | 'invalidLine'
  | 'missingAmount'
  | 'invalidAddress'
  | 'invalidAmount'
  | 'zeroAmount'
  | 'zeroAddress'
  | 'selfAddress'
  | 'batchContract';

export interface BatchParseError {
  /** 1-based line number inside the pasted text. */
  readonly line: number;
  readonly reason: BatchParseErrorReason;
}

export interface BatchParsedRow {
  readonly address: HexAddress;
  readonly amount: bigint;
  /**
   * 1-based input line that produced this row. For an address that repeats, the
   * row always belongs to its *first* occurrence; every later line is a
   * `BatchDuplicate`, never a row.
   */
  readonly line: number;
}

/** A later line whose address already appeared on `firstLine`. */
export interface BatchDuplicate {
  /** 1-based line of the repeated entry. */
  readonly line: number;
  /** 1-based line where the same address first appeared. */
  readonly firstLine: number;
}

export interface BatchParseResult {
  /** One row per unique address, in first-appearance order; repeats excluded. */
  readonly rows: readonly BatchParsedRow[];
  readonly errors: readonly BatchParseError[];
  /** Repeated addresses (later lines only); non-empty blocks submission. */
  readonly duplicates: readonly BatchDuplicate[];
  /** Sum of the rows above; a repeated line never contributes. */
  readonly total: bigint;
  /** Non-empty input lines. */
  readonly lineCount: number;
  /** True when at least one amount had more fraction digits than `decimals`. */
  readonly truncated: boolean;
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const SEPARATOR_RE = /[\s,]+/;

export interface ParseBatchOptions {
  readonly decimals: number;
  /** Connected wallet, rejected as a recipient (不能转给自己). */
  readonly self: string | undefined;
  /** BatchTransfer address, rejected as a recipient (不能转给合约本身). */
  readonly batchContract: HexAddress | undefined;
}

export function parseBatchText(text: string, options: ParseBatchOptions): BatchParseResult {
  const errors: BatchParseError[] = [];
  const duplicates: BatchDuplicate[] = [];
  const rows: BatchParsedRow[] = [];
  const firstLineByAddress = new Map<string, number>();
  let total = 0n;
  let lineCount = 0;
  let truncated = false;

  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const raw = (lines[index] ?? '').trim();
    if (raw.length === 0) continue;
    lineCount += 1;

    const tokens = raw.split(SEPARATOR_RE).filter((token) => token.length > 0);
    if (tokens.length !== 2) {
      errors.push({
        line: lineNumber,
        reason: tokens.length === 1 ? 'missingAmount' : 'invalidLine',
      });
      continue;
    }

    const [rawAddress = '', rawAmount = ''] = tokens;
    if (!ADDRESS_RE.test(rawAddress)) {
      errors.push({ line: lineNumber, reason: 'invalidAddress' });
      continue;
    }
    const address = rawAddress as HexAddress;
    if (/^0x0{40}$/i.test(address)) {
      errors.push({ line: lineNumber, reason: 'zeroAddress' });
      continue;
    }
    if (options.self !== undefined && address.toLowerCase() === options.self.toLowerCase()) {
      errors.push({ line: lineNumber, reason: 'selfAddress' });
      continue;
    }
    if (
      options.batchContract !== undefined &&
      address.toLowerCase() === options.batchContract.toLowerCase()
    ) {
      errors.push({ line: lineNumber, reason: 'batchContract' });
      continue;
    }

    const parsed = parseTransferAmount(rawAmount, options.decimals);
    if (parsed.kind === 'empty') {
      errors.push({ line: lineNumber, reason: 'missingAmount' });
      continue;
    }
    if (parsed.kind === 'invalid') {
      errors.push({ line: lineNumber, reason: 'invalidAmount' });
      continue;
    }
    if (parsed.kind === 'zero') {
      errors.push({ line: lineNumber, reason: 'zeroAmount' });
      continue;
    }
    if (parsed.truncated) truncated = true;

    const key = address.toLowerCase();
    const firstLine = firstLineByAddress.get(key);
    if (firstLine !== undefined) {
      // 重复地址：标出「与第 N 行重复」，不合并、不计入合计，由用户自己删行。
      duplicates.push({ line: lineNumber, firstLine });
      continue;
    }
    firstLineByAddress.set(key, lineNumber);
    rows.push({ address, amount: parsed.value, line: lineNumber });
    total += parsed.value;
  }

  return { rows, errors, duplicates, total, lineCount, truncated };
}
