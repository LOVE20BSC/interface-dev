#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createTestClient,
  encodeAbiParameters,
  encodeFunctionData,
  http,
  keccak256,
  parseAbi,
  parseEventLogs,
  publicActions,
  toHex,
} from 'viem';

const rpc = process.env.VERIFY_RPC ?? 'http://127.0.0.1:8566';
const url = new URL(rpc);
assert.ok(
  ['127.0.0.1', 'localhost'].includes(url.hostname) && !['8545', '8555'].includes(url.port),
);
const client = createTestClient({ mode: 'anvil', transport: http(rpc) }).extend(publicActions);
const network = JSON.parse(
  readFileSync(new URL('../../src/config/network/anvil31337_dev/network.json', import.meta.url)),
);
const snapshot = JSON.parse(
  readFileSync(new URL('../../src/config/network/anvil31337_dev/airdrop.json', import.meta.url)),
);
const token = network.addresses.firstTokenAddress;
const distributor = network.addresses.airdropDistributor;
const claimer = '0x976EA74026E726554dB657fA54763abd0C3a0aa9';
const previous = '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955';
const donor = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const outsider = '0x8b3a350cf5c34c9194ca85829a2df0ec3153be5d';
const B = 500000000000000000000000000n;
const R = 500000000000000000n;
const S = 100000000000000000n;
const A = 100000000000000000000000000n;
const D = 1234567890123456789n;
const FRACTIONAL = 100000000246913578024691357n;
const abi = parseAbi([
  'function airdropInfo(address) view returns ((address tokenAddress,bytes32 merkleRoot,uint256 claimableFromRound,uint256 totalClaimedShare,uint256 totalRemainingShare,uint256 totalClaimedAmount,uint256 remainingAmount,string snapshotUri))',
  'function claimableAmount(address,address,uint256,bytes32[]) view returns (uint256)',
  'function claimedAmount(address,address) view returns (uint256)',
  'function isClaimed(address,address) view returns (bool)',
  'function claim(address,uint256,bytes32[]) returns (uint256)',
  'event AirdropClaimed(address indexed tokenAddress,address indexed claimer,uint256 share,uint256 amount,uint256 remainingShare)',
  'error InvalidProof()',
  'error AirdropAlreadyClaimed(address tokenAddress,address claimer)',
]);
const erc20 = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address,uint256) returns (bool)',
]);
const entry = (account) => {
  const found = snapshot.entries.find(
    (item) => item.account.toLowerCase() === account.toLowerCase(),
  );
  assert.ok(found, `missing fixture entry ${account}`);
  assert.equal(BigInt(found.share), S);
  return found;
};
const read = (functionName, ...args) =>
  client.readContract({ address: distributor, abi, functionName, args });
const balance = (account) =>
  client.readContract({ address: token, abi: erc20, functionName: 'balanceOf', args: [account] });
const claimable = (account, proof = entry(account).proof) =>
  read('claimableAmount', token, account, S, proof);
const claimData = (account, proof = entry(account).proof) =>
  encodeFunctionData({ abi, functionName: 'claim', args: [token, S, proof] });

async function send(from, to, data) {
  const hash = await client.sendUnsignedTransaction({ from, to, data, gas: 500000n });
  const receipt = await client.waitForTransactionReceipt({ hash });
  console.log(`tx=${hash} status=${receipt.status}`);
  return receipt;
}

async function state(account, expected = {}) {
  const info = await read('airdropInfo', token);
  assert.deepEqual(
    {
      pool: info.remainingAmount,
      remainingShare: info.totalRemainingShare,
      claimedShare: info.totalClaimedShare,
      totalClaimedAmount: info.totalClaimedAmount,
      wallet: await balance(account),
      claimedAmount: await read('claimedAmount', token, account),
      claimed: await read('isClaimed', token, account),
    },
    {
      pool: B,
      remainingShare: R,
      claimedShare: R,
      totalClaimedAmount: B,
      wallet: 0n,
      claimedAmount: 0n,
      claimed: false,
      ...expected,
    },
  );
}

async function claim(account, amount, pool) {
  assert.equal(await claimable(account), amount);
  const receipt = await send(account, distributor, claimData(account));
  assert.equal(receipt.status, 'success');
  const events = parseEventLogs({ abi, logs: receipt.logs, eventName: 'AirdropClaimed' });
  assert.equal(events.length, 1);
  assert.equal(events[0].args.amount, amount);
  assert.equal(events[0].args.remainingShare, R - S);
  await state(account, {
    pool,
    remainingShare: R - S,
    claimedShare: R + S,
    totalClaimedAmount: B + amount,
    wallet: amount,
    claimedAmount: amount,
    claimed: true,
  });
}

