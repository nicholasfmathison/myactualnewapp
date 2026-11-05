import { initializeApp } from 'firebase-admin/app';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { app } from './app.js';
import { cleanupIncompleteSaves } from './store.js';

initializeApp();
export const api = onRequest({ region: 'us-central1', serviceAccount: process.env.RUNTIME_SERVICE_ACCOUNT, minInstances: 0, maxInstances: 2,
  memory: '512MiB', concurrency: 8, timeoutSeconds: 120, invoker: 'public' }, app);
export const cleanupSaves = onSchedule({ schedule: 'every 15 minutes', region: 'us-central1', serviceAccount: process.env.RUNTIME_SERVICE_ACCOUNT,
  maxInstances: 1, timeoutSeconds: 120 }, cleanupIncompleteSaves);
