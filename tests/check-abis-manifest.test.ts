import { describe, expect, it } from 'vitest';
import manifest from '../src/config/abis/manifest.json';
import { assertManifestSources, buildManifest } from '../scripts/lib/anvil-export.mjs';

const commit = 'a'.repeat(40);
const sha256 = 'b'.repeat(64);

function deployment() {
  const contracts = Object.values(manifest.sources).flatMap((source) => Object.keys(source.abis));
  return {
    network: 'anvil31337_dev',
    chainId: 31337,
    deployBlock: 36,
    abis: Object.fromEntries(contracts.map((contract) => [contract, [{}]])),
    provenance: {
      repos: Object.fromEntries(
        Object.keys(manifest.sources).map((repo) => [repo, { kind: 'commit', commit }]),
      ),
      abiSha256: Object.fromEntries(contracts.map((contract) => [contract, sha256])),
      dexArtifactSha256: manifest.dexArtifactSha256,
    },
  };
}

describe('ABI deployment manifest', () => {
  it('copies the deployment revision and each ABI hash', () => {
    expect(buildManifest(deployment())).toMatchObject({
      sources: { core: { kind: 'commit', commit, abis: { Stake: { entries: 1, sha256 } } } },
    });
  });

  it('keeps the base commit and fingerprint of a working-tree deployment distinct', () => {
    const input = deployment();
    Object.assign(input.provenance.repos, {
      core: { kind: 'working-tree', baseCommit: commit, sha256 },
    });
    expect(buildManifest(input)).toMatchObject({
      sources: { core: { kind: 'working-tree', baseCommit: commit, sha256 } },
    });
  });

  it('rejects a source record that has only a base revision', () => {
    const input = deployment();
    Object.assign(input.provenance.repos, { core: { kind: 'working-tree', baseCommit: commit } });
    expect(() => buildManifest(input)).toThrow('invalid deployment source record for core');
  });

  it('checks the frontend manifest without an Anvil export', () => {
    const published = buildManifest(deployment());
    expect(assertManifestSources(published)).toEqual([]);
    expect(() => assertManifestSources({ ...published, sources: {} })).toThrow(
      'invalid deployment source record for core',
    );
    expect(() => assertManifestSources({ ...published, schemaVersion: 1 })).toThrow(
      'no supported deployment provenance',
    );
  });

  it('rejects draft sources unless explicitly checking a local draft', () => {
    const input = deployment();
    Object.assign(input.provenance.repos, {
      core: { kind: 'working-tree', baseCommit: commit, sha256 },
    });
    const draft = buildManifest(input);
    expect(() => assertManifestSources(draft)).toThrow('deployment includes uncommitted sources');
    expect(assertManifestSources(draft, { allowWorkingTree: true })).toEqual(['core']);
  });
});
