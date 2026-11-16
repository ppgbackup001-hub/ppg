import type {
  AdminOperationalStatus,
  CastAction,
  CastCommandPayload,
  CastDeviceType,
  ConnectedCastDevice,
  HddBrowseResult,
  HddHostInfo,
  HddRootOption,
  LanHostInfo,
  LanSharedTrackMeta,
  LanSignalPayload,
  MountedHddFolder,
  NetworkInfoResponse,
  Track,
  UserAccount,
  UserPreferences,
} from '../types/music';

const AUTH_TOKEN_KEY = 'aura_auth_token_v1';
const CACHED_USER_KEY = 'aura_cached_user_v1';
const SERVER_BASE_URL_KEY = 'aura_server_base_url_v1';

export const DEFAULT_REMOTE_SERVER_URL =
  'https://ais-pre-msjr3xquijkl57f5erefyc-786866126044.asia-southeast1.run.app';

export function isNativeAndroidShell(): boolean {
  if (typeof window === 'undefined') return false;
  const { hostname, protocol } = window.location;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  return (
    hostname === 'appassets.androidplatform.net' ||
    protocol === 'file:' ||
    protocol === 'capacitor:' ||
    ua.includes('AuraAndroidApp')
  );
}

export function normalizeServerBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  const isLocalHostOrIp =
    /^(localhost|127\.0\.0\.1|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(trimmed) ||
    /:\d+$/.test(trimmed);
  return `${isLocalHostOrIp ? 'http' : 'https'}://${trimmed}`;
}

export function getConfiguredServerBaseUrl(): string {
  try {
    return localStorage.getItem(SERVER_BASE_URL_KEY) || '';
  } catch {
    return '';
  }
}

export function getServerBaseUrl(): string {
  const configured = getConfiguredServerBaseUrl();
  if (configured) return configured;
  if (isNativeAndroidShell()) {
    return DEFAULT_REMOTE_SERVER_URL;
  }
  return '';
}

export function setServerBaseUrl(url: string): string {
  const normalized = normalizeServerBaseUrl(url);
  try {
    if (normalized) {
      localStorage.setItem(SERVER_BASE_URL_KEY, normalized);
    } else {
      localStorage.removeItem(SERVER_BASE_URL_KEY);
    }
  } catch {
    // ignore storage failures
  }
  return getServerBaseUrl();
}

export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const base = getServerBaseUrl();
  if (!base) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

export function resolveTrackPlayableUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith('/api/')) {
    return apiUrl(url);
  }
  return url;
}

function hydrateTrackUrls(track: Track): Track {
  return {
    ...track,
    url: resolveTrackPlayableUrl(track.url),
    ...(track.streamUrl ? { streamUrl: resolveTrackPlayableUrl(track.streamUrl) } : {}),
    ...(track.coverDataUrl ? { coverDataUrl: resolveTrackPlayableUrl(track.coverDataUrl) } : {}),
  };
}

export async function testServerConnection(targetUrl?: string): Promise<{
  ok: boolean;
  url: string;
  latencyMs: number;
  connectedDevices?: number;
  error?: string;
}> {
  const base = targetUrl !== undefined ? normalizeServerBaseUrl(targetUrl) : getServerBaseUrl();
  const displayUrl = base || (typeof window !== 'undefined' ? window.location.origin : '');
  const endpoint = base ? `${base}/api/health` : '/api/health';
  const started = performance.now();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(endpoint, { signal: controller.signal });
    const latencyMs = Math.max(1, Math.round(performance.now() - started));
    if (!res.ok) {
      return {
        ok: false,
        url: displayUrl,
        latencyMs,
        error: `เซิร์ฟเวอร์ตอบกลับสถานะ HTTP ${res.status}`,
      };
    }
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      connectedDevices?: number;
    };
    return {
      ok: Boolean(data.ok ?? true),
      url: displayUrl,
      latencyMs,
      connectedDevices: data.connectedDevices,
    };
  } catch (err) {
    const latencyMs = Math.max(1, Math.round(performance.now() - started));
    return {
      ok: false,
      url: displayUrl,
      latencyMs,
      error:
        err instanceof Error && err.name === 'AbortError'
          ? 'หมดเวลาเชื่อมต่อ (เกิน 6 วินาที)'
          : 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ปลายทางได้ กรุณาตรวจสอบ URL หรือ Wi-Fi',
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  } catch {
    // ignore
  }
}

