import { randomUUID } from 'node:crypto';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
const [projectId, email, username] = process.argv.slice(2);
if (!projectId || !email || !/^[a-z0-9][a-z0-9_-]{2,39}$/.test(username ?? '')) throw new Error('Usage: node functions/scripts/provision-user.mjs PROJECT_ID EMAIL USERNAME (3–40 lowercase letters, digits, _ or -)');
if (process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Unset emulator variables before provisioning a cloud account.');
initializeApp({ projectId, credential: applicationDefault() });
let user;
try { user = await getAuth().getUserByEmail(email); }
catch (error) { if (error.code !== 'auth/user-not-found') throw error; user = await getAuth().createUser({ uid: randomUUID(), email, password: randomUUID() + randomUUID() }); }
if (!/^[0-9a-f-]{36}$/i.test(user.uid)) throw new Error('The existing account does not use a UUID. No profile was changed.');
const profile = getFirestore().doc(`users/${user.uid}`);
await getFirestore().runTransaction(async tx => {
  const existing = await tx.get(profile);
  if (existing.exists && existing.get('username') !== username) throw new Error('Usernames are immutable. Use the existing username.');
  if (!existing.exists) tx.create(profile, { id: user.uid, username, enabled: true, createdAt: new Date().toISOString() });
});
console.log(`Provisioned ${user.uid} in ${projectId}. Use Forgot your password on that environment to set your password. No password has been printed or stored.`);
