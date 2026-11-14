import crypto from 'node:crypto';
import express from 'express';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { parseFile } from 'music-metadata';

const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';
const IS_PROD = process.env.NODE_ENV === 'production';

const SERVER_STARTED_AT = Date.now();
const DATA_DIR = path.resolve(process.cwd(), 'data', 'hdd-streams');
const STREAMS_INDEX_FILE = path.join(DATA_DIR, 'streams-index.json');
const HOST_HDD_INDEX_FILE = path.join(DATA_DIR, 'host-hdd-index.json');
const HOST_HDD_FOLDERS_FILE = path.join(DATA_DIR, 'host-hdd-folders.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const PREFS_FILE = path.join(DATA_DIR, 'prefs.json');
const ADMIN_ACTIVITY_FILE = path.join(DATA_DIR, 'admin-activity.json');

const AUDIO_EXTENSIONS = new Set([
  '.mp3',
  '.wav',
  '.flac',
  '.ogg',
  '.oga',
  '.aac',
  '.m4a',
  '.m4b',
  '.opus',
  '.wma',
  '.aiff',
  '.aif',
  '.aifc',
  '.alac',
  '.webm',
  '.amr',
  '.ape',
  '.ac3',
  '.dts',
  '.caf',
]);

const LOSSLESS_EXTS = new Set(['.flac', '.wav', '.aiff', '.aif', '.aifc', '.alac', '.ape']);

const MIME_MAP: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/opus',
  '.aac': 'audio/aac',
  '.m4a': 'audio/mp4',
  '.m4b': 'audio/mp4',
  '.aiff': 'audio/aiff',
  '.aif': 'audio/aiff',
  '.aifc': 'audio/aiff',
  '.wma': 'audio/x-ms-wma',
  '.webm': 'audio/webm',
  '.amr': 'audio/amr',
  '.alac': 'audio/mp4',
  '.ape': 'audio/ape',
  '.ac3': 'audio/ac3',
  '.dts': 'audio/vnd.dts',
  '.caf': 'audio/x-caf',
};

interface StoredStreamTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  genre?: string;
  folderName?: string;
  format: string;
  formatDetail: string;
  isLossless: boolean;
  durationSec: number | null;
  durationLabel: string;
  streamKind: 'file' | 'url' | 'hdd';
  filePath?: string;
  externalUrl?: string;
  sizeBytes: number;
  sampleRate?: number;
  bitrate?: number;
  addedAt: number;
  ownerId: string;
  coverSeed: number;
  sourceFolder?: string;
}

interface StoredUser {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  role: 'admin' | 'member';
  createdAt: number;
  accentHue: number;
}

interface StoredSession {
  token: string;
  userId: string;
  role: 'admin' | 'member';
  createdAt: number;
}

interface AdminActivityRecord {
  id: string;
  action: string;
  detail: string;
  status: 'success' | 'info' | 'error';
  timestamp: number;
}

interface ConnectedDeviceEntry {
  deviceId: string;
  deviceName: string;
  deviceType: 'desktop' | 'mobile' | 'tablet' | 'tv';
  isAdmin: boolean;
  currentTrackTitle?: string;
  isPlaying?: boolean;
  connectedAt: number;
  lastSeenAt: number;
}

const sseClients = new Map<express.Response, ConnectedDeviceEntry>();

function getUniqueConnectedDevices() {
  const byDevice = new Map<string, ConnectedDeviceEntry>();
  for (const entry of sseClients.values()) {
    const existing = byDevice.get(entry.deviceId);
    if (!existing || entry.lastSeenAt >= existing.lastSeenAt) {
      byDevice.set(entry.deviceId, entry);
    }
  }
  return Array.from(byDevice.values()).sort((a, b) => a.connectedAt - b.connectedAt);
}

function broadcastSseEvent(data: Record<string, unknown>): void {
  const devices = getUniqueConnectedDevices();
  const payload = JSON.stringify({
    ...data,
    connectedClients: devices.length,
    devices,
    timestamp: Date.now(),
  });
  for (const client of sseClients.keys()) {
    try {
      client.write(`data: ${payload}\n\n`);
    } catch {
      sseClients.delete(client);
    }
  }
}

function broadcastLibraryUpdate(reason: string): void {
  broadcastSseEvent({ type: 'library-updated', reason });
}

async function recordAdminActivity(
  action: string,
  detail: string,
  status: 'success' | 'info' | 'error' = 'success'
): Promise<void> {
  try {
    const existing = await readJsonFile<AdminActivityRecord[]>(ADMIN_ACTIVITY_FILE, []);
    const item: AdminActivityRecord = {
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      action,
      detail,
      status,
      timestamp: Date.now(),
    };
    await writeJsonFile(ADMIN_ACTIVITY_FILE, [item, ...existing].slice(0, 15));
  } catch {
    // ignore activity log write failure
  }
}

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || isNaN(seconds) || !isFinite(seconds) || seconds < 0) {
    return '--:--';
  }
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function normalizeGenreTag(raw?: string[] | string): string | undefined {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const item of list) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    const stripped = trimmed.replace(/^\(\d+\)\s*/, '').trim();
    const clean = (stripped || trimmed).replace(/\s+/g, ' ');
    if (clean) return clean;
  }
  return undefined;
}

function computeHddFolderName(fullPath: string, sourceFolder?: string): string | undefined {
  const dir = path.dirname(fullPath);
  if (sourceFolder) {
    const rootName = path.basename(sourceFolder) || sourceFolder;
    const relDir = path.relative(sourceFolder, dir).replace(/\\/g, '/');
    if (!relDir || relDir === '.' || relDir.startsWith('..')) {
      return rootName;
    }
    return `${rootName}/${relDir}`;
  }
  return path.basename(dir) || undefined;
}

async function ensureDataDir(): Promise<void> {
  await fsp.mkdir(DATA_DIR, { recursive: true });
}