function getCachedUser(): UserAccount | null {
  try {
    const raw = localStorage.getItem(CACHED_USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as UserAccount;
  } catch {
    return null;
  }
}

function setCachedUser(user: UserAccount | null): void {
  try {
    if (user) {
      localStorage.setItem(CACHED_USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(CACHED_USER_KEY);
    }
  } catch {
    // ignore
  }
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getAuthToken();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

// --- Server Auth & User Prefs ---

export async function apiLogin(
  identifier: string,
  password: string
): Promise<{ user: UserAccount; token: string }> {
  const res = await fetch(apiUrl('/api/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    user?: UserAccount;
    token?: string;
    error?: string;
  };
  if (!res.ok || !data.user || !data.token) {
    throw new Error(data.error || 'เข้าสู่ระบบไม่สำเร็จ');
  }
  setAuthToken(data.token);
  setCachedUser(data.user);
  return { user: data.user, token: data.token };
}

export async function apiRegister(
  username: string,
  email: string,
  password: string
): Promise<{ user: UserAccount; token: string }> {
  const res = await fetch(apiUrl('/api/auth/register'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    user?: UserAccount;
    token?: string;
    error?: string;
  };
  if (!res.ok || !data.user || !data.token) {
    throw new Error(data.error || 'สมัครสมาชิกไม่สำเร็จ');
  }
  setAuthToken(data.token);
  setCachedUser(data.user);
  return { user: data.user, token: data.token };
}

export async function apiFetchMe(): Promise<UserAccount | null> {
  const token = getAuthToken();
  if (!token) {
    setCachedUser(null);
    return null;
  }
  try {
    const res = await fetch(apiUrl('/api/auth/me'), {
      headers: authHeaders(),
    });
    if (res.status === 401 || res.status === 403) {
      setAuthToken(null);
      setCachedUser(null);
      return null;
    }
    if (!res.ok) {
      return getCachedUser();
    }
    const data = (await res.json()) as { user?: UserAccount };
    if (data.user) {
      setCachedUser(data.user);
      return data.user;
    }
    return getCachedUser();
  } catch {
    return getCachedUser();
  }
}

export async function apiLogout(): Promise<void> {
  const token = getAuthToken();
  setAuthToken(null);
  setCachedUser(null);
  if (!token) return;
  try {
    await fetch(apiUrl('/api/auth/logout'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // ignore
  }
}

export async function apiLoadUserPrefs(): Promise<Partial<UserPreferences> | null> {
  if (!getAuthToken()) return null;
  try {
    const res = await fetch(apiUrl('/api/user/prefs'), { headers: authHeaders() });
    if (!res.ok) return null;
    const data = (await res.json()) as { prefs?: Partial<UserPreferences> | null };
    return data.prefs || null;
  } catch {
    return null;
  }
}

export async function apiSaveUserPrefs(prefs: UserPreferences): Promise<void> {
  if (!getAuthToken()) return;
  try {
    await fetch(apiUrl('/api/user/prefs'), {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prefs }),
    });
  } catch {
    // ignore
  }
}

// --- Shared Multi-Device Stream Catalog ---

export async function fetchServerHddStreamsSafe(knownVersion?: string): Promise<{
  ok: boolean;
  notModified?: boolean;
  version?: string;
  tracks: Track[];
}> {
  try {
    const cleanVersion = knownVersion?.trim() || '';
    const endpoint = cleanVersion
      ? apiUrl(`/api/streams?knownVersion=${encodeURIComponent(cleanVersion)}`)
      : apiUrl('/api/streams');
    const res = await fetch(endpoint, {
      cache: 'no-cache',
      ...(cleanVersion ? { headers: { 'If-None-Match': `"${cleanVersion}"` } } : {}),
    });
    if (res.status === 304) {
      return {
        ok: true,
        notModified: true,
        version: cleanVersion,
        tracks: [],
      };
    }
    if (!res.ok) return { ok: false, tracks: [] };
    const data = (await res.json()) as { version?: string; tracks?: Track[] };
    const headerEtag = res.headers
      .get('etag')
      ?.trim()
      .replace(/^W\//i, '')
      .replace(/^"+|"+$/g, '');
    return {
      ok: true,
      notModified: false,
      version: data.version || headerEtag || '',
      tracks: Array.isArray(data.tracks) ? data.tracks.map(hydrateTrackUrls) : [],
    };
  } catch {
    return { ok: false, tracks: [] };
  }
}

export async function fetchServerHddStreams(): Promise<Track[]> {
  const res = await fetchServerHddStreamsSafe();
  return res.tracks;
}

const DEVICE_ID_KEY = 'aura_device_id_v1';
const DEVICE_NAME_KEY = 'aura_device_name_v1';

export interface LocalDeviceIdentity {
  deviceId: string;
  deviceName: string;
  deviceType: CastDeviceType;
}

function detectBrowserDeviceDefaults(): { deviceName: string; deviceType: CastDeviceType } {
  if (typeof navigator === 'undefined') {
    return { deviceName: 'Aura Device', deviceType: 'desktop' };
  }
  const ua = navigator.userAgent || '';
  if (ua.includes('AuraAndroidApp') || isNativeAndroidShell()) {
    return { deviceName: 'Aura Android App', deviceType: 'mobile' };
  }

  const isTablet = /iPad|Tablet|PlayBook|Silk/i.test(ua);
  const isMobile = !isTablet && /iPhone|Android|Mobile|Windows Phone/i.test(ua);
  const isTv = /SmartTV|Tizen|Web0S|AppleTV|BRAVIA|AFT/i.test(ua);
  const deviceType: CastDeviceType = isTv ? 'tv' : isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop';

  let osLabel = 'Device';
  if (/iPhone/i.test(ua)) osLabel = 'iPhone';
  else if (/iPad/i.test(ua)) osLabel = 'iPad';
  else if (/Android/i.test(ua)) osLabel = 'Android';
  else if (/Mac OS X|Macintosh/i.test(ua)) osLabel = 'Mac';
  else if (/Windows/i.test(ua)) osLabel = 'Windows';
  else if (/Linux/i.test(ua)) osLabel = 'Linux';

  let browserLabel = 'Browser';
  if (/Edg\//i.test(ua)) browserLabel = 'Edge';
  else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) browserLabel = 'Chrome';
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browserLabel = 'Safari';
  else if (/Firefox\//i.test(ua)) browserLabel = 'Firefox';

  return { deviceName: `${browserLabel} · ${osLabel}`, deviceType };
}

export function getOrCreateDeviceIdentity(): LocalDeviceIdentity {
  const defaults = detectBrowserDeviceDefaults();
  let deviceId = '';
  let deviceName = defaults.deviceName;
  try {
    deviceId = localStorage.getItem(DEVICE_ID_KEY) || '';
    if (!deviceId) {
      deviceId = `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    const savedName = localStorage.getItem(DEVICE_NAME_KEY);
    if (savedName && savedName.trim()) {
      deviceName = savedName.trim();
    }
  } catch {
    deviceId = deviceId || `dev-${Math.random().toString(36).slice(2, 8)}`;
  }
  return { deviceId, deviceName, deviceType: defaults.deviceType };
}

export function saveLocalDeviceName(name: string): string {
  const clean = name.trim().slice(0, 60) || detectBrowserDeviceDefaults().deviceName;
  try {
    localStorage.setItem(DEVICE_NAME_KEY, clean);
  } catch {
    // ignore
  }
  return clean;
}

export interface StreamEventPayload {
  type?:
    | 'connected'
    | 'ping'
    | 'library-updated'
    | 'clients-changed'
    | 'devices-changed'
    | 'cast-command'
    | 'lan-hosts-changed'
    | 'lan-signal';
  reason?: string;
  catalogVersion?: string;
  connectedClients?: number;
  devices?: ConnectedCastDevice[];
  lanHosts?: LanHostInfo[];
  command?: CastCommandPayload;
  signal?: LanSignalPayload;
  timestamp?: number;
}

export function subscribeToStreamEvents(
  onLibraryUpdate: (payload: StreamEventPayload) => void,
  onStatusEvent?: (state: 'connecting' | 'connected' | 'reconnecting', payload?: StreamEventPayload) => void,
  options?: {
    device?: LocalDeviceIdentity;
    isAdmin?: boolean;
    onDevicesChange?: (devices: ConnectedCastDevice[]) => void;
    onCastCommand?: (command: CastCommandPayload) => void;
    onLanHostsChange?: (hosts: LanHostInfo[]) => void;
    onLanSignal?: (signal: LanSignalPayload) => void;
  }
): () => void {
  if (typeof EventSource === 'undefined') return () => {};

  const params = new URLSearchParams();
  if (options?.device) {
    params.set('deviceId', options.device.deviceId);
    params.set('deviceName', options.device.deviceName);
    params.set('deviceType', options.device.deviceType);
  }
  if (options?.isAdmin) {
    params.set('isAdmin', '1');
  }
  const query = params.toString();
  const streamUrl = apiUrl(`/api/streams/events${query ? `?${query}` : ''}`);

  let disposed = false;
  let source: EventSource | null = null;
  let hasOpenedOnce = false;
  let needsSyncOnConnect = false;
  let lastActivityAt = Date.now();
  let closedSince = 0;

  const connect = () => {
    if (disposed) return;
    if (source) {
      try {
        source.close();
      } catch {
        // ignore
      }
      source = null;
    }

    if (hasOpenedOnce) {
      needsSyncOnConnect = true;
    }
    onStatusEvent?.(hasOpenedOnce ? 'reconnecting' : 'connecting');
    const es = new EventSource(streamUrl);
    source = es;

    es.onopen = () => {
      if (disposed) return;
      lastActivityAt = Date.now();
      closedSince = 0;
      onStatusEvent?.('connected');
      hasOpenedOnce = true;
    };

    es.onerror = () => {
      if (disposed) return;
      if (hasOpenedOnce) {
        needsSyncOnConnect = true;
      }
      if (es.readyState === EventSource.CLOSED && !closedSince) {
        closedSince = Date.now();
      }
      onStatusEvent?.('reconnecting');
    };

    es.onmessage = (event) => {
      if (disposed) return;
      lastActivityAt = Date.now();
      closedSince = 0;
      try {
        const data = JSON.parse(event.data) as StreamEventPayload;
        if (data.type === 'ping') {
          onStatusEvent?.('connected');
          return;
        }
        if (Array.isArray(data.devices)) {
          options?.onDevicesChange?.(data.devices);
        }
        if (Array.isArray(data.lanHosts)) {
          options?.onLanHostsChange?.(data.lanHosts);
        }
        if (data.type === 'connected') {
          onStatusEvent?.('connected', data);
          if (needsSyncOnConnect) {
            needsSyncOnConnect = false;
            onLibraryUpdate(data);
          }
        } else if (
          data.type === 'clients-changed' ||
          data.type === 'devices-changed' ||
          data.type === 'lan-hosts-changed'
        ) {
          onStatusEvent?.('connected', data);
        } else if (data.type === 'library-updated') {
          onStatusEvent?.('connected', data);
          onLibraryUpdate(data);
        } else if (data.type === 'cast-command' && data.command) {
          options?.onCastCommand?.({
            ...data.command,
            ...(data.command.track ? { track: hydrateTrackUrls(data.command.track) } : {}),
          });
        } else if (data.type === 'lan-signal' && data.signal) {
          if (!options?.device || data.signal.targetDeviceId === options.device.deviceId) {
            options?.onLanSignal?.(data.signal);
          }
        }
      } catch {
        // ignore malformed event
      }
    };
  };

  connect();

  const watchdog = window.setInterval(() => {
    if (disposed) return;
    const now = Date.now();
    const staleMs = now - lastActivityAt;
    const isClosedTooLong =
      source?.readyState === EventSource.CLOSED && closedSince > 0 && now - closedSince > 3000;
    if (!source || staleMs > 32000 || isClosedTooLong) {
      connect();
    }
  }, 8000);

  return () => {
    disposed = true;
    window.clearInterval(watchdog);
    if (source) {
      try {
        source.close();
      } catch {
        // ignore
      }
      source = null;
    }
  };
}

export async function fetchConnectedDevices(): Promise<ConnectedCastDevice[]> {
  try {
    const res = await fetch(apiUrl('/api/devices'));
    if (!res.ok) return [];
    const data = (await res.json()) as { devices?: ConnectedCastDevice[] };
    return Array.isArray(data.devices) ? data.devices : [];
  } catch {
    return [];
  }
}

export async function updateDevicePresence(payload: {
  deviceId: string;
  deviceName?: string;
  deviceType?: CastDeviceType;
  isAdmin?: boolean;
  currentTrackTitle?: string | null;
  isPlaying?: boolean;
}): Promise<ConnectedCastDevice[]> {
  try {
    const res = await fetch(apiUrl('/api/devices/presence'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { devices?: ConnectedCastDevice[] };
    return Array.isArray(data.devices) ? data.devices : [];
  } catch {
    return [];
  }
}

export async function sendCastCommand(payload: {
  targetDeviceId: string;
  fromDeviceId: string;
  fromDeviceName: string;
  action: CastAction;
  track?: Track;
  positionSec?: number;
}): Promise<void> {
  const res = await fetch(apiUrl('/api/cast/send'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || 'ไม่สามารถส่งคำสั่งแคสต์ไปยังอุปกรณ์ปลายทางได้');
  }
}

// --- Local Network (LAN) Discovery & P2P Signaling API ---

export async function fetchNetworkInfo(): Promise<NetworkInfoResponse | null> {
  try {
    const res = await fetch(apiUrl('/api/network/info'));
    if (!res.ok) return null;
    return (await res.json()) as NetworkInfoResponse;
  } catch {
    return null;
  }
}

export async function fetchLanHosts(): Promise<LanHostInfo[]> {
  try {
    const res = await fetch(apiUrl('/api/lan/hosts'));
    if (!res.ok) return [];
    const data = (await res.json()) as { hosts?: LanHostInfo[] };
    return Array.isArray(data.hosts) ? data.hosts : [];
  } catch {
    return [];
  }
}

export async function registerLanHost(payload: {
  deviceId: string;
  deviceName: string;
  deviceType: CastDeviceType;
  tracks: LanSharedTrackMeta[];
}): Promise<LanHostInfo[]> {
  const res = await fetch(apiUrl('/api/lan/host/register'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || 'ไม่สามารถเปิดแชร์เพลงในวง Local Network ได้');
  }
  const data = (await res.json()) as { hosts?: LanHostInfo[] };
  return Array.isArray(data.hosts) ? data.hosts : [];
}

export async function heartbeatLanHost(
  deviceId: string
): Promise<{ ok: boolean; reregisterRequired?: boolean }> {
  try {
    const res = await fetch(apiUrl('/api/lan/host/heartbeat'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId }),
    });
    if (!res.ok) return { ok: false };
    return (await res.json()) as { ok: boolean; reregisterRequired?: boolean };
  } catch {
    return { ok: false };
  }
}

export async function unregisterLanHost(deviceId: string): Promise<LanHostInfo[]> {
  try {
    const res = await fetch(apiUrl('/api/lan/host/unregister'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { hosts?: LanHostInfo[] };
    return Array.isArray(data.hosts) ? data.hosts : [];
  } catch {
    return [];
  }
}

export async function sendLanSignal(payload: {
  fromDeviceId: string;
  fromDeviceName: string;
  targetDeviceId: string;
  signalType: 'offer' | 'answer' | 'ice' | 'reject';
  data: unknown;
}): Promise<void> {
  const res = await fetch(apiUrl('/api/lan/signal'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || 'ส่งสัญญาณ Local Network ไม่สำเร็จ');
  }
}

export async function fetchAdminStatus(): Promise<AdminOperationalStatus | null> {
  if (!getAuthToken()) return null;
  try {
    const res = await fetch(apiUrl('/api/admin/status'), { headers: authHeaders() });
    if (!res.ok) return null;
    return (await res.json()) as AdminOperationalStatus;
  } catch {
    return null;
  }
}

export async function apiResetServerData(): Promise<void> {
  const res = await fetch(apiUrl('/api/admin/reset'), {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || 'ไม่สามารถรีเซ็ตข้อมูลบนเซิร์ฟเวอร์ได้');
  }
}

export async function publishTrackToServerStream(
  track: Track,
  blob: Blob,
  filename: string
): Promise<Track> {
  const folder = track.folderName || track.syncedFolder;
  const CHUNK_THRESHOLD_BYTES = 16 * 1024 * 1024;
  const CHUNK_SIZE_BYTES = 8 * 1024 * 1024;

  if (blob.size > CHUNK_THRESHOLD_BYTES) {
    const initRes = await fetch(apiUrl('/api/streams/upload-init'), {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        filename,
        title: track.title,
        artist: track.artist,
        album: track.album,
        genre: track.genre,
        folderName: folder,
        durationSec: track.durationSec,
        totalSize: blob.size,
        clientTrackId: track.id,
      }),
    });
    if (!initRes.ok) {
      const err = (await initRes.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || 'ไม่สามารถเริ่มอัปโหลดไฟล์เสียงขนาดใหญ่ได้');
    }
    const { uploadId } = (await initRes.json()) as { uploadId: string };

    let chunkIndex = 0;
    for (let offset = 0; offset < blob.size; offset += CHUNK_SIZE_BYTES) {
      const slice = blob.slice(offset, Math.min(offset + CHUNK_SIZE_BYTES, blob.size));
      const chunkRes = await fetch(apiUrl('/api/streams/upload-chunk'), {
        method: 'POST',
        headers: authHeaders({
          'Content-Type': 'application/octet-stream',
          'x-upload-id': uploadId,
          'x-chunk-index': String(chunkIndex++),
        }),
        body: slice,
      });
      if (!chunkRes.ok) {
        const err = (await chunkRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || 'ส่งชิ้นส่วนไฟล์เสียงไม่สำเร็จ');
      }
    }

    const completeRes = await fetch(apiUrl('/api/streams/upload-complete'), {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ uploadId }),
    });
    if (!completeRes.ok) {
      const err = (await completeRes.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || 'ประกอบไฟล์เสียงไม่สำเร็จ');
    }
    const data = (await completeRes.json()) as { track: Track };
    return hydrateTrackUrls(data.track);
  }

  const res = await fetch(apiUrl('/api/streams/upload'), {
    method: 'POST',
    headers: authHeaders({
      'Content-Type': blob.type || 'application/octet-stream',
      'x-track-filename': encodeURIComponent(filename),
      'x-track-title': encodeURIComponent(track.title),
      'x-track-artist': encodeURIComponent(track.artist),
      'x-track-client-id': encodeURIComponent(track.id),
      ...(track.album ? { 'x-track-album': encodeURIComponent(track.album) } : {}),
      ...(track.genre ? { 'x-track-genre': encodeURIComponent(track.genre) } : {}),
      ...(folder ? { 'x-track-folder': encodeURIComponent(folder) } : {}),
      ...(track.durationSec !== null ? { 'x-track-duration': String(track.durationSec) } : {}),
    }),
    body: blob,
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || 'ไม่สามารถส่งไฟล์ขึ้นสตรีมมิ่งออนไลน์ได้');
  }

  const data = (await res.json()) as { track: Track };
  return hydrateTrackUrls(data.track);
}

export async function addSharedStreamUrl(payload: {
  title: string;
  artist: string;
  album?: string;
  genre?: string;
  url: string;
  format: string;
}): Promise<Track> {
  const res = await fetch(apiUrl('/api/streams/url'), {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as { track?: Track; error?: string };
  if (!res.ok || !data.track) {
    throw new Error(data.error || 'ไม่สามารถเพิ่มลิงก์สตรีมออนไลน์ได้');
  }
  return hydrateTrackUrls(data.track);
}

export async function updateSharedStreamMeta(
  id: string,
  payload: {
    title?: string;
    artist?: string;
    album?: string;
    genre?: string;
    folderName?: string;
    format?: string;
  }
): Promise<Track> {
  const res = await fetch(apiUrl(`/api/streams/${encodeURIComponent(id)}`), {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as { track?: Track; error?: string };
  if (!res.ok || !data.track) {
    throw new Error(data.error || 'ไม่สามารถแก้ไขข้อมูลเพลงได้');
  }
  return hydrateTrackUrls(data.track);
}

export async function reorderSharedStreams(orderedIds: string[]): Promise<void> {
  const res = await fetch(apiUrl('/api/streams/reorder'), {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ orderedIds }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || 'ไม่สามารถจัดลำดับเพลงได้');
  }
}

export async function deleteServerStream(streamId: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/streams/${encodeURIComponent(streamId)}`), {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || 'ไม่สามารถลบเพลงออกจากระบบสตรีมได้');
  }
}

// --- Host HDD Scanner API (Admin) ---

export async function fetchHostHddRoots(): Promise<{
  roots: HddRootOption[];
  mountedFolders: MountedHddFolder[];
  hostInfo?: HddHostInfo;
}> {
  const res = await fetch(apiUrl('/api/hdd/roots'), { headers: authHeaders() });
  if (!res.ok) {
    return { roots: [], mountedFolders: [] };
  }
  return (await res.json()) as {
    roots: HddRootOption[];
    mountedFolders: MountedHddFolder[];
    hostInfo?: HddHostInfo;
  };
}

export async function browseHostHddDirectory(dir?: string): Promise<HddBrowseResult> {
  const query = dir ? `?dir=${encodeURIComponent(dir)}` : '';
  const res = await fetch(apiUrl(`/api/hdd/browse${query}`), { headers: authHeaders() });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || 'ไม่สามารถเปิดดูโฟลเดอร์บน HDD ได้');
  }
  return (await res.json()) as HddBrowseResult;
}

export async function scanHostHddFolder(
  dir: string
): Promise<{ folder: string; tracks: Track[] }> {
  const res = await fetch(apiUrl('/api/hdd/scan'), {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ dir }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || 'ไม่สามารถสแกนโฟลเดอร์ HDD ได้');
  }
  const data = (await res.json()) as { folder: string; tracks: Track[] };
  return {
    folder: data.folder,
    tracks: Array.isArray(data.tracks) ? data.tracks.map(hydrateTrackUrls) : [],
  };
}

export async function addHostHddFiles(
  paths: string[]
): Promise<{ tracks: Track[]; addedCount: number }> {
  const res = await fetch(apiUrl('/api/hdd/add-files'), {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ paths }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || 'ไม่สามารถเพิ่มไฟล์จาก HDD ได้');
  }
  const data = (await res.json()) as { tracks: Track[]; addedCount: number };
  return {
    tracks: Array.isArray(data.tracks) ? data.tracks.map(hydrateTrackUrls) : [],
    addedCount: data.addedCount,
  };
}

export async function rescanAllHostHddFolders(): Promise<{
  folders: number;
  totalTracks: number;
}> {
  const res = await fetch(apiUrl('/api/hdd/rescan'), {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || 'ไม่สามารถรีสแกนโฟลเดอร์ HDD ได้');
  }
  return (await res.json()) as { folders: number; totalTracks: number };
}

export async function unmountHostHddFolder(dir: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/hdd/folder?dir=${encodeURIComponent(dir)}`), {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || 'ไม่สามารถยกเลิกโฟลเดอร์ HDD ได้');
  }
}
