import { writeFile } from 'node:fs/promises';

const { GITHUB_SHA, GITHUB_REF_NAME } = process.env;
if (!/^[a-f0-9]{40}$/.test(GITHUB_SHA ?? '') || GITHUB_REF_NAME !== 'main') throw new Error('Pages artifacts must identify an exact main commit.');
await writeFile(new URL('../dist/deployment.json', import.meta.url), JSON.stringify({
  commit: GITHUB_SHA, branch: GITHUB_REF_NAME, backendEnabled: process.env.BACKEND_ENABLED === 'true',
}, null, 2) + '\n');
