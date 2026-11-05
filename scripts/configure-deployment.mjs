import { writeFile } from 'node:fs/promises';
const required = ['FIREBASE_PROJECT_ID', 'FIREBASE_WEB_CONFIG', 'FIREBASE_RUNTIME_SERVICE_ACCOUNT', 'APP_ENV', 'ALLOWED_ORIGINS', 'GITHUB_SHA'];
for (const name of required) if (!process.env[name]) throw new Error(`Missing environment setting: ${name}`);
const config = JSON.parse(process.env.FIREBASE_WEB_CONFIG);
if (config.projectId !== process.env.FIREBASE_PROJECT_ID) throw new Error('Firebase web configuration belongs to a different project.');
for (const key of ['apiKey', 'projectId', 'authDomain', 'storageBucket', 'appId']) if (!config[key]) throw new Error(`Missing Firebase web setting: ${key}`);
const line = (key, value) => `${key}=${JSON.stringify(value)}\n`;
await writeFile('.env.production.local', Object.entries({ VITE_FIREBASE_API_KEY: config.apiKey, VITE_FIREBASE_PROJECT_ID: config.projectId,
  VITE_FIREBASE_AUTH_DOMAIN: config.authDomain, VITE_FIREBASE_STORAGE_BUCKET: config.storageBucket, VITE_FIREBASE_APP_ID: config.appId,
  VITE_API_BASE_URL: `https://us-central1-${config.projectId}.cloudfunctions.net/api`, VITE_USE_EMULATORS: 'false' }).map(([k, v]) => line(k, v)).join(''));
await writeFile(`functions/.env.${config.projectId}`, Object.entries({ APP_ENV: process.env.APP_ENV, ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
  DEPLOY_COMMIT: process.env.GITHUB_SHA, RUNTIME_SERVICE_ACCOUNT: process.env.FIREBASE_RUNTIME_SERVICE_ACCOUNT }).map(([k, v]) => line(k, v)).join(''));
console.log(`Configured ${process.env.APP_ENV} for ${config.projectId}. No deployment secrets were written.`);
