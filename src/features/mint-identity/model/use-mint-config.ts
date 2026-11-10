import { useAccount, useReadContracts } from 'wagmi';
import { love20TokenAbi, memberNftAbi } from '@/config/abis';
import { isConfiguredAddress, type HexAddress } from '@/config/networks';
import { useMemberNftAddress } from '@/entities/member-identity/model/use-member-nft-address';

export type MintConfigStatus = 'disconnected' | 'unconfigured' | 'loading' | 'error' | 'ready';

export interface MintConfigState {
  readonly status: MintConfigStatus;
  readonly memberNftAddress: HexAddress | undefined;
  /** The ERC20 MemberNFT.mint() pulls and burns — the genesis token, not the current community. */
  readonly paymentTokenAddress: HexAddress | undefined;
  readonly paymentTokenSymbol: string | undefined;
  readonly paymentTokenDecimals: number | undefined;
  /** MAX_NAME_LENGTH(), in UTF-8 bytes. Never hardcoded (UX spec §3.3). */
  readonly maxNameLength: number | undefined;
  readonly balance: bigint | undefined;
  readonly allowance: bigint | undefined;
  readonly refetch: () => void;
}

/**
 * MemberNFT configuration + the payment token state the mint page needs.
 *
 * The payment token is read from MemberNFT.LOVE20_TOKEN_ADDRESS(), not from the
 * community in the URL (CI-005): switching community must not change what the
 * mint costs or which token is approved. Both phases are single Multicall3
 * batches via wagmi's useReadContracts.
 */
export function useMintConfig(): MintConfigState {
  const { address: account } = useAccount();
  const resolution = useMemberNftAddress();
  const nft = resolution.address;

  const configReads = useReadContracts({
    contracts:
      nft !== undefined && account !== undefined
        ? [
            { address: nft, abi: memberNftAbi, functionName: 'MAX_NAME_LENGTH' },
            { address: nft, abi: memberNftAbi, functionName: 'LOVE20_TOKEN_ADDRESS' },
          ]
        : [],
    query: { enabled: nft !== undefined && account !== undefined },
  });

  const maxLengthEntry = configReads.data?.[0];
  const tokenAddressEntry = configReads.data?.[1];

  const rawMaxNameLength =
    maxLengthEntry?.status === 'success' && typeof maxLengthEntry.result === 'bigint'
      ? maxLengthEntry.result
      : undefined;
  const maxNameLength =
    rawMaxNameLength !== undefined && rawMaxNameLength > 0n && rawMaxNameLength <= 1024n
      ? Number(rawMaxNameLength)
      : undefined;
  const paymentTokenAddress =
    tokenAddressEntry?.status === 'success' && isConfiguredAddress(tokenAddressEntry.result)
      ? tokenAddressEntry.result
      : undefined;

  const tokenReads = useReadContracts({
    contracts:
      paymentTokenAddress !== undefined && account !== undefined && nft !== undefined
        ? [
            { address: paymentTokenAddress, abi: love20TokenAbi, functionName: 'symbol' },
            { address: paymentTokenAddress, abi: love20TokenAbi, functionName: 'decimals' },
            {
              address: paymentTokenAddress,
              abi: love20TokenAbi,
              functionName: 'balanceOf',
              args: [account],
            },
            {
              address: paymentTokenAddress,
              abi: love20TokenAbi,
              functionName: 'allowance',
              args: [account, nft],
            },
          ]
        : [],
    query: {
      enabled: paymentTokenAddress !== undefined && account !== undefined && nft !== undefined,
    },
  });

  const symbolEntry = tokenReads.data?.[0];
  const decimalsEntry = tokenReads.data?.[1];
  const balanceEntry = tokenReads.data?.[2];
  const allowanceEntry = tokenReads.data?.[3];

  const symbol =
    symbolEntry?.status === 'success' &&
    typeof symbolEntry.result === 'string' &&
    symbolEntry.result.length > 0
      ? symbolEntry.result
      : undefined;
  const decimals =
    decimalsEntry?.status === 'success' && typeof decimalsEntry.result === 'number'
      ? decimalsEntry.result
      : undefined;
  const balance =
    balanceEntry?.status === 'success' && typeof balanceEntry.result === 'bigint'
      ? balanceEntry.result
      : undefined;
  const allowance =
    allowanceEntry?.status === 'success' && typeof allowanceEntry.result === 'bigint'
      ? allowanceEntry.result
      : undefined;

  const configReadFailed = configReads.data?.some((entry) => entry.status === 'failure') ?? false;
  const tokenReadFailed = tokenReads.data?.some((entry) => entry.status === 'failure') ?? false;

  let status: MintConfigStatus;
  if (account === undefined) {
    status = 'disconnected';
  } else if (resolution.status === 'unconfigured') {
    status = 'unconfigured';
  } else if (resolution.status === 'error') {
    status = 'error';
  } else if (resolution.status === 'resolving' || nft === undefined) {
    status = 'loading';
  } else if (configReads.isError || configReadFailed) {
    status = 'error';
  } else if (configReads.isLoading || configReads.data === undefined) {
    status = 'loading';
  } else if (maxNameLength === undefined) {
    // MAX_NAME_LENGTH() succeeded but is unusable; do not invent 32.
    status = 'error';
  } else if (paymentTokenAddress === undefined) {
    status = 'unconfigured';
  } else if (tokenReads.isError || tokenReadFailed) {
    status = 'error';
  } else if (tokenReads.isLoading || tokenReads.data === undefined) {
    status = 'loading';
  } else if (
    symbol === undefined ||
    decimals === undefined ||
    balance === undefined ||
    allowance === undefined
  ) {
    status = 'error';
  } else {
    status = 'ready';
  }

  const refetch = () => {
    resolution.refetch();
    configReads.refetch();
    tokenReads.refetch();
  };

  return {
    status,
    memberNftAddress: nft,
    paymentTokenAddress,
    paymentTokenSymbol: symbol,
    paymentTokenDecimals: decimals,
    maxNameLength,
    balance,
    allowance,
    refetch,
  };
}