async function poolBalance(amount) {
  await client.impersonateAccount({ address: distributor });
  await client.setBalance({ address: distributor, value: 10n ** 18n });
  try {
    const receipt = await send(
      distributor,
      token,
      encodeFunctionData({ abi: erc20, functionName: 'transfer', args: [donor, B - amount] }),
    );
    assert.equal(receipt.status, 'success');
  } finally {
    await client.stopImpersonatingAccount({ address: distributor });
  }
}

const cases = [
  [
    'A normal',
    async () => {
      await claim(claimer, A, 400000000000000000000000000n);
    },
  ],
  [
    'B fractional top-up',
    async () => {
      const receipt = await send(
        donor,
        token,
        encodeFunctionData({ abi: erc20, functionName: 'transfer', args: [distributor, D] }),
      );
      assert.equal(receipt.status, 'success');
      await state(claimer, { pool: 500000001234567890123456789n });
      await claim(claimer, FRACTIONAL, 400000000987654312098765432n);
    },
  ],
  [
    'C round gate',
    async () => {
      const phase = await client.readContract({
        address: network.addresses.phase,
        abi: parseAbi(['function currentPhase() view returns (uint256)']),
        functionName: 'currentPhase',
      });
      const slot = keccak256(
        encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [token, 2n]),
      );
      await client.setStorageAt({
        address: distributor,
        index: slot,
        value: toHex(phase + 2n, { size: 32 }),
      });
      assert.equal(await claimable(claimer), 0n);
      await state(claimer);
    },
  ],
  [
    'D empty pool',
    async () => {
      await poolBalance(0n);
      assert.equal(await claimable(claimer), 0n);
      await state(claimer, { pool: 0n });
    },
  ],
  [
    'E floor to zero',
    async () => {
      await poolBalance(1n);
      assert.equal(await claimable(claimer), 0n);
      await state(claimer, { pool: 1n });
    },
  ],
  [
    'F already claimed',
    async () => {
      await state(previous);
      await claim(previous, A, B - A);
      assert.equal(await claimable(previous), 0n);
      await assert.rejects(
        client.simulateContract({
          address: distributor,
          abi,
          functionName: 'claim',
          args: [token, S, entry(previous).proof],
          account: previous,
        }),
        /AirdropAlreadyClaimed/,
      );
      const receipt = await send(previous, distributor, claimData(previous));
      assert.equal(receipt.status, 'reverted');
      await state(previous, {
        pool: B - A,
        remainingShare: R - S,
        claimedShare: R + S,
        totalClaimedAmount: B + A,
        wallet: A,
        claimedAmount: A,
        claimed: true,
      });
    },
  ],
  [
    'G invalid proof rollback',
    async () => {
      const proof = [...entry(claimer).proof];
      proof[0] = `0x${'00'.repeat(32)}`;
      assert.equal(await claimable(claimer, proof), 0n);
      await assert.rejects(
        client.simulateContract({
          address: distributor,
          abi,
          functionName: 'claim',
          args: [token, S, proof],
          account: claimer,
        }),
        /InvalidProof/,
      );
      const receipt = await send(claimer, distributor, claimData(claimer, proof));
      assert.equal(receipt.status, 'reverted');
      assert.equal(receipt.logs.length, 0);
      await state(claimer);
    },
  ],
  [
    'H outside snapshot',
    async () => {
      assert.equal(await claimable(outsider, entry(claimer).proof), 0n);
      await state(outsider);
    },
  ],
];

assert.equal(await client.getChainId(), 31337);
const info = await read('airdropInfo', token);
assert.equal(info.merkleRoot.toLowerCase(), snapshot.merkleRoot.toLowerCase());
assert.equal(
  info.snapshotUri,
  'https://love20bsc.github.io/core/script/network/anvil31337_dev/airdrop.json',
);
for (const [name, verify] of cases) {
  const id = await client.snapshot();
  try {
    await state(claimer);
    await verify();
    console.log(`PASS ${name}`);
  } finally {
    await client.revert({ id });
  }
  await state(claimer);
}
console.log(
  `[airdrop-contract] ${cases.length}/${cases.length} cases passed against independent theory values`,
);
