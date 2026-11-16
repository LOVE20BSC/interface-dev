import { APP_ENV } from './env';
import { DEPLOYMENT_FILES } from './variant';

const snapshots = import.meta.glob<unknown>('./network/*/airdrop.json', { import: 'default' });
const network = DEPLOYMENT_FILES[APP_ENV.variant].split('/')[0];

export const loadBundledAirdropSnapshot = snapshots[`./network/${network}/airdrop.json`] ?? null;
