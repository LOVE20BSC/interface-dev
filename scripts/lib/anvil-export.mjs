// Shared reader/adaptor for the anvil31337_dev export.
//
// `scripts/sync-anvil.mjs` writes the frontend artifacts from this module;
// `scripts/check-abis.mjs` regenerates the same bytes in memory and compares them with the
// committed files. Keeping both on one implementation is what makes "generate then commit" and
// the drift gate agree by construction (ADR-0002 §3, ADR-0004 §6).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { encodeAbiParameters, keccak256 } from 'viem';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** The sibling anvil checkout and the export directory produced by `make bootstrap`. */
export const ANVIL_REPO_DIR = process.env.ANVIL_REPO_DIR
  ? resolve(process.env.ANVIL_REPO_DIR)
  : resolve(ROOT, '../anvil');
/** Overridable for drift drills: read a copied export while still recording the real repo HEAD. */
export const ANVIL_EXPORT_DIR = process.env.ANVIL_EXPORT_DIR
  ? resolve(process.env.ANVIL_EXPORT_DIR)
  : resolve(ANVIL_REPO_DIR, 'export');

export const PROFILE = 'anvil31337_dev';
export const DEPLOYMENT_FILE = resolve(ANVIL_EXPORT_DIR, 'deployments', `${PROFILE}.json`);
export const ABIS_DIR = resolve(ANVIL_EXPORT_DIR, 'abis');
export const AIRDROP_FILE = resolve(ANVIL_EXPORT_DIR, 'airdrop', `${PROFILE}.json`);

export const FRONTEND_DEPLOYMENT_FILE = resolve(ROOT, 'src/config/deployments/anvil31337_dev.json');
export const FRONTEND_ABIS_DIR = resolve(ROOT, 'src/config/abis');
export const FRONTEND_INDEX_FILE = resolve(FRONTEND_ABIS_DIR, 'index.ts');
export const FRONTEND_MANIFEST_FILE = resolve(FRONTEND_ABIS_DIR, 'manifest.json');
export const FRONTEND_AIRDROP_FILE = resolve(ROOT, 'public/airdrop/anvil31337_dev.json');

const PRETTIER_CONFIG = (await resolveConfig(resolve(ROOT, 'src/config/abis/index.ts'))) ?? {};

/**
 * The app consumes these eleven ABI modules (`src/config/abis/index.ts` re-exports them). The export
 * also carries ABIs the app does not call today (ActionTarget, executors, ...): they stay in the
 * anvil export and in the manifest entry counts, but generating unused modules would only add dead
 * bytes. Add an entry here when a page starts using one.
 */
export const ABI_MODULES = [
  { file: 'member-nft.ts', exportName: 'memberNftAbi', contract: 'MemberNFT' },
  { file: 'love20-token.ts', exportName: 'love20TokenAbi', contract: 'LOVE20Token' },
  { file: 'launch.ts', exportName: 'launchAbi', contract: 'Launch' },
  { file: 'stake.ts', exportName: 'stakeAbi', contract: 'Stake' },
  { file: 'phase.ts', exportName: 'phaseAbi', contract: 'Phase' },
  {
    file: 'airdrop-distributor.ts',
    exportName: 'airdropDistributorAbi',
    contract: 'AirdropDistributor',
  },
  {
    file: 'uniswap-v2-router02.ts',
    exportName: 'uniswapV2Router02Abi',
    contract: 'UniswapV2Router02',
  },
  { file: 'uniswap-v2-pair.ts', exportName: 'uniswapV2PairAbi', contract: 'UniswapV2Pair' },
  {
    file: 'uniswap-v2-factory.ts',
    exportName: 'uniswapV2FactoryAbi',
    contract: 'UniswapV2Factory',
  },
  { file: 'weth9.ts', exportName: 'weth9Abi', contract: 'WETH9' },
  { file: 'multicall3.ts', exportName: 'multicall3Abi', contract: 'Multicall3' },
];

/**
 * Which sibling repository each export ABI came from. `libs` is required by ADR-0002 §3 even though
 * it contributes no ABI: its HEAD decides the linked library bytecode that GroupActionExecutor and
 * GroupServiceExecutor delegatecall into.
 */
const REPO_ABIS = {
  core: [
    'LOVE20Token',
    'Phase',
    'Launch',
    'MemberNFT',
    'Stake',
    'Submit',
    'Vote',
    'Mint',
    'AirdropDistributor',
  ],
  action: ['ActionTarget', 'LpExecutor', 'GroupActionExecutor', 'GroupServiceExecutor'],
  'group-chat': ['GroupChat'],
  libs: [],
  dex: ['UniswapV2Factory', 'UniswapV2Router02', 'UniswapV2Pair'],
  anvil: ['WETH9', 'Multicall3'],
};

