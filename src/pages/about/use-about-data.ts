import { useReadContract } from 'wagmi';
import { love20TokenAbi, memberNftAbi } from '@/config/abis';
import { configuredAddress } from '@/config/networks';
import { useCommunityToken } from '@/entities/community-token/model/use-community-token';
import { useFirstToken } from '@/entities/community-token/model/use-first-token';
import { useMemberNftAddress } from '@/entities/member-identity/model/use-member-nft-address';
import { useCurrentPhase } from '@/entities/phase/model/use-current-phase';

export type AboutValueStatus = 'unconfigured' | 'loading' | 'ready' | 'error';

export interface AboutValue<T> {
  readonly status: AboutValueStatus;
  /** Only meaningful for `ready`. */
  readonly value: T | undefined;
}

export interface AboutChainData {
  /** Current community token symbol()/decimals() plus totalSupply(). */
  readonly communitySymbol: AboutValue<string>;
  readonly communitySupply: AboutValue<bigint>;
  readonly communityDecimals: number | undefined;
  /** MemberNFT.totalSupply() (identity NFTs are whole units). */
  readonly memberNftSupply: AboutValue<bigint>;
  /** Community token balance held by the AirdropDistributor contract. */
  readonly airdropPool: AboutValue<bigint>;
  readonly airdropDecimals: number | undefined;
  readonly airdropSymbol: string | undefined;
  /** Phase currentPhase(); the page calls it 当前阶段, never a guessed round. */
  readonly phase: AboutValue<bigint>;
}

function readState(
  configured: boolean,
  isError: boolean,
  isPending: boolean,
  data: bigint | undefined,
): AboutValue<bigint> {
  if (!configured) return { status: 'unconfigured', value: undefined };
  if (isError) return { status: 'error', value: undefined };
  if (data === undefined || isPending) return { status: 'loading', value: undefined };
  return { status: 'ready', value: data };
}

/**
 * Read-only chain data for the 关于 page's 数据 tab.
 *
 * Each contract contributes at most one call here, so there is no same-contract
 * fan-out to batch: token metadata comes from the shared community-token entity
 * (already a Multicall3 `useReadContracts` batch), and the remaining reads are
 * one `totalSupply()`/`balanceOf()` per contract. They ride wagmi's normal
 * 12 s polling interval; this hook never sets a faster `refetchInterval`.
 */
export function useAboutChainData(symbol: string): AboutChainData {
  const token = useCommunityToken(symbol);
  const memberNft = useMemberNftAddress();
  const firstToken = useFirstToken();
  const phase = useCurrentPhase();
  const airdropAddress = configuredAddress('airdropDistributor');

  const tokenSupply = useReadContract({
    address: token.address,
    abi: love20TokenAbi,
    functionName: 'totalSupply',
    query: { enabled: token.address !== undefined },
  });

  const nftSupply = useReadContract({
    address: memberNft.address,
    abi: memberNftAbi,
    functionName: 'totalSupply',
    query: { enabled: memberNft.address !== undefined },
  });

  const poolBalance = useReadContract({
    address: firstToken.address,
    abi: love20TokenAbi,
    functionName: 'balanceOf',
    args: airdropAddress !== undefined ? [airdropAddress] : undefined,
    query: { enabled: firstToken.address !== undefined && airdropAddress !== undefined },
  });

  let communitySymbol: AboutValue<string>;
  if (token.address === undefined) {
    communitySymbol = { status: 'unconfigured', value: undefined };
  } else if (token.metadataError) {
    communitySymbol = { status: 'error', value: undefined };
  } else if (token.isMetadataLoading) {
    communitySymbol = { status: 'loading', value: undefined };
  } else {
    communitySymbol = { status: 'ready', value: token.symbol };
  }

  const communitySupply = readState(
    token.address !== undefined,
    tokenSupply.isError,
    tokenSupply.isPending,
    tokenSupply.data,
  );

  let memberNftSupply: AboutValue<bigint>;
  if (memberNft.status === 'unconfigured') {
    memberNftSupply = { status: 'unconfigured', value: undefined };
  } else if (memberNft.status === 'error') {
    memberNftSupply = { status: 'error', value: undefined };
  } else if (memberNft.status === 'resolving') {
    // Seed core is being asked for MEMBER_NFT_ADDRESS(): unknown, not 未配置.
    memberNftSupply = { status: 'loading', value: undefined };
  } else {
    memberNftSupply = readState(
      memberNft.address !== undefined,
      nftSupply.isError,
      nftSupply.isPending,
      nftSupply.data,
    );
  }

  let airdropPool: AboutValue<bigint>;
  if (airdropAddress === undefined || firstToken.address === undefined) {
    airdropPool = { status: 'unconfigured', value: undefined };
  } else if (firstToken.status === 'error' || poolBalance.isError) {
    airdropPool = { status: 'error', value: undefined };
  } else {
    airdropPool = readState(
      true,
      false,
      firstToken.status === 'loading' || poolBalance.isPending,
      poolBalance.data,
    );
  }

  let phaseValue: AboutValue<bigint>;
  if (phase.status === 'unconfigured') {
    phaseValue = { status: 'unconfigured', value: undefined };
  } else if (phase.status === 'error') {
    phaseValue = { status: 'error', value: undefined };
  } else if (phase.status === 'loading' || phase.phase === undefined) {
    phaseValue = { status: 'loading', value: undefined };
  } else {
    phaseValue = { status: 'ready', value: phase.phase };
  }

  return {
    communitySymbol,
    communitySupply,
    communityDecimals: token.decimals,
    memberNftSupply,
    airdropPool,
    airdropDecimals: firstToken.decimals,
    airdropSymbol: firstToken.symbol,
    phase: phaseValue,
  };
}
