import { useRef, useState } from 'react';
import { api, errorMessage, type Track } from '../lib/api';
import { Modal, Notice } from './LibraryUI';

export function DeleteDialog({ track, close, deleted }: { track: Track; close: () => void; deleted: () => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const lock = useRef(false);
  async function remove() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      await api(`/tracks/${track.id}`, { method: 'DELETE', headers: { 'If-Match': track.versionId } });
      deleted();
    } catch (err) { setError(errorMessage(err)); }
    finally { lock.current = false; setBusy(false); }
  }
  return <Modal title="Delete sound?" subtitle="" neutral close={() => { if (!lock.current) close(); }}>
    <p className="break-words text-sm text-neutral-500">“{track.title}” and its audio file will be permanently deleted.</p>
    {error && <div className="mt-4"><Notice>{error}</Notice></div>}
    <div className="mt-6 flex justify-end gap-3"><button type="button" className="secondary" disabled={busy} onClick={close}>Cancel</button><button type="button" className="rounded-lg bg-neutral-800 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700" disabled={busy} onClick={() => void remove()}>{busy ? 'Deleting…' : error ? 'Retry delete' : 'Delete'}</button></div>
  </Modal>;
}