const ADDRESS_KEYS = {
  tokenAddress: 'LOVE20_TOKEN_ADDRESS',
  memberNFT: 'MEMBER_NFT_ADDRESS',
  stake: 'STAKE_ADDRESS',
  submit: 'SUBMIT_ADDRESS',
  vote: 'VOTE_ADDRESS',
  mint: 'MINT_ADDRESS',
  phase: 'PHASE_ADDRESS',
  launch: 'LAUNCH_ADDRESS',
  actionTarget: 'ACTION_TARGET_ADDRESS',
  groupActionExecutor: 'GROUP_ACTION_EXECUTOR_ADDRESS',
  groupServiceExecutor: 'GROUP_SERVICE_EXECUTOR_ADDRESS',
  lpExecutor: 'LP_EXECUTOR_ADDRESS',
  groupChat: 'GROUP_CHAT_ADDRESS',
  groupChatMember: 'GROUP_MEMBER_ADDRESS',
  groupChatAdmin: 'GROUP_ADMIN_ADDRESS',
  weth: 'WETH_ADDRESS',
  factory: 'UNISWAP_V2_FACTORY_ADDRESS',
  router: 'UNISWAP_V2_ROUTER02_ADDRESS',
  multicall3: 'MULTICALL3_ADDRESS',
  airdropDistributor: 'AIRDROP_DISTRIBUTOR_ADDRESS',
  firstTokenAddress: 'LOVE20_TOKEN_ADDRESS',
  pair: 'UNISWAP_V2_PAIR_ADDRESS',
};

const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export class ExportError extends Error {}

function fail(message) {
  throw new ExportError(message);
}

export function readJson(path, label) {
  if (!existsSync(path)) {
    fail(
      `missing ${label}: ${path}\n` +
        '  Build the sibling chain first: make -C ../anvil bootstrap\n' +
        '  (then run `pnpm sync:anvil`).',
    );
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`${label} is not valid JSON: ${path}\n  ${error.message}`);
  }
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    fail(`${label} is missing or empty in the anvil export`);
  }
  return value;
}

function requireAddress(value, label) {
  if (typeof value !== 'string' || !HEX_ADDRESS.test(value)) {
    fail(`${label} is not a 0x-prefixed 20-byte address: ${JSON.stringify(value)}`);
  }
  return value;
}

function requireUint(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail(`${label} is not a non-negative safe integer: ${JSON.stringify(value)}`);
  }
  return value;
}

function requireHash(value, label) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    fail(`${label} is not a 0x-prefixed 32-byte hash: ${JSON.stringify(value)}`);
  }
  return value;
}

export function loadAnvilExport() {
  if (!existsSync(ANVIL_EXPORT_DIR)) {
    fail(
      `anvil export not found: ${ANVIL_EXPORT_DIR}\n` +
        '  Run `make -C ../anvil bootstrap` first; this script never invents addresses.',
    );
  }

  const deployment = readJson(DEPLOYMENT_FILE, 'anvil deployment export');
  const snapshot = readJson(AIRDROP_FILE, 'anvil airdrop snapshot');

  const chainId = requireUint(deployment.chainId, 'export.chainId');
  const deployBlock = requireUint(deployment.deployBlock, 'export.deployBlock');
  const network = requireString(deployment.network, 'export.network');
  const rpcUrl = requireString(deployment.rpcUrl, 'export.rpcUrl');
  const addresses = deployment.addresses;
  if (typeof addresses !== 'object' || addresses === null || Array.isArray(addresses)) {
    fail('export.addresses must be an object');
  }

  for (const [key, sourceKey] of Object.entries(ADDRESS_KEYS)) {
    requireAddress(addresses[sourceKey], `export.addresses.${sourceKey} (${key})`);
  }
  for (const [name, contract] of Object.entries(deployment.contracts ?? {})) {
    requireAddress(contract.address, `export.contracts.${name}.address`);
  }

  const abis = {};
  for (const contract of Object.values(REPO_ABIS).flat()) {
    const abi = readJson(resolve(ABIS_DIR, `${contract}.json`), `ABI ${contract}`);
    if (!Array.isArray(abi) || abi.length === 0) {
      fail(`ABI ${contract} must be a non-empty array (${resolve(ABIS_DIR, `${contract}.json`)})`);
    }
    abis[contract] = abi;
  }

  return { deployment, snapshot, abis, chainId, deployBlock, network, rpcUrl, addresses };
}

