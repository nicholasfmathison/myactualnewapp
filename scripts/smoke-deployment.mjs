const base = `https://us-central1-${process.env.FIREBASE_PROJECT_ID}.cloudfunctions.net/api/v1`;
const health = await fetch(`${base}/health`);
if (!health.ok) throw new Error(`Health check failed: ${health.status}`);
const data = await health.json();
if (data.commit !== process.env.GITHUB_SHA || data.environment !== process.env.APP_ENV) throw new Error('Deployed environment or commit does not match this workflow.');
const unauthorized = await fetch(`${base}/tracks/latest`);
if (unauthorized.status !== 401) throw new Error('Unauthenticated library request was not rejected.');
console.log(`Verified ${data.environment} API commit ${data.commit} and unauthenticated access denial.`);
