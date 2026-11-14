import type { HexAddress } from '@/config/networks';

/** Which of the two writes a row's button starts. */
export type ApprovalMode = 'unlimited' | 'revoke';

/** One pending 授权/撤销 request, fully self-contained for a resubmit. */
export interface ApprovalRequest {
  readonly tokenAddress: HexAddress;
  readonly tokenSymbol: string;
  readonly tokenDecimals: number;
  readonly spender: HexAddress;
  readonly spenderLabel: string;
  readonly mode: ApprovalMode;
}

/** A mined 授权/撤销, rendered as the dismissible strip above the list. */
export interface ApprovalRecord {
  readonly hash: `0x${string}`;
  readonly spenderLabel: string;
  readonly tokenSymbol: string;
  readonly mode: ApprovalMode;
}

/** Send-time failure of one 授权/撤销 write, shown in the sheet and under the page. */
export interface ApprovalTxError {
  readonly message: string;
  readonly kind?: 'nonce' | 'staleBlock';
}