export function buildAddressBook(exportData, existing) {
  if (typeof existing !== 'object' || existing === null || Array.isArray(existing)) {
    fail(`existing frontend deployment ${FRONTEND_DEPLOYMENT_FILE} must be an object`);
  }

  const addresses = {};
  for (const [targetKey, sourceKey] of Object.entries(ADDRESS_KEYS)) {
    addresses[targetKey] = requireAddress(
      exportData.addresses[sourceKey],
      `export.addresses.${sourceKey}`,
    );
  }

  return {
    ...existing,
    chainId: exportData.chainId,
    rpcUrls: [exportData.rpcUrl],
    // The environment package itself states the rule, so a hand-edited copy is obviously wrong.
    notes:
      '地址簿由 pnpm sync:anvil 从 anvil/export/deployments/anvil31337_dev.json 生成，勿手改；' +
      '地址始终跟随 clean bootstrap 的部署，不用地址簿反推 nonce。rpc 指向 8545：本机唯一规范链。' +
      'defaultSymbol 是 URL 种子，链上 symbol() 为准。',
    deployment: {
      ...(typeof existing.deployment === 'object' && existing.deployment !== null
        ? existing.deployment
        : {}),
      blockNumber: exportData.deployBlock,
    },
    addresses,
  };
}

/**
 * The vendored Airdrop uses double-hashed leaves and sorted pairs; this mirrors
 * anvil/script/gen_airdrop_fixture.py exactly and re-verifies every proof. A mismatch means the
 * snapshot, the export metadata and the on-chain constructor argument disagree, and the copied
 * root would make the UI show wrong eligibility.
 */
function leafHash(account, share) {
  const encoded = encodeAbiParameters(
    [{ type: 'address' }, { type: 'uint256' }],
    [account, BigInt(share)],
  );
  return keccak256(keccak256(encoded));
}

function nodeHash(left, right) {
  const [a, b] = [left.toLowerCase(), right.toLowerCase()].sort();
  return keccak256(`${a}${b.slice(2)}`);
}

function verifyMerkle(snapshot, expectedRoot) {
  const entries = snapshot.entries;
  if (!Array.isArray(entries) || entries.length === 0) {
    fail('airdrop snapshot has no entries');
  }
  if (String(snapshot.accountCount) !== String(entries.length)) {
    fail(
      `airdrop snapshot accountCount=${snapshot.accountCount} but has ${entries.length} entries`,
    );
  }

  const totalShare = BigInt(snapshot.totalShare);
  const sum = entries.reduce((acc, entry) => acc + BigInt(entry.share), 0n);
  if (sum !== totalShare) {
    fail(`airdrop snapshot shares sum to ${sum} but totalShare is ${totalShare}`);
  }

  const root = snapshot.merkleRoot;
  if (typeof root !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(root)) {
    fail(`airdrop snapshot merkleRoot is malformed: ${JSON.stringify(root)}`);
  }
  if (root.toLowerCase() !== String(expectedRoot).toLowerCase()) {
    fail(
      `airdrop snapshot merkleRoot ${root} disagrees with export airdrop.merkleRoot ${expectedRoot}`,
    );
  }
  for (const entry of entries) {
    requireAddress(entry.account, 'airdrop entry account');
    if (!Array.isArray(entry.proof)) fail(`airdrop entry ${entry.account} has no proof array`);
    let computed = leafHash(entry.account, entry.share);
    for (const sibling of entry.proof) {
      requireHash(sibling, 'airdrop proof element');
      computed = nodeHash(computed, sibling);
    }
    if (computed.toLowerCase() !== root.toLowerCase()) {
      fail(
        `airdrop proof does not verify for ${entry.account} (computed ${computed}, root ${root})`,
      );
    }
  }
  return root;
}

export function validateAirdrop(exportData) {
  const { snapshot, deployment } = exportData;
  const exportAirdrop = deployment.airdropDistributor ?? {};
  if (exportAirdrop.address !== exportData.addresses.AIRDROP_DISTRIBUTOR_ADDRESS) {
    fail(
      'export.airdropDistributor.address disagrees with export.addresses.AIRDROP_DISTRIBUTOR_ADDRESS',
    );
  }
  if (exportAirdrop.token !== exportData.addresses.LOVE20_TOKEN_ADDRESS) {
    fail(
      'export.airdropDistributor.token disagrees with export.addresses.LOVE20_TOKEN_ADDRESS',
    );
  }
  if (
    String(exportAirdrop.merkleRoot).toLowerCase() !== String(snapshot.merkleRoot).toLowerCase()
  ) {
    fail(
      `export.airdropDistributor.merkleRoot ${exportAirdrop.merkleRoot} disagrees with ` +
        `snapshot merkleRoot ${snapshot.merkleRoot}`,
    );
  }
  if (String(exportAirdrop.totalShare) !== String(snapshot.totalShare)) {
    fail('export.airdropDistributor.totalShare disagrees with the snapshot');
  }
  return verifyMerkle(snapshot, exportAirdrop.merkleRoot);
}

