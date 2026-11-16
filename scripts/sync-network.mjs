#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { ADDRESS_KEYS, verifyMerkle } from './lib/anvil-export.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = process.argv[2];
if (!source) throw new Error('Usage: pnpm sync:network <core/script/network/network>');
const sourceDirectory = resolve(source);

function readParams(filename) {
  const values = {};
  for (const line of readFileSync(resolve(sourceDirectory, filename), 'utf8').split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) throw new Error(`Invalid parameter in ${filename}`);
    const [, key, raw] = match;
    if (/PASSWORD|SECRET|PRIVATE_KEY|API_KEY|KEYSTORE/.test(key)) {
      throw new Error(`Move ${key} from ${filename} to .account`);
    }
    let value = raw.trim();
    if (value.startsWith('"') || value.startsWith("'")) {
      if (value.at(-1) !== value[0]) throw new Error(`Invalid quoted parameter: ${key}`);
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }
    values[key] = value
      .split(',')
      .map((item) => {
        item = item.trim();
        const scientific = item.match(/^([0-9][0-9_]*)[eE]([0-9]+)$/);
        if (scientific)
          return scientific[1].replaceAll('_', '') + '0'.repeat(Number(scientific[2]));
        return /^[0-9][0-9_]*$/.test(item) ? item.replaceAll('_', '') : item;
      })
      .join(',');
  }
  return values;
}

const publicNetwork = readParams('network.params');
const addresses = {};
for (const filename of readdirSync(sourceDirectory).filter((name) =>
  /^addresses\..+\.params$/.test(name),
)) {
  for (const [key, value] of Object.entries(readParams(filename))) {
    if (!key.endsWith('_ADDRESS') || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
      throw new Error(`Invalid address in ${filename}: ${key}`);
    }
    addresses[key] = value;
  }
}
const network = {
  network: basename(sourceDirectory),
  chainId: Number(publicNetwork.CHAIN_ID),
  rpcUrls: [publicNetwork.RPC_URL],
  addresses,
  params: readParams('core.params'),
};
const destination = resolve(root, 'src/config/network', network.network);
const configFile = resolve(destination, 'network.json');
if (!existsSync(configFile))
  throw new Error('Add this network to the frontend environment configuration first');
const config = JSON.parse(readFileSync(configFile, 'utf8'));
if (config.chainId !== network.chainId)
  throw new Error('Network chain ID does not match the frontend configuration');
if (!/^https?:\/\//.test(publicNetwork.RPC_URL)) {
  throw new Error('Network RPC URLs must be http(s)');
}

const merkleRoot = network.params.GENESIS_AIRDROP_MERKLE_ROOT;
if (!/^0x[0-9a-fA-F]{64}$/.test(merkleRoot)) throw new Error('Invalid genesis Merkle root');
const snapshotText = readFileSync(
  resolve(sourceDirectory, basename(new URL(network.params.GENESIS_AIRDROP_SNAPSHOT_URI).pathname)),
  'utf8',
);
verifyMerkle(JSON.parse(snapshotText), merkleRoot);
const zero = `0x${'0'.repeat(40)}`;
const newGenesis = network.addresses.LOVE20_TOKEN_ADDRESS;
if (!/^0x[0-9a-fA-F]{40}$/.test(newGenesis) || newGenesis === zero) {
  throw new Error('Deploy the network before synchronizing the frontend');
}
if (config.addresses.tokenAddress.toLowerCase() !== newGenesis.toLowerCase()) {
  config.addresses = Object.fromEntries(Object.keys(config.addresses).map((key) => [key, zero]));
  delete config.airdropDistributor;
  config.deployment = { blockNumber: null };
}
if (config.airdropDistributor?.merkleRoot.toLowerCase() !== merkleRoot.toLowerCase()) {
  delete config.airdropDistributor;
}
for (const [key, sourceKey] of Object.entries(ADDRESS_KEYS)) {
  const value =
    network.addresses[sourceKey] ??
    (sourceKey === 'UNISWAP_V2_FACTORY_ADDRESS' ? network.addresses.FACTORY_ADDRESS : undefined) ??
    (sourceKey === 'UNISWAP_V2_ROUTER02_ADDRESS' ? network.addresses.ROUTER_ADDRESS : undefined);
  if (value === undefined) continue;
  config.addresses[key] = value;
}
config.rpcUrls = network.rpcUrls;
config.params = network.params;
config.notes = '公开网络配置与快照由 pnpm sync:network 同步；链上状态以当前合约读取结果为准。';
const prettier = (await resolveConfig(configFile)) ?? {};
const configText = await format(JSON.stringify(config, null, 2), { ...prettier, parser: 'json' });
writeFileSync(configFile, configText);
writeFileSync(resolve(destination, 'airdrop.json'), snapshotText);
console.log(`Synchronized ${network.network}: addresses, public parameters and Merkle snapshot`);
