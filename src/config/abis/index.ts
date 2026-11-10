/**
 * Minimal read-only ABIs used by the M0 shell.
 *
 * The full ABI pipeline (ADR-0002 §3) is generate-then-commit from forge out/.
 * Until the anvil export lands, these hand-written fragments cover only the
 * views the shell needs and are deliberately small. The next agent should
 * replace this directory with generated `*.generated.ts` files plus a manifest,
 * and keep this file as the stable re-export index.
 */

export const communityTokenAbi = [
  {
    type: 'function',
    name: 'name',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

export const memberNftAbi = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'tokenOfOwnerByIndex',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'index', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'ownerOf',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'memberName',
    stateMutability: 'view',
    inputs: [{ name: 'memberId', type: 'uint256' }],
    outputs: [{ name: '', type: 'string' }],
  },
] as const;

/** Implemented by every core contract (Launch/Mint/Stake/Submit/Vote). */
export const memberNftAddressAbi = [
  {
    type: 'function',
    name: 'MEMBER_NFT_ADDRESS',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
] as const;

export const launchAbi = [
  {
    type: 'function',
    name: 'tokenAddressBySymbol',
    stateMutability: 'view',
    inputs: [{ name: 'symbol', type: 'string' }],
    outputs: [{ name: '', type: 'address' }],
  },
] as const;

export const phaseAbi = [
  {
    type: 'function',
    name: 'currentPhase',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

/**
 * Manifest is data, not a runtime dependency. It documents which fragments are
 * currently hand-written so the generated index can replace them safely.
 */
export const ABI_MANIFEST = Object.freeze({
  communityToken: { source: 'handwritten', entries: communityTokenAbi.length },
  memberNft: { source: 'handwritten', entries: memberNftAbi.length },
  memberNftAddress: { source: 'handwritten', entries: memberNftAddressAbi.length },
  launch: { source: 'handwritten', entries: launchAbi.length },
  phase: { source: 'handwritten', entries: phaseAbi.length },
});