const fileWriteQueues = new Map<string, Promise<void>>();

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  const prev = fileWriteQueues.get(filePath) || Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(async () => {
      await ensureDataDir();
      const tmpPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random()
        .toString(36)
        .slice(2, 7)}.tmp`;
      const serialized = JSON.stringify(data, null, 2);
      await fsp.writeFile(tmpPath, serialized, 'utf8');
      await fsp.rename(tmpPath, filePath);
    });
  fileWriteQueues.set(filePath, next);
  try {
    await next;
  } finally {
    if (fileWriteQueues.get(filePath) === next) {
      fileWriteQueues.delete(filePath);
    }
  }
}

async function ensureSeedAdmin(): Promise<void> {
  const users = await readJsonFile<StoredUser[]>(USERS_FILE, []);
  const adminIdx = users.findIndex((u) => u.username.toLowerCase() === 'admin');
  const expectedHash = sha256('2535');

  if (adminIdx === -1) {
    const adminUser: StoredUser = {
      id: 'user-admin',
      username: 'admin',
      email: 'admin@aura.local',
      passwordHash: expectedHash,
      role: 'admin',
      createdAt: Date.now(),
      accentHue: 32,
    };
    await writeJsonFile(USERS_FILE, [adminUser, ...users]);
  } else {
    let dirty = false;
    if (users[adminIdx].role !== 'admin') {
      users[adminIdx].role = 'admin';
      dirty = true;
    }
    if (!users[adminIdx].passwordHash) {
      users[adminIdx].passwordHash = expectedHash;
      dirty = true;
    }
    if (dirty) {
      await writeJsonFile(USERS_FILE, users);
    }
  }
}

function toPublicUser(user: StoredUser) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    accentHue: user.accentHue,
  };
}

function extractBearerToken(req: express.Request): string | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice('Bearer '.length).trim() || null;
}

async function getSessionUser(req: express.Request): Promise<StoredUser | null> {
  const token = extractBearerToken(req);
  if (!token) return null;
  const sessions = await readJsonFile<StoredSession[]>(SESSIONS_FILE, []);
  const session = sessions.find((s) => s.token === token);
  if (!session) return null;
  const users = await readJsonFile<StoredUser[]>(USERS_FILE, []);
  return users.find((u) => u.id === session.userId) || null;
}

async function requireAdmin(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<void> {
  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: 'กรุณาเข้าสู่ระบบผู้ดูแล (admin) ก่อนจัดการเพลงออนไลน์' });
    return;
  }
  if (user.role !== 'admin') {
    res.status(403).json({ error: 'สิทธิ์ไม่เพียงพอ เฉพาะบัญชี admin เท่านั้นที่จัดการเพลงออนไลน์ได้' });
    return;
  }
  next();
}

function toClientTrack(item: StoredStreamTrack, routePrefix: '/api/streams' | '/api/hdd/audio') {
  const isExternalUrl = item.streamKind === 'url' && Boolean(item.externalUrl);
  const audioUrl = isExternalUrl
    ? item.externalUrl!
    : routePrefix === '/api/streams'
    ? `/api/streams/${encodeURIComponent(item.id)}/audio`
    : `/api/hdd/audio/${encodeURIComponent(item.id)}`;

  return {
    id: item.id,
    title: item.title,
    artist: item.artist,
    album: item.album,
    genre: item.genre,
    folderName: item.folderName,
    source: 'stream' as const,
    isSharedStream: true,
    streamKind: item.streamKind || (routePrefix === '/api/hdd/audio' ? 'hdd' : 'file'),
    format: item.format,
    formatDetail: item.formatDetail,
    isLossless: item.isLossless,
    durationSec: item.durationSec,
    durationLabel: item.durationLabel,
    url: audioUrl,
    streamUrl: audioUrl,
    hddPath: item.sourceFolder ? item.filePath : undefined,
    coverSeed: item.coverSeed,
    addedAt: item.addedAt,
    ownerId: item.ownerId,
    sizeBytes: item.sizeBytes,
    sampleRate: item.sampleRate,
    bitrate: item.bitrate,
  };
}

function streamAudioFileWithRange(
  req: express.Request,
  res: express.Response,
  filePath: string
): void {
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'ไม่พบไฟล์เสียงบน HDD' });
    return;
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_MAP[ext] || 'application/octet-stream';

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'public, max-age=3600');

  const attachStreamCleanup = (stream: fs.ReadStream) => {
    const cleanup = () => {
      if (!stream.destroyed) {
        stream.destroy();
      }
    };
    req.on('close', cleanup);
    res.on('close', cleanup);
    stream.on('error', () => {
      cleanup();
      if (!res.headersSent) {
        res.status(500).end();
      } else if (!res.writableEnded) {
        res.end();
      }
    });
  };

  const rangeHeader = req.headers.range;
  if (rangeHeader) {
    const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
    if (!match) {
      res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
      return;
    }

    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Math.min(Number(match[2]), fileSize - 1) : fileSize - 1;

    if (isNaN(start) || isNaN(end) || start >= fileSize || start > end) {
      res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
      return;
    }

    const chunkSize = end - start + 1;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    res.setHeader('Content-Length', String(chunkSize));

    const stream = fs.createReadStream(filePath, { start, end });
    attachStreamCleanup(stream);
    stream.pipe(res);
    return;
  }

  res.status(200);
  res.setHeader('Content-Length', String(fileSize));
  const stream = fs.createReadStream(filePath);
  attachStreamCleanup(stream);
  stream.pipe(res);
}

async function parseSingleHddAudioFile(
  fullPath: string,
  ownerId: string,
  sourceFolder?: string
): Promise<StoredStreamTrack | null> {
  const ext = path.extname(fullPath).toLowerCase();
  if (!AUDIO_EXTENSIONS.has(ext)) return null;

  try {
    const stat = await fsp.stat(fullPath);
    if (!stat.isFile()) return null;

    const baseDir = path.dirname(fullPath);
    let title = path.basename(fullPath).replace(/\.[^/.]+$/, '');
    let artist = `HDD · ${path.basename(baseDir) || 'Disk'}`;
    let album: string | undefined;
    let genre: string | undefined;
    const folderName = computeHddFolderName(fullPath, sourceFolder);
    let durationSec: number | null = null;
    let sampleRate: number | undefined;
    let bitrate: number | undefined;
    let isLossless = LOSSLESS_EXTS.has(ext);
    let format = ext.slice(1).toUpperCase();

    try {
      const meta = await parseFile(fullPath, { duration: false, skipCovers: true });
      if (meta.common.title?.trim()) title = meta.common.title.trim();
      if (meta.common.artist?.trim()) artist = meta.common.artist.trim();
      if (meta.common.album?.trim()) album = meta.common.album.trim();
      genre = normalizeGenreTag(meta.common.genre);
      if (meta.format.duration && isFinite(meta.format.duration)) {
        durationSec = meta.format.duration;
      }
      if (meta.format.sampleRate) sampleRate = meta.format.sampleRate;
      if (meta.format.bitrate) bitrate = Math.round(meta.format.bitrate / 1000);
      if (typeof meta.format.lossless === 'boolean') isLossless = meta.format.lossless;
      if (meta.format.codec) {
        const c = meta.format.codec.split('/')[0].toUpperCase();
        if (c.length <= 8) format = c;
      }
    } catch {
      // fallback to filename metadata
    }

    const detailParts: string[] = [];
    if (sampleRate) detailParts.push(`${(sampleRate / 1000).toFixed(1)} kHz`);
    if (isLossless) detailParts.push('Lossless');
    else if (bitrate) detailParts.push(`${bitrate} kbps`);
    detailParts.push(formatBytes(stat.size));
    detailParts.push('HDD Direct');

    const id = `hdd-${hashSeed(fullPath).toString(36)}-${stat.size.toString(36)}`;
    return {
      id,
      title,
      artist,
      album,
      genre,
      folderName,
      format,
      formatDetail: detailParts.join(' · '),
      isLossless,
      durationSec,
      durationLabel: formatDuration(durationSec),
      streamKind: 'hdd',
      filePath: fullPath,
      sizeBytes: stat.size,
      sampleRate,
      bitrate,
      addedAt: Date.now(),
      ownerId,
      coverSeed: hashSeed(`${title}-${fullPath}`),
      sourceFolder,
    };
  } catch {
    return null;
  }
}

async function scanAudioDirectory(
  rootDir: string,
  ownerId: string,
  maxFiles = 2000,
  cachedByPath?: Map<string, StoredStreamTrack>
): Promise<StoredStreamTrack[]> {
  const audioPaths: string[] = [];
  const queue: string[] = [rootDir];

  while (queue.length > 0 && audioPaths.length < maxFiles) {
    const current = queue.shift()!;
    let entries: fs.Dirent[] = [];
    try {
      entries = await fsp.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (audioPaths.length >= maxFiles) break;
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(current, entry.name);

      let isDir = entry.isDirectory();
      let isFile = entry.isFile();
      if (!isDir && !isFile && entry.isSymbolicLink()) {
        try {
          const st = await fsp.stat(fullPath);
          isDir = st.isDirectory();
          isFile = st.isFile();
        } catch {
          continue;
        }
      }

      if (isDir) {
        if (
          entry.name !== 'node_modules' &&
          entry.name !== '.git' &&
          entry.name !== '$RECYCLE.BIN' &&
          entry.name !== 'System Volume Information'
        ) {
          queue.push(fullPath);
        }
        continue;
      }

      if (!isFile) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (AUDIO_EXTENSIONS.has(ext)) {
        audioPaths.push(fullPath);
      }
    }
  }

  const results: StoredStreamTrack[] = [];
  const BATCH_SIZE = 12;

  for (let i = 0; i < audioPaths.length; i += BATCH_SIZE) {
    const batch = audioPaths.slice(i, i + BATCH_SIZE);
    const parsedBatch = await Promise.all(
      batch.map(async (fullPath) => {
        if (cachedByPath) {
          const cached = cachedByPath.get(fullPath);
          if (cached) {
            try {
              const stat = await fsp.stat(fullPath);
              if (stat.isFile() && stat.size === cached.sizeBytes) {
                return {
                  ...cached,
                  sourceFolder: rootDir,
                  folderName: cached.folderName || computeHddFolderName(fullPath, rootDir),
                };
              }
            } catch {
              return null;
            }
          }
        }
        return parseSingleHddAudioFile(fullPath, ownerId, rootDir);
      })
    );
    for (const item of parsedBatch) {
      if (item) results.push(item);
    }
  }

  return results;
}

const activeHddWatchers = new Map<string, fs.FSWatcher>();
const watcherTimers = new Map<string, ReturnType<typeof setTimeout>>();

async function getMountedFolderList(): Promise<string[]> {
  const saved = await readJsonFile<string[]>(HOST_HDD_FOLDERS_FILE, []);
  const hostHdd = await readJsonFile<StoredStreamTrack[]>(HOST_HDD_INDEX_FILE, []);
  const combined = new Set<string>([
    ...saved.filter((p) => typeof p === 'string' && p.trim().length > 0),
    ...hostHdd.map((item) => item.sourceFolder).filter((p): p is string => Boolean(p)),
  ]);
  return Array.from(combined);
}

async function addMountedFolderPath(resolvedDir: string): Promise<void> {
  const current = await getMountedFolderList();
  if (!current.includes(resolvedDir)) {
    await writeJsonFile(HOST_HDD_FOLDERS_FILE, [...current, resolvedDir]);
  }
}

async function removeMountedFolderPath(resolvedDir?: string): Promise<void> {
  if (!resolvedDir) {
    await writeJsonFile(HOST_HDD_FOLDERS_FILE, []);
    return;
  }
  const current = await getMountedFolderList();
  await writeJsonFile(
    HOST_HDD_FOLDERS_FILE,
    current.filter((p) => p !== resolvedDir)
  );
}

async function rescanMountedFolder(resolvedDir: string, reasonLabel?: string): Promise<StoredStreamTrack[]> {
  await addMountedFolderPath(resolvedDir);
  const existing = await readJsonFile<StoredStreamTrack[]>(HOST_HDD_INDEX_FILE, []);
  if (!fs.existsSync(resolvedDir)) {
    // Preserve indexed entries if mounted folder is temporarily offline/sleeping
    return existing.filter((item) => item.sourceFolder === resolvedDir);
  }
  const cachedByPath = new Map(
    existing
      .filter((item) => item.filePath)
      .map((item) => [item.filePath!, item])
  );
  const scanned = await scanAudioDirectory(resolvedDir, 'user-admin', 2000, cachedByPath);
  const others = existing.filter((item) => item.sourceFolder !== resolvedDir);
  const next = [...scanned, ...others];
  await writeJsonFile(HOST_HDD_INDEX_FILE, next);
  if (reasonLabel) {
    await recordAdminActivity(reasonLabel, `ซิงค์โฟลเดอร์ "${resolvedDir}" (${scanned.length} เพลง)`);
  }
  broadcastLibraryUpdate('hdd-sync');
  return scanned;
}

async function syncHddWatchers(): Promise<void> {
  const mounted = await getMountedFolderList();
  const desiredFolders = new Set(mounted.filter((p) => fs.existsSync(p)));

  for (const [folder, watcher] of activeHddWatchers.entries()) {
    if (!desiredFolders.has(folder)) {
      watcher.close();
      activeHddWatchers.delete(folder);
    }
  }

  for (const folder of desiredFolders) {
    if (activeHddWatchers.has(folder)) continue;
    try {
      const watchHandler = () => {
        const prev = watcherTimers.get(folder);
        if (prev) clearTimeout(prev);
        watcherTimers.set(
          folder,
          setTimeout(() => {
            watcherTimers.delete(folder);
            rescanMountedFolder(folder, 'อัปเดตไฟล์บน HDD อัตโนมัติ').catch(() => {});
          }, 1500)
        );
      };

      let watcher: fs.FSWatcher;
      try {
        watcher = fs.watch(folder, { recursive: true }, watchHandler);
      } catch {
        watcher = fs.watch(folder, watchHandler);
      }
      watcher.on('error', () => {
        watcher.close();
        activeHddWatchers.delete(folder);
      });
      activeHddWatchers.set(folder, watcher);
    } catch {
      // ignore unwatchable path
    }
  }
}

async function startServer(): Promise<void> {
  await ensureDataDir();
  await ensureSeedAdmin();
  await syncHddWatchers();

  const app = express();
  app.use(express.json({ limit: '4mb' }));

  // Allow cross-origin requests from the Android APK shell (WebViewAssetLoader) & remote devices
  app.use('/api', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, Range, x-track-filename, x-track-title, x-track-artist, x-track-album, x-track-genre, x-track-folder, x-track-duration'
    );
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      app: 'Aura Audio',
      version: '1.0.0',
      connectedDevices: getUniqueConnectedDevices().length,
      timestamp: Date.now(),
    });
  });

  // --- Auth & User System ---
  app.post('/api/auth/login', async (req, res) => {
    const identifier = String(req.body?.identifier || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!identifier || !password) {
      res.status(400).json({ error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
      return;
    }

    const users = await readJsonFile<StoredUser[]>(USERS_FILE, []);
    const matched = users.find(
      (u) => u.username.toLowerCase() === identifier || u.email.toLowerCase() === identifier
    );

    if (!matched || matched.passwordHash !== sha256(password)) {
      res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
      return;
    }

    const token = crypto.randomBytes(24).toString('hex');
    const sessions = await readJsonFile<StoredSession[]>(SESSIONS_FILE, []);
    const nextSessions = [
      { token, userId: matched.id, role: matched.role, createdAt: Date.now() },
      ...sessions.slice(0, 100),
    ];
    await writeJsonFile(SESSIONS_FILE, nextSessions);

    if (matched.role === 'admin') {
      await recordAdminActivity('เข้าสู่ระบบผู้ดูแล', `บัญชี ${matched.username} เข้าสู่ระบบสำเร็จ`, 'info');
    }

    res.json({
      user: toPublicUser(matched),
      token,
    });
  });

  app.post('/api/auth/register', async (req, res) => {
    const username = String(req.body?.username || '').trim();
    const email = String(req.body?.email || '').trim();
    const password = String(req.body?.password || '');

    if (!username || !email || password.length < 4) {
      res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบและตั้งรหัสผ่านอย่างน้อย 4 ตัวอักษร' });
      return;
    }

    if (username.toLowerCase() === 'admin') {
      res.status(400).json({ error: 'ไม่สามารถใช้ชื่อผู้ใช้ admin ได้' });
      return;
    }

    const users = await readJsonFile<StoredUser[]>(USERS_FILE, []);
    if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
      res.status(409).json({ error: 'อีเมลนี้ถูกใช้งานแล้ว' });
      return;
    }
    if (users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
      res.status(409).json({ error: 'ชื่อผู้ใช้นี้ถูกใช้แล้ว' });
      return;
    }

    const newUser: StoredUser = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      username,
      email,
      passwordHash: sha256(password),
      role: 'member',
      createdAt: Date.now(),
      accentHue: (users.length * 47 + 28) % 360,
    };

    await writeJsonFile(USERS_FILE, [...users, newUser]);

    const token = crypto.randomBytes(24).toString('hex');
    const sessions = await readJsonFile<StoredSession[]>(SESSIONS_FILE, []);
    await writeJsonFile(SESSIONS_FILE, [
      { token, userId: newUser.id, role: newUser.role, createdAt: Date.now() },
      ...sessions.slice(0, 100),
    ]);

    res.status(201).json({
      user: toPublicUser(newUser),
      token,
    });
  });

  app.get('/api/auth/me', async (req, res) => {
    const user = await getSessionUser(req);
    if (!user) {
      res.status(401).json({ error: 'ไม่ได้เข้าสู่ระบบ' });
      return;
    }
    res.json({ user: toPublicUser(user) });
  });

  app.post('/api/auth/logout', async (req, res) => {
    const token = extractBearerToken(req);
    if (token) {
      const sessions = await readJsonFile<StoredSession[]>(SESSIONS_FILE, []);
      await writeJsonFile(
        SESSIONS_FILE,
        sessions.filter((s) => s.token !== token)
      );
    }
    res.json({ ok: true });
  });

  app.get('/api/user/prefs', async (req, res) => {
    const user = await getSessionUser(req);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const allPrefs = await readJsonFile<Record<string, unknown>>(PREFS_FILE, {});
    res.json({ prefs: allPrefs[user.id] || null });
  });

  app.put('/api/user/prefs', async (req, res) => {
    const user = await getSessionUser(req);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const allPrefs = await readJsonFile<Record<string, unknown>>(PREFS_FILE, {});
    allPrefs[user.id] = req.body?.prefs || null;
    await writeJsonFile(PREFS_FILE, allPrefs);
    res.json({ ok: true });
  });

  // --- SSE Real-Time Sync & Device Cast Across Connected Devices ---
  app.get('/api/streams/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const rawDeviceId = typeof req.query.deviceId === 'string' ? req.query.deviceId.trim() : '';
    const deviceId = rawDeviceId || `dev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const rawName = typeof req.query.deviceName === 'string' ? req.query.deviceName.trim() : '';
    const deviceName = rawName || 'อุปกรณ์ Aura Audio';
    const rawType = typeof req.query.deviceType === 'string' ? req.query.deviceType.trim() : 'desktop';
    const deviceType =
      rawType === 'mobile' || rawType === 'tablet' || rawType === 'tv' ? rawType : 'desktop';
    const now = Date.now();

    sseClients.set(res, {
      deviceId,
      deviceName,
      deviceType,
      isAdmin: req.query.isAdmin === '1',
      connectedAt: now,
      lastSeenAt: now,
    });

    const devices = getUniqueConnectedDevices();
    res.write(
      `data: ${JSON.stringify({
        type: 'connected',
        connectedClients: devices.length,
        devices,
        timestamp: now,
      })}\n\n`
    );
    broadcastSseEvent({ type: 'devices-changed' });

    const keepAlive = windowSafeSetInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(keepAlive);
        sseClients.delete(res);
      }
    }, 20000);

    req.on('close', () => {
      clearInterval(keepAlive);
      sseClients.delete(res);
      broadcastSseEvent({ type: 'devices-changed' });
    });
  });

  app.get('/api/devices', (_req, res) => {
    res.json({ devices: getUniqueConnectedDevices() });
  });

  app.post('/api/devices/presence', (req, res) => {
    const deviceId = typeof req.body?.deviceId === 'string' ? req.body.deviceId.trim() : '';
    if (!deviceId) {
      res.status(400).json({ error: 'ไม่พบรหัสอุปกรณ์' });
      return;
    }

    const deviceName =
      typeof req.body?.deviceName === 'string' && req.body.deviceName.trim()
        ? req.body.deviceName.trim().slice(0, 60)
        : undefined;
    const rawType = typeof req.body?.deviceType === 'string' ? req.body.deviceType : undefined;
    const deviceType =
      rawType === 'mobile' || rawType === 'tablet' || rawType === 'tv' || rawType === 'desktop'
        ? rawType
        : undefined;
    const isAdminFlag = typeof req.body?.isAdmin === 'boolean' ? req.body.isAdmin : undefined;
    const currentTrackTitle =
      typeof req.body?.currentTrackTitle === 'string'
        ? req.body.currentTrackTitle.trim().slice(0, 120) || undefined
        : req.body?.currentTrackTitle === null
        ? undefined
        : undefined;
    const isPlaying = typeof req.body?.isPlaying === 'boolean' ? req.body.isPlaying : undefined;

    let updated = false;
    const now = Date.now();
    for (const [clientRes, entry] of sseClients.entries()) {
      if (entry.deviceId === deviceId) {
        sseClients.set(clientRes, {
          ...entry,
          ...(deviceName ? { deviceName } : {}),
          ...(deviceType ? { deviceType } : {}),
          ...(isAdminFlag !== undefined ? { isAdmin: isAdminFlag } : {}),
          ...(req.body?.currentTrackTitle !== undefined ? { currentTrackTitle } : {}),
          ...(isPlaying !== undefined ? { isPlaying } : {}),
          lastSeenAt: now,
        });
        updated = true;
      }
    }

    if (updated) {
      broadcastSseEvent({ type: 'devices-changed' });
    }
    res.json({ ok: true, devices: getUniqueConnectedDevices() });
  });

  app.post('/api/cast/send', async (req, res) => {
    const targetDeviceId =
      typeof req.body?.targetDeviceId === 'string' ? req.body.targetDeviceId.trim() : '';
    const fromDeviceId =
      typeof req.body?.fromDeviceId === 'string' ? req.body.fromDeviceId.trim() : '';
    const fromDeviceName =
      typeof req.body?.fromDeviceName === 'string' && req.body.fromDeviceName.trim()
        ? req.body.fromDeviceName.trim()
        : 'อุปกรณ์อื่น';
    const action = req.body?.action;
    const validActions = new Set(['play', 'pause', 'resume', 'seek', 'stop']);

    if (!targetDeviceId || !validActions.has(action)) {
      res.status(400).json({ error: 'คำสั่งแคสต์ไม่ถูกต้อง' });
      return;
    }

    const command = {
      id: `cast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      targetDeviceId,
      fromDeviceId,
      fromDeviceName,
      action,
      track: req.body?.track || undefined,
      positionSec:
        typeof req.body?.positionSec === 'number' && isFinite(req.body.positionSec)
          ? req.body.positionSec
          : undefined,
      sentAt: Date.now(),
    };

    let delivered = 0;
    const payload = JSON.stringify({
      type: 'cast-command',
      command,
      timestamp: Date.now(),
    });

    for (const [clientRes, entry] of sseClients.entries()) {
      if (entry.deviceId === targetDeviceId) {
        try {
          clientRes.write(`data: ${payload}\n\n`);
          delivered++;
        } catch {
          sseClients.delete(clientRes);
        }
      }
    }

    if (delivered === 0) {
      res.status(404).json({ error: 'อุปกรณ์ปลายทางออฟไลน์หรือไม่พร้อมรับสัญญาณแคสต์' });
      return;
    }

    res.json({ ok: true, delivered, command });
  });

  // --- Admin Operational Status Endpoint ---
  app.get('/api/admin/status', requireAdmin, async (_req, res) => {
    const uploadedOrUrl = await readJsonFile<StoredStreamTrack[]>(STREAMS_INDEX_FILE, []);
    const hostHdd = await readJsonFile<StoredStreamTrack[]>(HOST_HDD_INDEX_FILE, []);
    const activities = await readJsonFile<AdminActivityRecord[]>(ADMIN_ACTIVITY_FILE, []);

    const validStreams = uploadedOrUrl.filter(
      (item) => item.streamKind === 'url' || (item.filePath && fs.existsSync(item.filePath))
    );
    const validHost = hostHdd.filter((item) => item.filePath && fs.existsSync(item.filePath));
    const combined = [...validStreams, ...validHost];

    const mountedList = await getMountedFolderList();
    const mountedFolders = mountedList.map((folderPath) => ({
      path: folderPath,
      trackCount: validHost.filter((item) => item.sourceFolder === folderPath).length,
    }));

    let storageWritable = false;
    try {
      fs.accessSync(DATA_DIR, fs.constants.W_OK);
      storageWritable = true;
    } catch {
      storageWritable = false;
    }

    res.json({
      serverStatus: 'online',
      startedAt: SERVER_STARTED_AT,
      uptimeSec: Math.max(0, Math.floor((Date.now() - SERVER_STARTED_AT) / 1000)),
      connectedDevices: getUniqueConnectedDevices().length,
      totalSharedTracks: combined.length,
      fileTracks: validStreams.filter((t) => t.streamKind === 'file').length,
      hddTracks: validHost.length,
      urlTracks: validStreams.filter((t) => t.streamKind === 'url').length,
      totalSizeBytes: combined.reduce((sum, t) => sum + (t.sizeBytes || 0), 0),
      mountedFolders,
      watchingHddCount: activeHddWatchers.size,
      storageWritable,
      recentActivities: activities.slice(0, 10),
    });
  });

  // Admin: Reset all shared streams, mounted Host HDD folders, and user prefs on server
  app.post('/api/admin/reset', requireAdmin, async (_req, res) => {
    const uploadedOrUrl = await readJsonFile<StoredStreamTrack[]>(STREAMS_INDEX_FILE, []);
    for (const item of uploadedOrUrl) {
      if (item.filePath && path.resolve(item.filePath).startsWith(DATA_DIR) && fs.existsSync(item.filePath)) {
        try {
          await fsp.unlink(item.filePath);
        } catch {
          // ignore unlink error
        }
      }
    }

    for (const timer of watcherTimers.values()) {
      clearTimeout(timer);
    }
    watcherTimers.clear();
    for (const watcher of activeHddWatchers.values()) {
      watcher.close();
    }
    activeHddWatchers.clear();

    await writeJsonFile(STREAMS_INDEX_FILE, []);
    await writeJsonFile(HOST_HDD_INDEX_FILE, []);
    await writeJsonFile(HOST_HDD_FOLDERS_FILE, []);
    await writeJsonFile(PREFS_FILE, {});
    await recordAdminActivity(
      'รีเซ็ตข้อมูลคลังกลาง',
      'ล้างรายการสตรีมออนไลน์และโฟลเดอร์ HDD โฮสต์ทั้งหมดแล้ว'
    );
    broadcastLibraryUpdate('reset');

    res.json({ ok: true });
  });

  // --- Shared Online Streaming Library (Same song set for every device) ---
  app.get('/api/streams', async (_req, res) => {
    const uploadedOrUrl = await readJsonFile<StoredStreamTrack[]>(STREAMS_INDEX_FILE, []);
    const hostHdd = await readJsonFile<StoredStreamTrack[]>(HOST_HDD_INDEX_FILE, []);

    const validStreams = uploadedOrUrl.filter(
      (item) => item.streamKind === 'url' || (item.filePath && fs.existsSync(item.filePath))
    );
    const validHost = hostHdd.filter((item) => item.filePath && fs.existsSync(item.filePath));

    const tracks = [
      ...validStreams.map((item) => toClientTrack(item, '/api/streams')),
      ...validHost.map((item) => toClientTrack(item, '/api/hdd/audio')),
    ];

    res.json({ tracks });
  });

  // Admin: Upload HDD audio file to shared online streaming catalog
  app.post(
    '/api/streams/upload',
    requireAdmin,
    express.raw({ type: '*/*', limit: '250mb' }),
    async (req, res) => {
      try {
        const buffer = req.body as Buffer;
        if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
          res.status(400).json({ error: 'ไม่พบข้อมูลไฟล์เสียงที่ส่งมา' });
          return;
        }

        const rawName = decodeURIComponent(String(req.headers['x-track-filename'] || 'track.mp3'));
        const ext = path.extname(rawName).toLowerCase() || '.mp3';
        const safeExt = AUDIO_EXTENSIONS.has(ext) ? ext : '.mp3';
        const id = `stream-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const storedPath = path.join(DATA_DIR, `${id}${safeExt}`);

        await fsp.writeFile(storedPath, buffer);

        let title = decodeURIComponent(
          String(req.headers['x-track-title'] || rawName.replace(/\.[^/.]+$/, ''))
        );
        let artist = decodeURIComponent(String(req.headers['x-track-artist'] || 'Shared Online Stream'));
        let album = req.headers['x-track-album']
          ? decodeURIComponent(String(req.headers['x-track-album']))
          : undefined;
        let genre = req.headers['x-track-genre']
          ? normalizeGenreTag(decodeURIComponent(String(req.headers['x-track-genre'])))
          : undefined;
        const folderName = req.headers['x-track-folder']
          ? decodeURIComponent(String(req.headers['x-track-folder'])).trim() || undefined
          : undefined;
        let durationSec: number | null = req.headers['x-track-duration']
          ? Number(req.headers['x-track-duration'])
          : null;
        if (durationSec !== null && (!isFinite(durationSec) || durationSec <= 0)) {
          durationSec = null;
        }

        let sampleRate: number | undefined;
        let bitrate: number | undefined;
        let isLossless = LOSSLESS_EXTS.has(safeExt);
        let format = safeExt.slice(1).toUpperCase();

        try {
          const meta = await parseFile(storedPath, { duration: true, skipCovers: true });
          if (meta.common.title?.trim()) title = meta.common.title.trim();
          if (meta.common.artist?.trim()) artist = meta.common.artist.trim();
          if (meta.common.album?.trim()) album = meta.common.album.trim();
          genre = normalizeGenreTag(meta.common.genre) || genre;
          if (meta.format.duration && isFinite(meta.format.duration)) {
            durationSec = meta.format.duration;
          }
          if (meta.format.sampleRate) sampleRate = meta.format.sampleRate;
          if (meta.format.bitrate) bitrate = Math.round(meta.format.bitrate / 1000);
          if (typeof meta.format.lossless === 'boolean') isLossless = meta.format.lossless;
          if (meta.format.codec) {
            const c = meta.format.codec.split('/')[0].toUpperCase();
            if (c.length <= 8) format = c;
          }
        } catch {
          // keep client-provided metadata
        }

        const detailParts: string[] = [];
        if (sampleRate) detailParts.push(`${(sampleRate / 1000).toFixed(1)} kHz`);
        if (isLossless) detailParts.push('Lossless');
        else if (bitrate) detailParts.push(`${bitrate} kbps`);
        detailParts.push(formatBytes(buffer.length));
        detailParts.push('Shared Stream');

        const record: StoredStreamTrack = {
          id,
          title,
          artist,
          album,
          genre,
          folderName,
          format,
          formatDetail: detailParts.join(' · '),
          isLossless,
          durationSec,
          durationLabel: formatDuration(durationSec),
          streamKind: 'file',
          filePath: storedPath,
          sizeBytes: buffer.length,
          sampleRate,
          bitrate,
          addedAt: Date.now(),
          ownerId: 'user-admin',
          coverSeed: hashSeed(`${title}-${artist}-${buffer.length}`),
        };

        const existing = await readJsonFile<StoredStreamTrack[]>(STREAMS_INDEX_FILE, []);
        await writeJsonFile(STREAMS_INDEX_FILE, [record, ...existing]);
        await recordAdminActivity(
          'อัปโหลดไฟล์เข้าคลังกลาง',
          `เพิ่ม "${record.title}" (${record.format} · ${formatBytes(buffer.length)})`
        );
        broadcastLibraryUpdate('upload');

        res.status(201).json({
          track: toClientTrack(record, '/api/streams'),
        });
      } catch (err) {
        console.error('Upload stream error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการเพิ่มเพลงขึ้นสตรีมออนไลน์' });
      }
    }
  );

  // Admin: Add external stream URL to shared online streaming catalog
  app.post('/api/streams/url', requireAdmin, async (req, res) => {
    const title = String(req.body?.title || '').trim() || 'สถานีวิทยุออนไลน์';
    const artist = String(req.body?.artist || '').trim() || 'Online Audio Stream';
    const album = req.body?.album ? String(req.body.album).trim() : undefined;
    const genre = req.body?.genre ? normalizeGenreTag(String(req.body.genre)) : undefined;
    const externalUrl = String(req.body?.url || '').trim();
    const format = String(req.body?.format || 'STREAM').trim().toUpperCase();

    if (!/^https?:\/\//i.test(externalUrl)) {
      res.status(400).json({ error: 'กรุณาระบุ URL ที่ขึ้นต้นด้วย http:// หรือ https://' });
      return;
    }

    const record: StoredStreamTrack = {
      id: `stream-url-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title,
      artist,
      album,
      genre,
      folderName: 'สตรีมลิงก์ URL',
      format,
      formatDetail: 'Shared External Stream',
      isLossless: format === 'FLAC' || format === 'WAV',
      durationSec: null,
      durationLabel: 'STREAM',
      streamKind: 'url',
      externalUrl,
      sizeBytes: 0,
      addedAt: Date.now(),
      ownerId: 'user-admin',
      coverSeed: hashSeed(`${title}-${externalUrl}`),
    };

    const existing = await readJsonFile<StoredStreamTrack[]>(STREAMS_INDEX_FILE, []);
    await writeJsonFile(STREAMS_INDEX_FILE, [record, ...existing]);
    await recordAdminActivity('เพิ่มลิงก์สตรีมกลาง', `เพิ่มสถานี "${record.title}" (${record.format})`);
    broadcastLibraryUpdate('add-url');

    res.status(201).json({
      track: toClientTrack(record, '/api/streams'),
    });
  });

  // Admin: Reorder shared online streaming tracks
  app.put('/api/streams/reorder', requireAdmin, async (req, res) => {
    const orderedIds = Array.isArray(req.body?.orderedIds)
      ? (req.body.orderedIds as string[])
      : [];
    if (orderedIds.length === 0) {
      res.status(400).json({ error: 'ไม่พบลำดับเพลง' });
      return;
    }

    const orderMap = new Map(orderedIds.map((id, index) => [id, index]));

    const streams = await readJsonFile<StoredStreamTrack[]>(STREAMS_INDEX_FILE, []);
    streams.sort((a, b) => {
      const ia = orderMap.has(a.id) ? orderMap.get(a.id)! : Number.MAX_SAFE_INTEGER;
      const ib = orderMap.has(b.id) ? orderMap.get(b.id)! : Number.MAX_SAFE_INTEGER;
      return ia - ib;
    });
    await writeJsonFile(STREAMS_INDEX_FILE, streams);

    const hostHdd = await readJsonFile<StoredStreamTrack[]>(HOST_HDD_INDEX_FILE, []);
    hostHdd.sort((a, b) => {
      const ia = orderMap.has(a.id) ? orderMap.get(a.id)! : Number.MAX_SAFE_INTEGER;
      const ib = orderMap.has(b.id) ? orderMap.get(b.id)! : Number.MAX_SAFE_INTEGER;
      return ia - ib;
    });
    await writeJsonFile(HOST_HDD_INDEX_FILE, hostHdd);

    await recordAdminActivity('จัดลำดับคลังเพลงกลาง', `อัปเดตลำดับเพลงใหม่ (${orderedIds.length} รายการ)`);
    broadcastLibraryUpdate('reorder');
    res.json({ ok: true });
  });

  // Admin: Edit metadata of a shared online stream track
  app.patch('/api/streams/:id', requireAdmin, async (req, res) => {
    const id = req.params.id;
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : undefined;
    const artist = typeof req.body?.artist === 'string' ? req.body.artist.trim() : undefined;
    const album = typeof req.body?.album === 'string' ? req.body.album.trim() : undefined;
    const genre = typeof req.body?.genre === 'string' ? req.body.genre.trim() : undefined;
    const folderName =
      typeof req.body?.folderName === 'string' ? req.body.folderName.trim() : undefined;
    const format = typeof req.body?.format === 'string' ? req.body.format.trim().toUpperCase() : undefined;

    const streams = await readJsonFile<StoredStreamTrack[]>(STREAMS_INDEX_FILE, []);
    const sIdx = streams.findIndex((item) => item.id === id);
    if (sIdx !== -1) {
      if (title) streams[sIdx].title = title;
      if (artist) streams[sIdx].artist = artist;
      if (album !== undefined) streams[sIdx].album = album || undefined;
      if (genre !== undefined) streams[sIdx].genre = genre || undefined;
      if (folderName !== undefined) streams[sIdx].folderName = folderName || undefined;
      if (format) streams[sIdx].format = format;
      await writeJsonFile(STREAMS_INDEX_FILE, streams);
      await recordAdminActivity('แก้ไขข้อมูลเพลง', `อัปเดตข้อมูล "${streams[sIdx].title}"`);
      broadcastLibraryUpdate('edit');
      res.json({ track: toClientTrack(streams[sIdx], '/api/streams') });
      return;
    }

    const hostHdd = await readJsonFile<StoredStreamTrack[]>(HOST_HDD_INDEX_FILE, []);
    const hIdx = hostHdd.findIndex((item) => item.id === id);
    if (hIdx !== -1) {
      if (title) hostHdd[hIdx].title = title;
      if (artist) hostHdd[hIdx].artist = artist;
      if (album !== undefined) hostHdd[hIdx].album = album || undefined;
      if (genre !== undefined) hostHdd[hIdx].genre = genre || undefined;
      if (folderName !== undefined) hostHdd[hIdx].folderName = folderName || undefined;
      if (format) hostHdd[hIdx].format = format;
      await writeJsonFile(HOST_HDD_INDEX_FILE, hostHdd);
      await recordAdminActivity('แก้ไขข้อมูลเพลง HDD', `อัปเดตข้อมูล "${hostHdd[hIdx].title}"`);
      broadcastLibraryUpdate('edit');
      res.json({ track: toClientTrack(hostHdd[hIdx], '/api/hdd/audio') });
      return;
    }

    res.status(404).json({ error: 'ไม่พบเพลงนี้ในระบบสตรีมออนไลน์' });
  });

  // Public: Stream uploaded HDD file with HTTP 206 Partial Content
  app.get('/api/streams/:id/audio', async (req, res) => {
    const existing = await readJsonFile<StoredStreamTrack[]>(STREAMS_INDEX_FILE, []);
    const found = existing.find((item) => item.id === req.params.id);
    if (!found || !found.filePath) {
      res.status(404).json({ error: 'ไม่พบสตรีมเพลงนี้' });
      return;
    }
    streamAudioFileWithRange(req, res, found.filePath);
  });

  // Admin: Delete a shared stream track
  app.delete('/api/streams/:id', requireAdmin, async (req, res) => {
    const id = req.params.id;
    const existing = await readJsonFile<StoredStreamTrack[]>(STREAMS_INDEX_FILE, []);
    const target = existing.find((item) => item.id === id);
    if (target) {
      try {
        if (target.filePath && fs.existsSync(target.filePath)) {
          await fsp.unlink(target.filePath);
        }
      } catch {
        // ignore
      }
      await writeJsonFile(
        STREAMS_INDEX_FILE,
        existing.filter((item) => item.id !== id)
      );
      await recordAdminActivity('ลบเพลงออกจากคลังกลาง', `ลบ "${target.title}"`);
      broadcastLibraryUpdate('delete');
      res.json({ deleted: true });
      return;
    }

    const hostHdd = await readJsonFile<StoredStreamTrack[]>(HOST_HDD_INDEX_FILE, []);
    const hTarget = hostHdd.find((item) => item.id === id);
    if (hTarget) {
      await writeJsonFile(
        HOST_HDD_INDEX_FILE,
        hostHdd.filter((item) => item.id !== id)
      );
      await recordAdminActivity('ลบเพลง HDD ออกจากคลังกลาง', `ลบ "${hTarget.title}"`);
      broadcastLibraryUpdate('delete');
      res.json({ deleted: true });
      return;
    }

    res.status(404).json({ error: 'ไม่พบสตรีมนี้' });
  });

  // --- Host HDD Scanner & Direct Disk Streaming (Admin Managed, Zero Upload) ---
  app.get('/api/hdd/roots', requireAdmin, async (_req, res) => {
    const home = os.homedir();
    const candidates: Array<{ label: string; path: string }> = [
      { label: 'Music Folder', path: path.join(home, 'Music') },
      { label: 'Downloads', path: path.join(home, 'Downloads') },
      { label: 'Home Directory', path: home },
      { label: 'Workspace', path: process.cwd() },
    ];

    if (process.platform === 'win32') {
      for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
        const drive = `${letter}:\\`;
        if (fs.existsSync(drive)) {
          candidates.push({ label: `Drive ${letter}:`, path: drive });
        }
      }
    } else {
      candidates.push({ label: 'Root (/)', path: '/' });
    }

    const seen = new Set<string>();
    const roots = candidates.filter((c) => {
      if (seen.has(c.path) || !fs.existsSync(c.path)) return false;
      seen.add(c.path);
      return true;
    });

    const hostHdd = await readJsonFile<StoredStreamTrack[]>(HOST_HDD_INDEX_FILE, []);
    const mountedList = await getMountedFolderList();
    const mountedFolders = mountedList.map((folderPath) => ({
      path: folderPath,
      trackCount: hostHdd.filter((item) => item.sourceFolder === folderPath).length,
    }));

    const isCloudContainer = Boolean(
      process.env.K_SERVICE ||
        process.env.CLOUD_RUN_JOB ||
        (process.platform === 'linux' && process.cwd().startsWith('/app'))
    );

    res.json({
      roots,
      mountedFolders,
      hostInfo: {
        platform: process.platform,
        hostname: os.hostname(),
        isCloudContainer,
      },
    });
  });

  app.get('/api/hdd/browse', requireAdmin, async (req, res) => {
    const rawDir = typeof req.query.dir === 'string' ? req.query.dir.trim() : '';
    if (rawDir && /^[A-Za-z]:[\\/]/.test(rawDir) && process.platform !== 'win32') {
      res.status(400).json({
        error:
          'เซิร์ฟเวอร์โฮสต์ทำงานบน Linux/Cloud จึงไม่เห็นไดรฟ์ Windows (เช่น D:\\) โดยตรง — กรุณาใช้แท็บ "HDD บนเครื่องนี้" เพื่อซิงค์จากเครื่องของคุณ',
      });
      return;
    }

    const requested = rawDir ? path.resolve(rawDir) : os.homedir();

    if (!fs.existsSync(requested)) {
      res.status(404).json({ error: 'ไม่พบโฟลเดอร์ที่ระบุบน HDD' });
      return;
    }

    try {
      const entries = await fsp.readdir(requested, { withFileTypes: true });
      const directories = entries
        .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
        .map((e) => ({
          name: e.name,
          path: path.join(requested, e.name),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      const audioFiles: Array<{ name: string; path: string; sizeBytes: number; format: string }> = [];
      for (const e of entries) {
        if (!e.isFile() || e.name.startsWith('.')) continue;
        const ext = path.extname(e.name).toLowerCase();
        if (!AUDIO_EXTENSIONS.has(ext)) continue;
        const fullPath = path.join(requested, e.name);
        try {
          const stat = await fsp.stat(fullPath);
          audioFiles.push({
            name: e.name,
            path: fullPath,
            sizeBytes: stat.size,
            format: ext.slice(1).toUpperCase(),
          });
        } catch {
          // ignore
        }
      }
      audioFiles.sort((a, b) => a.name.localeCompare(b.name));

      res.json({
        currentDir: requested,
        parentDir: path.dirname(requested) !== requested ? path.dirname(requested) : null,
        directories,
        audioCount: audioFiles.length,
        audioFiles,
      });
    } catch {
      res.status(403).json({ error: 'ไม่สามารถเปิดอ่านโฟลเดอร์นี้ได้' });
    }
  });

  app.post('/api/hdd/scan', requireAdmin, async (req, res) => {
    const dirInput = typeof req.body?.dir === 'string' ? req.body.dir.trim() : '';
    if (!dirInput) {
      res.status(400).json({ error: 'กรุณาระบุที่อยู่โฟลเดอร์บน HDD' });
      return;
    }

    if (/^[A-Za-z]:[\\/]/.test(dirInput) && process.platform !== 'win32') {
      res.status(400).json({
        error:
          'เซิร์ฟเวอร์โฮสต์ทำงานบน Linux/Cloud ไม่สามารถอ่านไดรฟ์บนเครื่อง PC โดยตรงได้ — กรุณาสลับไปที่แท็บ "HDD บนเครื่องนี้" แล้วกดเลือกโฟลเดอร์บน HDD เพื่อซิงค์เพลงทันที',
      });
      return;
    }

    const resolvedDir = path.resolve(dirInput.replace(/^~(?=$|\/|\\)/, os.homedir()));
    if (!fs.existsSync(resolvedDir)) {
      res.status(404).json({ error: `ไม่พบโฟลเดอร์: ${resolvedDir}` });
      return;
    }

    const stat = await fsp.stat(resolvedDir);
    if (stat.isFile()) {
      const parsed = await parseSingleHddAudioFile(resolvedDir, 'user-admin');
      if (!parsed) {
        res.status(400).json({ error: 'ไฟล์ที่ระบุไม่ใช่ไฟล์เสียงที่รองรับ' });
        return;
      }
      const existing = await readJsonFile<StoredStreamTrack[]>(HOST_HDD_INDEX_FILE, []);
      const filtered = existing.filter((item) => item.filePath !== resolvedDir);
      await writeJsonFile(HOST_HDD_INDEX_FILE, [parsed, ...filtered]);
      await recordAdminActivity('เพิ่มไฟล์จาก HDD (ไม่อัปโหลด)', `เพิ่ม "${parsed.title}"`);
      broadcastLibraryUpdate('hdd-add-files');
      res.json({
        folder: path.dirname(resolvedDir),
        tracks: [toClientTrack(parsed, '/api/hdd/audio')],
      });
      return;
    }

    const scanned = await rescanMountedFolder(resolvedDir, 'สแกนโฟลเดอร์ HDD (ไม่อัปโหลด)');
    await syncHddWatchers();

    res.json({
      folder: resolvedDir,
      tracks: scanned.map((item) => toClientTrack(item, '/api/hdd/audio')),
    });
  });

  app.post('/api/hdd/add-files', requireAdmin, async (req, res) => {
    const rawPaths = Array.isArray(req.body?.paths) ? (req.body.paths as unknown[]) : [];
    const filePaths = rawPaths
      .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
      .map((p) => path.resolve(p.trim()));

    if (filePaths.length === 0) {
      res.status(400).json({ error: 'กรุณาเลือกไฟล์เสียงบน HDD' });
      return;
    }

    const added: StoredStreamTrack[] = [];
    for (const fp of filePaths) {
      if (!fs.existsSync(fp)) continue;
      const parsed = await parseSingleHddAudioFile(fp, 'user-admin');
      if (parsed) added.push(parsed);
    }

    if (added.length === 0) {
      res.status(400).json({ error: 'ไม่พบไฟล์เสียงที่รองรับจากที่อยู่ที่เลือก' });
      return;
    }

    const existing = await readJsonFile<StoredStreamTrack[]>(HOST_HDD_INDEX_FILE, []);
    const existingByPath = new Set(existing.map((item) => item.filePath).filter(Boolean));
    const uniqueNew = added.filter((item) => item.filePath && !existingByPath.has(item.filePath));
    const next = [...uniqueNew, ...existing];
    await writeJsonFile(HOST_HDD_INDEX_FILE, next);

    if (uniqueNew.length > 0) {
      await recordAdminActivity(
        'เพิ่มไฟล์จาก HDD (ไม่อัปโหลด)',
        `เพิ่ม ${uniqueNew.length} ไฟล์เข้าสตรีมตรงจาก HDD`
      );
      broadcastLibraryUpdate('hdd-add-files');
    }

    res.status(201).json({
      tracks: added.map((item) => toClientTrack(item, '/api/hdd/audio')),
      addedCount: uniqueNew.length,
    });
  });

  app.post('/api/hdd/rescan', requireAdmin, async (_req, res) => {
    const existing = await readJsonFile<StoredStreamTrack[]>(HOST_HDD_INDEX_FILE, []);
    const mountedFolders = await getMountedFolderList();

    const standaloneFiles = existing.filter(
      (item) => !item.sourceFolder && item.filePath && fs.existsSync(item.filePath)
    );

    const cachedByPath = new Map(
      existing
        .filter((item) => item.filePath)
        .map((item) => [item.filePath!, item])
    );

    const rescannedAll: StoredStreamTrack[] = [...standaloneFiles];
    for (const folder of mountedFolders) {
      if (!fs.existsSync(folder)) {
        // Keep previously indexed entries for temporarily unavailable folders instead of wiping them
        rescannedAll.push(...existing.filter((item) => item.sourceFolder === folder));
        continue;
      }
      const scanned = await scanAudioDirectory(folder, 'user-admin', 2000, cachedByPath);
      rescannedAll.push(...scanned);
    }

    await writeJsonFile(HOST_HDD_INDEX_FILE, rescannedAll);
    await syncHddWatchers();
    await recordAdminActivity(
      'รีสแกน HDD โฮสต์',
      `อัปเดต ${mountedFolders.length} โฟลเดอร์ รวม ${rescannedAll.length} เพลง`
    );
    broadcastLibraryUpdate('hdd-rescan');

    res.json({
      folders: mountedFolders.length,
      totalTracks: rescannedAll.length,
    });
  });

  app.get('/api/hdd/audio/:id', async (req, res) => {
    const existing = await readJsonFile<StoredStreamTrack[]>(HOST_HDD_INDEX_FILE, []);
    const found = existing.find((item) => item.id === req.params.id);
    if (!found || !found.filePath) {
      res.status(404).json({ error: 'ไม่พบไฟล์เสียงในรายการ HDD' });
      return;
    }
    streamAudioFileWithRange(req, res, found.filePath);
  });

  app.delete('/api/hdd/folder', requireAdmin, async (req, res) => {
    const folder = typeof req.query.dir === 'string' ? req.query.dir : '';
    const existing = await readJsonFile<StoredStreamTrack[]>(HOST_HDD_INDEX_FILE, []);
    const next = folder ? existing.filter((item) => item.sourceFolder !== folder) : [];
    await writeJsonFile(HOST_HDD_INDEX_FILE, next);
    await removeMountedFolderPath(folder || undefined);
    await syncHddWatchers();
    await recordAdminActivity(
      'ยกเลิกโฟลเดอร์ HDD โฮสต์',
      folder ? `ถอดโฟลเดอร์ "${folder}"` : 'ล้างโฟลเดอร์ HDD ทั้งหมด'
    );
    broadcastLibraryUpdate('hdd-unmount');
    res.json({ ok: true });
  });

  // Vite Dev Middleware or Static Production Build
  if (!IS_PROD) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`Aura Audio streaming server running at http://${HOST}:${PORT}`);
  });
}

function windowSafeSetInterval(fn: () => void, ms: number): ReturnType<typeof setInterval> {
  return setInterval(fn, ms);
}

startServer().catch((err) => {
  console.error('Failed to start Aura Audio server:', err);
  process.exit(1);
});
