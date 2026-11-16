// @vitest-environment node
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { expect, it } from 'vitest';
import { ADDRESS_KEYS, buildAddressBook } from '../scripts/lib/anvil-export.mjs';

it('keeps public network sync compatible with Anvil and rejects invalid data', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const temporary = mkdtempSync(resolve(tmpdir(), 'love20-sync-network-'));
  try {
    const source = resolve(temporary, 'core/script/network/anvil31337_dev');
    const destination = resolve(temporary, 'src/config/network/anvil31337_dev');
    mkdirSync(source, { recursive: true });
    mkdirSync(resolve(temporary, 'scripts/lib'), { recursive: true });
    mkdirSync(destination, { recursive: true });
    for (const file of ['sync-network.mjs', 'lib/anvil-export.mjs']) {
      cpSync(resolve(root, 'scripts', file), resolve(temporary, 'scripts', file));
    }
    cpSync(resolve(root, '.prettierrc.json'), resolve(temporary, '.prettierrc.json'));
    symlinkSync(resolve(root, 'node_modules'), resolve(temporary, 'node_modules'));
    const existing = readFileSync(
      resolve(root, 'src/config/network/anvil31337_dev/network.json'),
      'utf8',
    );
    writeFileSync(resolve(destination, 'network.json'), existing);
    const genesis = JSON.parse(existing).addresses.tokenAddress;
    writeFileSync(resolve(source, 'addresses.core.params'), `LOVE20_TOKEN_ADDRESS=${genesis}\n`);
    writeFileSync(
      resolve(source, 'network.params'),
      'CHAIN_ID=31337\nRPC_URL=http://127.0.0.1:8545\n',
    );
    const snapshot = JSON.parse(
      readFileSync(resolve(root, 'src/config/network/anvil31337_dev/airdrop.json'), 'utf8'),
    );
    writeFileSync(resolve(source, 'airdrop.json'), JSON.stringify(snapshot));
    writeFileSync(
      resolve(source, '.account'),
      'ETHERSCAN_API_KEY=private-key\nRPC_URL=http://private.invalid\n',
    );
    const paramsFile = resolve(source, 'core.params');
    writeFileSync(
      paramsFile,
      `GENESIS_AIRDROP_MERKLE_ROOT=${snapshot.merkleRoot}\n` +
        'GENESIS_AIRDROP_SNAPSHOT_URI=https://love20bsc.github.io/core/script/network/anvil31337_dev/airdrop.json\n' +
        'LAUNCH_AMOUNT=1e27\nSYNC_LITERAL="literal # data"\nSYNC_NUMBERS=1_000,3e2\n',
    );
    const sync = () =>
      execFileSync(process.execPath, [resolve(temporary, 'scripts/sync-network.mjs'), source], {
        stdio: 'pipe',
      });
    sync();
    const configFile = resolve(destination, 'network.json');
    const configText = readFileSync(configFile, 'utf8');
    const config = JSON.parse(configText);
    expect(config.params.LAUNCH_AMOUNT).toBe('1000000000000000000000000000');
    expect(config.params.SYNC_LITERAL).toBe('literal # data');
    expect(config.params.SYNC_NUMBERS).toBe('1000,300');
    expect(config.rpcUrls).toEqual(['http://127.0.0.1:8545']);
    expect(configText).not.toContain('private-');
    const regenerated = buildAddressBook(
      {
        chainId: config.chainId,
        rpcUrl: config.rpcUrls[0],
        deployBlock: config.deployment.blockNumber,
        addresses: Object.fromEntries(
          Object.entries(ADDRESS_KEYS).map(([key, sourceKey]) => [
            sourceKey,
            config.addresses[key],
          ]),
        ),
        deployment: {
          airdropDistributor: config.airdropDistributor,
          coreParams: { LAUNCH_AMOUNT: '1' },
        },
      },
      config,
    );
    expect(
      await format(JSON.stringify(regenerated, null, 2), {
        ...(await resolveConfig(configFile)),
        parser: 'json',
      }),
    ).toBe(configText);
    const snapshotFile = resolve(destination, 'airdrop.json');
    const snapshotText = readFileSync(snapshotFile, 'utf8');
    snapshot.entries[0].proof[0] = `0x${'00'.repeat(32)}`;
    writeFileSync(resolve(source, 'airdrop.json'), JSON.stringify(snapshot));
    expect(sync).toThrow();
    writeFileSync(
      resolve(source, 'network.params'),
      'CHAIN_ID=31337\nRPC_URL=http://public.invalid\nETHERSCAN_API_KEY=secret\n',
    );
    expect(sync).toThrow(/Move ETHERSCAN_API_KEY/);
    expect(readFileSync(configFile, 'utf8')).toBe(configText);
    expect(readFileSync(snapshotFile, 'utf8')).toBe(snapshotText);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
