import type {
  EqBands,
  EqPresetKey,
  SyncedHddFolderSummary,
  Track,
  UserAccount,
  UserPreferences,
} from '../types/music';

const USERS_KEY = 'aura_users_v1';
const SESSION_KEY = 'aura_session_v1';
const THEME_KEY = 'aura_theme_v1';
const PREFS_PREFIX = 'aura_prefs_v1:';
const STREAMS_PREFIX = 'aura_custom_streams_v1:';
const SYNCED_FOLDERS_PREFIX = 'aura_synced_hdd_folders_v1:';

const IDB_NAME = 'aura_audio_db_v2';
const IDB_STORE = 'local_tracks';
const IDB_HANDLES_STORE = 'hdd_handles';

export const DEFAULT_EQ_BANDS: EqBands = [0, 0, 0, 0, 0];

export const EQ_PRESETS: Record<EqPresetKey, { label: string; bands: EqBands }> = {
  flat: { label: 'Flat', bands: [0, 0, 0, 0, 0] },
  warm: { label: 'Warm Vinyl', bands: [3, 2, 0, -1, -2] },
  bass: { label: 'Deep Bass', bands: [6, 3, 0, 1, 2] },
  vocal: { label: 'Vocal Clarity', bands: [-2, 0, 3, 4, 2] },
  latenight: { label: 'Late Night', bands: [2, 1, -1, 1, -3] },
  custom: { label: 'Custom', bands: [0, 0, 0, 0, 0] },
};

export function createDefaultPreferences(): UserPreferences {
  return {
    favorites: [],
    recentIds: [],
    playlists: [],
    eqPreset: 'flat',
    eqBands: [...DEFAULT_EQ_BANDS] as EqBands,
    playbackRate: 1,
    volume: 0.8,
    includeHddInStream: true,
    autoStreamOnAdd: true,
  };
}

function safeReadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed as T;
  } catch {
    return fallback;
  }
}

function safeWriteJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadThemePreference(): 'light' | 'dark' {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
  } catch {
    // ignore
  }
  return 'light';
}

export function saveThemePreference(theme: 'light' | 'dark'): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // ignore
  }
}

export async function hashPassword(password: string): Promise<string> {
  try {
    if (window.crypto?.subtle) {
      const encoded = new TextEncoder().encode(password);
      const digest = await window.crypto.subtle.digest('SHA-256', encoded);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch {
    // fallback below
  }
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    hash = (hash << 5) - hash + password.charCodeAt(i);
    hash |= 0;
  }
  return `h_${Math.abs(hash)}`;
}

export function loadUsers(): UserAccount[] {
  const list = safeReadJson<UserAccount[]>(USERS_KEY, []);
  return Array.isArray(list) ? list : [];
}

export function saveUsers(users: UserAccount[]): boolean {
  return safeWriteJson(USERS_KEY, users);
}

export function loadActiveUserId(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY) || null;
  } catch {
    return null;
  }
}

