import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
// This script is deliberately locked to loopback emulators and a demo project.
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
initializeApp({ projectId: 'demo-soundroom' });
const uid = '11111111-1111-4111-8111-111111111111';
const email = 'demo@example.test';
const password = 'Soundroom-local-only!';
try { await getAuth().createUser({ uid, email, password }); }
catch (error) { if (error.code !== 'auth/uid-already-exists' && error.code !== 'auth/email-already-exists') throw error; }
await getFirestore().doc(`users/${uid}`).set({ id: uid, username: 'local-demo', enabled: true, createdAt: new Date().toISOString() });
console.log(`Local emulator account: ${email}\nLocal-only password: ${password}\nThis account does not exist in Firebase production.`);
