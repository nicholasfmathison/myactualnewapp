import { readFile } from 'node:fs/promises';

const policy = JSON.parse(await readFile(new URL('../config/spending-policy.json', import.meta.url), 'utf8'));
if (policy.cloudDeploymentApproved !== true || policy.cloudSafeguardsInstalled !== true) {
  console.error('Cloud deployment blocked: backend stays local. The combined monthly target is USD 10, not a guaranteed spending cap. Explicit owner approval and verified cloud safeguards are required before enabling deployment.');
  process.exit(1);
}