export function saveActiveUserId(userId: string | null): void {
  try {
    if (userId) {
      localStorage.setItem(SESSION_KEY, userId);
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  } catch {
    // ignore
  }
}

export function loadUserPreferences(ownerId: string): UserPreferences {
  const defaults = createDefaultPreferences();
  const saved = safeReadJson<Partial<UserPreferences>>(`${PREFS_PREFIX}${ownerId}`, {});
  return {
    favorites: Array.isArray(saved.favorites) ? saved.favorites : defaults.favorites,
    recentIds: Array.isArray(saved.recentIds) ? saved.recentIds : defaults.recentIds,
    playlists: Array.isArray(saved.playlists) ? saved.playlists : defaults.playlists,
    eqPreset: saved.eqPreset || defaults.eqPreset,
    eqBands:
      Array.isArray(saved.eqBands) && saved.eqBands.length === 5
        ? (saved.eqBands as EqBands)
        : defaults.eqBands,
    playbackRate: typeof saved.playbackRate === 'number' ? saved.playbackRate : defaults.playbackRate,
    volume: typeof saved.volume === 'number' ? saved.volume : defaults.volume,
    includeHddInStream:
      typeof saved.includeHddInStream === 'boolean'
        ? saved.includeHddInStream
        : defaults.includeHddInStream,
    autoStreamOnAdd:
      typeof saved.autoStreamOnAdd === 'boolean'
        ? saved.autoStreamOnAdd
        : defaults.autoStreamOnAdd,
  };
}

export function saveUserPreferences(ownerId: string, prefs: UserPreferences): boolean {
  return safeWriteJson(`${PREFS_PREFIX}${ownerId}`, prefs);
}

export function loadCustomStreams(ownerId: string): Track[] {
  const list = safeReadJson<Track[]>(`${STREAMS_PREFIX}${ownerId}`, []);
  return Array.isArray(list) ? list : [];
}

export function saveCustomStreams(ownerId: string, streams: Track[]): boolean {
  return safeWriteJson(`${STREAMS_PREFIX}${ownerId}`, streams);
}

// --- IndexedDB for Local Audio Files & Direct HDD Folder Handles ---

interface StoredLocalRecord {
  id: string;
  ownerId: string;
  blob: Blob;
  track: Omit<Track, 'url'>;
}

export interface StoredHddHandleRecord {
  id: string;
  ownerId: string;
  name: string;
  addedAt: number;
  handle: FileSystemDirectoryHandle;
}

function openAudioDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = window.indexedDB.open(IDB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        const store = db.createObjectStore(IDB_STORE, { keyPath: 'id' });
        store.createIndex('ownerId', 'ownerId', { unique: false });
      }
      if (!db.objectStoreNames.contains(IDB_HANDLES_STORE)) {
        const handleStore = db.createObjectStore(IDB_HANDLES_STORE, { keyPath: 'id' });
        handleStore.createIndex('ownerId', 'ownerId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function loadSyncedFolderSummaries(ownerId: string): SyncedHddFolderSummary[] {
  const list = safeReadJson<SyncedHddFolderSummary[]>(`${SYNCED_FOLDERS_PREFIX}${ownerId}`, []);
  return Array.isArray(list) ? list : [];
}

export function saveSyncedFolderSummary(
  ownerId: string,
  summary: Omit<SyncedHddFolderSummary, 'id' | 'ownerId'>
): SyncedHddFolderSummary[] {
  const existing = loadSyncedFolderSummaries(ownerId);
  const id = `folder-${ownerId}-${summary.name}`;
  const item: SyncedHddFolderSummary = {
    id,
    ownerId,
    name: summary.name,
    trackCount: summary.trackCount,
    lastSyncedAt: summary.lastSyncedAt,
    mode: summary.mode,
  };
  const next = [item, ...existing.filter((f) => f.id !== id)].slice(0, 20);
  safeWriteJson(`${SYNCED_FOLDERS_PREFIX}${ownerId}`, next);
  return next;
}

export function removeSyncedFolderSummary(ownerId: string, id: string): SyncedHddFolderSummary[] {
  const existing = loadSyncedFolderSummaries(ownerId);
  const next = existing.filter((f) => f.id !== id);
  safeWriteJson(`${SYNCED_FOLDERS_PREFIX}${ownerId}`, next);
  return next;
}

const MAX_IDB_BLOB_BYTES = 80 * 1024 * 1024;
const MAX_IDB_BATCH_TOTAL_BYTES = 600 * 1024 * 1024;

export async function saveLocalTrackToDb(track: Track, blob: Blob): Promise<void> {
  if (blob.size > MAX_IDB_BLOB_BYTES) {
    return;
  }
  try {
    const db = await openAudioDb();
    const { url: _unusedUrl, ...rest } = track;
    const record: StoredLocalRecord = {
      id: track.id,
      ownerId: track.ownerId,
      blob,
      track: rest,
    };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Non-fatal: track still plays directly from objectURL in current session
  }
}

export async function saveLocalTracksBatchToDb(
  items: Array<{ track: Track; blob: Blob }>
): Promise<void> {
  if (items.length === 0) return;
  let db: IDBDatabase | null = null;
  try {
    db = await openAudioDb();
    let totalSavedBytes = 0;
    const eligible = items.filter(({ blob }) => {
      if (blob.size > MAX_IDB_BLOB_BYTES) return false;
      if (totalSavedBytes + blob.size > MAX_IDB_BATCH_TOTAL_BYTES) return false;
      totalSavedBytes += blob.size;
      return true;
    });
    if (eligible.length === 0) return;

    const putChunk = (slice: Array<{ track: Track; blob: Blob }>) =>
      new Promise<void>((resolve, reject) => {
        const tx = db!.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        for (const { track, blob } of slice) {
          const { url: _unusedUrl, ...rest } = track;
          const record: StoredLocalRecord = {
            id: track.id,
            ownerId: track.ownerId,
            blob,
            track: rest,
          };
          store.put(record);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });

    const CHUNK = 15;
    for (let i = 0; i < eligible.length; i += CHUNK) {
      const slice = eligible.slice(i, i + CHUNK);
      try {
        await putChunk(slice);
      } catch {
        // Fallback: save individually so one oversized/corrupt item never drops the rest
        for (const single of slice) {
          try {
            await putChunk([single]);
          } catch {
            // Stop further writes if browser storage quota is full
            return;
          }
        }
      }
    }
  } catch {
    // Non-fatal: tracks play directly from HDD objectURL in current session
  } finally {
    db?.close();
  }
}

export async function updateLocalTrackMetaInDb(track: Track): Promise<void> {
  try {
    const db = await openAudioDb();
    const existing = await new Promise<StoredLocalRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(track.id);
      req.onsuccess = () => resolve(req.result as StoredLocalRecord | undefined);
      req.onerror = () => reject(req.error);
    });
    if (existing) {
      const { url: _unusedUrl, ...rest } = track;
      existing.track = rest;
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(existing);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
    db.close();
  } catch {
    // ignore
  }
}

export async function loadLocalTracksFromDb(ownerId: string): Promise<Track[]> {
  try {
    const db = await openAudioDb();
    const records = await new Promise<StoredLocalRecord[]>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const idx = tx.objectStore(IDB_STORE).index('ownerId');
      const req = idx.getAll(ownerId);
      req.onsuccess = () => resolve((req.result as StoredLocalRecord[]) || []);
      req.onerror = () => reject(req.error);
    });
    db.close();

    return records
      .sort((a, b) => b.track.addedAt - a.track.addedAt)
      .map((rec) => ({
        ...rec.track,
        url: URL.createObjectURL(rec.blob),
      }));
  } catch {
    return [];
  }
}