function gitHead(repoPath) {
  try {
    return execFileSync('git', ['-C', repoPath, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    fail(`cannot read git HEAD for ${repoPath} (the manifest must record the source commit)`);
  }
}

export function buildManifest(exportData) {
  const anvilDir = ANVIL_REPO_DIR;
  const repoPaths = {
    core: resolve(anvilDir, '../core'),
    action: resolve(anvilDir, '../action'),
    'group-chat': resolve(anvilDir, '../group-chat'),
    libs: resolve(anvilDir, '../libs'),
    dex: resolve(anvilDir, '../dex'),
    anvil: anvilDir,
  };

  const sources = {};
  for (const [repo, contracts] of Object.entries(REPO_ABIS)) {
    const abis = {};
    for (const contract of contracts) {
      abis[contract] = exportData.abis[contract].length;
    }
    sources[repo] = {
      head: gitHead(repoPaths[repo]),
      path: relative(ROOT, repoPaths[repo]),
      abis,
      ...(contracts.length === 0
        ? { note: 'no ABI is exported from this repo; its HEAD pins the linked library bytecode' }
        : {}),
    };
  }

  // Anvil export timestamps are not part of the export JSON (it must stay byte-identical between
  // two clean bootstraps). The file mtime is the honest "when this export was produced" value; the
  // drift gate ignores only this field when comparing manifests.
  const exportedAt = statSync(DEPLOYMENT_FILE).mtime.toISOString();

  return {
    schemaVersion: 1,
    generatedBy: 'pnpm sync:anvil',
    anvilExport: {
      profile: exportData.network,
      path: relative(ROOT, ANVIL_EXPORT_DIR),
      chainId: exportData.chainId,
      deployBlock: exportData.deployBlock,
      exportedAt,
    },
    sources,
    modules: Object.fromEntries(
      ABI_MODULES.map(({ file, contract }) => [
        contract,
        {
          file: `src/config/abis/${file}`,
          entries: exportData.abis[contract].length,
        },
      ]),
    ),
  };
}

function abiModuleSource(module, abi) {
  return `/**
 * ${module.contract} ABI, copied verbatim from the anvil31337_dev export
 * (anvil/export/abis/${module.contract}.json). Generated by \`pnpm sync:anvil\`; do not hand-edit.
 */
export const ${module.exportName} = ${JSON.stringify(abi, null, 2)} as const;
`;
}

function abiIndexSource() {
  const lines = ABI_MODULES.map(
    ({ file, exportName }) => `export { ${exportName} } from './${file.replace(/\.ts$/, '')}';`,
  );
  return `/**
 * Generated ABI index. Sources: anvil/export/abis/*.json (anvil31337_dev).
 * Generated by \`pnpm sync:anvil\`; do not hand-edit.
 */

${lines.join('\n')}
`;
}

async function formatText(source, parser) {
  return format(source, { ...PRETTIER_CONFIG, parser });
}

/**
 * Build every file `pnpm sync:anvil` owns. Nothing is written here, so the drift gate can reuse it.
 * Returns a Map<absolute path, utf8 contents>.
 */
export async function buildSyncOutputs() {
  const exportData = loadAnvilExport();
  const existingBook = readJson(FRONTEND_DEPLOYMENT_FILE, 'frontend deployment book');
  const book = buildAddressBook(exportData, existingBook);
  const manifest = buildManifest(exportData);
  const root = validateAirdrop(exportData);

  const outputs = new Map();
  outputs.set(
    FRONTEND_DEPLOYMENT_FILE,
    await formatText(`${JSON.stringify(book, null, 2)}\n`, 'json'),
  );

  for (const module of ABI_MODULES) {
    const source = abiModuleSource(module, exportData.abis[module.contract]);
    outputs.set(resolve(FRONTEND_ABIS_DIR, module.file), await formatText(source, 'typescript'));
  }
  outputs.set(FRONTEND_INDEX_FILE, await formatText(abiIndexSource(), 'typescript'));
  outputs.set(
    FRONTEND_MANIFEST_FILE,
    await formatText(`${JSON.stringify(manifest, null, 2)}\n`, 'json'),
  );

  // The snapshot is copied byte-for-byte: the contract, the proofs and the file served to the
  // browser must be the same artifact, not a re-serialisation of it.
  outputs.set(FRONTEND_AIRDROP_FILE, readFileSync(AIRDROP_FILE, 'utf8'));

  return { outputs, manifest, root, exportData };
}

/** Stable comparison form: the export mtime is metadata, not content. */
export function comparableManifest(manifest) {
  const copy = JSON.parse(JSON.stringify(manifest));
  delete copy.anvilExport.exportedAt;
  return `${JSON.stringify(copy, null, 2)}\n`;
}
