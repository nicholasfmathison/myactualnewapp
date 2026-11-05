import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { FieldPath, FieldValue } from 'firebase-admin/firestore';

// Explicitly restricted to the existing local demo account. Never targets cloud.
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
const admin = initializeApp({ projectId: 'demo-soundroom', storageBucket: 'demo-soundroom.appspot.com' });
const { db, tracks, purgeTrackHistory, cleanupRetiredAudio } = await import('../lib/store.js');
const uid = '11111111-1111-4111-8111-111111111111';
let cursor, count = 0, removed = 0;
try {
  while (true) {
    let query = tracks(uid).orderBy(FieldPath.documentId()).limit(24);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get(); if (page.empty) break;
    for (const track of page.docs) {
      let batch;
      do { batch = await purgeTrackHistory(uid, track.id); removed += batch; } while (batch);
      const live = (await track.ref.get()).data();
      if (!(await getStorage().bucket().file(live.objectPath).exists())[0]) throw new Error('Current audio missing; stop migration.');
      count++;
    }
    cursor = page.docs.at(-1).id;
  }
  await cleanupRetiredAudio();
  // Retain idempotency keys, but drop old metadata snapshots from their receipts.
  let receiptCursor;
  while (true) {
    let query = db().collection(`users/${uid}/saves`).orderBy(FieldPath.documentId()).limit(50);
    if (receiptCursor) query = query.startAfter(receiptCursor);
    const receipts = await query.get(); if (receipts.empty) break;
    const batch = db().batch();
    for (const receipt of receipts.docs) {
      const data = receipt.data();
      if (data.status === 'complete' && data.result?.track?.id) batch.update(receipt.ref, {
        trackId: data.result.track.id, unchanged: data.result.unchanged ?? false, result: FieldValue.delete(),
      });
    }
    await batch.commit(); receiptCursor = receipts.docs.at(-1).id;
  }
  const pending = await db().collection(`users/${uid}/saves`).where('status', '==', 'retired').limit(1).get();
  if (!pending.empty) throw new Error('Some retired files still need cleanup. Run again after storage recovers.');
  console.log(`Local cleanup complete: ${removed} historical records removed; ${count} current sounds retained; no retired audio awaiting deletion.`);
} finally { await deleteApp(admin); }