export async function getLocalBlobFromDb(trackId: string): Promise<Blob | null> {
  try {
    const db = await openAudioDb();
    const record = await new Promise<StoredLocalRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(trackId);
      req.onsuccess = () => resolve(req.result as StoredLocalRecord | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return record?.blob || null;
  } catch {
    return null;
  }
}

export async function deleteLocalTrackFromDb(trackId: string): Promise<void> {
  try {
    const db = await openAudioDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(trackId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore
  }
}

export async function clearLocalTracksFromDb(ownerId: string): Promise<void> {
  try {
    const tracks = await loadLocalTracksFromDb(ownerId);
    const db = await openAudioDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      for (const t of tracks) {
        URL.revokeObjectURL(t.url);
        store.delete(t.id);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore
  }
}

export async function saveHddHandleToDb(
  ownerId: string,
  handle: FileSystemDirectoryHandle
): Promise<StoredHddHandleRecord | null> {
  try {
    const db = await openAudioDb();
    const record: StoredHddHandleRecord = {
      id: `hdd-${ownerId}-${handle.name}`,
      ownerId,
      name: handle.name,
      addedAt: Date.now(),
      handle,
    };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_HANDLES_STORE, 'readwrite');
      tx.objectStore(IDB_HANDLES_STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return record;
  } catch {
    return null;
  }
}

export async function loadHddHandlesFromDb(ownerId: string): Promise<StoredHddHandleRecord[]> {
  try {
    const db = await openAudioDb();
    const records = await new Promise<StoredHddHandleRecord[]>((resolve, reject) => {
      const tx = db.transaction(IDB_HANDLES_STORE, 'readonly');
      const idx = tx.objectStore(IDB_HANDLES_STORE).index('ownerId');
      const req = idx.getAll(ownerId);
      req.onsuccess = () => resolve((req.result as StoredHddHandleRecord[]) || []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return records;
  } catch {
    return [];
  }
}

export async function deleteHddHandleFromDb(id: string): Promise<void> {
  try {
    const db = await openAudioDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_HANDLES_STORE, 'readwrite');
      tx.objectStore(IDB_HANDLES_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore
  }
}

export async function clearHddHandlesFromDb(ownerId: string): Promise<void> {
  try {
    const handles = await loadHddHandlesFromDb(ownerId);
    if (handles.length === 0) return;
    const db = await openAudioDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_HANDLES_STORE, 'readwrite');
      const store = tx.objectStore(IDB_HANDLES_STORE);
      for (const h of handles) {
        store.delete(h.id);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore
  }
}

export function clearSyncedFolderSummaries(ownerId: string): void {
  try {
    localStorage.removeItem(`${SYNCED_FOLDERS_PREFIX}${ownerId}`);
  } catch {
    // ignore
  }
}

