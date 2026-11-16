import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Cast,
  CheckCircle2,
  Clock,
  Disc,
  FolderOpen,
  HardDrive,
  Heart,
  Layers,
  ListMusic,
  ListPlus,
  Maximize2,
  Minimize2,
  Moon,
  Music2,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Pencil,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Repeat,
  Repeat1,
  RotateCcw,
  Search,
  Server,
  ShieldCheck,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Smartphone,
  Sun,
  Tag,
  Trash2,
  Upload,
  User,
  Volume1,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { AdminTrackModal } from './components/AdminTrackModal';
import { AlbumShowcaseStage } from './components/AlbumShowcaseStage';
import { AndroidGitHubModal } from './components/AndroidGitHubModal';
import { AuthModal } from './components/AuthModal';
import { CastModal, type AudioOutputDeviceOption } from './components/CastModal';
import { EqualizerPopover } from './components/EqualizerPopover';
import { HddStreamModal } from './components/HddStreamModal';
import { LanNetworkModal } from './components/LanNetworkModal';
import { PlaylistModal } from './components/PlaylistModal';
import { OfflineIndicator, PWAInstallButton, PWAUpdateBanner } from './components/PWAInstallButton';
import { QueueDrawer } from './components/QueueDrawer';
import { ResetDataModal } from './components/ResetDataModal';
import { StreamModal } from './components/StreamModal';
import { Button, Surface, TrackCover } from './components/ui';
import { VisualizerCanvas } from './components/VisualizerCanvas';
import type {
  AdminOperationalStatus,
  CastCommandPayload,
  ConnectedCastDevice,
  EqBands,
  EqPresetKey,
  FormatFilter,
  LanHostInfo,
  LanSharedTrackMeta,
  LanSignalPayload,
  LibraryGroupBy,
  LibraryTab,
  Playlist,
  RepeatMode,
  SyncedHddFolderSummary,
  Track,
  UserAccount,
  UserPreferences,
} from './types/music';
import {
  addSharedStreamUrl,
  apiFetchMe,
  apiLoadUserPrefs,
  apiLogin,
  apiLogout,
  apiRegister,
  apiResetServerData,
  apiSaveUserPrefs,
  deleteServerStream,
  fetchAdminStatus,
  fetchConnectedDevices,
  fetchLanHosts,
  fetchServerHddStreamsSafe,
  getOrCreateDeviceIdentity,
  getServerBaseUrl,
  heartbeatLanHost,
  publishTrackToServerStream,
  registerLanHost,
  reorderSharedStreams,
  rescanAllHostHddFolders,
  resolveTrackPlayableUrl,
  saveLocalDeviceName,
  sendCastCommand,
  subscribeToStreamEvents,
  unregisterLanHost,
  updateDevicePresence,
  updateSharedStreamMeta,
  type LocalDeviceIdentity,
} from './utils/api';
import { LanP2PManager } from './utils/lanP2P';
import {
  AUDIO_ACCEPT_STRING,
  collectFilesFromDataTransfer,
  decodeBlobToWavUrl,
  extractCoverFromAudioBlob,
  extractCoverFromImageFile,
  extractFolderNameFromRelativePath,
  extractLocalTrack,
  formatFileSize,
  formatTime,
  getCoverImagePriority,
  getFileExtension,
  hashStringToSeed,
  isCoverImageFilename,
  isSupportedAudioFile,
  isSupportedAudioFilename,
  parseM3uContent,
  resizeImageBlobToDataUrl,
} from './utils/audioMetadata';
import {
  adoptGuestLocalData,
  clearCachedServerLibrary,
  clearCachedStreamMedia,
  clearHddHandlesFromDb,
  clearLocalTracksFromDb,
  clearSyncedFolderSummaries,
  createDefaultPreferences,
  deleteHddHandleFromDb,
  deleteLocalTrackFromDb,
  EQ_PRESETS,
  getCachedStreamAudioBlob,
  getLocalBlobFromDb,
  getStreamTrackSignature,
  loadCachedServerLibrary,
  loadCachedStreamCovers,
  loadHddHandlesFromDb,
  loadLocalTracksFromDb,
  loadSyncedFolderSummaries,
  loadThemePreference,
  loadUserPreferences,
  pruneCachedStreamMedia,
  removeSyncedFolderSummary,
  saveCachedServerLibrary,
  saveCachedStreamAudioBlob,
  saveCachedStreamCover,
  saveHddHandleToDb,
  saveLocalTracksBatchToDb,
  saveLocalTracksMetaFirstToDb,
  saveSyncedFolderSummary,
  saveThemePreference,
  saveUserPreferences,
  updateLocalTrackMetaInDb,
  type LocalDbSaveItem,
  type StoredHddHandleRecord,
} from './utils/storage';

const EQ_FREQUENCIES = [60, 230, 910, 3600, 14000];

export default function App() {
  // --- Theme & Layout Preferences ---
  const [theme, setTheme] = useState<'light' | 'dark'>(() => loadThemePreference());
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('aura_sidebar_collapsed_v1') === '1';
    } catch {
      return false;
    }
  });
  const [albumShowcaseOpen, setAlbumShowcaseOpen] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    saveThemePreference(theme);
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem('aura_sidebar_collapsed_v1', sidebarCollapsed ? '1' : '0');
    } catch {
      // ignore storage failure
    }
  }, [sidebarCollapsed]);

  // --- Server-Backed Auth & Scoped Preferences ---
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const isAdmin = currentUser?.role === 'admin';
  const ownerKey = currentUser ? currentUser.id : 'guest';

  const initialServerScope = getServerBaseUrl() || 'origin';
  const initialCachedLibraryRef = useRef<ReturnType<typeof loadCachedServerLibrary> | undefined>(
    undefined
  );
  if (initialCachedLibraryRef.current === undefined) {
    initialCachedLibraryRef.current = loadCachedServerLibrary(initialServerScope);
  }
  const initialCachedLib = initialCachedLibraryRef.current;

  const [prefs, setPrefs] = useState<UserPreferences>(() => loadUserPreferences('guest'));
  const [localTracks, setLocalTracks] = useState<Track[]>([]);
  const [serverStreams, setServerStreams] = useState<Track[]>(
    () => initialCachedLib?.tracks || []
  );
  const [savedHddHandles, setSavedHddHandles] = useState<StoredHddHandleRecord[]>([]);
  const [syncedFolders, setSyncedFolders] = useState<SyncedHddFolderSummary[]>(() =>
    loadSyncedFolderSummaries('guest')
  );
  const [hddSyncProgress, setHddSyncProgress] = useState<{
    label: string;
    processed: number;
    total: number;
  } | null>(null);
  const [syncState, setSyncState] = useState<'connecting' | 'connected' | 'reconnecting'>('connecting');
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(
    () => initialCachedLib?.cachedAt || null
  );
  const [liveConnectedDevices, setLiveConnectedDevices] = useState<number>(1);
  const [deviceIdentity, setDeviceIdentity] = useState<LocalDeviceIdentity>(() =>
    getOrCreateDeviceIdentity()
  );
  const [connectedDevices, setConnectedDevices] = useState<ConnectedCastDevice[]>([]);
  const [activeCastTarget, setActiveCastTarget] = useState<ConnectedCastDevice | null>(null);
  const [castModalOpen, setCastModalOpen] = useState(false);
  const [castingBusyId, setCastingBusyId] = useState<string | null>(null);
  const [nativeCastState, setNativeCastState] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [nativeCastSupported, setNativeCastSupported] = useState(false);
  const [audioOutputs, setAudioOutputs] = useState<AudioOutputDeviceOption[]>([]);
  const [selectedSinkId, setSelectedSinkId] = useState('');
  const [canSelectAudioOutput, setCanSelectAudioOutput] = useState(false);
  const castCommandHandlerRef = useRef<(command: CastCommandPayload) => void>(() => {});
  const [adminStatus, setAdminStatus] = useState<AdminOperationalStatus | null>(null);
  const [adminStatusLoading, setAdminStatusLoading] = useState(false);
  const [adminTask, setAdminTask] = useState<{
    state: 'idle' | 'working' | 'done' | 'error';
    message: string;
    updatedAt: number;
  }>({
    state: 'idle',
    message: 'ระบบพร้อมทำงานปกติ',
    updatedAt: Date.now(),
  });
  const [serverConfigVersion, setServerConfigVersion] = useState(0);
  const [serverStreamsLoaded, setServerStreamsLoaded] = useState<boolean>(() =>
    Boolean(initialCachedLib)
  );
  const serverCatalogVersionRef = useRef<string>(initialCachedLib?.version || '');
  const serverStreamsLoadedRef = useRef<boolean>(Boolean(initialCachedLib));
  const serverCoverCacheMapRef = useRef<Map<string, { signature: string; coverDataUrl: string }>>(
    new Map()
  );
  const inflightStreamCoverIdsRef = useRef<Set<string>>(new Set());
  const inflightStreamAudioIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    serverStreamsLoadedRef.current = serverStreamsLoaded;
  }, [serverStreamsLoaded]);

  // --- Local Network (LAN P2P + LAN Server) State ---
  const [lanModalOpen, setLanModalOpen] = useState(false);
  const [isSharingLan, setIsSharingLan] = useState(false);
  const [sharingLanBusy, setSharingLanBusy] = useState(false);
  const [lanHosts, setLanHosts] = useState<LanHostInfo[]>([]);
  const [connectedLanHostIds, setConnectedLanHostIds] = useState<string[]>([]);
  const [connectingLanHostId, setConnectingLanHostId] = useState<string | null>(null);
  const [lanPeerCount, setLanPeerCount] = useState(0);
  const [lanCoverCache, setLanCoverCache] = useState<Record<string, string>>({});
  const lanCoverCacheRef = useRef<Record<string, string>>({});
  const lanCoverInflightRef = useRef<Set<string>>(new Set());
  const lanCoverTriedRef = useRef<Map<string, number>>(new Map());
  const deviceIdentityRef = useRef<LocalDeviceIdentity>(deviceIdentity);
  const lanSignalHandlerRef = useRef<(signal: LanSignalPayload) => void>(() => {});
  const lanP2pRef = useRef<LanP2PManager | null>(null);
  const desiredLanHostIdsRef = useRef<Set<string>>(new Set());
  const lanHostMissingSinceRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    lanCoverCacheRef.current = lanCoverCache;
  }, [lanCoverCache]);

  useEffect(() => {
    deviceIdentityRef.current = deviceIdentity;
  }, [deviceIdentity]);

  useEffect(() => {
    const isBusy = adminTask.state === 'working' || hddSyncProgress !== null;
    if (!isBusy) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [adminTask.state, hddSyncProgress]);

  const applyCoverCacheToTracks = useCallback(
    (tracks: Track[], coverMap: Map<string, { signature: string; coverDataUrl: string }>) => {
      if (coverMap.size === 0) return tracks;
      let changed = false;
      const next = tracks.map((track) => {
        const entry = coverMap.get(track.id);
        if (entry && entry.signature === getStreamTrackSignature(track) && entry.coverDataUrl) {
          if (track.coverDataUrl !== entry.coverDataUrl) {
            changed = true;
            return { ...track, coverDataUrl: entry.coverDataUrl };
          }
        }
        return track;
      });
      return changed ? next : tracks;
    },
    []
  );

  const cacheNewStreamCovers = useCallback(async (tracks: Track[], scope: string) => {
    const candidates = tracks.filter((track) => {
      if (track.streamKind === 'url') return false;
      if (!track.coverDataUrl || track.coverDataUrl.startsWith('data:')) return false;
      const cached = serverCoverCacheMapRef.current.get(track.id);
      if (cached && cached.signature === getStreamTrackSignature(track)) return false;
      const inflightKey = `${scope}::${track.id}`;
      return !inflightStreamCoverIdsRef.current.has(inflightKey);
    });
    if (candidates.length === 0) return;

    const BATCH = 3;
    for (let i = 0; i < candidates.length; i += BATCH) {
      if ((getServerBaseUrl() || 'origin') !== scope) return;
      const slice = candidates.slice(i, i + BATCH);
      await Promise.all(
        slice.map(async (track) => {
          const inflightKey = `${scope}::${track.id}`;
          inflightStreamCoverIdsRef.current.add(inflightKey);
          try {
            const res = await fetch(track.coverDataUrl!);
            if (!res.ok) return;
            const blob = await res.blob();
            if (!blob || blob.size === 0) return;
            const dataUrl = await resizeImageBlobToDataUrl(blob, 512);
            if (!dataUrl) return;
            const sig = getStreamTrackSignature(track);
            serverCoverCacheMapRef.current.set(track.id, { signature: sig, coverDataUrl: dataUrl });
            await saveCachedStreamCover(track, scope, dataUrl);
            if ((getServerBaseUrl() || 'origin') !== scope) return;
            setServerStreams((prev) =>
              prev.map((item) =>
                item.id === track.id && item.coverDataUrl !== dataUrl
                  ? { ...item, coverDataUrl: dataUrl }
                  : item
              )
            );
          } catch {
            // ignore transient cover fetch failure
          }
        })
      );
    }
  }, []);

  const refreshServerStreams = useCallback(
    async (force = false) => {
      const scope = getServerBaseUrl() || 'origin';
      const knownVersion = force ? undefined : serverCatalogVersionRef.current || undefined;
      const res = await fetchServerHddStreamsSafe(knownVersion);
      if (!res.ok) return;

      if (res.notModified) {
        setServerStreamsLoaded(true);
        setLastSyncAt(Date.now());
        return;
      }

      const nextVersion = res.version || '';
      serverCatalogVersionRef.current = nextVersion;
      saveCachedServerLibrary(scope, nextVersion, res.tracks);
      void pruneCachedStreamMedia(scope, res.tracks);

      const hydrated = applyCoverCacheToTracks(res.tracks, serverCoverCacheMapRef.current);
      setServerStreams(hydrated);
      setServerStreamsLoaded(true);
      setLastSyncAt(Date.now());
      void cacheNewStreamCovers(res.tracks, scope);
    },
    [applyCoverCacheToTracks, cacheNewStreamCovers]
  );

  const refreshAdminStatus = useCallback(async () => {
    if (!isAdmin) {
      setAdminStatus(null);
      return;
    }
    setAdminStatusLoading(true);
    try {
      const data = await fetchAdminStatus();
      if (data) {
        setAdminStatus(data);
        setLiveConnectedDevices(data.connectedDevices);
      }
    } finally {
      setAdminStatusLoading(false);
    }
  }, [isAdmin]);

  // Restore session on initial load
  useEffect(() => {
    let cancelled = false;
    apiFetchMe().then((user) => {
      if (!cancelled) {
        setCurrentUser(user);
        setAuthReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load remembered library from this device immediately, then validate with server (304 if unchanged) + SSE sync
  useEffect(() => {
    let cancelled = false;
    const scope = getServerBaseUrl() || 'origin';
    const cachedLib = loadCachedServerLibrary(scope);

    if (cachedLib) {
      serverCatalogVersionRef.current = cachedLib.version;
      setServerStreams(cachedLib.tracks);
      setServerStreamsLoaded(true);
      setLastSyncAt(cachedLib.cachedAt);
    } else {
      serverCatalogVersionRef.current = '';
      setServerStreams([]);
      setServerStreamsLoaded(false);
    }

    loadCachedStreamCovers(scope).then((coverMap) => {
      if (cancelled) return;
      serverCoverCacheMapRef.current = coverMap;
      if (coverMap.size > 0) {
        setServerStreams((prev) => applyCoverCacheToTracks(prev, coverMap));
      }
      if (cachedLib?.tracks.length) {
        void cacheNewStreamCovers(cachedLib.tracks, scope);
      }
    });

    void refreshServerStreams();
    fetchConnectedDevices().then((devices) => {
      if (!cancelled) setConnectedDevices(devices);
    });
    fetchLanHosts().then((hosts) => {
      if (!cancelled) setLanHosts(hosts);
    });
    let sseRefreshTimer: number | null = null;
    const unsubscribe = subscribeToStreamEvents(
      (payload) => {
        if (
          payload.catalogVersion &&
          payload.catalogVersion === serverCatalogVersionRef.current &&
          serverStreamsLoadedRef.current
        ) {
          setLastSyncAt(Date.now());
          return;
        }
        if (sseRefreshTimer !== null) {
          window.clearTimeout(sseRefreshTimer);
        }
        sseRefreshTimer = window.setTimeout(() => {
          sseRefreshTimer = null;
          void refreshServerStreams();
          if (isAdmin) {
            void refreshAdminStatus();
          }
        }, 300);
      },
      (state, payload) => {
        setSyncState(state);
        if (typeof payload?.connectedClients === 'number') {
          setLiveConnectedDevices(payload.connectedClients);
        }
        if (state === 'connected') {
          setLastSyncAt(Date.now());
        }
      },
      {
        device: deviceIdentity,
        isAdmin,
        onDevicesChange: (devices) => {
          setConnectedDevices(devices);
          setActiveCastTarget((prev) => {
            if (!prev) return null;
            const stillOnline = devices.find((d) => d.deviceId === prev.deviceId);
            return stillOnline || null;
          });
        },
        onCastCommand: (command) => {
          castCommandHandlerRef.current(command);
        },
        onLanHostsChange: (hosts) => {
          setLanHosts(hosts);
          const presentIds = new Set(hosts.map((h) => h.deviceId));
          const now = Date.now();
          for (const id of desiredLanHostIdsRef.current) {
            if (presentIds.has(id)) {
              lanHostMissingSinceRef.current.delete(id);
            } else if (!lanHostMissingSinceRef.current.has(id)) {
              lanHostMissingSinceRef.current.set(id, now);
            }
          }
          setConnectedLanHostIds((prev) => {
            const next = new Set<string>();
            for (const id of prev) {
              if (presentIds.has(id)) {
                next.add(id);
              } else {
                const missingSince = lanHostMissingSinceRef.current.get(id) ?? now;
                if (now - missingSince < 15000) {
                  next.add(id);
                } else {
                  desiredLanHostIdsRef.current.delete(id);
                  lanHostMissingSinceRef.current.delete(id);
                }
              }
            }
            for (const id of desiredLanHostIdsRef.current) {
              if (presentIds.has(id)) {
                next.add(id);
              }
            }
            if (next.size === prev.length && prev.every((id) => next.has(id))) {
              return prev;
            }
            return Array.from(next);
          });
        },
        onLanSignal: (signal) => {
          lanSignalHandlerRef.current(signal);
        },
      }
    );
    return () => {
      cancelled = true;
      if (sseRefreshTimer !== null) window.clearTimeout(sseRefreshTimer);
      unsubscribe();
    };
  }, [
    applyCoverCacheToTracks,
    cacheNewStreamCovers,
    deviceIdentity,
    isAdmin,
    refreshAdminStatus,
    refreshServerStreams,
    serverConfigVersion,
  ]);

  // Refresh admin operational status when entering Admin tab or signing in as Admin
  useEffect(() => {
    if (!isAdmin) {
      setAdminStatus(null);
      return;
    }
    refreshAdminStatus();
    const interval = window.setInterval(refreshAdminStatus, 15000);
    return () => window.clearInterval(interval);
  }, [isAdmin, refreshAdminStatus]);

  // Reload scoped user preferences and merge device local files when user changes
  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;

    const loadScopedData = async () => {
      if (currentUser) {
        await adoptGuestLocalData(currentUser.id);
      }
      if (cancelled) return;

      const localPrefs = loadUserPreferences(ownerKey);
      setPrefs(localPrefs);

      if (currentUser) {
        apiLoadUserPrefs().then((remotePrefs) => {
          if (!cancelled && remotePrefs) {
            const merged = { ...localPrefs, ...remotePrefs };
            setPrefs(merged);
            saveUserPreferences(ownerKey, merged);
          }
        });
      }

      const [loaded, handles] = await Promise.all([
        loadLocalTracksFromDb(ownerKey),
        loadHddHandlesFromDb(ownerKey),
      ]);
      if (cancelled) return;

      setLocalTracks((prev) => {
        if (prev.length === 0) return loaded;
        // Preserve already-synced session tracks when logging in/out instead of wiping them
        const loadedIds = new Set(loaded.map((t) => t.id));
        const liveSessionOnly = prev.filter((t) => !loadedIds.has(t.id));
        const prevById = new Map(prev.map((t) => [t.id, t]));
        const mergedLoaded = loaded.map((item) => {
          const existing = prevById.get(item.id);
          if (existing && existing.url.startsWith('blob:')) {
            if (item.url.startsWith('blob:') && item.url !== existing.url) {
              URL.revokeObjectURL(item.url);
            }
            return existing;
          }
          return item;
        });
        return [...liveSessionOnly, ...mergedLoaded];
      });

      setSavedHddHandles(handles);
      setSyncedFolders(loadSyncedFolderSummaries(ownerKey));

      // Backfill missing cover art for previously saved local tracks in background
      const missingCovers = loaded.filter((t) => !t.coverDataUrl);
      if (missingCovers.length > 0 && !cancelled) {
        void (async () => {
          for (let i = 0; i < missingCovers.length; i += 4) {
            if (cancelled) return;
            const batch = missingCovers.slice(i, i + 4);
            const updates = new Map<string, string>();
            await Promise.all(
              batch.map(async (track) => {
                try {
                  const blob =
                    inMemoryBlobMapRef.current.get(track.id) || (await getLocalBlobFromDb(track.id));
                  if (!blob || cancelled) return;
                  const coverDataUrl = await extractCoverFromAudioBlob(blob, 512);
                  if (coverDataUrl && !cancelled) {
                    updates.set(track.id, coverDataUrl);
                    await updateLocalTrackMetaInDb({ ...track, coverDataUrl });
                  }
                } catch {
                  // ignore individual backfill failures
                }
              })
            );
            if (updates.size > 0 && !cancelled) {
              setLocalTracks((prev) =>
                prev.map((t) => {
                  const nextCover = updates.get(t.id);
                  return nextCover && !t.coverDataUrl ? { ...t, coverDataUrl: nextCover } : t;
                })
              );
            }
          }
        })();
      }
    };

    void loadScopedData();

    return () => {
      cancelled = true;
    };
  }, [authReady, currentUser, ownerKey]);

  const updatePrefs = useCallback(
    (updater: (prev: UserPreferences) => UserPreferences) => {
      setPrefs((prev) => {
        const next = updater(prev);
        saveUserPreferences(ownerKey, next);
        if (currentUser) {
          apiSaveUserPrefs(next);
        }
        return next;
      });
    },
    [currentUser, ownerKey]
  );

  // --- Combined Library (Shared Server Streams + Local Device HDD Tracks + LAN P2P Tracks) ---
  const serverStreamIdSet = useMemo(() => new Set(serverStreams.map((t) => t.id)), [serverStreams]);

  const uniqueLocalTracks = useMemo(() => {
    return localTracks.filter((t) => !t.publishedStreamId || !serverStreamIdSet.has(t.publishedStreamId));
  }, [localTracks, serverStreamIdSet]);

  const lanTracks = useMemo<Track[]>(() => {
    const connectedSet = new Set(connectedLanHostIds);
    const items: Track[] = [];
    for (const host of lanHosts) {
      if (host.deviceId === deviceIdentity.deviceId) continue;
      if (!connectedSet.has(host.deviceId)) continue;
      for (const meta of host.tracks) {
        const lanId = `lan-${host.deviceId}-${meta.id}`;
        const coverDataUrl = meta.coverDataUrl || lanCoverCache[lanId];
        items.push({
          id: lanId,
          lanOriginalTrackId: meta.id,
          lanHostDeviceId: host.deviceId,
          lanHostDeviceName: host.deviceName,
          title: meta.title,
          artist: meta.artist,
          album: meta.album,
          genre: meta.genre,
          folderName: meta.folderName || `LAN · ${host.deviceName}`,
          source: 'lan',
          format: meta.format,
          formatDetail: `${meta.formatDetail} · LAN`,
          isLossless: meta.isLossless,
          durationSec: meta.durationSec,
          durationLabel: meta.durationLabel,
          url: '',
          ...(coverDataUrl ? { coverDataUrl } : {}),
          coverSeed: meta.coverSeed,
          addedAt: meta.addedAt,
          ownerId: host.deviceId,
          sizeBytes: meta.sizeBytes,
          sampleRate: meta.sampleRate,
          bitrate: meta.bitrate,
        });
      }
    }
    return items;
  }, [connectedLanHostIds, deviceIdentity.deviceId, lanCoverCache, lanHosts]);

  // Fetch missing LAN album covers over WebRTC DataChannel without cancelling mid-batch
  useEffect(() => {
    if (connectedLanHostIds.length === 0 || !lanP2pRef.current) return;
    const connectedSet = new Set(connectedLanHostIds);
    const missing: Array<{ lanId: string; hostId: string; origId: string; hostUpdatedAt: number }> = [];
    for (const host of lanHosts) {
      if (host.deviceId === deviceIdentity.deviceId || !connectedSet.has(host.deviceId)) continue;
      for (const meta of host.tracks) {
        const lanId = `lan-${host.deviceId}-${meta.id}`;
        if (meta.coverDataUrl) continue;
        if (meta.hasCover === false) continue;
        if (lanCoverCacheRef.current[lanId] || lanCoverInflightRef.current.has(lanId)) continue;
        if (lanCoverTriedRef.current.get(lanId) === host.updatedAt) continue;
        missing.push({
          lanId,
          hostId: host.deviceId,
          origId: meta.id,
          hostUpdatedAt: host.updatedAt,
        });
      }
    }
    if (missing.length === 0) return;

    let cancelled = false;
    void (async () => {
      const BATCH = 3;
      for (let i = 0; i < missing.length; i += BATCH) {
        if (cancelled || !lanP2pRef.current) return;
        const slice = missing.slice(i, i + BATCH);
        await Promise.all(
          slice.map(async (item) => {
            if (cancelled || !lanP2pRef.current) return;
            lanCoverInflightRef.current.add(item.lanId);
            try {
              const cover = await lanP2pRef.current.fetchTrackCover(item.hostId, item.origId);
              if (cover) {
                setLanCoverCache((prev) =>
                  prev[item.lanId] ? prev : { ...prev, [item.lanId]: cover }
                );
              }
              lanCoverTriedRef.current.set(item.lanId, item.hostUpdatedAt);
            } finally {
              lanCoverInflightRef.current.delete(item.lanId);
            }
          })
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [connectedLanHostIds, deviceIdentity.deviceId, lanHosts]);

  const allTracks = useMemo<Track[]>(() => {
    return [...serverStreams, ...uniqueLocalTracks, ...lanTracks];
  }, [lanTracks, serverStreams, uniqueLocalTracks]);

  // --- Navigation, Grouping & Filters ---
  const [activeTab, setActiveTab] = useState<LibraryTab>('all');
  const [formatFilter, setFormatFilter] = useState<FormatFilter>('all');
  const [groupBy, setGroupBy] = useState<LibraryGroupBy>('none');
  const [selectedGroupKey, setSelectedGroupKey] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setSelectedGroupKey('ALL');
  }, [groupBy, activeTab]);

  useEffect(() => {
    setAlbumShowcaseOpen(false);
  }, [activeTab]);

  // Reset from admin tab if signed out
  useEffect(() => {
    if (activeTab === 'admin' && !isAdmin) {
      setActiveTab('stream');
    }
  }, [activeTab, isAdmin]);

  // --- Modals & Popovers ---
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [streamModalOpen, setStreamModalOpen] = useState(false);
  const [hddModalOpen, setHddModalOpen] = useState(false);
  const [playlistModalOpen, setPlaylistModalOpen] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [androidModalOpen, setAndroidModalOpen] = useState(false);
  const [resetDefaultIncludeServer, setResetDefaultIncludeServer] = useState(false);
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);
  const [eqOpen, setEqOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [playlistMenuTrackId, setPlaylistMenuTrackId] = useState<string | null>(null);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const showStatus = useCallback((msg: string) => {
    setStatusMessage(msg);
  }, []);

  useEffect(() => {
    if (!statusMessage) return;
    const t = window.setTimeout(() => setStatusMessage(''), 4200);
    return () => window.clearTimeout(t);
  }, [statusMessage]);

  // --- Filtered Track List ---
  const filteredTracks = useMemo(() => {
    let list = allTracks;

    if (activeTab === 'admin') {
      list = serverStreams;
    } else if (activeTab === 'stream') {
      list = [
        ...serverStreams,
        ...(prefs.includeHddInStream ? uniqueLocalTracks : []),
      ];
    } else if (activeTab === 'lan') {
      list = lanTracks;
    } else if (activeTab === 'local') {
      list = [
        ...localTracks,
        ...serverStreams.filter((t) => Boolean(t.hddPath)),
      ];
    } else if (activeTab === 'favorites') {
      const favSet = new Set(prefs.favorites);
      list = list.filter((t) => favSet.has(t.id));
    } else if (activeTab === 'recent') {
      const byId = new Map(list.map((t) => [t.id, t]));
      list = prefs.recentIds.map((id) => byId.get(id)).filter((t): t is Track => Boolean(t));
    } else if (activeTab.startsWith('playlist:')) {
      const plId = activeTab.slice('playlist:'.length);
      const playlist = prefs.playlists.find((p) => p.id === plId);
      if (playlist) {
        const byId = new Map(list.map((t) => [t.id, t]));
        list = playlist.trackIds.map((id) => byId.get(id)).filter((t): t is Track => Boolean(t));
      } else {
        list = [];
      }
    }

    if (formatFilter === 'lossless') {
      list = list.filter((t) => t.isLossless);
    } else if (formatFilter === 'compressed') {
      list = list.filter((t) => (t.source === 'local' || t.source === 'lan' || Boolean(t.hddPath)) && !t.isLossless);
    } else if (formatFilter === 'stream') {
      list = list.filter((t) => t.source === 'stream' || t.source === 'lan' || Boolean(t.publishedStreamId));
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          (t.album && t.album.toLowerCase().includes(q)) ||
          (t.genre && t.genre.toLowerCase().includes(q)) ||
          (t.folderName && t.folderName.toLowerCase().includes(q)) ||
          (t.syncedFolder && t.syncedFolder.toLowerCase().includes(q)) ||
          (t.lanHostDeviceName && t.lanHostDeviceName.toLowerCase().includes(q)) ||
          t.format.toLowerCase().includes(q) ||
          t.formatDetail.toLowerCase().includes(q)
      );
    }

    return list;
  }, [
    allTracks,
    serverStreams,
    localTracks,
    uniqueLocalTracks,
    lanTracks,
    activeTab,
    formatFilter,
    searchQuery,
    prefs.favorites,
    prefs.recentIds,
    prefs.playlists,
    prefs.includeHddInStream,
  ]);

  const resolveTrackGroup = useCallback(
    (track: Track, mode: LibraryGroupBy): { key: string; label: string; isUnknown: boolean } => {
      if (mode === 'folder') {
        const raw =
          track.folderName?.trim() ||
          track.syncedFolder?.trim() ||
          extractFolderNameFromRelativePath(track.relativePath) ||
          (track.streamKind === 'url'
            ? 'สตรีมลิงก์ URL'
            : track.isSharedStream
            ? 'คลังสตรีมออนไลน์กลาง'
            : '');
        if (!raw) {
          return { key: '__unknown__', label: 'ไม่ระบุโฟลเดอร์', isUnknown: true };
        }
        return { key: raw.toLowerCase(), label: raw, isUnknown: false };
      }
      if (mode === 'artist') {
        const raw = track.artist?.trim();
        if (!raw) {
          return { key: '__unknown__', label: 'ไม่ระบุศิลปิน', isUnknown: true };
        }
        return { key: raw.toLowerCase(), label: raw, isUnknown: false };
      }
      if (mode === 'genre') {
        const raw = track.genre?.trim();
        if (!raw) {
          return { key: '__unknown__', label: 'ไม่ระบุแนวเพลง', isUnknown: true };
        }
        return { key: raw.toLowerCase(), label: raw, isUnknown: false };
      }
      return { key: 'all', label: 'ทั้งหมด', isUnknown: false };
    },
    []
  );

  const groupedSections = useMemo(() => {
    if (groupBy === 'none') return [];
    const groups = new Map<
      string,
      { key: string; label: string; isUnknown: boolean; tracks: Track[] }
    >();
    for (const track of filteredTracks) {
      const resolved = resolveTrackGroup(track, groupBy);
      const existing = groups.get(resolved.key);
      if (existing) {
        existing.tracks.push(track);
      } else {
        groups.set(resolved.key, {
          key: resolved.key,
          label: resolved.label,
          isUnknown: resolved.isUnknown,
          tracks: [track],
        });
      }
    }
    return Array.from(groups.values()).sort((a, b) => {
      if (a.isUnknown !== b.isUnknown) return a.isUnknown ? 1 : -1;
      return a.label.localeCompare(b.label, 'th');
    });
  }, [filteredTracks, groupBy, resolveTrackGroup]);

  const visibleSections = useMemo(() => {
    if (groupBy === 'none') return [];
    if (selectedGroupKey === 'ALL') return groupedSections;
    const matched = groupedSections.filter((g) => g.key === selectedGroupKey);
    return matched.length > 0 ? matched : groupedSections;
  }, [groupBy, groupedSections, selectedGroupKey]);

  const displayedTracks = useMemo(() => {
    if (groupBy === 'none') return filteredTracks;
    return visibleSections.flatMap((section) => section.tracks);
  }, [filteredTracks, groupBy, visibleSections]);

  // --- Audio Engine Refs ---
  const localAudioRef = useRef<HTMLAudioElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeEngineRef = useRef<'local' | 'remote'>('local');
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const eqFiltersRef = useRef<BiquadFilterNode[]>([]);
  const masterGainRef = useRef<GainNode | null>(null);
  const localSourceConnectedRef = useRef(false);
  const playRequestIdRef = useRef(0);
  const inMemoryBlobMapRef = useRef<Map<string, Blob>>(new Map());
  const remoteBlobCacheRef = useRef<Map<string, Blob>>(new Map());
  const tempPlaybackUrlsRef = useRef<string[]>([]);
  const playbackRetryCountRef = useRef(0);
  const retryTimerRef = useRef<number | null>(null);
  const stallTimerRef = useRef<number | null>(null);
  const intentionalPauseRef = useRef(false);
  const wantPlayingRef = useRef(false);
  const suppressPauseUntilRef = useRef(0);
  const lastPlaybackTimeRef = useRef(0);
  const currentTrackRef = useRef<Track | null>(null);
  const isPlayingRef = useRef(false);
  const localTracksRef = useRef<Track[]>([]);
  const serverStreamsRef = useRef<Track[]>([]);
  const autoPublishingRef = useRef(false);
  const autoReconnectedIdsRef = useRef<Set<string>>(new Set());
  const activeCastTargetRef = useRef<ConnectedCastDevice | null>(null);
  const handlingPlayFallbackRef = useRef<number>(0);
  const isSharingLanRef = useRef(false);
  const attemptRecoveryRef = useRef<(reason: 'error' | 'stalled') => void>(() => {});

  const cacheRemoteBlob = useCallback((trackId: string, blob: Blob) => {
    const cache = remoteBlobCacheRef.current;
    if (cache.has(trackId)) {
      cache.delete(trackId);
    }
    while (cache.size >= 2) {
      const oldestKey = cache.keys().next().value;
      if (!oldestKey) break;
      cache.delete(oldestKey);
    }
    cache.set(trackId, blob);
  }, []);

  const registerTempPlaybackUrl = useCallback((url: string) => {
    if (!url || !url.startsWith('blob:')) return;
    const queue = tempPlaybackUrlsRef.current;
    if (!queue.includes(url)) {
      queue.push(url);
    }
    while (queue.length > 2) {
      const oldest = queue.shift();
      if (oldest) {
        try {
          URL.revokeObjectURL(oldest);
        } catch {
          // ignore
        }
      }
    }
  }, []);

  useEffect(() => {
    const cache = remoteBlobCacheRef.current;
    const urls = tempPlaybackUrlsRef.current;
    return () => {
      cache.clear();
      while (urls.length > 0) {
        const u = urls.shift();
        if (u) {
          try {
            URL.revokeObjectURL(u);
          } catch {
            // ignore
          }
        }
      }
    };
  }, []);

  // --- Playback State ---
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [playbackError, setPlaybackError] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('off');
  const [isMuted, setIsMuted] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    currentTrackRef.current = currentTrack;
  }, [currentTrack]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    localTracksRef.current = localTracks;
  }, [localTracks]);

  useEffect(() => {
    serverStreamsRef.current = serverStreams;
  }, [serverStreams]);

  useEffect(() => {
    activeCastTargetRef.current = activeCastTarget;
  }, [activeCastTarget]);

  const getActiveAudioElement = useCallback((): HTMLAudioElement | null => {
    return activeEngineRef.current === 'local' ? localAudioRef.current : remoteAudioRef.current;
  }, []);

  const clearPlaybackTimers = useCallback(() => {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (stallTimerRef.current !== null) {
      window.clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
  }, []);

  // Keep currentTrack synced if admin edits metadata or a local track gets a fresh blob URL
  useEffect(() => {
    if (!currentTrack) return;
    const updated = allTracks.find((t) => t.id === currentTrack.id);
    if (
      updated &&
      (updated.url !== currentTrack.url ||
        updated.coverDataUrl !== currentTrack.coverDataUrl ||
        updated.title !== currentTrack.title ||
        updated.artist !== currentTrack.artist ||
        updated.album !== currentTrack.album ||
        updated.genre !== currentTrack.genre ||
        updated.folderName !== currentTrack.folderName)
    ) {
      setCurrentTrack(updated);
    }
  }, [allTracks, currentTrack]);

  // Ensure Web Audio Graph (EQ + Analyser)
  const ensureAudioGraph = useCallback(() => {
    if (!audioCtxRef.current) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;

      const ctx = new AudioCtx();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.82;

      const masterGain = ctx.createGain();
      masterGain.gain.value = isMuted ? 0 : prefs.volume;

      const filters = EQ_FREQUENCIES.map((freq, idx) => {
        const filter = ctx.createBiquadFilter();
        filter.type =
          idx === 0 ? 'lowshelf' : idx === EQ_FREQUENCIES.length - 1 ? 'highshelf' : 'peaking';
        filter.frequency.value = freq;
        filter.Q.value = 1.1;
        filter.gain.value = prefs.eqBands[idx] || 0;
        return filter;
      });

      for (let i = 0; i < filters.length - 1; i++) {
        filters[i].connect(filters[i + 1]);
      }
      filters[filters.length - 1].connect(analyser);
      analyser.connect(masterGain);
      masterGain.connect(ctx.destination);

      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      eqFiltersRef.current = filters;
      masterGainRef.current = masterGain;

      ctx.onstatechange = () => {
        if (isPlayingRef.current && ctx.state !== 'running') {
          ctx.resume().catch(() => {});
        }
      };
    }

    if (audioCtxRef.current.state !== 'running') {
      audioCtxRef.current.resume().catch(() => {});
    }

    if (
      !localSourceConnectedRef.current &&
      localAudioRef.current &&
      audioCtxRef.current &&
      eqFiltersRef.current[0]
    ) {
      try {
        const source = audioCtxRef.current.createMediaElementSource(localAudioRef.current);
        source.connect(eqFiltersRef.current[0]);
        localSourceConnectedRef.current = true;
      } catch {
        // ignore if already connected
      }
    }

    return {
      ctx: audioCtxRef.current,
      inputNode: eqFiltersRef.current[0],
      analyser: analyserRef.current,
    };
  }, [isMuted, prefs.eqBands, prefs.volume]);

  const resumeAudioContextBounded = useCallback(async () => {
    const graph = ensureAudioGraph();
    const ctx = graph?.ctx;
    if (ctx && ctx.state !== 'running') {
      await Promise.race([
        ctx.resume().catch(() => {}),
        new Promise<void>((resolve) => window.setTimeout(resolve, 250)),
      ]);
    }
  }, [ensureAudioGraph]);

  // Keep AudioContext & active playback alive when tab/app returns to foreground or network reconnects
  useEffect(() => {
    const handleKeepAlive = () => {
      if ((!isPlayingRef.current && !wantPlayingRef.current) || activeCastTargetRef.current) return;
      if (audioCtxRef.current && audioCtxRef.current.state !== 'running') {
        audioCtxRef.current.resume().catch(() => {});
      }
      const el = getActiveAudioElement();
      if (el && el.paused && !el.ended && !intentionalPauseRef.current) {
        el.play().catch(() => {
          attemptRecoveryRef.current('error');
        });
      }
    };

    document.addEventListener('visibilitychange', handleKeepAlive);
    window.addEventListener('focus', handleKeepAlive);
    window.addEventListener('online', handleKeepAlive);
    return () => {
      document.removeEventListener('visibilitychange', handleKeepAlive);
      window.removeEventListener('focus', handleKeepAlive);
      window.removeEventListener('online', handleKeepAlive);
    };
  }, [getActiveAudioElement]);

  // Sync EQ band gains
  useEffect(() => {
    eqFiltersRef.current.forEach((filter, idx) => {
      if (audioCtxRef.current) {
        filter.gain.setTargetAtTime(prefs.eqBands[idx] || 0, audioCtxRef.current.currentTime, 0.03);
      } else {
        filter.gain.value = prefs.eqBands[idx] || 0;
      }
    });
  }, [prefs.eqBands]);

  // Sync volume & mute
  useEffect(() => {
    const effectiveVol = isMuted ? 0 : prefs.volume;
    if (masterGainRef.current && audioCtxRef.current) {
      masterGainRef.current.gain.setTargetAtTime(effectiveVol, audioCtxRef.current.currentTime, 0.03);
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.volume = effectiveVol;
      remoteAudioRef.current.muted = isMuted;
    }
    if (localAudioRef.current) {
      localAudioRef.current.muted = isMuted;
    }
  }, [prefs.volume, isMuted]);

  // Sync playback rate
  useEffect(() => {
    if (localAudioRef.current) localAudioRef.current.playbackRate = prefs.playbackRate;
    if (remoteAudioRef.current) remoteAudioRef.current.playbackRate = prefs.playbackRate;
  }, [prefs.playbackRate]);

  const stopAllEngines = useCallback((preserveIntent = false) => {
    intentionalPauseRef.current = true;
    suppressPauseUntilRef.current = performance.now() + 450;
    if (!preserveIntent) {
      wantPlayingRef.current = false;
    }
    clearPlaybackTimers();
    if (localAudioRef.current) localAudioRef.current.pause();
    if (remoteAudioRef.current) remoteAudioRef.current.pause();
  }, [clearPlaybackTimers]);

  const isSameOriginTrack = useCallback((track: Track | null) => {
    if (!track) return false;
    return (
      track.source === 'local' ||
      track.source === 'lan' ||
      track.url.startsWith('/api/streams/') ||
      track.url.startsWith('/api/hdd/') ||
      track.url.includes('/api/streams/') ||
      track.url.includes('/api/hdd/')
    );
  }, []);

  const seekAudioWhenReady = useCallback((el: HTMLAudioElement, startAtSec: number) => {
    if (!startAtSec || !isFinite(startAtSec) || startAtSec <= 0) return;
    const applySeek = () => {
      try {
        const maxSafe =
          isFinite(el.duration) && el.duration > 1 ? Math.max(0, el.duration - 0.5) : startAtSec;
        el.currentTime = Math.min(startAtSec, maxSafe);
      } catch {
        // ignore seek before ready
      }
    };
    if (el.readyState >= 1) {
      applySeek();
    } else {
      el.addEventListener('loadedmetadata', applySeek, { once: true });
    }
  }, []);

  const appendCacheBust = useCallback((url: string): string => {
    if (!url || url.startsWith('blob:') || url.startsWith('data:')) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}_r=${Date.now()}`;
  }, []);

  const cacheStreamAudioInBackground = useCallback(
    async (track: Track, sourceUrl: string, scope: string) => {
      if (track.source !== 'stream' || track.streamKind === 'url' || !sourceUrl) return;
      if ((track.sizeBytes || 0) > 45 * 1024 * 1024) return;
      const inflightKey = `${scope}::${track.id}`;
      if (inflightStreamAudioIdsRef.current.has(inflightKey)) return;
      inflightStreamAudioIdsRef.current.add(inflightKey);
      try {
        const existing = await getCachedStreamAudioBlob(track, scope);
        if (existing) return;
        const res = await fetch(sourceUrl);
        if (!res.ok) return;
        const blob = await res.blob();
        if (blob.size > 0 && blob.size <= 45 * 1024 * 1024) {
          await saveCachedStreamAudioBlob(track, scope, blob);
        }
      } catch {
        // non-fatal background cache
      } finally {
        inflightStreamAudioIdsRef.current.delete(inflightKey);
      }
    },
    []
  );

  const tryFetchBlobAndPlay = useCallback(
    async (
      sourceUrl: string,
      track: Track,
      el: HTMLAudioElement,
      startAtSec: number,
      reqId: number
    ): Promise<{ ok: boolean; errorHint?: string }> => {
      const scope = getServerBaseUrl() || 'origin';
      let blob: Blob | undefined =
        remoteBlobCacheRef.current.get(track.id) ?? inMemoryBlobMapRef.current.get(track.id);

      if (!blob && track.source === 'stream' && track.streamKind !== 'url') {
        const idbBlob = await getCachedStreamAudioBlob(track, scope);
        if (playRequestIdRef.current !== reqId) return { ok: false };
        if (idbBlob) {
          blob = idbBlob;
          cacheRemoteBlob(track.id, idbBlob);
        }
      }

      const findLocalMatch = () =>
        localTracksRef.current.find(
          (t) =>
            t.publishedStreamId === track.id ||
            (t.title.toLowerCase() === track.title.toLowerCase() &&
              (t.sizeBytes || 0) > 0 &&
              (t.sizeBytes || 0) === (track.sizeBytes || 0))
        );

      if (!blob && sourceUrl) {
        try {
          const res = await fetch(sourceUrl);
          if (playRequestIdRef.current !== reqId) return { ok: false };
          if (res.ok) {
            const fetched = await res.blob();
            if (playRequestIdRef.current !== reqId) return { ok: false };
            if (fetched.size > 0) {
              blob = fetched;
              cacheRemoteBlob(track.id, fetched);
              if (track.source === 'stream' && track.streamKind !== 'url') {
                void saveCachedStreamAudioBlob(track, scope, fetched);
              }
            }
          } else if (res.status === 404) {
            void refreshServerStreams();
            const localCopy = findLocalMatch();
            if (localCopy) {
              const localBlob =
                inMemoryBlobMapRef.current.get(localCopy.id) || (await getLocalBlobFromDb(localCopy.id));
              if (playRequestIdRef.current !== reqId) return { ok: false };
              if (localBlob) blob = localBlob;
            }
            if (!blob) {
              return {
                ok: false,
                errorHint: `ไม่พบไฟล์เสียง "${track.title}" บนเซิร์ฟเวอร์ (404) — ให้ Admin กดซิงค์เพลงใหม่ หรือเปิดผ่านโหมด Local Network`,
              };
            }
          }
        } catch {
          const localCopy = findLocalMatch();
          if (localCopy) {
            const localBlob =
              inMemoryBlobMapRef.current.get(localCopy.id) || (await getLocalBlobFromDb(localCopy.id));
            if (playRequestIdRef.current !== reqId) return { ok: false };
            if (localBlob) blob = localBlob;
          }
          if (
            !blob &&
            typeof window !== 'undefined' &&
            window.location.protocol === 'https:' &&
            sourceUrl.startsWith('http://')
          ) {
            return {
              ok: false,
              errorHint:
                'เบราว์เซอร์บล็อกเสียง HTTP จากหน้าเว็บ HTTPS (Mixed Content) — แนะนำให้ใช้โหมดแชร์วง LAN P2P หรือแอพ Android',
            };
          }
        }
      }

      if (!blob) {
        const localCopy = findLocalMatch();
        if (localCopy) {
          const localBlob =
            inMemoryBlobMapRef.current.get(localCopy.id) || (await getLocalBlobFromDb(localCopy.id));
          if (playRequestIdRef.current !== reqId) return { ok: false };
          if (localBlob) blob = localBlob;
        }
      }

      if (!blob) return { ok: false };

      const blobUrl = URL.createObjectURL(blob);
      registerTempPlaybackUrl(blobUrl);
      activeEngineRef.current = 'local';
      if (remoteAudioRef.current && remoteAudioRef.current.getAttribute('src')) {
        remoteAudioRef.current.pause();
        remoteAudioRef.current.removeAttribute('src');
        remoteAudioRef.current.load();
      }

      el.removeAttribute('crossorigin');
      el.src = blobUrl;
      el.playbackRate = prefs.playbackRate;
      el.load();
      seekAudioWhenReady(el, startAtSec);

      try {
        await el.play();
        if (playRequestIdRef.current !== reqId) return { ok: false };
        setIsPlaying(true);
        setIsBuffering(false);
        return { ok: true };
      } catch {
        if (playRequestIdRef.current !== reqId) return { ok: false };
        const wavUrl = await decodeBlobToWavUrl(blob);
        if (playRequestIdRef.current !== reqId) return { ok: false };
        if (wavUrl) {
          registerTempPlaybackUrl(wavUrl);
          el.removeAttribute('crossorigin');
          el.src = wavUrl;
          el.playbackRate = prefs.playbackRate;
          el.load();
          seekAudioWhenReady(el, startAtSec);
          try {
            await el.play();
            if (playRequestIdRef.current !== reqId) return { ok: false };
            setIsPlaying(true);
            setIsBuffering(false);
            showStatus(`ถอดรหัสเสียง ${track.format} ผ่านโหมดความเข้ากันได้สูงสำเร็จ`);
            return { ok: true };
          } catch {
            // fall through
          }
        }
      }
      return { ok: false };
    },
    [cacheRemoteBlob, prefs.playbackRate, refreshServerStreams, registerTempPlaybackUrl, seekAudioWhenReady, showStatus]
  );

  const playTrackLocally = useCallback(
    async (
      track: Track,
      startAtSec = 0,
      options?: { forceRemoteEngine?: boolean; cacheBust?: boolean; resetRetry?: boolean }
    ) => {
      const reqId = ++playRequestIdRef.current;
      handlingPlayFallbackRef.current = reqId;
      if (options?.resetRetry !== false) {
        playbackRetryCountRef.current = 0;
      }

      setPlaybackError('');
      setCurrentTrack(track);
      currentTrackRef.current = track;
      setCurrentTime(startAtSec);
      lastPlaybackTimeRef.current = startAtSec;
      setDuration(track.durationSec || 0);

      updatePrefs((prev) => ({
        ...prev,
        recentIds: [track.id, ...prev.recentIds.filter((id) => id !== track.id)].slice(0, 30),
      }));

      stopAllEngines(true);
      wantPlayingRef.current = true;
      intentionalPauseRef.current = false;
      suppressPauseUntilRef.current = performance.now() + 450;

      const resolvedServerUrl =
        track.source === 'stream'
          ? resolveTrackPlayableUrl(
              track.streamKind === 'url' ? track.url : track.streamUrl || track.url
            )
          : track.url;

      const scope = getServerBaseUrl() || 'origin';
      let cachedStreamBlob: Blob | null = null;
      if (track.source === 'stream' && track.streamKind !== 'url') {
        const memStreamBlob =
          remoteBlobCacheRef.current.get(track.id) ??
          inMemoryBlobMapRef.current.get(track.id) ??
          null;
        cachedStreamBlob =
          memStreamBlob || (await getCachedStreamAudioBlob(track, scope));
        if (playRequestIdRef.current !== reqId) return;
        if (cachedStreamBlob) {
          cacheRemoteBlob(track.id, cachedStreamBlob);
        }
      }

      const useLocalEngine =
        !options?.forceRemoteEngine &&
        (Boolean(cachedStreamBlob) || isSameOriginTrack(track));

      if (useLocalEngine) {
        activeEngineRef.current = 'local';
        if (remoteAudioRef.current && remoteAudioRef.current.getAttribute('src')) {
          remoteAudioRef.current.removeAttribute('src');
          remoteAudioRef.current.load();
        }
        await resumeAudioContextBounded();
        if (playRequestIdRef.current !== reqId) return;

        const el = localAudioRef.current;
        if (!el) return;
        setIsBuffering(true);

        // Always rebuild blob URL from in-memory, IndexedDB, or LAN P2P if missing
        let playableUrl = resolvedServerUrl;
        const memBlob =
          cachedStreamBlob ??
          remoteBlobCacheRef.current.get(track.id) ??
          inMemoryBlobMapRef.current.get(track.id);

        if (cachedStreamBlob && track.source === 'stream') {
          playableUrl = URL.createObjectURL(cachedStreamBlob);
          registerTempPlaybackUrl(playableUrl);
        }

        if (track.source === 'lan') {
          if (memBlob) {
            if (playableUrl && playableUrl.startsWith('blob:')) {
              registerTempPlaybackUrl(playableUrl);
            } else {
              playableUrl = URL.createObjectURL(memBlob);
              registerTempPlaybackUrl(playableUrl);
            }
          } else if (track.lanHostDeviceId && lanP2pRef.current) {
            try {
              showStatus(`กำลังรับเสียง "${track.title}" จาก ${track.lanHostDeviceName || 'LAN'}...`);
              const lanBlob = await lanP2pRef.current.fetchTrackBlob(
                track.lanHostDeviceId,
                track.lanOriginalTrackId || track.id,
                (received, total) => {
                  if (playRequestIdRef.current !== reqId) return;
                  if (total > 0) {
                    const pct = Math.min(100, Math.round((received / total) * 100));
                    showStatus(`รับเสียง "${track.title}" ผ่าน LAN (${pct}%)`);
                  }
                }
              );
              if (playRequestIdRef.current !== reqId) return;
              cacheRemoteBlob(track.id, lanBlob);
              if (!track.coverDataUrl && !lanCoverCacheRef.current[track.id]) {
                void extractCoverFromAudioBlob(lanBlob, 512).then((cover) => {
                  if (cover) {
                    setLanCoverCache((prev) =>
                      prev[track.id] ? prev : { ...prev, [track.id]: cover }
                    );
                  }
                });
              }
              playableUrl = URL.createObjectURL(lanBlob);
              registerTempPlaybackUrl(playableUrl);
              setCurrentTrack((prev) =>
                prev && prev.id === track.id ? { ...prev, url: playableUrl } : prev
              );
            } catch (lanErr) {
              if (playRequestIdRef.current !== reqId) return;
              handlingPlayFallbackRef.current = 0;
              wantPlayingRef.current = false;
              setIsPlaying(false);
              setIsBuffering(false);
              setPlaybackError(
                lanErr instanceof Error
                  ? lanErr.message
                  : `ไม่สามารถรับเสียง "${track.title}" ผ่าน Local Network ได้`
              );
              return;
            }
          }
        } else if (track.source === 'local' && (!playableUrl || !playableUrl.startsWith('blob:'))) {
          const resolvedBlob = memBlob || (await getLocalBlobFromDb(track.id));
          if (playRequestIdRef.current !== reqId) return;
          if (resolvedBlob) {
            inMemoryBlobMapRef.current.set(track.id, resolvedBlob);
            playableUrl = URL.createObjectURL(resolvedBlob);
            setLocalTracks((prev) =>
              prev.map((t) => (t.id === track.id ? { ...t, url: playableUrl } : t))
            );
            setCurrentTrack((prev) =>
              prev && prev.id === track.id ? { ...prev, url: playableUrl } : prev
            );
          }
        } else if (options?.cacheBust && playableUrl) {
          playableUrl = appendCacheBust(playableUrl);
        }

        if (!playableUrl) {
          handlingPlayFallbackRef.current = 0;
          wantPlayingRef.current = false;
          setIsPlaying(false);
          setIsBuffering(false);
          setPlaybackError(
            track.source === 'lan'
              ? `ยังไม่ได้เชื่อมต่อโฮสต์ "${track.lanHostDeviceName || 'LAN'}" เพื่อโหลด "${track.title}"`
              : `ยังไม่ได้เชื่อมต่อไฟล์ "${track.title}" หลังรีเฟรช — กดปุ่มซิงค์โฟลเดอร์ HDD ด้านบนเพื่อเชื่อมต่อต่อทันที`
          );
          return;
        }

        if (playableUrl.startsWith('blob:') || playableUrl.startsWith('data:')) {
          el.removeAttribute('crossorigin');
        } else {
          el.crossOrigin = 'anonymous';
        }

        el.src = playableUrl;
        el.load();
        el.playbackRate = prefs.playbackRate;
        seekAudioWhenReady(el, startAtSec);

        try {
          await el.play();
          if (playRequestIdRef.current !== reqId) return;
          handlingPlayFallbackRef.current = 0;
          setIsPlaying(true);
          setIsBuffering(false);
          if (track.source === 'stream' && track.streamKind !== 'url' && !cachedStreamBlob) {
            void cacheStreamAudioInBackground(track, resolvedServerUrl, scope);
          }
        } catch (playErr) {
          if (playRequestIdRef.current !== reqId) return;
          const errName = playErr instanceof DOMException ? playErr.name : '';

          if (errName === 'AbortError') {
            handlingPlayFallbackRef.current = 0;
            setIsBuffering(false);
            return;
          }

          if (errName === 'NotAllowedError') {
            handlingPlayFallbackRef.current = 0;
            wantPlayingRef.current = false;
            setIsPlaying(false);
            setIsBuffering(false);
            showStatus(`พร้อมเล่น "${track.title}" — กดปุ่ม Play เพื่อเริ่มฟัง`);
            return;
          }

          if (track.source === 'local' || track.source === 'lan' || cachedStreamBlob) {
            const storedBlob =
              cachedStreamBlob ||
              remoteBlobCacheRef.current.get(track.id) ||
              inMemoryBlobMapRef.current.get(track.id) ||
              (track.source === 'local' ? await getLocalBlobFromDb(track.id) : null);
            if (playRequestIdRef.current !== reqId) return;

            if (storedBlob) {
              if (track.source === 'local') {
                inMemoryBlobMapRef.current.set(track.id, storedBlob);
              } else {
                cacheRemoteBlob(track.id, storedBlob);
              }
              const freshBlobUrl = URL.createObjectURL(storedBlob);
              if (track.source === 'lan') {
                registerTempPlaybackUrl(freshBlobUrl);
              }
              el.removeAttribute('crossorigin');
              el.src = freshBlobUrl;
              el.load();
              seekAudioWhenReady(el, startAtSec);
              try {
                await el.play();
                if (playRequestIdRef.current !== reqId) return;
                handlingPlayFallbackRef.current = 0;
                if (track.source === 'local') {
                  setLocalTracks((prev) =>
                    prev.map((t) => (t.id === track.id ? { ...t, url: freshBlobUrl } : t))
                  );
                }
                setCurrentTrack((prev) =>
                  prev && prev.id === track.id ? { ...prev, url: freshBlobUrl } : prev
                );
                setIsPlaying(true);
                setIsBuffering(false);
                return;
              } catch {
                // Continue to PCM WAV fallback
              }

              const wavUrl = await decodeBlobToWavUrl(storedBlob);
              if (playRequestIdRef.current !== reqId) return;
              if (wavUrl) {
                registerTempPlaybackUrl(wavUrl);
                el.removeAttribute('crossorigin');
                el.src = wavUrl;
                el.load();
                seekAudioWhenReady(el, startAtSec);
                try {
                  await el.play();
                  if (playRequestIdRef.current !== reqId) return;
                  handlingPlayFallbackRef.current = 0;
                  setIsPlaying(true);
                  setIsBuffering(false);
                  showStatus(`แปลงไฟล์ ${track.format} ผ่านตัวถอดรหัส PCM สำเร็จ`);
                  return;
                } catch {
                  // fall through
                }
              }
            }
          } else {
            // Stream track fallback 1: try remoteAudioRef (no CORS / WebAudio restrictions)
            if (remoteAudioRef.current) {
              activeEngineRef.current = 'remote';
              suppressPauseUntilRef.current = performance.now() + 450;
              el.pause();
              el.removeAttribute('src');
              el.load();

              const fallbackEl = remoteAudioRef.current;
              fallbackEl.src = options?.cacheBust
                ? appendCacheBust(resolvedServerUrl)
                : resolvedServerUrl;
              fallbackEl.volume = isMuted ? 0 : prefs.volume;
              fallbackEl.muted = isMuted;
              fallbackEl.playbackRate = prefs.playbackRate;
              fallbackEl.load();
              seekAudioWhenReady(fallbackEl, startAtSec);
              try {
                await fallbackEl.play();
                if (playRequestIdRef.current !== reqId) return;
                handlingPlayFallbackRef.current = 0;
                setIsPlaying(true);
                setIsBuffering(false);
                return;
              } catch {
                // Continue to Blob / PCM / local-copy fallback
              }
            }

            // Stream track fallback 2: fetch Blob directly -> ObjectURL -> PCM WAV / local copy
            const blobFallback = await tryFetchBlobAndPlay(
              resolvedServerUrl,
              track,
              el,
              startAtSec,
              reqId
            );
            if (playRequestIdRef.current !== reqId) return;
            if (blobFallback.ok) {
              handlingPlayFallbackRef.current = 0;
              return;
            }
            if (blobFallback.errorHint) {
              handlingPlayFallbackRef.current = 0;
              wantPlayingRef.current = false;
              setIsPlaying(false);
              setIsBuffering(false);
              setPlaybackError(blobFallback.errorHint);
              return;
            }
          }

          handlingPlayFallbackRef.current = 0;
          wantPlayingRef.current = false;
          setIsPlaying(false);
          setIsBuffering(false);
          setPlaybackError(
            track.source === 'local'
              ? `ไม่สามารถเปิดไฟล์ ${track.format} นี้ได้ กรุณากดซิงค์โฟลเดอร์ใหม่อีกครั้ง`
              : track.source === 'lan'
              ? `ไม่สามารถเล่นไฟล์ ${track.format} จาก Local Network ได้`
              : `ไม่สามารถโหลดเสียง "${track.title}" จากเซิร์ฟเวอร์ได้`
          );
        }
        return;
      }

      // Remote / Cross-Origin / Direct Stream Element
      activeEngineRef.current = 'remote';
      if (localAudioRef.current && localAudioRef.current.getAttribute('src')) {
        localAudioRef.current.removeAttribute('src');
        localAudioRef.current.load();
      }
      const remoteEl = remoteAudioRef.current;
      if (!remoteEl) return;
      setIsBuffering(true);
      remoteEl.src = options?.cacheBust ? appendCacheBust(resolvedServerUrl) : resolvedServerUrl;
      remoteEl.volume = isMuted ? 0 : prefs.volume;
      remoteEl.muted = isMuted;
      remoteEl.playbackRate = prefs.playbackRate;
      remoteEl.load();
      seekAudioWhenReady(remoteEl, startAtSec);
      try {
        await remoteEl.play();
        if (playRequestIdRef.current !== reqId) return;
        handlingPlayFallbackRef.current = 0;
        setIsPlaying(true);
        setIsBuffering(false);
        if (track.source === 'stream' && track.streamKind !== 'url' && !cachedStreamBlob) {
          void cacheStreamAudioInBackground(track, resolvedServerUrl, scope);
        }
      } catch (err) {
        if (playRequestIdRef.current !== reqId) return;
        const errName = err instanceof DOMException ? err.name : '';
        if (errName === 'AbortError') {
          handlingPlayFallbackRef.current = 0;
          setIsBuffering(false);
          return;
        }
        if (errName === 'NotAllowedError') {
          handlingPlayFallbackRef.current = 0;
          wantPlayingRef.current = false;
          setIsPlaying(false);
          setIsBuffering(false);
          showStatus(`พร้อมเล่น "${track.title}" — กดปุ่ม Play เพื่อเริ่มฟัง`);
          return;
        }

        if (track.source === 'stream' && localAudioRef.current) {
          const blobFallback = await tryFetchBlobAndPlay(
            resolvedServerUrl,
            track,
            localAudioRef.current,
            startAtSec,
            reqId
          );
          if (playRequestIdRef.current !== reqId) return;
          if (blobFallback.ok) {
            handlingPlayFallbackRef.current = 0;
            return;
          }
          if (blobFallback.errorHint) {
            handlingPlayFallbackRef.current = 0;
            wantPlayingRef.current = false;
            setIsPlaying(false);
            setIsBuffering(false);
            setPlaybackError(blobFallback.errorHint);
            return;
          }
        }

        handlingPlayFallbackRef.current = 0;
        wantPlayingRef.current = false;
        setIsPlaying(false);
        setIsBuffering(false);
        setPlaybackError(
          track.source === 'stream' && track.streamKind !== 'url'
            ? `ไม่สามารถโหลดเสียง "${track.title}" จากเซิร์ฟเวอร์ได้`
            : 'ไม่สามารถเชื่อมต่อสตรีมจากลิงก์นี้ได้'
        );
      }
    },
    [
      appendCacheBust,
      cacheRemoteBlob,
      cacheStreamAudioInBackground,
      isMuted,
      isSameOriginTrack,
      prefs.playbackRate,
      prefs.volume,
      registerTempPlaybackUrl,
      resumeAudioContextBounded,
      seekAudioWhenReady,
      showStatus,
      stopAllEngines,
      tryFetchBlobAndPlay,
      updatePrefs,
    ]
  );

  // Automatic recovery when active audio stream drops or stalls mid-playback
  useEffect(() => {
    attemptRecoveryRef.current = (reason: 'error' | 'stalled') => {
      const track = currentTrackRef.current;
      if (!track || activeCastTargetRef.current || intentionalPauseRef.current || !wantPlayingRef.current) {
        return;
      }

      const el = getActiveAudioElement();
      if (el?.ended) return;

      const attempt = playbackRetryCountRef.current + 1;
      if (attempt > 3) {
        // Fallback: if a server stream dropped, try playing its local cached copy seamlessly
        if (track.source === 'stream') {
          const localCopy = localTracksRef.current.find(
            (t) =>
              t.publishedStreamId === track.id ||
              (t.title.toLowerCase() === track.title.toLowerCase() &&
                (t.sizeBytes || 0) === (track.sizeBytes || 0))
          );
          if (localCopy) {
            const resumePos = Math.max(lastPlaybackTimeRef.current || 0, el?.currentTime || 0);
            playbackRetryCountRef.current = 0;
            void playTrackLocally(localCopy, resumePos, { resetRetry: true });
            return;
          }
        }

        wantPlayingRef.current = false;
        setIsBuffering(false);
        setIsPlaying(false);
        setPlaybackError(
          reason === 'stalled'
            ? `การเชื่อมต่อเสียง "${track.title}" ขาดหาย — กด Play เพื่อเชื่อมต่อใหม่`
            : track.source === 'local'
            ? `ไฟล์เสียง "${track.title}" หลุดการเชื่อมต่อ กรุณากดเล่นอีกครั้ง`
            : `ไม่สามารถโหลดเสียง "${track.title}" จากเซิร์ฟเวอร์ได้ — กด Play เพื่อลองใหม่`
        );
        return;
      }

      playbackRetryCountRef.current = attempt;
      const resumePos = Math.max(lastPlaybackTimeRef.current || 0, el?.currentTime || 0);
      const reqSnapshot = playRequestIdRef.current;

      setIsBuffering(true);
      showStatus(`กำลังเชื่อมต่อเสียง "${track.title}" ใหม่อัตโนมัติ (${attempt}/3)...`);

      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
      }
      retryTimerRef.current = window.setTimeout(() => {
        retryTimerRef.current = null;
        if (
          playRequestIdRef.current !== reqSnapshot ||
          intentionalPauseRef.current ||
          !wantPlayingRef.current
        ) {
          return;
        }
        const useFallbackRemote =
          track.source === 'stream' &&
          (activeEngineRef.current === 'remote' || attempt >= 2 || reason === 'error');
        void playTrackLocally(track, resumePos, {
          forceRemoteEngine: useFallbackRemote,
          cacheBust: track.source === 'stream',
          resetRetry: false,
        });
      }, 650 * attempt);
    };
  }, [getActiveAudioElement, playTrackLocally, showStatus]);

  const ensureShareableTrackForCast = useCallback(
    async (track: Track): Promise<Track> => {
      if (track.source !== 'local') return track;
      if (track.publishedStreamId) {
        const matched = serverStreams.find((s) => s.id === track.publishedStreamId);
        if (matched) return matched;
      }
      if (!isAdmin) {
        throw new Error(
          'ไฟล์ในเครื่องนี้ยังไม่ได้แชร์ขึ้นคลังสตรีมกลาง — กรุณาเลือกเพลงจากสตรีมออนไลน์/HDD โฮสต์ หรือเข้าสู่ระบบ Admin เพื่อแคสต์ไฟล์นี้ไปเครื่องอื่น'
        );
      }
      let blob: Blob | null | undefined = await getLocalBlobFromDb(track.id);
      if (!blob) {
        blob = await fetch(track.url).then((r) => r.blob());
      }
      if (!blob) {
        throw new Error('ไม่สามารถอ่านไฟล์เสียงเพื่อแคสต์ได้');
      }
      const fname = `${track.title}.${track.format.toLowerCase()}`;
      const published = await publishTrackToServerStream(track, blob, fname);
      setLocalTracks((prev) =>
        prev.map((t) => (t.id === track.id ? { ...t, publishedStreamId: published.id } : t))
      );
      await refreshServerStreams();
      return published;
    },
    [isAdmin, refreshServerStreams, serverStreams]
  );

  const castTrackToTarget = useCallback(
    async (targetDevice: ConnectedCastDevice, track: Track, positionSec = 0) => {
      setCastingBusyId(targetDevice.deviceId);
      try {
        const shareableTrack = await ensureShareableTrackForCast(track);
        stopAllEngines();
        await sendCastCommand({
          targetDeviceId: targetDevice.deviceId,
          fromDeviceId: deviceIdentity.deviceId,
          fromDeviceName: deviceIdentity.deviceName,
          action: 'play',
          track: shareableTrack,
          positionSec,
        });
        setActiveCastTarget(targetDevice);
        setCurrentTrack(shareableTrack);
        setIsPlaying(true);
        showStatus(`กำลังแคสต์ "${shareableTrack.title}" ไปที่ ${targetDevice.deviceName}`);
      } finally {
        setCastingBusyId(null);
      }
    },
    [deviceIdentity.deviceId, deviceIdentity.deviceName, ensureShareableTrackForCast, showStatus, stopAllEngines]
  );

  const playTrack = useCallback(
    async (track: Track) => {
      if (activeCastTarget) {
        try {
          await castTrackToTarget(activeCastTarget, track, 0);
          return;
        } catch (err) {
          showStatus(err instanceof Error ? err.message : 'ไม่สามารถแคสต์ไปยังอุปกรณ์ปลายทางได้');
          setActiveCastTarget(null);
        }
      }
      await playTrackLocally(track, 0);
    },
    [activeCastTarget, castTrackToTarget, playTrackLocally, showStatus]
  );

  const handleCastToDevice = useCallback(
    async (targetDevice: ConnectedCastDevice) => {
      const candidate = currentTrack || displayedTracks[0] || allTracks[0];
      if (!candidate) {
        throw new Error('กรุณาเลือกหรือเพิ่มเพลงก่อนทำการแคสต์ไปยังอุปกรณ์อื่น');
      }
      const resumePos = currentTrack?.id === candidate.id ? currentTime : 0;
      await castTrackToTarget(targetDevice, candidate, resumePos);
      setCastModalOpen(false);
    },
    [allTracks, castTrackToTarget, currentTime, currentTrack, displayedTracks]
  );

  const handleRemoteCastAction = useCallback(
    async (action: 'pause' | 'resume' | 'stop') => {
      if (!activeCastTarget) return;
      try {
        await sendCastCommand({
          targetDeviceId: activeCastTarget.deviceId,
          fromDeviceId: deviceIdentity.deviceId,
          fromDeviceName: deviceIdentity.deviceName,
          action,
        });
      } catch {
        // ignore if target went offline
      }
      if (action === 'stop') {
        const targetName = activeCastTarget.deviceName;
        setActiveCastTarget(null);
        setIsPlaying(false);
        showStatus(`หยุดแคสต์ไปยัง ${targetName} แล้ว`);
      } else if (action === 'pause') {
        setIsPlaying(false);
      } else if (action === 'resume') {
        setIsPlaying(true);
      }
    },
    [activeCastTarget, deviceIdentity.deviceId, deviceIdentity.deviceName, showStatus]
  );

  // Sync incoming remote Cast commands
  useEffect(() => {
    castCommandHandlerRef.current = (command: CastCommandPayload) => {
      if (command.action === 'play' && command.track) {
        setActiveCastTarget(null);
        showStatus(`รับสัญญาณแคสต์จาก "${command.fromDeviceName}": กำลังเล่น "${command.track.title}"`);
        void playTrackLocally(command.track, command.positionSec || 0);
        return;
      }
      const activeEl = getActiveAudioElement();
      if (command.action === 'pause') {
        intentionalPauseRef.current = true;
        activeEl?.pause();
        setIsPlaying(false);
        showStatus(`อุปกรณ์ "${command.fromDeviceName}" พักการเล่นชั่วคราว`);
      } else if (command.action === 'resume') {
        intentionalPauseRef.current = false;
        activeEl?.play().then(() => setIsPlaying(true)).catch(() => {});
      } else if (command.action === 'seek' && typeof command.positionSec === 'number') {
        if (activeEl && isFinite(activeEl.duration)) {
          activeEl.currentTime = command.positionSec;
          lastPlaybackTimeRef.current = command.positionSec;
          setCurrentTime(command.positionSec);
        }
      } else if (command.action === 'stop') {
        stopAllEngines();
        setIsPlaying(false);
        showStatus(`"${command.fromDeviceName}" หยุดการแคสต์แล้ว`);
      }
    };
  }, [getActiveAudioElement, playTrackLocally, showStatus, stopAllEngines]);

  // Publish this device's presence & playback state to server (debounced so internal URL updates don't spam SSE)
  const currentTrackId = currentTrack?.id ?? null;
  const currentTrackTitle = currentTrack?.title ?? null;
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void updateDevicePresence({
        deviceId: deviceIdentity.deviceId,
        deviceName: deviceIdentity.deviceName,
        deviceType: deviceIdentity.deviceType,
        isAdmin,
        currentTrackTitle,
        isPlaying,
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [currentTrackId, currentTrackTitle, deviceIdentity, isAdmin, isPlaying]);

  // Native Browser Remote Playback (Chromecast / AirPlay) & Audio Output Routing
  const refreshAudioOutputs = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) return;
    const md = navigator.mediaDevices as MediaDevices & {
      selectAudioOutput?: (opts?: { deviceId?: string }) => Promise<MediaDeviceInfo>;
    };
    setCanSelectAudioOutput(typeof md.selectAudioOutput === 'function');
    try {
      const list = await md.enumerateDevices();
      const outputs = list
        .filter((d) => d.kind === 'audiooutput' && d.deviceId)
        .map((d, index) => ({
          deviceId: d.deviceId,
          label: d.label || (d.deviceId === 'default' ? 'ลำโพงเริ่มต้นของระบบ' : `อุปกรณ์เสียง ${index + 1}`),
        }));
      setAudioOutputs(outputs);
    } catch {
      // ignore permission/iframe error
    }
  }, []);

  useEffect(() => {
    const localEl = localAudioRef.current as (HTMLAudioElement & {
      remote?: {
        state: 'connecting' | 'connected' | 'disconnected';
        prompt: () => Promise<void>;
        addEventListener?: (type: string, cb: () => void) => void;
        removeEventListener?: (type: string, cb: () => void) => void;
      };
      webkitShowPlaybackTargetPicker?: () => void;
    }) | null;

    if (!localEl) return;
    const hasRemote = Boolean(localEl.remote?.prompt || localEl.webkitShowPlaybackTargetPicker);
    setNativeCastSupported(hasRemote);

    const remoteObj = localEl.remote;
    if (!remoteObj?.addEventListener) return;
    const syncStateFromRemote = () => {
      setNativeCastState(remoteObj.state || 'disconnected');
    };
    syncStateFromRemote();
    remoteObj.addEventListener('connecting', syncStateFromRemote);
    remoteObj.addEventListener('connect', syncStateFromRemote);
    remoteObj.addEventListener('disconnect', syncStateFromRemote);
    return () => {
      remoteObj.removeEventListener?.('connecting', syncStateFromRemote);
      remoteObj.removeEventListener?.('connect', syncStateFromRemote);
      remoteObj.removeEventListener?.('disconnect', syncStateFromRemote);
    };
  }, []);

  const handleTriggerNativeCast = useCallback(async () => {
    const activeEl = getActiveAudioElement() as (HTMLAudioElement & {
      remote?: { prompt: () => Promise<void> };
      webkitShowPlaybackTargetPicker?: () => void;
    }) | null;

    if (!activeEl) {
      throw new Error('ยังไม่พบตัวเล่นเสียง');
    }
    if (activeEl.remote && typeof activeEl.remote.prompt === 'function') {
      await activeEl.remote.prompt();
      return;
    }
    if (typeof activeEl.webkitShowPlaybackTargetPicker === 'function') {
      activeEl.webkitShowPlaybackTargetPicker();
      return;
    }
    throw new Error(
      'เบราว์เซอร์นี้ไม่รองรับหน้าต่าง Cast ไร้สายโดยตรง — สามารถใช้วิธีเปิด Aura Audio บนอุปกรณ์ปลายทางแล้วแคสต์ผ่านรายการด้านบนได้ทันที'
    );
  }, [getActiveAudioElement]);

  const handleApplySinkId = useCallback(
    async (sinkId: string) => {
      const applyTo = async (el: HTMLAudioElement | null) => {
        if (!el) return;
        const sinkEl = el as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
        if (typeof sinkEl.setSinkId === 'function') {
          await sinkEl.setSinkId(sinkId);
        }
      };
      await Promise.all([applyTo(localAudioRef.current), applyTo(remoteAudioRef.current)]);
      setSelectedSinkId(sinkId);
      const picked = audioOutputs.find((o) => o.deviceId === sinkId);
      showStatus(`สลับเสียงออกไปยัง "${picked?.label || 'อุปกรณ์ที่เลือก'}" แล้ว`);
    },
    [audioOutputs, showStatus]
  );

  const handleSelectAudioOutputPrompt = useCallback(async () => {
    const md = navigator.mediaDevices as (MediaDevices & {
      selectAudioOutput?: (opts?: { deviceId?: string }) => Promise<MediaDeviceInfo>;
    }) | undefined;
    if (!md?.selectAudioOutput) {
      await refreshAudioOutputs();
      return;
    }
    const chosen = await md.selectAudioOutput();
    await refreshAudioOutputs();
    if (chosen?.deviceId) {
      await handleApplySinkId(chosen.deviceId);
    }
  }, [handleApplySinkId, refreshAudioOutputs]);

  const handleRenameMyDevice = useCallback(
    async (newName: string) => {
      const cleanName = saveLocalDeviceName(newName);
      setDeviceIdentity((prev) => ({ ...prev, deviceName: cleanName }));
      await updateDevicePresence({
        deviceId: deviceIdentity.deviceId,
        deviceName: cleanName,
        deviceType: deviceIdentity.deviceType,
        isAdmin,
      });
    },
    [deviceIdentity.deviceId, deviceIdentity.deviceType, isAdmin]
  );

  const togglePlayPause = useCallback(async () => {
    if (activeCastTarget) {
      await handleRemoteCastAction(isPlaying ? 'pause' : 'resume');
      return;
    }

    if (!currentTrack) {
      if (displayedTracks.length > 0) {
        await playTrack(displayedTracks[0]);
      }
      return;
    }

    const usesLocalEl = activeEngineRef.current === 'local';
    const activeEl = getActiveAudioElement();
    if (!activeEl) return;

    if (!activeEl.src || activeEl.error || activeEl.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) {
      await playTrackLocally(currentTrack, lastPlaybackTimeRef.current || 0);
      return;
    }

    if (activeEl.paused) {
      wantPlayingRef.current = true;
      intentionalPauseRef.current = false;
      if (usesLocalEl) await resumeAudioContextBounded();
      try {
        await activeEl.play();
        setIsPlaying(true);
        setPlaybackError('');
      } catch {
        // Reload track cleanly from last position if cached audio element failed
        await playTrackLocally(currentTrack, activeEl.currentTime || lastPlaybackTimeRef.current || 0);
      }
    } else {
      wantPlayingRef.current = false;
      intentionalPauseRef.current = true;
      suppressPauseUntilRef.current = performance.now() + 450;
      clearPlaybackTimers();
      activeEl.pause();
      setIsPlaying(false);
    }
  }, [
    activeCastTarget,
    clearPlaybackTimers,
    currentTrack,
    displayedTracks,
    getActiveAudioElement,
    handleRemoteCastAction,
    isPlaying,
    playTrack,
    playTrackLocally,
    resumeAudioContextBounded,
  ]);

  const activeQueue = displayedTracks.length > 0 ? displayedTracks : allTracks;

  const playNext = useCallback(() => {
    if (activeQueue.length === 0) return;
    if (isShuffle && activeQueue.length > 1) {
      const candidates = activeQueue.filter((t) => t.id !== currentTrack?.id);
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      if (pick) void playTrack(pick);
      return;
    }
    const idx = activeQueue.findIndex((t) => t.id === currentTrack?.id);
    const nextIdx = idx === -1 ? 0 : (idx + 1) % activeQueue.length;
    void playTrack(activeQueue[nextIdx]);
  }, [activeQueue, currentTrack?.id, isShuffle, playTrack]);

  const playPrev = useCallback(() => {
    if (activeQueue.length === 0) return;
    const activeEl = getActiveAudioElement();
    if (!activeCastTarget && activeEl && activeEl.currentTime > 3) {
      activeEl.currentTime = 0;
      lastPlaybackTimeRef.current = 0;
      return;
    }
    const idx = activeQueue.findIndex((t) => t.id === currentTrack?.id);
    const prevIdx = idx <= 0 ? activeQueue.length - 1 : idx - 1;
    void playTrack(activeQueue[prevIdx]);
  }, [activeCastTarget, activeQueue, currentTrack?.id, getActiveAudioElement, playTrack]);

  const handleTrackEnded = useCallback(() => {
    clearPlaybackTimers();
    if (repeatMode === 'one' && currentTrack) {
      const activeEl = getActiveAudioElement();
      if (activeEl) {
        activeEl.currentTime = 0;
        lastPlaybackTimeRef.current = 0;
        activeEl.play().catch(() => {});
        return;
      }
    }
    if (repeatMode === 'off') {
      const idx = activeQueue.findIndex((t) => t.id === currentTrack?.id);
      if (idx === activeQueue.length - 1 && !isShuffle) {
        wantPlayingRef.current = false;
        setIsPlaying(false);
        return;
      }
    }
    playNext();
  }, [activeQueue, clearPlaybackTimers, currentTrack, getActiveAudioElement, isShuffle, playNext, repeatMode]);

  const handleSeek = useCallback((newTime: number) => {
    if (!currentTrack) return;
    lastPlaybackTimeRef.current = newTime;
    if (activeCastTarget) {
      setCurrentTime(newTime);
      void sendCastCommand({
        targetDeviceId: activeCastTarget.deviceId,
        fromDeviceId: deviceIdentity.deviceId,
        fromDeviceName: deviceIdentity.deviceName,
        action: 'seek',
        positionSec: newTime,
      }).catch(() => {});
      return;
    }
    const activeEl = getActiveAudioElement();
    if (activeEl && isFinite(activeEl.duration)) {
      activeEl.currentTime = newTime;
      setCurrentTime(newTime);
    }
  }, [activeCastTarget, currentTrack, deviceIdentity.deviceId, deviceIdentity.deviceName, getActiveAudioElement]);

  // Register MediaSession metadata & transport controls to prevent background playback drops on Android/mobile
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    if (currentTrack && typeof MediaMetadata !== 'undefined') {
      let artwork: MediaImage[] | undefined;
      if (currentTrack.coverDataUrl) {
        let artSrc = currentTrack.coverDataUrl;
        if (artSrc.startsWith('/')) {
          try {
            artSrc = new URL(artSrc, window.location.origin).href;
          } catch {
            // keep relative
          }
        }
        artwork = [{ src: artSrc, sizes: '512x512', type: 'image/jpeg' }];
      }
      ms.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: currentTrack.album || 'Aura Audio',
        ...(artwork ? { artwork } : {}),
      });
    }
    ms.playbackState = isPlaying ? 'playing' : 'paused';
  }, [currentTrack, isPlaying]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const safeSet = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        // ignore unsupported media action
      }
    };
    safeSet('play', () => {
      if (!isPlayingRef.current) void togglePlayPause();
    });
    safeSet('pause', () => {
      if (isPlayingRef.current) void togglePlayPause();
    });
    safeSet('previoustrack', () => playPrev());
    safeSet('nexttrack', () => playNext());
    safeSet('seekto', (details) => {
      if (typeof details.seekTime === 'number' && isFinite(details.seekTime)) {
        handleSeek(details.seekTime);
      }
    });
    return () => {
      safeSet('play', null);
      safeSet('pause', null);
      safeSet('previoustrack', null);
      safeSet('nexttrack', null);
      safeSet('seekto', null);
    };
  }, [handleSeek, playNext, playPrev, togglePlayPause]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && albumShowcaseOpen) {
        setAlbumShowcaseOpen(false);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setSidebarCollapsed((prev) => !prev);
        return;
      }
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
      ) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlayPause();
      } else if (e.code === 'ArrowRight') {
        handleSeek(Math.min(duration || 0, currentTime + 5));
      } else if (e.code === 'ArrowLeft') {
        handleSeek(Math.max(0, currentTime - 5));
      } else if (e.key.toLowerCase() === 'm') {
        setIsMuted((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [albumShowcaseOpen, currentTime, duration, handleSeek, togglePlayPause]);

  // --- File & Folder Direct HDD Sync (Zero Server Upload) ---
  const publishTracksSequentially = useCallback(
    async (
      items: Array<{ track: Track; blob?: Blob }>
    ) => {
      if (items.length === 0 || autoPublishingRef.current) return;
      autoPublishingRef.current = true;
      let publishedCount = 0;
      const publishedMap = new Map<string, string>();
      setAdminTask({
        state: 'working',
        message: `กำลังเปิดสตรีมออนไลน์อัตโนมัติทุกเครื่อง (0/${items.length})...`,
        updatedAt: Date.now(),
      });

      try {
        for (let i = 0; i < items.length; i++) {
          const { track, blob: initialBlob } = items[i];
          try {
            let blob: Blob | undefined | null =
              initialBlob || inMemoryBlobMapRef.current.get(track.id) || (await getLocalBlobFromDb(track.id));
            if (!blob && track.url.startsWith('blob:')) {
              blob = await fetch(track.url).then((r) => r.blob()).catch(() => null);
            }
            if (!blob || blob.size <= 0 || blob.size > 240 * 1024 * 1024) continue;

            const fname =
              blob instanceof File ? blob.name : `${track.title}.${track.format.toLowerCase()}`;
            const created = await publishTrackToServerStream(track, blob, fname);
            publishedMap.set(track.id, created.id);
            publishedCount++;
            void updateLocalTrackMetaInDb({ ...track, publishedStreamId: created.id });
          } catch {
            // skip individual publish error
          }
          setAdminTask({
            state: 'working',
            message: `กำลังเปิดสตรีมออนไลน์อัตโนมัติทุกเครื่อง (${i + 1}/${items.length})...`,
            updatedAt: Date.now(),
          });
        }

        if (publishedMap.size > 0) {
          setLocalTracks((prev) =>
            prev.map((t) =>
              publishedMap.has(t.id)
                ? { ...t, publishedStreamId: publishedMap.get(t.id) }
                : t
            )
          );
          await refreshServerStreams();
          await refreshAdminStatus();
          setAdminTask({
            state: 'done',
            message: `เปิดสตรีมออนไลน์อัตโนมัติ ${publishedCount} เพลงไปยังทุกเครื่องแล้ว`,
            updatedAt: Date.now(),
          });
          showStatus(`เปิดสตรีมออนไลน์อัตโนมัติให้ทุกเครื่อง ${publishedCount} เพลงเรียบร้อย`);
        } else {
          setAdminTask({
            state: 'idle',
            message: 'ระบบพร้อมทำงานปกติ',
            updatedAt: Date.now(),
          });
        }
      } finally {
        autoPublishingRef.current = false;
      }
    },
    [refreshAdminStatus, refreshServerStreams, showStatus]
  );

  // Auto-resume / auto-heal pending Admin online streams after refresh or container restart
  useEffect(() => {
    if (
      !authReady ||
      !isAdmin ||
      !serverStreamsLoaded ||
      prefs.autoStreamOnAdd === false ||
      autoPublishingRef.current ||
      localTracks.length === 0
    ) {
      return;
    }

    const existingServerIds = new Set(serverStreams.map((t) => t.id));
    const existingServerKeys = new Set(
      serverStreams.map((t) => `${t.title.toLowerCase()}::${t.sizeBytes || 0}`)
    );

    const pending = localTracks.filter((t) => {
      if (t.publishedStreamId && existingServerIds.has(t.publishedStreamId)) return false;
      const key = `${t.title.toLowerCase()}::${t.sizeBytes || 0}`;
      if (existingServerKeys.has(key)) return false;
      return Boolean(t.url) || inMemoryBlobMapRef.current.has(t.id);
    });

    if (pending.length > 0) {
      void publishTracksSequentially(pending.map((track) => ({ track })));
    }
  }, [
    authReady,
    isAdmin,
    localTracks,
    prefs.autoStreamOnAdd,
    publishTracksSequentially,
    serverStreams,
    serverStreamsLoaded,
  ]);

  const syncFilesIntoLibrary = useCallback(
    async (
      entries: Array<{ file: File; relativePath?: string; fileHandle?: FileSystemFileHandle }>,
      options?: {
        folderName?: string;
        folderMode?: 'handle' | 'directory-input';
        targetTab?: LibraryTab;
        silent?: boolean;
      }
    ) => {
      const audioEntries: Array<{ file: File; relativePath?: string; fileHandle?: FileSystemFileHandle }> = [];
      const playlistFiles: File[] = [];
      const folderCoverCandidates = new Map<string, { file: File; priority: number }>();

      for (const item of entries) {
        const ext = getFileExtension(item.file.name);
        if (ext === 'm3u' || ext === 'm3u8') {
          playlistFiles.push(item.file);
        } else if (isCoverImageFilename(item.file.name)) {
          const relPath =
            (
              item.relativePath ||
              ((item.file as File & { webkitRelativePath?: string }).webkitRelativePath || '').trim() ||
              item.file.name
            ).replace(/\\/g, '/');
          const lastSlash = relPath.lastIndexOf('/');
          const dirKey = lastSlash > 0 ? relPath.slice(0, lastSlash) : '__root__';
          const priority = getCoverImagePriority(item.file.name);
          const existing = folderCoverCandidates.get(dirKey);
          if (!existing || priority < existing.priority) {
            folderCoverCandidates.set(dirKey, { file: item.file, priority });
          }
        } else if (isSupportedAudioFile(item.file)) {
          audioEntries.push(item);
        }
      }

      const folderCoverDataUrls = new Map<string, string>();
      if (folderCoverCandidates.size > 0) {
        await Promise.all(
          Array.from(folderCoverCandidates.entries()).map(async ([dirKey, { file }]) => {
            const dataUrl = await extractCoverFromImageFile(file, 512);
            if (dataUrl) folderCoverDataUrls.set(dirKey, dataUrl);
          })
        );
      }

      const resolveFolderCover = (relPath: string): string | undefined => {
        const normalized = relPath.replace(/\\/g, '/');
        let cursor = normalized.lastIndexOf('/') > 0 ? normalized.slice(0, normalized.lastIndexOf('/')) : '__root__';
        while (true) {
          const hit = folderCoverDataUrls.get(cursor);
          if (hit) return hit;
          if (cursor === '__root__') break;
          const parentSlash = cursor.lastIndexOf('/');
          cursor = parentSlash > 0 ? cursor.slice(0, parentSlash) : '__root__';
        }
        return undefined;
      };

      if (playlistFiles.length > 0 && isAdmin) {
        let importedCount = 0;
        let firstImported: Track | null = null;
        for (const plFile of playlistFiles) {
          try {
            const text = await plFile.text();
            const parsed = parseM3uContent(text);
            for (const entry of parsed) {
              const created = await addSharedStreamUrl({
                title: entry.title,
                artist: `M3U · ${plFile.name}`,
                url: entry.url,
                format: 'M3U',
              });
              if (!firstImported) firstImported = created;
              importedCount++;
            }
          } catch {
            // ignore
          }
        }
        if (importedCount > 0) {
          await refreshServerStreams();
          await refreshAdminStatus();
          showStatus(`นำเข้าลิงก์สตรีม ${importedCount} รายการเข้าคลังกลางแล้ว`);
          if (firstImported && audioEntries.length === 0 && !isPlayingRef.current) {
            void playTrack(firstImported);
          }
        }
      }

      if (audioEntries.length === 0) {
        if (playlistFiles.length === 0 && !options?.silent) {
          showStatus('ไม่พบไฟล์เสียงที่รองรับในโฟลเดอร์หรือรายการที่เลือก');
        }
        return;
      }

      const inferredFolder =
        options?.folderName ||
        (() => {
          const rel = audioEntries[0]?.relativePath ||
            (audioEntries[0]?.file as File & { webkitRelativePath?: string }).webkitRelativePath ||
            '';
          return rel.includes('/') ? rel.split('/')[0] : undefined;
        })();

      if (!options?.silent) {
        setHddSyncProgress({
          label: inferredFolder ? `กำลังซิงค์โฟลเดอร์ "${inferredFolder}"` : 'กำลังซิงค์ไฟล์จาก HDD',
          processed: 0,
          total: audioEntries.length,
        });
      }

      const existingById = new Map(localTracksRef.current.map((t) => [t.id, t]));
      const existingByPathSize = new Map(
        localTracksRef.current
          .filter((t) => t.relativePath && typeof t.sizeBytes === 'number')
          .map((t) => [`${t.relativePath}::${t.sizeBytes}`, t])
      );
      const syncedTracks: Track[] = [];
      const dbQueue: LocalDbSaveItem[] = [];
      const pendingCoverBackfill: Array<{ track: Track; file: File; fallbackCover?: string }> = [];
      const fastMode = audioEntries.length > 20;
      const BATCH_SIZE = 16;

      try {
        for (let i = 0; i < audioEntries.length; i += BATCH_SIZE) {
          const batch = audioEntries.slice(i, i + BATCH_SIZE);
          const parsedBatch = await Promise.all(
            batch.map(async ({ file, relativePath, fileHandle }) => {
              try {
                const relPath =
                  relativePath ||
                  ((file as File & { webkitRelativePath?: string }).webkitRelativePath || '').trim() ||
                  file.name;
                const fallbackCover = resolveFolderCover(relPath);
                const deterministicSeed = hashStringToSeed(
                  `${ownerKey}:${relPath}:${file.size}:${file.lastModified}`
                );
                const candidateId = `local-${deterministicSeed.toString(36)}-${file.size.toString(36)}`;
                const cached =
                  existingById.get(candidateId) ||
                  existingByPathSize.get(`${relPath}::${file.size}`);

                let track: Track;
                if (cached) {
                  const syncedFolder = inferredFolder || cached.syncedFolder;
                  let coverDataUrl = cached.coverDataUrl;
                  if (!coverDataUrl && !fastMode) {
                    coverDataUrl = (await extractCoverFromAudioBlob(file, 512)) || fallbackCover;
                  }
                  track = {
                    ...cached,
                    ...(coverDataUrl ? { coverDataUrl } : {}),
                    url: cached.url && cached.url.startsWith('blob:') ? cached.url : URL.createObjectURL(file),
                    addedAt: cached.addedAt || Date.now(),
                    relativePath: relPath,
                    syncedFolder,
                    folderName:
                      cached.folderName || extractFolderNameFromRelativePath(relPath, syncedFolder),
                  };
                } else {
                  track = await extractLocalTrack(file, ownerKey, {
                    relativePath: relPath,
                    syncedFolder: inferredFolder,
                    fastMode,
                    fallbackCoverDataUrl: fallbackCover,
                  });
                }

                if (!track.coverDataUrl) {
                  pendingCoverBackfill.push({
                    track,
                    file,
                    fallbackCover,
                  });
                }

                inMemoryBlobMapRef.current.set(track.id, file);
                dbQueue.push({ track, blob: file, fileHandle });
                return track;
              } catch {
                return null;
              }
            })
          );
          for (const item of parsedBatch) {
            if (item) syncedTracks.push(item);
          }
          if (!options?.silent) {
            setHddSyncProgress({
              label: inferredFolder
                ? `กำลังซิงค์โฟลเดอร์ "${inferredFolder}"`
                : 'กำลังซิงค์ไฟล์จาก HDD',
              processed: Math.min(i + batch.length, audioEntries.length),
              total: audioEntries.length,
            });
          }
          await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
        }
      } finally {
        if (!options?.silent) {
          setHddSyncProgress(null);
        }
      }

      if (syncedTracks.length > 0) {
        const urlsToRevoke: string[] = [];
        const syncedMap = new Map(syncedTracks.map((t) => [t.id, t]));
        setLocalTracks((prev) => {
          const preserved = prev.filter((t) => {
            const replacement = syncedMap.get(t.id);
            if (!replacement) return true;
            if (t.url.startsWith('blob:') && t.url !== replacement.url) {
              urlsToRevoke.push(t.url);
            }
            return false;
          });
          return [...syncedTracks, ...preserved];
        });

        // Delay revoking replaced blob URLs and never revoke the currently active audio URL
        if (urlsToRevoke.length > 0) {
          window.setTimeout(() => {
            for (const oldUrl of urlsToRevoke) {
              if (
                localAudioRef.current?.src !== oldUrl &&
                remoteAudioRef.current?.src !== oldUrl &&
                currentTrackRef.current?.url !== oldUrl
              ) {
                URL.revokeObjectURL(oldUrl);
              }
            }
          }, 10000);
        }

        if (inferredFolder) {
          const updatedFolders = saveSyncedFolderSummary(ownerKey, {
            name: inferredFolder,
            trackCount: syncedTracks.length,
            lastSyncedAt: Date.now(),
            mode: options?.folderMode || 'directory-input',
          });
          setSyncedFolders(updatedFolders);
        }

        if (!prefs.includeHddInStream) {
          updatePrefs((prev) => ({ ...prev, includeHddInStream: true }));
        }

        // Persist metadata + fileHandles immediately before returning so refreshing never drops tracks
        await saveLocalTracksMetaFirstToDb(dbQueue);

        if (!options?.silent) {
          if (activeTab === 'admin') {
            setActiveTab('local');
          } else if (options?.targetTab && activeTab !== 'all') {
            setActiveTab(options.targetTab);
          }

          showStatus(
            inferredFolder
              ? `ซิงค์โฟลเดอร์ "${inferredFolder}" สำเร็จ ${syncedTracks.length} เพลง — บันทึกคลังเรียบร้อย`
              : `เพิ่มเพลงจาก HDD ${syncedTracks.length} เพลง — บันทึกคลังเรียบร้อย`
          );

          // Only auto-start playback if nothing is currently playing so we don't cut off an active song
          if (!currentTrackRef.current || (!isPlayingRef.current && !wantPlayingRef.current)) {
            void playTrack(syncedTracks[0]);
          }
        }

        // Persist audio blobs asynchronously in background
        void saveLocalTracksBatchToDb(dbQueue);

        // Extract remaining album covers in background when syncing large batches (> 20 tracks)
        if (pendingCoverBackfill.length > 0) {
          void (async () => {
            for (let i = 0; i < pendingCoverBackfill.length; i += 4) {
              const chunk = pendingCoverBackfill.slice(i, i + 4);
              const coverMap = new Map<string, string>();
              await Promise.all(
                chunk.map(async ({ track, file, fallbackCover }) => {
                  const coverDataUrl =
                    (await extractCoverFromAudioBlob(file, 512)) || fallbackCover;
                  if (coverDataUrl) {
                    coverMap.set(track.id, coverDataUrl);
                    await updateLocalTrackMetaInDb({ ...track, coverDataUrl });
                  }
                })
              );
              if (coverMap.size > 0) {
                setLocalTracks((prev) =>
                  prev.map((t) => {
                    const cov = coverMap.get(t.id);
                    return cov && !t.coverDataUrl ? { ...t, coverDataUrl: cov } : t;
                  })
                );
              }
              await new Promise<void>((resolve) => window.setTimeout(resolve, 16));
            }
          })();
        }

        // If Admin & autoStreamOnAdd enabled, auto-publish new tracks sequentially
        const shouldAutoPublish = isAdmin && prefs.autoStreamOnAdd !== false;
        if (shouldAutoPublish) {
          const existingServerIds = new Set(serverStreamsRef.current.map((t) => t.id));
          const existingServerKeys = new Set(
            serverStreamsRef.current.map((t) => `${t.title.toLowerCase()}::${t.sizeBytes || 0}`)
          );
          const MAX_AUTO_PUBLISH_BYTES = 240 * 1024 * 1024;
          const toPublish = dbQueue.filter(({ track, blob }) => {
            if (blob.size <= 0 || blob.size > MAX_AUTO_PUBLISH_BYTES) return false;
            if (track.publishedStreamId && existingServerIds.has(track.publishedStreamId)) return false;
            const key = `${track.title.toLowerCase()}::${track.sizeBytes || 0}`;
            return !existingServerKeys.has(key);
          });

          if (toPublish.length > 0) {
            void publishTracksSequentially(toPublish.map(({ track, blob }) => ({ track, blob })));
          }
        }
      }
    },
    [
      activeTab,
      isAdmin,
      ownerKey,
      playTrack,
      prefs.autoStreamOnAdd,
      prefs.includeHddInStream,
      publishTracksSequentially,
      refreshAdminStatus,
      refreshServerStreams,
      showStatus,
      updatePrefs,
    ]
  );

  const processIncomingFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      const items = files.map((file) => ({
        file,
        relativePath:
          ((file as File & { webkitRelativePath?: string }).webkitRelativePath || '').trim() ||
          file.name,
      }));
      await syncFilesIntoLibrary(items, {
        folderMode: 'directory-input',
        targetTab: activeTab === 'stream' ? 'stream' : 'local',
      });
    },
    [activeTab, syncFilesIntoLibrary]
  );

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (files.length > 0) {
      void processIncomingFiles(files);
    }
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingFiles(false);
    const items = await collectFilesFromDataTransfer(e.dataTransfer);
    if (items.length === 0) {
      showStatus('ไม่พบไฟล์เสียงในรายการที่ลากมาวาง');
      return;
    }
    await syncFilesIntoLibrary(items, {
      folderMode: 'directory-input',
      targetTab: activeTab === 'stream' ? 'stream' : 'local',
    });
  };

  const collectAudioFilesFromDirHandle = useCallback(
    async (
      dirHandle: FileSystemDirectoryHandle,
      maxFiles = 2000
    ): Promise<Array<{ file: File; relativePath: string; fileHandle: FileSystemFileHandle }>> => {
      const pendingHandles: Array<{ handle: FileSystemFileHandle; relativePath: string }> = [];
      const walk = async (handle: FileSystemDirectoryHandle, prefix: string) => {
        if (pendingHandles.length >= maxFiles) return;
        const iterable = handle as unknown as {
          values(): AsyncIterableIterator<FileSystemHandle>;
        };
        for await (const entry of iterable.values()) {
          if (pendingHandles.length >= maxFiles) break;
          if (entry.name.startsWith('.')) continue;
          const entryPath = `${prefix}/${entry.name}`;
          if (entry.kind === 'file') {
            if (isSupportedAudioFilename(entry.name) || isCoverImageFilename(entry.name)) {
              pendingHandles.push({
                handle: entry as FileSystemFileHandle,
                relativePath: entryPath,
              });
            }
          } else if (
            entry.kind === 'directory' &&
            entry.name !== 'node_modules' &&
            entry.name !== '$RECYCLE.BIN' &&
            entry.name !== 'System Volume Information'
          ) {
            await walk(entry as FileSystemDirectoryHandle, entryPath);
          }
        }
      };

      await walk(dirHandle, dirHandle.name);

      const files: Array<{ file: File; relativePath: string; fileHandle: FileSystemFileHandle }> = [];
      const GET_FILE_BATCH = 24;
      for (let i = 0; i < pendingHandles.length; i += GET_FILE_BATCH) {
        const chunk = pendingHandles.slice(i, i + GET_FILE_BATCH);
        const resolved = await Promise.all(
          chunk.map(async ({ handle, relativePath }) => {
            try {
              return {
                file: await handle.getFile(),
                relativePath,
                fileHandle: handle,
              };
            } catch {
              return null;
            }
          })
        );
        for (const item of resolved) {
          if (item) files.push(item);
        }
      }
      return files;
    },
    []
  );

  // Auto-hydrate local tracks from granted HDD directory handles after page refresh
  useEffect(() => {
    if (!authReady || savedHddHandles.length === 0) return;
    let cancelled = false;
    const autoHydrate = async () => {
      for (const rec of savedHddHandles) {
        if (cancelled || autoReconnectedIdsRef.current.has(rec.id)) continue;
        try {
          const handleWithPerm = rec.handle as unknown as {
            queryPermission?: (opts: { mode: 'read' }) => Promise<PermissionState>;
          };
          const perm = handleWithPerm.queryPermission
            ? await handleWithPerm.queryPermission({ mode: 'read' })
            : 'granted';
          if (perm === 'granted') {
            autoReconnectedIdsRef.current.add(rec.id);
            const entries = await collectAudioFilesFromDirHandle(rec.handle);
            if (!cancelled && entries.length > 0) {
              await syncFilesIntoLibrary(entries, {
                folderName: rec.name,
                folderMode: 'handle',
                silent: true,
              });
            }
          }
        } catch {
          // ignore auto-hydrate error until user interacts
        }
      }
    };
    void autoHydrate();
    return () => {
      cancelled = true;
    };
  }, [authReady, collectAudioFilesFromDirHandle, savedHddHandles, syncFilesIntoLibrary]);

  const handlePickBrowserHddFolder = useCallback(() => {
    let inIframe = false;
    try {
      inIframe = window.self !== window.top;
    } catch {
      inIframe = true;
    }

    const picker = (window as unknown as {
      showDirectoryPicker?: (opts?: { mode?: 'read' }) => Promise<FileSystemDirectoryHandle>;
    }).showDirectoryPicker;

    // Inside iframes (or browsers without File System Access API), invoke <input webkitdirectory>
    // synchronously so the browser user-gesture token does not expire before opening the picker.
    if (inIframe || !picker) {
      folderInputRef.current?.click();
      return;
    }

    picker({ mode: 'read' })
      .then(async (dirHandle) => {
        const saved = await saveHddHandleToDb(ownerKey, dirHandle);
        if (saved) {
          setSavedHddHandles((prev) => [saved, ...prev.filter((h) => h.id !== saved.id)]);
        }
        const entries = await collectAudioFilesFromDirHandle(dirHandle);
        await syncFilesIntoLibrary(entries, {
          folderName: dirHandle.name,
          folderMode: 'handle',
          targetTab: activeTab === 'stream' ? 'stream' : 'local',
        });
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (err instanceof DOMException && err.name === 'SecurityError') {
          folderInputRef.current?.click();
          return;
        }
        showStatus(
          'ไม่สามารถเปิดหน้าต่างเลือกโฟลเดอร์ได้ — กรุณากด "เลือกไฟล์จาก HDD เครื่องนี้" หรือวางโฟลเดอร์ลงในหน้าจอ'
        );
      });
  }, [activeTab, collectAudioFilesFromDirHandle, ownerKey, showStatus, syncFilesIntoLibrary]);

  const handleReconnectHddHandle = useCallback(
    async (record: StoredHddHandleRecord) => {
      try {
        const handleWithPerm = record.handle as unknown as {
          queryPermission?: (opts: { mode: 'read' }) => Promise<PermissionState>;
          requestPermission?: (opts: { mode: 'read' }) => Promise<PermissionState>;
        };
        let state: PermissionState = 'granted';
        if (handleWithPerm.queryPermission) {
          state = await handleWithPerm.queryPermission({ mode: 'read' });
        }
        if (state !== 'granted' && handleWithPerm.requestPermission) {
          state = await handleWithPerm.requestPermission({ mode: 'read' });
        }
        if (state !== 'granted') {
          throw new Error(`ไม่ได้รับสิทธิ์เข้าถึงโฟลเดอร์ "${record.name}"`);
        }
        const entries = await collectAudioFilesFromDirHandle(record.handle);
        await syncFilesIntoLibrary(entries, {
          folderName: record.name,
          folderMode: 'handle',
          targetTab: activeTab === 'stream' ? 'stream' : 'local',
        });
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : `ไม่สามารถอ่านโฟลเดอร์ "${record.name}" ได้ กรุณากดซิงค์โฟลเดอร์ใหม่อีกครั้ง`;
        showStatus(msg);
        throw new Error(msg);
      }
    },
    [activeTab, collectAudioFilesFromDirHandle, showStatus, syncFilesIntoLibrary]
  );

  const handleRemoveHddHandle = useCallback(async (id: string) => {
    await deleteHddHandleFromDb(id);
    setSavedHddHandles((prev) => prev.filter((h) => h.id !== id));
  }, []);

  const handleRemoveSyncedFolder = useCallback(
    (id: string) => {
      const next = removeSyncedFolderSummary(ownerKey, id);
      setSyncedFolders(next);
    },
    [ownerKey]
  );

  const handleRescanHostHdd = useCallback(async () => {
    setAdminTask({
      state: 'working',
      message: 'กำลังรีสแกนไฟล์ล่าสุดจากโฟลเดอร์ HDD...',
      updatedAt: Date.now(),
    });
    try {
      const res = await rescanAllHostHddFolders();
      await refreshServerStreams();
      await refreshAdminStatus();
      const msg =
        res.folders > 0
          ? `รีสแกน ${res.folders} โฟลเดอร์บน HDD แล้ว พบ ${res.totalTracks} เพลง`
          : 'ยังไม่ได้เชื่อมต่อโฟลเดอร์ HDD โฮสต์ — กดเลือกโฟลเดอร์บน HDD เพื่อเริ่มต้น';
      setAdminTask({ state: 'done', message: msg, updatedAt: Date.now() });
      showStatus(msg);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'รีสแกน HDD ไม่สำเร็จ';
      setAdminTask({ state: 'error', message: msg, updatedAt: Date.now() });
      showStatus(msg);
      throw err;
    }
  }, [refreshAdminStatus, refreshServerStreams, showStatus]);

  const handleCopyStreamLink = useCallback(
    async (track: Track) => {
      const rawUrl = resolveTrackPlayableUrl(
        track.streamUrl || `/api/hdd/audio/${encodeURIComponent(track.id)}`
      );
      const baseOrigin = getServerBaseUrl() || window.location.origin;
      const fullUrl = rawUrl.startsWith('http') ? rawUrl : `${baseOrigin}${rawUrl}`;
      try {
        await navigator.clipboard.writeText(fullUrl);
        showStatus(`คัดลอกลิงก์สตรีม "${track.title}" แล้ว`);
      } catch {
        showStatus(`ลิงก์สตรีม: ${fullUrl}`);
      }
    },
    [showStatus]
  );

  // --- Track Management Actions ---
  const handleToggleFavorite = (trackId: string) => {
    updatePrefs((prev) => {
      const exists = prev.favorites.includes(trackId);
      const nextFavs = exists
        ? prev.favorites.filter((id) => id !== trackId)
        : [trackId, ...prev.favorites];
      return { ...prev, favorites: nextFavs };
    });
  };

  const handleRemoveTrack = async (track: Track) => {
    try {
      if (track.source === 'local') {
        if (currentTrack?.id === track.id) {
          stopAllEngines();
          setIsPlaying(false);
          setCurrentTrack(null);
        }
        if (track.url.startsWith('blob:')) URL.revokeObjectURL(track.url);
        inMemoryBlobMapRef.current.delete(track.id);
        remoteBlobCacheRef.current.delete(track.id);
        await deleteLocalTrackFromDb(track.id);
        setLocalTracks((prev) => prev.filter((t) => t.id !== track.id));
        showStatus(`ลบไฟล์ "${track.title}" ออกจากเครื่องนี้แล้ว`);
      } else if (track.isSharedStream) {
        if (!isAdmin) {
          setAuthModalOpen(true);
          return;
        }
        setAdminTask({
          state: 'working',
          message: `กำลังลบ "${track.title}" ออกจากคลังกลาง...`,
          updatedAt: Date.now(),
        });
        await deleteServerStream(track.id);
        remoteBlobCacheRef.current.delete(track.id);
        if (currentTrack?.id === track.id) {
          stopAllEngines();
          setIsPlaying(false);
          setCurrentTrack(null);
        }
        await refreshServerStreams();
        await refreshAdminStatus();
        setAdminTask({
          state: 'done',
          message: `ลบ "${track.title}" เรียบร้อยแล้ว`,
          updatedAt: Date.now(),
        });
        showStatus(`ลบ "${track.title}" ออกจากคลังสตรีมกลางแล้ว`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ลบเพลงไม่สำเร็จ';
      setAdminTask({ state: 'error', message: msg, updatedAt: Date.now() });
      showStatus(msg);
    }
  };

  const handleAddStream = async (payload: {
    title: string;
    artist: string;
    genre?: string;
    url: string;
    format: string;
  }) => {
    setAdminTask({
      state: 'working',
      message: `กำลังเพิ่มลิงก์สตรีม "${payload.title}"...`,
      updatedAt: Date.now(),
    });
    try {
      const newStream = await addSharedStreamUrl(payload);
      await refreshServerStreams();
      await refreshAdminStatus();
      if (activeTab !== 'admin') setActiveTab('stream');
      setAdminTask({
        state: 'done',
        message: `เพิ่ม "${newStream.title}" เข้าคลังกลางสำเร็จ`,
        updatedAt: Date.now(),
      });
      showStatus(`เพิ่ม "${newStream.title}" เข้าคลังสตรีมกลางแล้ว`);
      playTrack(newStream);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'เพิ่มลิงก์สตรีมไม่สำเร็จ';
      setAdminTask({ state: 'error', message: msg, updatedAt: Date.now() });
      throw err;
    }
  };

  const handleSaveEditedTrack = async (
    id: string,
    payload: {
      title: string;
      artist: string;
      album: string;
      genre: string;
      folderName: string;
      format: string;
    }
  ) => {
    setAdminTask({
      state: 'working',
      message: `กำลังบันทึกข้อมูล "${payload.title}"...`,
      updatedAt: Date.now(),
    });
    try {
      await updateSharedStreamMeta(id, payload);
      await refreshServerStreams();
      await refreshAdminStatus();
      setAdminTask({
        state: 'done',
        message: `บันทึก "${payload.title}" และซิงค์ทุกเครื่องแล้ว`,
        updatedAt: Date.now(),
      });
      showStatus(`บันทึกการแก้ไข "${payload.title}" แล้ว (อัปเดตทุกเครื่อง)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'แก้ไขข้อมูลไม่สำเร็จ';
      setAdminTask({ state: 'error', message: msg, updatedAt: Date.now() });
      throw err;
    }
  };

  const handleMoveServerTrack = async (trackId: string, direction: 'up' | 'down') => {
    const idx = serverStreams.findIndex((t) => t.id === trackId);
    if (idx === -1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= serverStreams.length) return;

    const copy = [...serverStreams];
    const temp = copy[idx];
    copy[idx] = copy[swapIdx];
    copy[swapIdx] = temp;

    setServerStreams(copy);
    setAdminTask({
      state: 'working',
      message: 'กำลังอัปเดตลำดับเพลงคลังกลาง...',
      updatedAt: Date.now(),
    });
    try {
      await reorderSharedStreams(copy.map((t) => t.id));
      await refreshAdminStatus();
      setAdminTask({
        state: 'done',
        message: 'จัดลำดับเพลงและซิงค์ทุกเครื่องแล้ว',
        updatedAt: Date.now(),
      });
      showStatus('อัปเดตลำดับเพลงสำหรับทุกเครื่องแล้ว');
    } catch (err) {
      await refreshServerStreams();
      const msg = err instanceof Error ? err.message : 'จัดลำดับเพลงไม่สำเร็จ';
      setAdminTask({ state: 'error', message: msg, updatedAt: Date.now() });
      showStatus(msg);
    }
  };

  // --- Playlists ---
  const handleCreatePlaylist = (name: string) => {
    const pl: Playlist = {
      id: `pl-${Date.now()}`,
      name,
      trackIds: [],
      createdAt: Date.now(),
      ownerId: ownerKey,
    };
    updatePrefs((prev) => ({ ...prev, playlists: [...prev.playlists, pl] }));
    setActiveTab(`playlist:${pl.id}`);
    showStatus(`สร้างเพลย์ลิสต์ "${name}" แล้ว`);
  };

  const handleToggleTrackInPlaylist = (playlistId: string, trackId: string) => {
    updatePrefs((prev) => ({
      ...prev,
      playlists: prev.playlists.map((pl) => {
        if (pl.id !== playlistId) return pl;
        const exists = pl.trackIds.includes(trackId);
        return {
          ...pl,
          trackIds: exists ? pl.trackIds.filter((id) => id !== trackId) : [...pl.trackIds, trackId],
        };
      }),
    }));
    setPlaylistMenuTrackId(null);
  };

  const handleDeletePlaylist = (playlistId: string) => {
    updatePrefs((prev) => ({
      ...prev,
      playlists: prev.playlists.filter((p) => p.id !== playlistId),
    }));
    if (activeTab === `playlist:${playlistId}`) {
      setActiveTab('all');
    }
    showStatus('ลบเพลย์ลิสต์แล้ว');
  };

  // --- Server Auth Handlers ---
  const handleSignIn = async (identifier: string, password: string): Promise<string | null> => {
    try {
      const { user } = await apiLogin(identifier, password);
      setCurrentUser(user);
      showStatus(
        user.role === 'admin'
          ? `เข้าสู่ระบบ Admin (${user.username}) สำเร็จ`
          : `ยินดีต้อนรับ ${user.username}`
      );
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'เข้าสู่ระบบไม่สำเร็จ';
    }
  };

  const handleSignUp = async (
    username: string,
    email: string,
    password: string
  ): Promise<string | null> => {
    try {
      const { user } = await apiRegister(username, email, password);
      setCurrentUser(user);
      showStatus(`สร้างบัญชี "${user.username}" และเข้าสู่ระบบแล้ว`);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'สมัครสมาชิกไม่สำเร็จ';
    }
  };

  const handleSignOut = async () => {
    await apiLogout();
    setCurrentUser(null);
    showStatus('ออกจากระบบแล้ว (ใช้งานโหมดผู้เยี่ยมชม)');
  };

  const handleClearLocalFiles = async () => {
    for (const t of localTracks) {
      if (t.url.startsWith('blob:')) URL.revokeObjectURL(t.url);
    }
    inMemoryBlobMapRef.current.clear();
    remoteBlobCacheRef.current.clear();
    await clearLocalTracksFromDb(ownerKey);
    clearSyncedFolderSummaries(ownerKey);
    setLocalTracks([]);
    setSyncedFolders([]);
    if (currentTrack?.source === 'local') {
      stopAllEngines();
      setIsPlaying(false);
      setCurrentTrack(null);
    }
    showStatus('ล้างไฟล์เพลงในเครื่องนี้เรียบร้อยแล้ว');
  };

  const handleConfirmResetData = async (includeServer: boolean) => {
    stopAllEngines();
    setIsPlaying(false);
    setIsBuffering(false);
    setPlaybackError('');
    setCurrentTrack(null);
    setCurrentTime(0);
    setDuration(0);

    for (const t of localTracks) {
      if (t.url.startsWith('blob:')) URL.revokeObjectURL(t.url);
    }
    inMemoryBlobMapRef.current.clear();
    remoteBlobCacheRef.current.clear();

    await Promise.all([clearLocalTracksFromDb(ownerKey), clearHddHandlesFromDb(ownerKey)]);
    clearSyncedFolderSummaries(ownerKey);
    setLocalTracks([]);
    setSavedHddHandles([]);
    setSyncedFolders([]);

    const freshPrefs = createDefaultPreferences();
    setPrefs(freshPrefs);
    saveUserPreferences(ownerKey, freshPrefs);
    if (currentUser) {
      await apiSaveUserPrefs(freshPrefs);
    }

    if (includeServer && isAdmin) {
      setAdminTask({
        state: 'working',
        message: 'กำลังรีเซ็ตข้อมูลคลังสตรีมออนไลน์ส่วนกลาง...',
        updatedAt: Date.now(),
      });
      await apiResetServerData();
      const scope = getServerBaseUrl() || 'origin';
      serverCatalogVersionRef.current = '';
      serverCoverCacheMapRef.current.clear();
      clearCachedServerLibrary(scope);
      await clearCachedStreamMedia(scope);
      await Promise.all([refreshServerStreams(true), refreshAdminStatus()]);
      setAdminTask({
        state: 'done',
        message: 'รีเซ็ตข้อมูลคลังกลางและโฟลเดอร์ HDD โฮสต์ทั้งหมดแล้ว',
        updatedAt: Date.now(),
      });
    }

    setSearchQuery('');
    setFormatFilter('all');
    setGroupBy('none');
    setSelectedGroupKey('ALL');
    if (activeTab.startsWith('playlist:')) {
      setActiveTab('all');
    }
    showStatus(
      includeServer
        ? 'รีเซ็ตข้อมูลในเครื่องและคลังสตรีมออนไลน์ทั้งหมดเรียบร้อยแล้ว'
        : 'รีเซ็ตข้อมูลในเครื่องนี้เรียบร้อยแล้ว'
    );
  };

  // --- Local Network (LAN P2P) Manager & Handlers ---
  useEffect(() => {
    isSharingLanRef.current = isSharingLan;
  }, [isSharingLan]);

  useEffect(() => {
    const manager = new LanP2PManager({
      getIdentity: () => deviceIdentityRef.current,
      resolveLocalBlob: async (trackId) => {
        const mem = inMemoryBlobMapRef.current.get(trackId);
        if (mem) return mem;

        const dbBlob = await getLocalBlobFromDb(trackId);
        if (dbBlob) {
          inMemoryBlobMapRef.current.set(trackId, dbBlob);
          return dbBlob;
        }

        const localMatch = localTracksRef.current.find((t) => t.id === trackId);
        if (localMatch?.url && localMatch.url.startsWith('blob:')) {
          try {
            const fetched = await fetch(localMatch.url).then((r) => (r.ok ? r.blob() : null));
            if (fetched) {
              inMemoryBlobMapRef.current.set(trackId, fetched);
              return fetched;
            }
          } catch {
            // ignore stale blob
          }
        }

        const serverMatch = serverStreamsRef.current.find((t) => t.id === trackId);
        if (serverMatch) {
          const url = resolveTrackPlayableUrl(serverMatch.streamUrl || serverMatch.url);
          if (url) {
            try {
              const fetched = await fetch(url).then((r) => (r.ok ? r.blob() : null));
              if (fetched) {
                inMemoryBlobMapRef.current.set(trackId, fetched);
                return fetched;
              }
            } catch {
              // ignore fetch failure
            }
          }
        }

        return null;
      },
      resolveLocalCover: async (trackId) => {
        const localMatch = localTracksRef.current.find((t) => t.id === trackId);
        if (localMatch?.coverDataUrl?.startsWith('data:image/')) {
          return localMatch.coverDataUrl;
        }
        const blob =
          inMemoryBlobMapRef.current.get(trackId) || (await getLocalBlobFromDb(trackId));
        if (blob) {
          const extracted = await extractCoverFromAudioBlob(blob, 512);
          if (extracted) {
            if (localMatch) {
              const updatedTrack = { ...localMatch, coverDataUrl: extracted };
              setLocalTracks((prev) =>
                prev.map((t) => (t.id === trackId && !t.coverDataUrl ? updatedTrack : t))
              );
              void updateLocalTrackMetaInDb(updatedTrack);
            }
            return extracted;
          }
        }
        const serverMatch = serverStreamsRef.current.find((t) => t.id === trackId);
        if (serverMatch?.coverDataUrl) {
          if (serverMatch.coverDataUrl.startsWith('data:image/')) {
            return serverMatch.coverDataUrl;
          }
          try {
            const res = await fetch(serverMatch.coverDataUrl);
            if (res.ok) {
              const imgBlob = await res.blob();
              const dataUrl = await resizeImageBlobToDataUrl(imgBlob, 512);
              if (dataUrl) return dataUrl;
            }
          } catch {
            // ignore
          }
        }
        return null;
      },
      onPeerCountChange: (count) => {
        setLanPeerCount(count);
      },
    });

    lanP2pRef.current = manager;
    lanSignalHandlerRef.current = (signal) => {
      void manager.handleSignal(signal);
    };

    return () => {
      manager.closeAll();
      lanP2pRef.current = null;
      if (isSharingLanRef.current) {
        void unregisterLanHost(deviceIdentityRef.current.deviceId);
      }
    };
  }, []);

  const buildLanSharedMetadata = useCallback((): LanSharedTrackMeta[] => {
    let inlineCoverBudget = 600 * 1024;
    let inlineCoverCount = 0;
    return localTracksRef.current.map((t) => {
      const hasCover = Boolean(t.coverDataUrl);
      let inlineCover: string | undefined;
      if (
        t.coverDataUrl &&
        t.coverDataUrl.startsWith('data:image/') &&
        inlineCoverCount < 20 &&
        t.coverDataUrl.length < inlineCoverBudget
      ) {
        inlineCover = t.coverDataUrl;
        inlineCoverBudget -= t.coverDataUrl.length;
        inlineCoverCount++;
      }
      return {
        id: t.id,
        title: t.title,
        artist: t.artist,
        album: t.album,
        genre: t.genre,
        folderName: t.folderName || t.syncedFolder,
        format: t.format,
        formatDetail: t.formatDetail,
        isLossless: t.isLossless,
        durationSec: t.durationSec,
        durationLabel: t.durationLabel,
        ...(inlineCover ? { coverDataUrl: inlineCover } : {}),
        ...(hasCover ? { hasCover: true } : {}),
        coverSeed: t.coverSeed,
        addedAt: t.addedAt,
        sizeBytes: t.sizeBytes,
        sampleRate: t.sampleRate,
        bitrate: t.bitrate,
      };
    });
  }, []);

  // Keep shared LAN track list synced when local tracks or device identity changes
  useEffect(() => {
    if (!isSharingLan) return;
    const timer = window.setTimeout(() => {
      void registerLanHost({
        deviceId: deviceIdentity.deviceId,
        deviceName: deviceIdentity.deviceName,
        deviceType: deviceIdentity.deviceType,
        tracks: buildLanSharedMetadata(),
      })
        .then((hosts) => setLanHosts(hosts))
        .catch(() => {});
    }, 250);
    return () => window.clearTimeout(timer);
  }, [buildLanSharedMetadata, deviceIdentity, isSharingLan, localTracks]);

  // Keep LAN host alive with 20s heartbeat + automatic re-register on SSE reconnect or tab resume
  useEffect(() => {
    if (!isSharingLan) return;

    const sendHeartbeatOrReregister = async () => {
      const ok = await heartbeatLanHost(deviceIdentityRef.current.deviceId);
      if (!ok && isSharingLanRef.current) {
        try {
          const hosts = await registerLanHost({
            deviceId: deviceIdentityRef.current.deviceId,
            deviceName: deviceIdentityRef.current.deviceName,
            deviceType: deviceIdentityRef.current.deviceType,
            tracks: buildLanSharedMetadata(),
          });
          setLanHosts(hosts);
        } catch {
          // retry on next interval
        }
      }
    };

    if (syncState === 'connected') {
      void sendHeartbeatOrReregister();
    }

    const interval = window.setInterval(() => {
      void sendHeartbeatOrReregister();
    }, 20000);

    const handleVisible = () => {
      if (document.visibilityState === 'visible') {
        void sendHeartbeatOrReregister();
        void fetchLanHosts().then((hosts) => setLanHosts(hosts));
      }
    };
    document.addEventListener('visibilitychange', handleVisible);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisible);
    };
  }, [buildLanSharedMetadata, isSharingLan, syncState]);

  const handleToggleShareLan = useCallback(async () => {
    setSharingLanBusy(true);
    try {
      if (isSharingLan) {
        const hosts = await unregisterLanHost(deviceIdentity.deviceId);
        setLanHosts(hosts);
        setIsSharingLan(false);
        showStatus('หยุดแชร์เพลงในวง Local Network แล้ว');
      } else {
        const meta = buildLanSharedMetadata();
        if (meta.length === 0) {
          throw new Error('กรุณาเพิ่มไฟล์หรือซิงค์โฟลเดอร์เพลงในเครื่องก่อนเปิดแชร์ในวง LAN');
        }
        const hosts = await registerLanHost({
          deviceId: deviceIdentity.deviceId,
          deviceName: deviceIdentity.deviceName,
          deviceType: deviceIdentity.deviceType,
          tracks: meta,
        });
        setLanHosts(hosts);
        setIsSharingLan(true);
        showStatus(`เปิดแชร์ ${meta.length} เพลงในวง Local Network (ไม่อัปโหลดขึ้นเซิร์ฟเวอร์) แล้ว`);
      }
    } finally {
      setSharingLanBusy(false);
    }
  }, [buildLanSharedMetadata, deviceIdentity, isSharingLan, showStatus]);

  const handleRefreshLanHosts = useCallback(async () => {
    const hosts = await fetchLanHosts();
    setLanHosts(hosts);
  }, []);

  const handleConnectLanHost = useCallback(
    async (host: LanHostInfo) => {
      setConnectingLanHostId(host.deviceId);
      try {
        if (lanP2pRef.current) {
          await lanP2pRef.current.connectToHost(host.deviceId);
        }
        desiredLanHostIdsRef.current.add(host.deviceId);
        lanHostMissingSinceRef.current.delete(host.deviceId);
        setConnectedLanHostIds((prev) =>
          prev.includes(host.deviceId) ? prev : [...prev, host.deviceId]
        );
        setActiveTab('lan');
        setLanModalOpen(false);
        showStatus(`เชื่อมต่อวง LAN กับ "${host.deviceName}" (${host.trackCount} เพลง) แล้ว`);
      } finally {
        setConnectingLanHostId(null);
      }
    },
    [showStatus]
  );

  const handleDisconnectLanHost = useCallback(
    (hostDeviceId: string) => {
      desiredLanHostIdsRef.current.delete(hostDeviceId);
      lanHostMissingSinceRef.current.delete(hostDeviceId);
      lanP2pRef.current?.closePeer(hostDeviceId);
      setConnectedLanHostIds((prev) => prev.filter((id) => id !== hostDeviceId));
      if (currentTrack?.source === 'lan' && currentTrack.lanHostDeviceId === hostDeviceId) {
        stopAllEngines();
        setIsPlaying(false);
        setIsBuffering(false);
      }
      showStatus('ตัดการเชื่อมต่อเครื่องในวง Local Network แล้ว');
    },
    [currentTrack, showStatus, stopAllEngines]
  );

  // --- Equalizer Handlers ---
  const handleSelectEqPreset = (preset: EqPresetKey) => {
    updatePrefs((prev) => ({
      ...prev,
      eqPreset: preset,
      eqBands: [...EQ_PRESETS[preset].bands] as EqBands,
    }));
  };

  const handleChangeEqBand = (index: number, value: number) => {
    updatePrefs((prev) => {
      const nextBands = [...prev.eqBands] as EqBands;
      nextBands[index] = value;
      return { ...prev, eqPreset: 'custom', eqBands: nextBands };
    });
  };

  // --- Admin Summary Stats ---
  const adminStats = useMemo(() => {
    const totalBytes = serverStreams.reduce((acc, t) => acc + (t.sizeBytes || 0), 0);
    const fileCount = serverStreams.filter((t) => t.streamKind === 'file').length;
    const hddCount = serverStreams.filter((t) => t.streamKind === 'hdd').length;
    const urlCount = serverStreams.filter((t) => t.streamKind === 'url').length;
    return { totalBytes, fileCount, hddCount, urlCount };
  }, [serverStreams]);

  // --- Heading Metadata ---
  const currentTabInfo = useMemo(() => {
    if (activeTab === 'admin') {
      return {
        title: 'จัดการเพลงออนไลน์ (Admin)',
        sub: 'เพิ่ม แก้ไข จัดลำดับ และลบเพลงที่ใช้ร่วมกันทุกอุปกรณ์',
      };
    }
    if (activeTab === 'all') {
      return { title: 'คลังเพลงทั้งหมด', sub: 'สตรีมกลางทุกเครื่อง, วง LAN และไฟล์ในเครื่องนี้' };
    }
    if (activeTab === 'stream') {
      return {
        title: 'สตรีมเพลงออนไลน์',
        sub: 'เพลงชุดเดียวกันสำหรับทุกอุปกรณ์ที่เชื่อมต่อ',
      };
    }
    if (activeTab === 'lan') {
      return {
        title: 'ฟังผ่าน Local Network (LAN / Wi-Fi)',
        sub: 'รับเสียงโดยตรงจากอุปกรณ์อื่นในวง Wi-Fi เดียวกันแบบ P2P ไม่อัปโหลดขึ้นเซิร์ฟเวอร์',
      };
    }
    if (activeTab === 'local') {
      return {
        title: 'ไฟล์เพลงในเครื่องนี้',
        sub: 'MP3, FLAC, WAV, OGG, AAC, AIFF, OPUS',
      };
    }
    if (activeTab === 'favorites') {
      return { title: 'เพลงที่ถูกใจ', sub: 'คอลเลกชันส่วนตัว' };
    }
    if (activeTab === 'recent') {
      return { title: 'ฟังล่าสุด', sub: 'ประวัติการเล่นของคุณ' };
    }
    if (activeTab.startsWith('playlist:')) {
      const pl = prefs.playlists.find((p) => p.id === activeTab.slice('playlist:'.length));
      return { title: pl?.name || 'เพลย์ลิสต์', sub: 'เพลย์ลิสต์ส่วนตัว' };
    }
    return { title: 'คลังเพลง', sub: '' };
  }, [activeTab, prefs.playlists]);

  const isLiveTrack =
    currentTrack?.source === 'stream' &&
    currentTrack.durationSec === null &&
    !currentTrack.url.includes('/api/streams/') &&
    !currentTrack.url.includes('/api/hdd/');

  const isCurrentFav = currentTrack ? prefs.favorites.includes(currentTrack.id) : false;

  const resolvedCurrentTrack = useMemo(() => {
    if (!currentTrack) return null;
    const latest = allTracks.find((t) => t.id === currentTrack.id);
    if (!latest) return currentTrack;
    return latest.coverDataUrl && latest.coverDataUrl !== currentTrack.coverDataUrl
      ? { ...currentTrack, coverDataUrl: latest.coverDataUrl }
      : currentTrack;
  }, [allTracks, currentTrack]);

  const showcaseTrack = resolvedCurrentTrack || displayedTracks[0] || allTracks[0] || null;
  const isShowcaseFav = showcaseTrack ? prefs.favorites.includes(showcaseTrack.id) : false;

  return (
    <div className="h-dvh flex flex-col bg-background text-foreground">
      {/* Dual Audio Elements with Auto-Reconnect & Stall Recovery */}
      <audio
        ref={localAudioRef}
        preload="auto"
        onLoadedMetadata={(e) => {
          if (activeEngineRef.current !== 'local') return;
          const el = e.currentTarget;
          if (isFinite(el.duration) && el.duration > 0) {
            setDuration(el.duration);
            if (currentTrack && currentTrack.source === 'local' && currentTrack.durationSec === null) {
              const dur = el.duration;
              const label = formatTime(dur);
              setLocalTracks((prev) =>
                prev.map((t) =>
                  t.id === currentTrack.id
                    ? { ...t, durationSec: dur, durationLabel: label }
                    : t
                )
              );
            }
          }
        }}
        onTimeUpdate={(e) => {
          if (activeEngineRef.current !== 'local') return;
          const el = e.currentTarget;
          lastPlaybackTimeRef.current = el.currentTime;
          setCurrentTime(el.currentTime);
          if (isFinite(el.duration) && el.duration > 0) setDuration(el.duration);
          if (stallTimerRef.current !== null) {
            window.clearTimeout(stallTimerRef.current);
            stallTimerRef.current = null;
          }
        }}
        onEnded={() => {
          if (activeEngineRef.current !== 'local') return;
          handleTrackEnded();
        }}
        onWaiting={() => {
          if (activeEngineRef.current !== 'local') return;
          setIsBuffering(true);
          if (stallTimerRef.current === null && (isPlayingRef.current || wantPlayingRef.current)) {
            stallTimerRef.current = window.setTimeout(() => {
              stallTimerRef.current = null;
              if (activeEngineRef.current === 'local' && (isPlayingRef.current || wantPlayingRef.current)) {
                attemptRecoveryRef.current('stalled');
              }
            }, 8000);
          }
        }}
        onStalled={() => {
          if (activeEngineRef.current !== 'local' || (!isPlayingRef.current && !wantPlayingRef.current)) return;
          if (stallTimerRef.current === null) {
            stallTimerRef.current = window.setTimeout(() => {
              stallTimerRef.current = null;
              if (activeEngineRef.current === 'local' && (isPlayingRef.current || wantPlayingRef.current)) {
                attemptRecoveryRef.current('stalled');
              }
            }, 7000);
          }
        }}
        onPlaying={() => {
          if (activeEngineRef.current !== 'local') return;
          if (stallTimerRef.current !== null) {
            window.clearTimeout(stallTimerRef.current);
            stallTimerRef.current = null;
          }
          playbackRetryCountRef.current = 0;
          setIsBuffering(false);
          setIsPlaying(true);
          setPlaybackError('');
        }}
        onPause={(e) => {
          if (activeEngineRef.current !== 'local') return;
          if (intentionalPauseRef.current || performance.now() < suppressPauseUntilRef.current) return;
          if (!e.currentTarget.ended && (isPlayingRef.current || wantPlayingRef.current)) {
            setIsPlaying(false);
          }
        }}
        onError={() => {
          if (
            activeEngineRef.current !== 'local' ||
            intentionalPauseRef.current ||
            handlingPlayFallbackRef.current === playRequestIdRef.current
          ) {
            return;
          }
          if (isPlayingRef.current || wantPlayingRef.current) {
            attemptRecoveryRef.current('error');
          } else {
            setIsBuffering(false);
            setIsPlaying(false);
          }
        }}
      />
      <audio
        ref={remoteAudioRef}
        preload="auto"
        onLoadedMetadata={(e) => {
          if (activeEngineRef.current !== 'remote') return;
          const el = e.currentTarget;
          if (isFinite(el.duration) && el.duration > 0) setDuration(el.duration);
        }}
        onTimeUpdate={(e) => {
          if (activeEngineRef.current !== 'remote') return;
          const el = e.currentTarget;
          lastPlaybackTimeRef.current = el.currentTime;
          setCurrentTime(el.currentTime);
          if (isFinite(el.duration) && el.duration > 0) setDuration(el.duration);
          if (stallTimerRef.current !== null) {
            window.clearTimeout(stallTimerRef.current);
            stallTimerRef.current = null;
          }
        }}
        onEnded={() => {
          if (activeEngineRef.current !== 'remote') return;
          handleTrackEnded();
        }}
        onWaiting={() => {
          if (activeEngineRef.current !== 'remote') return;
          setIsBuffering(true);
          if (stallTimerRef.current === null && (isPlayingRef.current || wantPlayingRef.current)) {
            stallTimerRef.current = window.setTimeout(() => {
              stallTimerRef.current = null;
              if (activeEngineRef.current === 'remote' && (isPlayingRef.current || wantPlayingRef.current)) {
                attemptRecoveryRef.current('stalled');
              }
            }, 8000);
          }
        }}
        onStalled={() => {
          if (activeEngineRef.current !== 'remote' || (!isPlayingRef.current && !wantPlayingRef.current)) return;
          if (stallTimerRef.current === null) {
            stallTimerRef.current = window.setTimeout(() => {
              stallTimerRef.current = null;
              if (activeEngineRef.current === 'remote' && (isPlayingRef.current || wantPlayingRef.current)) {
                attemptRecoveryRef.current('stalled');
              }
            }, 7000);
          }
        }}
        onPlaying={() => {
          if (activeEngineRef.current !== 'remote') return;
          if (stallTimerRef.current !== null) {
            window.clearTimeout(stallTimerRef.current);
            stallTimerRef.current = null;
          }
          playbackRetryCountRef.current = 0;
          setIsBuffering(false);
          setIsPlaying(true);
          setPlaybackError('');
        }}
        onPause={(e) => {
          if (activeEngineRef.current !== 'remote') return;
          if (intentionalPauseRef.current || performance.now() < suppressPauseUntilRef.current) return;
          if (!e.currentTarget.ended && (isPlayingRef.current || wantPlayingRef.current)) {
            setIsPlaying(false);
          }
        }}
        onError={() => {
          if (
            activeEngineRef.current !== 'remote' ||
            intentionalPauseRef.current ||
            handlingPlayFallbackRef.current === playRequestIdRef.current
          ) {
            return;
          }
          if (isPlayingRef.current || wantPlayingRef.current) {
            attemptRecoveryRef.current('error');
          } else {
            wantPlayingRef.current = false;
            setIsBuffering(false);
            setIsPlaying(false);
            setPlaybackError('ไม่สามารถเชื่อมต่อสตรีมจากลิงก์นี้ได้');
          }
        }}
      />

      {/* Hidden File & Folder Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={AUDIO_ACCEPT_STRING}
        onChange={handleFileInputChange}
        className="hidden"
        aria-label="เลือกไฟล์เพลงจากเครื่อง"
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        onChange={handleFileInputChange}
        className="hidden"
        aria-label="เลือกโฟลเดอร์เพลงจากเครื่อง"
        {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
      />

      {/* Main Workspace */}
      <div className="flex-1 min-h-0 flex">
        {/* Desktop Collapsible Sidebar */}
        {!sidebarCollapsed && (
          <aside className="hidden md:flex w-64 shrink-0 flex-col justify-between bg-surface border-r border-border/70 p-5 min-h-0 overflow-y-auto">
            <div className="space-y-6">
              {/* Brand & Sidebar Collapse */}
              <div className="flex items-center justify-between px-1 gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-foreground text-surface flex items-center justify-center shrink-0">
                    <Disc className="w-4 h-4" />
                  </div>
                  <span className="text-base font-semibold tracking-tight truncate">Aura Audio</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {isAdmin && (
                    <span className="text-[11px] font-medium text-primary">Admin</span>
                  )}
                  <button
                    type="button"
                    onClick={() => setSidebarCollapsed(true)}
                    aria-label="ย่อปิดแถบด้านข้าง"
                    title="ย่อปิดแถบด้านข้าง (Ctrl+B)"
                    className="w-8 h-8 rounded-control flex items-center justify-center text-muted hover:text-foreground hover:bg-foreground/5 transition-colors cursor-pointer"
                  >
                    <PanelLeftClose className="w-4 h-4" />
                  </button>
                </div>
              </div>

            {/* Library Navigation */}
            <nav aria-label="หมวดหมู่คลังเพลง" className="space-y-1">
              {(
                [
                  { id: 'all', label: 'คลังเพลงทั้งหมด', icon: Layers, count: allTracks.length },
                  {
                    id: 'stream',
                    label: 'สตรีมออนไลน์',
                    icon: Radio,
                    count:
                      serverStreams.length + (prefs.includeHddInStream ? localTracks.length : 0),
                  },
                  {
                    id: 'lan',
                    label: 'วง LAN (Local)',
                    icon: Network,
                    count: lanTracks.length,
                  },
                  {
                    id: 'local',
                    label: 'ไฟล์ในเครื่อง',
                    icon: HardDrive,
                    count:
                      localTracks.length + serverStreams.filter((t) => Boolean(t.hddPath)).length,
                  },
                  { id: 'favorites', label: 'เพลงที่ถูกใจ', icon: Heart, count: prefs.favorites.length },
                  { id: 'recent', label: 'ฟังล่าสุด', icon: Clock, count: prefs.recentIds.length },
                ] as const
              ).map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full min-h-10 px-3 rounded-control flex items-center justify-between text-sm font-medium transition-colors cursor-pointer ${
                      active
                        ? 'bg-foreground text-surface'
                        : 'text-muted hover:text-foreground hover:bg-foreground/5'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 whitespace-nowrap">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </span>
                    <span className={`text-xs tabular-nums ${active ? 'text-surface/80' : 'text-muted'}`}>
                      {item.count}
                    </span>
                  </button>
                );
              })}

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setActiveTab('admin')}
                  className={`w-full min-h-10 px-3 rounded-control flex items-center justify-between text-sm font-medium transition-colors cursor-pointer ${
                    activeTab === 'admin'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-primary hover:bg-foreground/5'
                  }`}
                >
                  <span className="flex items-center gap-2.5 whitespace-nowrap">
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                    <span>จัดการเพลง (Admin)</span>
                  </span>
                  <span className="text-xs tabular-nums">{serverStreams.length}</span>
                </button>
              )}
            </nav>

            {/* User Playlists */}
            <div className="pt-4 border-t border-border/60">
              <div className="flex items-center justify-between px-1 mb-2">
                <h2 className="text-xs font-medium text-muted">เพลย์ลิสต์ของคุณ</h2>
                <button
                  type="button"
                  onClick={() => setPlaylistModalOpen(true)}
                  aria-label="สร้างเพลย์ลิสต์ใหม่"
                  title="สร้างเพลย์ลิสต์ใหม่"
                  className="w-7 h-7 rounded-control flex items-center justify-center text-muted hover:text-foreground hover:bg-foreground/5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              {prefs.playlists.length === 0 ? (
                <button
                  type="button"
                  onClick={() => setPlaylistModalOpen(true)}
                  className="w-full py-2 px-3 rounded-control text-left text-xs text-muted hover:text-foreground hover:bg-foreground/5 flex items-center gap-2 cursor-pointer"
                >
                  <ListPlus className="w-3.5 h-3.5 shrink-0" />
                  <span>สร้างเพลย์ลิสต์แรก</span>
                </button>
              ) : (
                <div className="space-y-1">
                  {prefs.playlists.map((pl) => {
                    const tabId: LibraryTab = `playlist:${pl.id}`;
                    const active = activeTab === tabId;
                    return (
                      <div key={pl.id} className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setActiveTab(tabId)}
                          className={`flex-1 min-w-0 min-h-9 px-3 rounded-control flex items-center justify-between text-sm transition-colors cursor-pointer ${
                            active
                              ? 'bg-foreground text-surface font-medium'
                              : 'text-muted hover:text-foreground hover:bg-foreground/5'
                          }`}
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <ListMusic className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate" title={pl.name}>
                              {pl.name}
                            </span>
                          </span>
                          <span className="text-xs tabular-nums ml-2">{pl.trackIds.length}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePlaylist(pl.id)}
                          aria-label={`ลบเพลย์ลิสต์ ${pl.name}`}
                          className="w-8 h-8 rounded-control flex items-center justify-center text-muted hover:text-red-700 dark:hover:text-red-400 cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Local Audio & HDD Streaming Actions */}
            <div className="pt-4 border-t border-border/60 space-y-2">
              <Button
                tone="quiet"
                onClick={() => setHddModalOpen(true)}
                className="w-full justify-start text-sm"
              >
                <HardDrive className="w-4 h-4 shrink-0 text-primary" />
                <span>เชื่อมต่อ HDD เครื่อง</span>
              </Button>
              <Button
                tone="ghost"
                onClick={() => fileInputRef.current?.click()}
                className="w-full justify-start text-xs text-muted"
              >
                <Upload className="w-4 h-4 shrink-0" />
                <span>เลือกไฟล์จาก HDD เครื่องนี้</span>
              </Button>
              <Button
                tone="ghost"
                onClick={handlePickBrowserHddFolder}
                className="w-full justify-start text-xs text-muted"
              >
                <FolderOpen className="w-4 h-4 shrink-0" />
                <span>ซิงค์ทั้งโฟลเดอร์ (ไม่อัปโหลด)</span>
              </Button>
              <Button
                tone="ghost"
                onClick={() => {
                  setResetDefaultIncludeServer(isAdmin);
                  setResetModalOpen(true);
                }}
                className="w-full justify-start text-xs text-muted hover:text-red-700 dark:hover:text-red-400"
              >
                <RotateCcw className="w-4 h-4 shrink-0" />
                <span>รีเซ็ตข้อมูล</span>
              </Button>
              <Button
                tone="ghost"
                onClick={() => setLanModalOpen(true)}
                className="w-full justify-start text-xs text-muted hover:text-foreground"
              >
                <Network
                  className={`w-4 h-4 shrink-0 ${
                    isSharingLan || connectedLanHostIds.length > 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-primary'
                  }`}
                />
                <span>ฟังผ่าน Local Network</span>
              </Button>
              <PWAInstallButton
                variant="sidebar"
                onInstalled={() => showStatus('ติดตั้งแอพ Aura Audio เรียบร้อยแล้ว')}
                onStatusMessage={(msg) => showStatus(msg)}
              />
              <Button
                tone="ghost"
                onClick={() => setAndroidModalOpen(true)}
                className="w-full justify-start text-xs text-muted hover:text-foreground"
              >
                <Smartphone className="w-4 h-4 shrink-0 text-primary" />
                <span>แอพ Android (GitHub)</span>
              </Button>
              <p className="text-[11px] text-muted px-1 leading-relaxed">
                อ่านตรงจากไฟล์ HDD โดยไม่อัปโหลดขึ้นระบบ รองรับ MP3, FLAC, WAV, OGG, AAC, M4A, OPUS, AIFF, WMA
              </p>
            </div>
          </div>

          {/* Sidebar Bottom: User / Admin Account */}
          <div className="pt-4 mt-4 border-t border-border/60">
            <button
              type="button"
              onClick={() => setAuthModalOpen(true)}
              className="w-full p-2 rounded-control hover:bg-foreground/5 flex items-center gap-3 text-left transition-colors cursor-pointer"
            >
              <div className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold shrink-0">
                {currentUser ? currentUser.username.charAt(0).toUpperCase() : <User className="w-4 h-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">
                  {currentUser ? currentUser.username : 'ผู้เยี่ยมชม'}
                </p>
                <p className="text-xs text-muted truncate">
                  {currentUser
                    ? currentUser.role === 'admin'
                      ? 'ผู้ดูแลระบบ (Admin)'
                      : currentUser.email
                    : 'เข้าสู่ระบบ / Admin'}
                </p>
              </div>
            </button>
          </div>
        </aside>
        )}

        {/* Main Content Pane */}
        <main className="flex-1 min-w-0 min-h-0 flex flex-col">
          {/* Top Header */}
          <header className="h-16 px-4 md:px-7 border-b border-border/70 bg-surface flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setSidebarCollapsed((prev) => !prev)}
                aria-label={sidebarCollapsed ? 'เปิดแถบด้านข้าง' : 'ย่อปิดแถบด้านข้าง'}
                title={sidebarCollapsed ? 'เปิดแถบด้านข้าง (Ctrl+B)' : 'ย่อปิดแถบด้านข้าง (Ctrl+B)'}
                className="hidden md:inline-flex w-10 h-10 rounded-control border border-border items-center justify-center text-foreground hover:bg-foreground/5 transition-colors cursor-pointer"
              >
                {sidebarCollapsed ? (
                  <PanelLeftOpen className="w-4 h-4" />
                ) : (
                  <PanelLeftClose className="w-4 h-4" />
                )}
              </button>

              {sidebarCollapsed && (
                <div className="hidden md:flex items-center gap-2 pr-1">
                  <div className="w-7 h-7 rounded-full bg-foreground text-surface flex items-center justify-center">
                    <Disc className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-sm font-semibold tracking-tight">Aura Audio</span>
                </div>
              )}

              <div className="flex items-center gap-2 md:hidden shrink-0">
                <div className="w-7 h-7 rounded-full bg-foreground text-surface flex items-center justify-center">
                  <Disc className="w-3.5 h-3.5" />
                </div>
                <span className="text-sm font-semibold">Aura</span>
              </div>
            </div>

            <div className="flex-1 min-w-0 max-w-md relative">
              <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (albumShowcaseOpen && e.target.value.trim()) {
                    setAlbumShowcaseOpen(false);
                  }
                }}
                aria-label="ค้นหาเพลง ศิลปิน แนวเพลง โฟลเดอร์ หรือนามสกุลไฟล์"
                placeholder="ค้นหาเพลง, ศิลปิน, แนวเพลง, โฟลเดอร์, FLAC..."
                className="w-full min-h-10 pl-9 pr-3 text-sm rounded-control bg-background text-foreground border border-border/70 placeholder:text-muted focus-visible:outline-2 focus-visible:outline-primary"
              />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="เพิ่มไฟล์เพลงจากเครื่อง"
                title="เพิ่มไฟล์เพลงจากเครื่อง"
                className="md:hidden w-10 h-10 rounded-control border border-border flex items-center justify-center text-foreground hover:bg-foreground/5 cursor-pointer"
              >
                <Upload className="w-4 h-4" />
              </button>

              {isAdmin ? (
                <Button
                  tone="primary"
                  onClick={() => setHddModalOpen(true)}
                  className="min-h-10 px-3 text-xs sm:text-sm"
                >
                  <HardDrive className="w-4 h-4 shrink-0" />
                  <span className="hidden sm:inline">เพิ่มเพลงจาก HDD</span>
                </Button>
              ) : (
                <Button
                  tone="quiet"
                  onClick={() => setAuthModalOpen(true)}
                  className="min-h-10 px-3 text-xs sm:text-sm"
                >
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span className="hidden sm:inline">Admin</span>
                </Button>
              )}

              <PWAInstallButton
                variant="header"
                onInstalled={() => showStatus('ติดตั้งแอพ Aura Audio เรียบร้อยแล้ว')}
                onStatusMessage={(msg) => showStatus(msg)}
              />

              <button
                type="button"
                onClick={() => setLanModalOpen(true)}
                aria-label="ฟังผ่าน Local Network (LAN / Wi-Fi)"
                title="ฟังผ่าน Local Network (LAN / Wi-Fi)"
                className={`w-10 h-10 rounded-control border flex items-center justify-center transition-colors cursor-pointer ${
                  isSharingLan || connectedLanHostIds.length > 0
                    ? 'border-primary text-primary bg-primary/10'
                    : 'border-border text-foreground hover:bg-foreground/5'
                }`}
              >
                <Network className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setAndroidModalOpen(true)}
                aria-label="ตั้งค่าแอพ Android และ GitHub APK"
                title="แอพ Android & GitHub APK"
                className="w-10 h-10 rounded-control border border-border flex items-center justify-center text-foreground hover:bg-foreground/5 cursor-pointer"
              >
                <Smartphone className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setAlbumShowcaseOpen((prev) => !prev)}
                aria-label={albumShowcaseOpen ? 'ปิดมุมมองหน้าปกเต็มหน้า' : 'แสดงหน้าปกอัลบั้มเต็มหน้า'}
                title={albumShowcaseOpen ? 'กลับหน้ารายการเพลง (Esc)' : 'โชว์หน้าปกอัลบั้มใหญ่เต็มหน้า'}
                className={`min-h-10 px-2.5 lg:px-3 rounded-control border flex items-center justify-center gap-1.5 text-xs font-medium transition-colors cursor-pointer ${
                  albumShowcaseOpen
                    ? 'border-primary text-primary bg-primary/10'
                    : 'border-border text-foreground hover:bg-foreground/5'
                }`}
              >
                {albumShowcaseOpen ? (
                  <Minimize2 className="w-4 h-4 shrink-0" />
                ) : (
                  <Maximize2 className="w-4 h-4 shrink-0" />
                )}
                <span className="hidden lg:inline whitespace-nowrap">
                  {albumShowcaseOpen ? 'กลับรายการเพลง' : 'หน้าปกเต็มหน้า'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
                aria-label={theme === 'light' ? 'เปลี่ยนเป็นโหมดกลางคืน' : 'เปลี่ยนเป็นโหมดสว่าง'}
                title={theme === 'light' ? 'โหมดกลางคืน' : 'โหมดสว่าง'}
                className="w-10 h-10 rounded-control border border-border flex items-center justify-center text-foreground hover:bg-foreground/5 cursor-pointer"
              >
                {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                aria-label="บัญชีผู้ใช้งาน"
                className="md:hidden w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold cursor-pointer"
              >
                {currentUser ? currentUser.username.charAt(0).toUpperCase() : <User className="w-4 h-4" />}
              </button>
            </div>
          </header>

          {/* Mobile Category Strip */}
          <div className="md:hidden px-4 py-2.5 border-b border-border/60 bg-surface flex items-center gap-2 flex-wrap shrink-0">
            {(
              [
                { id: 'all', label: 'ทั้งหมด' },
                { id: 'stream', label: 'สตรีมออนไลน์' },
                { id: 'lan', label: 'วง LAN' },
                { id: 'local', label: 'ไฟล์ในเครื่อง' },
                { id: 'favorites', label: 'ถูกใจ' },
                { id: 'recent', label: 'ฟังล่าสุด' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-foreground text-surface'
                    : 'bg-background text-muted border border-border/70'
                }`}
              >
                {tab.label}
              </button>
            ))}
            {isAdmin && (
              <button
                type="button"
                onClick={() => setActiveTab('admin')}
                className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap cursor-pointer ${
                  activeTab === 'admin'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-primary border border-primary/50'
                }`}
              >
                จัดการ (Admin)
              </button>
            )}
            {prefs.playlists.map((pl) => {
              const tabId: LibraryTab = `playlist:${pl.id}`;
              return (
                <button
                  key={pl.id}
                  type="button"
                  onClick={() => setActiveTab(tabId)}
                  className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap cursor-pointer ${
                    activeTab === tabId
                      ? 'bg-foreground text-surface'
                      : 'bg-background text-muted border border-border/70'
                  }`}
                >
                  {pl.name}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setPlaylistModalOpen(true)}
              className="px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap border border-dashed border-border text-muted hover:text-foreground cursor-pointer"
            >
              + เพลย์ลิสต์
            </button>
          </div>

          {/* Full-Page Album Cover Showcase OR Library Content */}
          {albumShowcaseOpen ? (
            <AlbumShowcaseStage
              track={showcaseTrack}
              hasActiveTrack={Boolean(resolvedCurrentTrack)}
              isPlaying={isPlaying}
              isBuffering={isBuffering}
              isFavorite={isShowcaseFav}
              currentTime={currentTime}
              duration={duration}
              sidebarCollapsed={sidebarCollapsed}
              analyser={analyserRef.current}
              isSynthOrCors={
                activeEngineRef.current === 'local' && isSameOriginTrack(resolvedCurrentTrack)
              }
              onToggleSidebar={() => setSidebarCollapsed((prev) => !prev)}
              onClose={() => setAlbumShowcaseOpen(false)}
              onTogglePlay={() => {
                if (resolvedCurrentTrack) {
                  togglePlayPause();
                } else if (showcaseTrack) {
                  playTrack(showcaseTrack);
                }
              }}
              onPrev={playPrev}
              onNext={playNext}
              onToggleFavorite={handleToggleFavorite}
            />
          ) : (
          /* Scrollable Library Content + Dropzone */
          <div
            className="flex-1 min-h-0 overflow-y-auto px-4 py-5 md:px-8 md:py-6 relative"
            onDragEnter={(e) => {
              e.preventDefault();
              setIsDraggingFiles(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingFiles(true);
            }}
            onDragLeave={(e) => {
              if (e.currentTarget.contains(e.relatedTarget as Node)) return;
              setIsDraggingFiles(false);
            }}
            onDrop={handleDrop}
          >
            {/* Drag & Drop Overlay */}
            {isDraggingFiles && (
              <Surface
                inset
                className="fixed md:absolute inset-4 z-30 border-2 border-dashed border-primary flex flex-col items-center justify-center text-center p-6 pointer-events-none"
              >
                <Upload className="w-10 h-10 text-primary mb-3" />
                <p className="text-base font-semibold">
                  วางไฟล์เพลงหรือโฟลเดอร์จาก HDD เพื่อเล่นตรงทันที (ไม่อัปโหลดขึ้นระบบ)
                </p>
                <p className="text-sm text-muted mt-1">
                  รองรับ MP3, FLAC, WAV, OGG, AAC, M4A, OPUS, AIFF, WMA และ .M3U
                </p>
              </Surface>
            )}

            {/* Live HDD Sync Progress */}
            {hddSyncProgress && (
              <div
                role="status"
                className="mb-4 px-4 py-2.5 rounded-control border border-primary/40 bg-surface text-xs sm:text-sm flex items-center justify-between gap-3"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <RefreshCw className="w-4 h-4 text-primary animate-spin shrink-0" />
                  <span className="truncate">
                    {hddSyncProgress.label} ({hddSyncProgress.processed}/{hddSyncProgress.total})
                  </span>
                </span>
                <span className="text-xs font-mono tabular-nums text-muted shrink-0">
                  {Math.round((hddSyncProgress.processed / Math.max(hddSyncProgress.total, 1)) * 100)}%
                </span>
              </div>
            )}

            {/* One-Click Saved HDD Folder Reconnect Banner after Refresh */}
            {!hddSyncProgress &&
              savedHddHandles.length > 0 &&
              localTracks.some((t) => !t.url) && (
                <div className="mb-4 px-4 py-2.5 rounded-control border border-primary/40 bg-surface text-xs sm:text-sm flex flex-wrap items-center justify-between gap-3">
                  <span className="flex items-center gap-2 min-w-0">
                    <FolderOpen className="w-4 h-4 text-primary shrink-0" />
                    <span className="truncate">
                      พบโฟลเดอร์ HDD ที่ซิงค์ไว้ก่อนหน้า ({savedHddHandles.map((h) => h.name).join(', ')}) — กดเพื่อเชื่อมต่อไฟล์เสียงต่อทันที
                    </span>
                  </span>
                  <Button
                    tone="primary"
                    onClick={() => {
                      void (async () => {
                        for (const rec of savedHddHandles) {
                          try {
                            await handleReconnectHddHandle(rec);
                          } catch {
                            // continue remaining handles
                          }
                        }
                      })();
                    }}
                    className="min-h-8 px-3 text-xs shrink-0"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>เชื่อมต่อโฟลเดอร์ HDD ต่อทันที</span>
                  </Button>
                </div>
              )}

            {/* Status Feedback Line */}
            {(statusMessage || playbackError) && (
              <div
                role={playbackError ? 'alert' : 'status'}
                className={`mb-4 px-4 py-2.5 rounded-control border text-xs sm:text-sm flex items-center justify-between gap-3 ${
                  playbackError
                    ? 'border-red-500/40 bg-surface text-red-700 dark:text-red-400'
                    : 'border-border bg-surface text-foreground'
                }`}
              >
                <span>{playbackError || statusMessage}</span>
                <button
                  type="button"
                  onClick={() => {
                    setPlaybackError('');
                    setStatusMessage('');
                  }}
                  className="text-xs text-muted hover:text-foreground whitespace-nowrap cursor-pointer"
                >
                  ปิด
                </button>
              </div>
            )}

            {/* Section Header */}
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-5">
              <div className="min-w-0">
                <h1 className="text-[length:var(--text-display)] font-semibold tracking-tight leading-tight">
                  {currentTabInfo.title}
                </h1>
                <p className="text-sm text-muted mt-1">
                  {currentTabInfo.sub} ·{' '}
                  <span className="tabular-nums">{displayedTracks.length}</span> เพลง
                  {groupBy !== 'none' && groupedSections.length > 0 && (
                    <span>
                      {' '}
                      · <span className="tabular-nums">{groupedSections.length}</span>{' '}
                      {groupBy === 'folder'
                        ? 'โฟลเดอร์'
                        : groupBy === 'artist'
                        ? 'ศิลปิน'
                        : 'แนวเพลง'}
                    </span>
                  )}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {activeTab === 'admin' && isAdmin && (
                  <>
                    <Button
                      tone="primary"
                      onClick={() => setHddModalOpen(true)}
                      className="min-h-9 px-3.5 text-xs sm:text-sm"
                    >
                      <HardDrive className="w-4 h-4" />
                      <span>เลือกโฟลเดอร์/ไฟล์บน HDD (ไม่อัปโหลด)</span>
                    </Button>
                    <Button
                      tone="quiet"
                      onClick={() => handleRescanHostHdd().catch(() => {})}
                      className="min-h-9 px-3 text-xs"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>รีสแกน HDD ล่าสุด</span>
                    </Button>
                    <Button
                      tone="quiet"
                      onClick={() => setStreamModalOpen(true)}
                      className="min-h-9 px-3 text-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>เพิ่มลิงก์ URL</span>
                    </Button>
                    <button
                      type="button"
                      onClick={() =>
                        updatePrefs((prev) => ({
                          ...prev,
                          autoStreamOnAdd: prev.autoStreamOnAdd === false,
                        }))
                      }
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap cursor-pointer inline-flex items-center gap-1.5 ${
                        prefs.autoStreamOnAdd !== false
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-surface text-muted border-border hover:text-foreground'
                      }`}
                    >
                      <Radio className="w-3.5 h-3.5" />
                      <span>
                        สตรีมอัตโนมัติเมื่อเพิ่ม: {prefs.autoStreamOnAdd !== false ? 'เปิด' : 'ปิด'}
                      </span>
                    </button>
                    <Button
                      tone="danger"
                      onClick={() => {
                        setResetDefaultIncludeServer(true);
                        setResetModalOpen(true);
                      }}
                      className="min-h-9 px-3 text-xs"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>รีเซ็ตข้อมูล</span>
                    </Button>
                  </>
                )}

                {activeTab === 'local' && (
                  <>
                    <Button
                      tone="primary"
                      onClick={handlePickBrowserHddFolder}
                      className="min-h-9 px-3.5 text-xs sm:text-sm"
                    >
                      <FolderOpen className="w-4 h-4" />
                      <span>ซิงค์โฟลเดอร์จาก HDD</span>
                    </Button>
                    <Button
                      tone="quiet"
                      onClick={() => {
                        setResetDefaultIncludeServer(false);
                        setResetModalOpen(true);
                      }}
                      className="min-h-9 px-3 text-xs"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>รีเซ็ตข้อมูล</span>
                    </Button>
                  </>
                )}

                {activeTab === 'stream' && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        updatePrefs((prev) => ({
                          ...prev,
                          includeHddInStream: !prev.includeHddInStream,
                        }))
                      }
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap cursor-pointer inline-flex items-center gap-1.5 ${
                        prefs.includeHddInStream
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-surface text-muted border-border hover:text-foreground'
                      }`}
                    >
                      <HardDrive className="w-3.5 h-3.5" />
                      <span>
                        รวมไฟล์เครื่องนี้: {prefs.includeHddInStream ? 'เปิด' : 'ปิด'}
                      </span>
                    </button>
                    {isAdmin && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            updatePrefs((prev) => ({
                              ...prev,
                              autoStreamOnAdd: prev.autoStreamOnAdd === false,
                            }))
                          }
                          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap cursor-pointer inline-flex items-center gap-1.5 ${
                            prefs.autoStreamOnAdd !== false
                              ? 'bg-foreground text-surface border-foreground'
                              : 'bg-surface text-muted border-border hover:text-foreground'
                          }`}
                        >
                          <Radio className="w-3.5 h-3.5" />
                          <span>
                            สตรีมอัตโนมัติเมื่อเพิ่ม: {prefs.autoStreamOnAdd !== false ? 'เปิด' : 'ปิด'}
                          </span>
                        </button>
                        <Button
                          tone="quiet"
                          onClick={() => setStreamModalOpen(true)}
                          className="min-h-9 px-3 text-xs"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>เพิ่มเพลงให้ทุกเครื่อง</span>
                        </Button>
                      </>
                    )}
                  </>
                )}

                {(
                  [
                    { id: 'all', label: 'ทุกฟอร์แมต' },
                    { id: 'lossless', label: 'Lossless' },
                    { id: 'compressed', label: 'MP3 / AAC / OGG' },
                    { id: 'stream', label: 'สตรีมมิ่ง' },
                  ] as const
                ).map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setFormatFilter(chip.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap cursor-pointer ${
                      formatFilter === chip.id
                        ? 'bg-foreground text-surface border-foreground'
                        : 'bg-surface text-muted border-border hover:text-foreground'
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}

                <Button
                  tone="ink"
                  onClick={() => {
                    if (displayedTracks.length > 0) playTrack(displayedTracks[0]);
                  }}
                  disabled={displayedTracks.length === 0}
                  className="min-h-9 px-4 text-xs sm:text-sm"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>เล่นทั้งหมด</span>
                </Button>
              </div>
            </div>

            {/* Admin Operational Status Panel (only in Admin Management tab) */}
            {activeTab === 'admin' && isAdmin && (
              <div className="space-y-4 mb-5">
                {/* Live Status Banner & Refresh */}
                <Surface className="border border-border/75 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start sm:items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-control border flex items-center justify-center shrink-0 ${
                        adminTask.state === 'error'
                          ? 'border-red-500/40 text-red-700 dark:text-red-400 bg-background'
                          : adminTask.state === 'working'
                          ? 'border-primary/50 text-primary bg-background'
                          : 'border-emerald-600/35 text-emerald-700 dark:text-emerald-400 bg-background'
                      }`}
                    >
                      {adminTask.state === 'working' ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : adminTask.state === 'done' ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : (
                        <Activity className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          สถานะการทำงาน:
                        </span>
                        <span
                          className={`text-sm font-medium ${
                            adminTask.state === 'error'
                              ? 'text-red-700 dark:text-red-400'
                              : adminTask.state === 'working'
                              ? 'text-primary'
                              : 'text-emerald-700 dark:text-emerald-400'
                          }`}
                        >
                          {adminTask.state === 'working'
                            ? adminTask.message
                            : adminTask.state === 'error'
                            ? adminTask.message
                            : adminTask.state === 'done'
                            ? adminTask.message
                            : 'ระบบสตรีมกลางพร้อมทำงานปกติ'}
                        </span>
                      </div>
                      <p className="text-xs text-muted mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="inline-flex items-center gap-1">
                          {syncState === 'connected' ? (
                            <Wifi className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <WifiOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                          )}
                          <span>
                            {syncState === 'connected'
                              ? 'ซิงค์เรียลไทม์ (SSE) ปกติ'
                              : syncState === 'connecting'
                              ? 'กำลังเชื่อมต่อระบบซิงค์...'
                              : 'กำลังเชื่อมต่อซิงค์ใหม่อัตโนมัติ...'}
                          </span>
                        </span>
                        {lastSyncAt && (
                          <span className="tabular-nums">
                            · อัปเดตล่าสุด{' '}
                            {new Date(lastSyncAt).toLocaleTimeString('th-TH', {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <Button
                    tone="quiet"
                    onClick={async () => {
                      setAdminTask({
                        state: 'working',
                        message: 'กำลังตรวจสอบสถานะและซิงค์ข้อมูลล่าสุด...',
                        updatedAt: Date.now(),
                      });
                      await Promise.all([refreshServerStreams(), refreshAdminStatus()]);
                      setAdminTask({
                        state: 'done',
                        message: 'ตรวจสอบสถานะระบบล่าสุดแล้ว',
                        updatedAt: Date.now(),
                      });
                    }}
                    disabled={adminStatusLoading}
                    className="min-h-9 px-3 text-xs shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${adminStatusLoading ? 'animate-spin' : ''}`} />
                    <span>รีเฟรชสถานะ</span>
                  </Button>
                </Surface>

                {/* 4 Operational Status Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                  <Surface className="border border-border/75 p-4 space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-muted">
                      <span>เซิร์ฟเวอร์สตรีมกลาง</span>
                      <Server className="w-4 h-4 text-primary" />
                    </div>
                    <p className="text-sm font-semibold flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-600 dark:bg-emerald-400 shrink-0" />
                      <span>
                        {adminStatus?.serverStatus === 'online' ? 'ออนไลน์ · พร้อมสตรีม' : 'กำลังตรวจสอบ...'}
                      </span>
                    </p>
                    <p className="text-xs text-muted tabular-nums">
                      {adminStatus
                        ? `เปิดทำงาน ${
                            adminStatus.uptimeSec >= 3600
                              ? `${Math.floor(adminStatus.uptimeSec / 3600)} ชม. ${Math.floor(
                                  (adminStatus.uptimeSec % 3600) / 60
                                )} นาที`
                              : adminStatus.uptimeSec >= 60
                              ? `${Math.floor(adminStatus.uptimeSec / 60)} นาที ${adminStatus.uptimeSec % 60} วิ`
                              : `${adminStatus.uptimeSec} วินาที`
                          } · ${adminStatus.storageWritable ? 'พื้นที่จัดเก็บพร้อมเขียน' : 'อ่านอย่างเดียว'}`
                        : 'กำลังดึงข้อมูลเซิร์ฟเวอร์'}
                    </p>
                  </Surface>

                  <Surface className="border border-border/75 p-4 space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-muted">
                      <span>การเชื่อมต่อหลายเครื่อง</span>
                      <Wifi className="w-4 h-4 text-primary" />
                    </div>
                    <p className="text-sm font-semibold tabular-nums">
                      {liveConnectedDevices} เครื่องกำลังออนไลน์
                    </p>
                    <p className="text-xs text-muted">
                      {syncState === 'connected'
                        ? 'ซิงค์คลังเพลงอัตโนมัติทุกอุปกรณ์'
                        : 'กำลังเชื่อมต่อช่องสัญญาณซิงค์'}
                    </p>
                  </Surface>

                  <Surface className="border border-border/75 p-4 space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-muted">
                      <span>คลังเพลงจาก HDD &amp; สตรีม</span>
                      <Radio className="w-4 h-4 text-primary" />
                    </div>
                    <p className="text-sm font-semibold tabular-nums">
                      {serverStreams.length} เพลง · {formatFileSize(adminStats.totalBytes)}
                    </p>
                    <p className="text-xs text-muted tabular-nums">
                      HDD โฮสต์ {adminStats.hddCount} (ไม่อัปโหลด) · URL {adminStats.urlCount}
                    </p>
                  </Surface>

                  <Surface className="border border-border/75 p-4 space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-muted">
                      <span>โฟลเดอร์ HDD โฮสต์</span>
                      <HardDrive className="w-4 h-4 text-primary" />
                    </div>
                    <p className="text-sm font-semibold tabular-nums">
                      {adminStatus?.mountedFolders.length ?? 0} โฟลเดอร์ (เฝ้าดู{' '}
                      {adminStatus?.watchingHddCount ?? 0} จุด)
                    </p>
                    <p
                      className="text-xs text-muted truncate"
                      title={
                        adminStatus && adminStatus.mountedFolders.length > 0
                          ? adminStatus.mountedFolders.map((f) => f.path).join(', ')
                          : ''
                      }
                    >
                      {adminStatus && adminStatus.mountedFolders.length > 0
                        ? adminStatus.mountedFolders
                            .map((f) => `${f.path} (${f.trackCount})`)
                            .join(' · ')
                        : 'ยังไม่ได้เชื่อมต่อโฟลเดอร์ HDD โฮสต์'}
                    </p>
                  </Surface>
                </div>

                {/* Recent Admin Activity Status */}
                <Surface className="border border-border/75 p-4">
                  <div className="flex items-center justify-between mb-2.5">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
                      ประวัติการทำงานล่าสุด
                    </h2>
                    <span className="text-[11px] text-muted tabular-nums">
                      {adminStatus?.recentActivities.length || 0} รายการล่าสุด
                    </span>
                  </div>
                  {adminStatus && adminStatus.recentActivities.length > 0 ? (
                    <ul className="divide-y divide-border/50">
                      {adminStatus.recentActivities.slice(0, 5).map((act) => (
                        <li
                          key={act.id}
                          className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                act.status === 'error'
                                  ? 'bg-red-600 dark:bg-red-400'
                                  : act.status === 'info'
                                  ? 'bg-primary'
                                  : 'bg-emerald-600 dark:bg-emerald-400'
                              }`}
                            />
                            <span className="font-medium text-foreground whitespace-nowrap">
                              {act.action}
                            </span>
                            <span className="text-muted truncate">{act.detail}</span>
                          </div>
                          <span className="text-[11px] font-mono tabular-nums text-muted shrink-0">
                            {new Date(act.timestamp).toLocaleTimeString('th-TH', {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted">
                      ยังไม่มีประวัติการจัดการเพลง — เมื่อ Admin เพิ่ม แก้ไข หรือจัดลำดับเพลง สถานะจะแสดงที่นี่
                    </p>
                  )}
                </Surface>
              </div>
            )}

            {/* Active Studio Visualizer Strip */}
            <Surface className="border border-border/75 p-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5 min-w-0">
                <button
                  type="button"
                  onClick={() => setAlbumShowcaseOpen(true)}
                  aria-label="ขยายดูหน้าปกอัลบั้มใหญ่เต็มหน้า"
                  title="คลิกเพื่อโชว์หน้าปกอัลบั้มใหญ่เต็มหน้า"
                  className="relative group shrink-0 rounded-lg cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <TrackCover
                    src={resolvedCurrentTrack?.coverDataUrl}
                    seed={resolvedCurrentTrack?.coverSeed ?? 1}
                    title={resolvedCurrentTrack?.title || 'Aura Audio'}
                    sizeClass="w-14 h-14"
                  />
                  <span className="absolute inset-0 rounded-lg bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                    <Maximize2 className="w-4 h-4" />
                  </span>
                </button>
                <div className="min-w-0">
                  <p className="text-xs text-muted truncate">
                    {isBuffering
                      ? 'กำลังเชื่อมต่อเสียง...'
                      : isPlaying
                      ? 'กำลังเล่น'
                      : 'หยุดชั่วคราว'}{' '}
                    · {currentTrack?.format || 'READY'}
                    {currentTrack?.formatDetail ? ` · ${currentTrack.formatDetail}` : ''}
                  </p>
                  <p className="text-sm sm:text-base font-semibold truncate mt-0.5" title={currentTrack?.title}>
                    {currentTrack ? currentTrack.title : 'เลือกเพลงจากรายการด้านล่าง'}
                  </p>
                  <p className="text-xs text-muted truncate">
                    {currentTrack ? currentTrack.artist : 'รองรับไฟล์ภายในเครื่องทุกนามสกุลและสตรีมกลางทุกเครื่อง'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto shrink-0">
                <div className="flex-1 sm:w-52">
                  <VisualizerCanvas
                    analyser={analyserRef.current}
                    isPlaying={isPlaying}
                    isSynthOrCors={activeEngineRef.current === 'local' && isSameOriginTrack(currentTrack)}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setAlbumShowcaseOpen(true)}
                  aria-label="โชว์หน้าปกอัลบั้มเต็มหน้า"
                  title="โชว์หน้าปกอัลบั้มใหญ่เต็มหน้า"
                  className="h-10 px-3 rounded-control border border-border/80 bg-background hover:bg-foreground/5 text-xs font-medium text-foreground inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-primary" />
                  <span className="hidden md:inline">ปกใหญ่เต็มหน้า</span>
                </button>
              </div>
            </Surface>

            {/* Group By Selector Bar (Folder / Artist / Genre) */}
            <div className="mb-4 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="แยกเพลงตามหมวดหมู่">
                  <span className="text-xs font-medium text-muted mr-1">แยกเพลงตาม:</span>
                  {(
                    [
                      { id: 'none', label: 'ทั้งหมด', icon: Layers },
                      { id: 'folder', label: 'โฟลเดอร์', icon: FolderOpen },
                      { id: 'artist', label: 'ศิลปิน', icon: User },
                      { id: 'genre', label: 'แนวเพลง', icon: Tag },
                    ] as const
                  ).map((mode) => {
                    const ModeIcon = mode.icon;
                    const active = groupBy === mode.id;
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => setGroupBy(mode.id)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap cursor-pointer inline-flex items-center gap-1.5 ${
                          active
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-surface text-muted border-border hover:text-foreground'
                        }`}
                      >
                        <ModeIcon className="w-3.5 h-3.5" />
                        <span>{mode.label}</span>
                      </button>
                    );
                  })}
                </div>

                {groupBy !== 'none' && groupedSections.length > 0 && (
                  <span className="text-xs text-muted tabular-nums">
                    แสดง {visibleSections.length}/{groupedSections.length} กลุ่ม ·{' '}
                    {displayedTracks.length} เพลง
                  </span>
                )}
              </div>

              {groupBy !== 'none' && groupedSections.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedGroupKey('ALL')}
                    className={`px-2.5 py-1 rounded-control text-xs font-medium border transition-colors cursor-pointer ${
                      selectedGroupKey === 'ALL'
                        ? 'bg-foreground text-surface border-foreground'
                        : 'bg-surface text-muted border-border/75 hover:text-foreground'
                    }`}
                  >
                    ทุกกลุ่ม ({filteredTracks.length})
                  </button>
                  {groupedSections.map((section) => {
                    const active = selectedGroupKey === section.key;
                    return (
                      <button
                        key={section.key}
                        type="button"
                        onClick={() => setSelectedGroupKey(section.key)}
                        className={`px-2.5 py-1 rounded-control text-xs font-medium border transition-colors cursor-pointer max-w-[14rem] truncate ${
                          active
                            ? 'bg-foreground text-surface border-foreground'
                            : 'bg-surface text-muted border-border/75 hover:text-foreground'
                        }`}
                        title={`${section.label} (${section.tracks.length})`}
                      >
                        {section.label} ({section.tracks.length})
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Track Table / Grouped Sections */}
            {displayedTracks.length > 0 ? (
              (() => {
                const renderTrackTable = (tracksToRender: Track[], allowReorder: boolean) => (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left">
                      <thead>
                        <tr className="border-b border-border/70 text-[12px] font-medium text-muted uppercase tracking-wider">
                          <th className="py-3 pl-4 pr-2 w-10 text-center">#</th>
                          <th className="py-3 px-3">เพลง / ศิลปิน / แนวเพลง</th>
                          <th className="py-3 px-3 hidden sm:table-cell">แหล่งที่มา · โฟลเดอร์ · รูปแบบ</th>
                          <th className="py-3 px-3 text-right w-20">เวลา</th>
                          <th className="py-3 pl-2 pr-4 text-right w-40">จัดการ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {tracksToRender.map((track, idx) => {
                          const isCurrent = currentTrack?.id === track.id;
                          const isFav = prefs.favorites.includes(track.id);
                          const isShared = Boolean(track.isSharedStream);
                          const canEditShared = isAdmin && isShared;
                          const canDelete = track.source === 'local' || canEditShared;
                          const isReorderable =
                            allowReorder &&
                            isAdmin &&
                            isShared &&
                            !searchQuery.trim() &&
                            formatFilter === 'all' &&
                            (activeTab === 'admin' || activeTab === 'stream');
                          const displayFolder = track.folderName || track.syncedFolder;

                          return (
                            <tr
                              key={track.id}
                              className={`transition-colors hover:bg-foreground/4 ${
                                isCurrent ? 'bg-foreground/6' : ''
                              }`}
                            >
                              <td className="py-3 pl-4 pr-2 text-center text-xs font-mono tabular-nums text-muted">
                                {isCurrent && isPlaying ? (
                                  <Volume2 className="w-4 h-4 text-primary mx-auto" />
                                ) : (
                                  idx + 1
                                )}
                              </td>

                              <td className="py-3 px-3 min-w-0 max-w-[16rem] sm:max-w-xs">
                                <button
                                  type="button"
                                  onClick={() => playTrack(track)}
                                  className="w-full flex items-center gap-3 text-left min-w-0 cursor-pointer group"
                                >
                                  <TrackCover
                                    src={track.coverDataUrl}
                                    seed={track.coverSeed}
                                    title={track.title}
                                    sizeClass="w-10 h-10"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <p
                                      className={`text-sm font-medium truncate group-hover:text-primary transition-colors ${
                                        isCurrent ? 'text-primary' : 'text-foreground'
                                      }`}
                                      title={track.title}
                                    >
                                      {track.title}
                                    </p>
                                    <p
                                      className="text-xs text-muted truncate"
                                      title={`${track.artist}${track.album ? ` · ${track.album}` : ''}${
                                        track.genre ? ` · ${track.genre}` : ''
                                      }`}
                                    >
                                      {track.artist}
                                      {track.album ? ` · ${track.album}` : ''}
                                      {track.genre ? ` · ${track.genre}` : ''}
                                    </p>
                                  </div>
                                </button>
                              </td>

                              <td className="py-3 px-3 hidden sm:table-cell text-xs text-muted">
                                <span className="inline-flex items-center gap-1.5 flex-wrap">
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                      track.source === 'lan'
                                        ? 'bg-sky-600 dark:bg-sky-400'
                                        : track.source === 'local' || track.hddPath
                                        ? 'bg-emerald-600 dark:bg-emerald-400'
                                        : 'bg-primary'
                                    }`}
                                  />
                                  <span className="font-medium text-foreground">
                                    {track.source === 'lan'
                                      ? `LAN · ${track.lanHostDeviceName || 'P2P'}`
                                      : track.hddPath
                                      ? 'HDD Shared'
                                      : isShared
                                      ? 'Shared Stream'
                                      : track.publishedStreamId
                                      ? 'HDD · Online'
                                      : 'Local Device'}
                                  </span>
                                  {displayFolder && (
                                    <>
                                      <span>·</span>
                                      <span className="max-w-[10rem] truncate" title={displayFolder}>
                                        {displayFolder}
                                      </span>
                                    </>
                                  )}
                                  <span>·</span>
                                  <span className="font-mono uppercase">{track.format}</span>
                                  <span className="hidden lg:inline">· {track.formatDetail}</span>
                                </span>
                              </td>

                              <td className="py-3 px-3 text-right text-xs font-mono tabular-nums text-muted">
                                {track.durationLabel}
                              </td>

                              <td className="py-3 pl-2 pr-4 text-right relative">
                                <div className="inline-flex items-center justify-end gap-0.5">
                                  {isReorderable && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handleMoveServerTrack(track.id, 'up')}
                                        disabled={idx === 0}
                                        aria-label={`เลื่อน ${track.title} ขึ้น`}
                                        title="เลื่อนขึ้น"
                                        className="w-7 h-8 rounded-control flex items-center justify-center text-muted hover:text-foreground disabled:opacity-25 cursor-pointer"
                                      >
                                        <ArrowUp className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleMoveServerTrack(track.id, 'down')}
                                        disabled={
                                          idx === serverStreams.length - 1 ||
                                          !serverStreams.some((s) => s.id === track.id)
                                        }
                                        aria-label={`เลื่อน ${track.title} ลง`}
                                        title="เลื่อนลง"
                                        className="w-7 h-8 rounded-control flex items-center justify-center text-muted hover:text-foreground disabled:opacity-25 cursor-pointer"
                                      >
                                        <ArrowDown className="w-3.5 h-3.5" />
                                      </button>
                                    </>
                                  )}

                                  {canEditShared && (
                                    <button
                                      type="button"
                                      onClick={() => setEditingTrack(track)}
                                      aria-label={`แก้ไขข้อมูล ${track.title}`}
                                      title="แก้ไขข้อมูลเพลง"
                                      className="w-8 h-8 rounded-control flex items-center justify-center text-muted hover:text-foreground cursor-pointer"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                  )}

                                  {isShared && (
                                    <button
                                      type="button"
                                      onClick={() => handleCopyStreamLink(track)}
                                      title="คัดลอกลิงก์สตรีมจาก HDD"
                                      aria-label={`คัดลอกลิงก์สตรีม ${track.title}`}
                                      className="w-8 h-8 rounded-control flex items-center justify-center transition-colors cursor-pointer text-primary hover:bg-foreground/5"
                                    >
                                      <Radio className="w-4 h-4" />
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => handleToggleFavorite(track.id)}
                                    aria-label={
                                      isFav
                                        ? `นำ ${track.title} ออกจากเพลงที่ถูกใจ`
                                        : `เพิ่ม ${track.title} เป็นเพลงที่ถูกใจ`
                                    }
                                    className={`w-8 h-8 rounded-control flex items-center justify-center transition-colors cursor-pointer ${
                                      isFav ? 'text-primary' : 'text-muted hover:text-foreground'
                                    }`}
                                  >
                                    <Heart className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
                                  </button>

                                  {prefs.playlists.length > 0 && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setPlaylistMenuTrackId((prev) =>
                                          prev === track.id ? null : track.id
                                        )
                                      }
                                      aria-label={`เพิ่ม ${track.title} ลงเพลย์ลิสต์`}
                                      className="w-8 h-8 rounded-control flex items-center justify-center text-muted hover:text-foreground cursor-pointer"
                                    >
                                      <ListPlus className="w-4 h-4" />
                                    </button>
                                  )}

                                  {canDelete && (
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveTrack(track)}
                                      aria-label={`ลบ ${track.title}`}
                                      className="w-8 h-8 rounded-control flex items-center justify-center text-muted hover:text-red-700 dark:hover:text-red-400 cursor-pointer"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>

                                {playlistMenuTrackId === track.id && (
                                  <Surface className="absolute right-4 top-12 z-30 w-48 border border-border p-1.5 text-left shadow-lg">
                                    <p className="px-2.5 py-1 text-[11px] font-medium text-muted">
                                      เพิ่มเข้าเพลย์ลิสต์
                                    </p>
                                    {prefs.playlists.map((pl) => {
                                      const inPl = pl.trackIds.includes(track.id);
                                      return (
                                        <button
                                          key={pl.id}
                                          type="button"
                                          onClick={() =>
                                            handleToggleTrackInPlaylist(pl.id, track.id)
                                          }
                                          className="w-full px-2.5 py-1.5 rounded-control text-xs flex items-center justify-between hover:bg-foreground/5 cursor-pointer"
                                        >
                                          <span className="truncate">{pl.name}</span>
                                          <span className="text-primary font-medium ml-2">
                                            {inPl ? '✓' : '+'}
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </Surface>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );

                if (groupBy === 'none') {
                  return (
                    <Surface className="border border-border/75 overflow-hidden">
                      {renderTrackTable(filteredTracks, true)}
                    </Surface>
                  );
                }

                const GroupIcon =
                  groupBy === 'folder' ? FolderOpen : groupBy === 'artist' ? User : Tag;

                return (
                  <div className="space-y-4">
                    {visibleSections.map((section) => (
                      <Surface
                        key={section.key}
                        className="border border-border/75 overflow-hidden"
                      >
                        <div className="px-4 py-3 border-b border-border/70 bg-background/50 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-7 h-7 rounded-control bg-surface border border-border/70 flex items-center justify-center text-primary shrink-0">
                              <GroupIcon className="w-3.5 h-3.5" />
                            </div>
                            <div className="min-w-0">
                              <h3 className="text-sm font-semibold truncate" title={section.label}>
                                {section.label}
                              </h3>
                              <p className="text-[11px] text-muted tabular-nums">
                                {section.tracks.length} เพลง
                              </p>
                            </div>
                          </div>
                          <Button
                            tone="quiet"
                            onClick={() => {
                              setSelectedGroupKey(section.key);
                              if (section.tracks[0]) playTrack(section.tracks[0]);
                            }}
                            className="min-h-8 px-3 text-xs shrink-0"
                          >
                            <Play className="w-3 h-3 fill-current" />
                            <span>เล่นกลุ่มนี้</span>
                          </Button>
                        </div>
                        {renderTrackTable(section.tracks, false)}
                      </Surface>
                    ))}
                  </div>
                );
              })()
            ) : (
              <Surface className="border border-border/75 py-14 px-6 text-center">
                <div className="w-11 h-11 rounded-full bg-background border border-border/70 flex items-center justify-center mx-auto mb-3 text-muted">
                  {activeTab === 'lan' ? (
                    <Network className="w-5 h-5" />
                  ) : (
                    <Music2 className="w-5 h-5" />
                  )}
                </div>
                <p className="text-base font-medium">
                  {activeTab === 'lan'
                    ? 'ยังไม่ได้เชื่อมต่อเพลงจากเครื่องอื่นในวง Local Network'
                    : activeTab === 'stream' || activeTab === 'admin'
                    ? 'ยังไม่มีเพลงในคลังสตรีมออนไลน์ส่วนกลาง'
                    : 'ไม่พบเพลงในหมวดหมู่นี้'}
                </p>
                <p className="text-sm text-muted mt-1 mb-5">
                  {activeTab === 'lan'
                    ? 'เปิดหน้าต่าง Local Network เพื่อเชื่อมต่อเครื่องอื่นใน Wi-Fi เดียวกัน หรือเปิดแชร์เพลงจากเครื่องนี้'
                    : isAdmin
                    ? 'เลือกโฟลเดอร์หรือไฟล์บน HDD เพื่อสตรีมตรงให้ทุกเครื่องทันที โดยไม่อัปโหลดไฟล์ขึ้นระบบ'
                    : 'คุณสามารถเลือกไฟล์เพลงจาก HDD บนอุปกรณ์นี้มาฟังโดยตรง (ไม่อัปโหลด) หรือเข้าสู่ระบบ Admin'}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {activeTab === 'lan' ? (
                    <>
                      <Button tone="primary" onClick={() => setLanModalOpen(true)}>
                        <Network className="w-4 h-4" />
                        <span>เปิดหน้าต่าง Local Network (Wi-Fi / LAN)</span>
                      </Button>
                      {lanHosts
                        .filter((h) => h.deviceId !== deviceIdentity.deviceId)
                        .slice(0, 3)
                        .map((host) => (
                          <Button
                            key={host.deviceId}
                            tone="quiet"
                            disabled={connectingLanHostId === host.deviceId}
                            onClick={() => void handleConnectLanHost(host)}
                          >
                            <Wifi className="w-4 h-4 text-primary" />
                            <span>
                              {connectingLanHostId === host.deviceId
                                ? 'กำลังเชื่อม...'
                                : `ฟังจาก ${host.deviceName} (${host.trackCount})`}
                            </span>
                          </Button>
                        ))}
                    </>
                  ) : isAdmin ? (
                    <>
                      <Button tone="primary" onClick={() => setHddModalOpen(true)}>
                        <HardDrive className="w-4 h-4" />
                        <span>เลือกโฟลเดอร์/ไฟล์บน HDD (ไม่อัปโหลด)</span>
                      </Button>
                      <Button tone="quiet" onClick={() => setStreamModalOpen(true)}>
                        <Plus className="w-4 h-4" />
                        <span>เพิ่มลิงก์สตรีม URL</span>
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button tone="primary" onClick={() => setHddModalOpen(true)}>
                        <HardDrive className="w-4 h-4" />
                        <span>เลือกไฟล์/โฟลเดอร์จาก HDD เครื่องนี้</span>
                      </Button>
                      <Button tone="quiet" onClick={() => setAuthModalOpen(true)}>
                        <ShieldCheck className="w-4 h-4" />
                        <span>เข้าสู่ระบบ Admin</span>
                      </Button>
                    </>
                  )}
                </div>
              </Surface>
            )}
          </div>
          )}
        </main>
      </div>

      {/* Persistent Minimalist Player Bar */}
      <footer className="border-t border-border/75 bg-surface px-4 md:px-7 py-3 shrink-0 z-20">
        {activeCastTarget && (
          <div className="mb-2.5 pb-2 border-b border-border/60 flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-1.5 text-primary font-medium min-w-0">
              <Cast className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                กำลังแคสต์ไปที่ {activeCastTarget.deviceName}
              </span>
            </span>
            <button
              type="button"
              onClick={() => void handleRemoteCastAction('stop')}
              className="text-muted hover:text-foreground underline whitespace-nowrap cursor-pointer shrink-0"
            >
              หยุดแคสต์
            </button>
          </div>
        )}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Left: Current Track Info */}
          <div className="flex items-center gap-3 w-full sm:w-1/3 min-w-0">
            <button
              type="button"
              onClick={() => setAlbumShowcaseOpen((prev) => !prev)}
              aria-label={albumShowcaseOpen ? 'ปิดหน้าปกอัลบั้มเต็มหน้า' : 'ดูหน้าปกอัลบั้มใหญ่เต็มหน้า'}
              title={albumShowcaseOpen ? 'คลิกเพื่อกลับรายการเพลง' : 'คลิกเพื่อโชว์หน้าปกอัลบั้มใหญ่เต็มหน้า'}
              className="relative shrink-0 rounded-full cursor-pointer group focus-visible:outline-2 focus-visible:outline-primary"
            >
              <TrackCover
                src={resolvedCurrentTrack?.coverDataUrl}
                seed={resolvedCurrentTrack?.coverSeed ?? 1}
                title={resolvedCurrentTrack?.title || 'Aura'}
                sizeClass="w-11 h-11"
                roundedClass="rounded-full"
                spinning={isPlaying}
              />
              <span
                aria-hidden="true"
                className="w-2.5 h-2.5 rounded-full bg-surface border border-border absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
              />
            </button>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate" title={currentTrack?.title}>
                {currentTrack ? currentTrack.title : 'ยังไม่ได้เลือกเพลง'}
              </p>
              <p className="text-xs text-muted truncate" title={currentTrack?.artist}>
                {currentTrack ? `${currentTrack.artist} · ${currentTrack.format}` : 'Aura Minimal Player'}
              </p>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {currentTrack && (
                <button
                  type="button"
                  onClick={() => handleToggleFavorite(currentTrack.id)}
                  aria-label={isCurrentFav ? 'นำออกจากเพลงที่ถูกใจ' : 'เพิ่มเป็นเพลงที่ถูกใจ'}
                  className={`w-9 h-9 rounded-control flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                    isCurrentFav ? 'text-primary' : 'text-muted hover:text-foreground'
                  }`}
                >
                  <Heart className={`w-4 h-4 ${isCurrentFav ? 'fill-current' : ''}`} />
                </button>
              )}
              <button
                type="button"
                onClick={() => setCastModalOpen(true)}
                aria-label="แคสต์ไปยังอุปกรณ์ใกล้เคียง"
                title="แคสต์ไปยังอุปกรณ์ใกล้เคียง"
                className={`sm:hidden w-9 h-9 rounded-control flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                  activeCastTarget || nativeCastState === 'connected'
                    ? 'text-primary'
                    : 'text-muted hover:text-foreground'
                }`}
              >
                <Cast className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setEqOpen((prev) => !prev)}
                aria-label="เปิดอีควอไลเซอร์"
                className={`sm:hidden w-9 h-9 rounded-control flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                  eqOpen || prefs.eqPreset !== 'flat' || prefs.playbackRate !== 1
                    ? 'text-primary'
                    : 'text-muted hover:text-foreground'
                }`}
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setQueueOpen(true)}
                aria-label="เปิดคิวเพลง"
                className="sm:hidden w-9 h-9 rounded-control flex items-center justify-center text-muted hover:text-foreground cursor-pointer shrink-0"
              >
                <ListMusic className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Center: Transport & Seek Bar */}
          <div className="flex flex-col items-center w-full sm:w-1/3 max-w-md">
            <div className="flex items-center gap-3 sm:gap-5 mb-1.5">
              <button
                type="button"
                onClick={() => setIsShuffle((prev) => !prev)}
                aria-label="สลับโหมดสุ่มเพลง"
                aria-pressed={isShuffle}
                title="สุ่มเพลง"
                className={`w-8 h-8 rounded-control flex items-center justify-center transition-colors cursor-pointer ${
                  isShuffle ? 'text-primary' : 'text-muted hover:text-foreground'
                }`}
              >
                <Shuffle className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={playPrev}
                aria-label="เพลงก่อนหน้า"
                title="เพลงก่อนหน้า"
                className="w-9 h-9 rounded-control flex items-center justify-center text-foreground hover:bg-foreground/5 cursor-pointer"
              >
                <SkipBack className="w-4 h-4 fill-current" />
              </button>

              <button
                type="button"
                onClick={togglePlayPause}
                aria-label={isPlaying ? 'หยุดชั่วคราว' : 'เล่นเพลง'}
                title={isPlaying ? 'หยุดชั่วคราว (Space)' : 'เล่น (Space)'}
                className="w-10 h-10 rounded-full bg-foreground text-surface flex items-center justify-center hover:brightness-95 active:scale-95 transition-transform cursor-pointer"
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4 fill-current" />
                ) : (
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                )}
              </button>

              <button
                type="button"
                onClick={playNext}
                aria-label="เพลงถัดไป"
                title="เพลงถัดไป"
                className="w-9 h-9 rounded-control flex items-center justify-center text-foreground hover:bg-foreground/5 cursor-pointer"
              >
                <SkipForward className="w-4 h-4 fill-current" />
              </button>

              <button
                type="button"
                onClick={() =>
                  setRepeatMode((prev) => (prev === 'off' ? 'all' : prev === 'all' ? 'one' : 'off'))
                }
                aria-label={`โหมดเล่นซ้ำ: ${repeatMode}`}
                title="เล่นซ้ำ"
                className={`w-8 h-8 rounded-control flex items-center justify-center transition-colors cursor-pointer ${
                  repeatMode !== 'off' ? 'text-primary' : 'text-muted hover:text-foreground'
                }`}
              >
                {repeatMode === 'one' ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
              </button>
            </div>

            <div className="w-full flex items-center gap-2.5">
              <span className="text-[11px] font-mono tabular-nums text-muted w-10 text-right">
                {isLiveTrack ? 'LIVE' : formatTime(currentTime)}
              </span>
              <input
                type="range"
                min={0}
                max={isLiveTrack ? 100 : Math.max(duration, 1)}
                step={0.5}
                value={isLiveTrack ? (isPlaying ? 100 : 0) : Math.min(currentTime, duration || 1)}
                disabled={isLiveTrack}
                aria-label="แถบเวลาเพลง"
                onChange={(e) => handleSeek(Number(e.target.value))}
                className="aura-range flex-1 disabled:opacity-50"
              />
              <span className="text-[11px] font-mono tabular-nums text-muted w-10">
                {isLiveTrack ? '∞' : formatTime(duration)}
              </span>
            </div>
          </div>

          {/* Right: Cast, EQ, Queue, Volume */}
          <div className="hidden sm:flex items-center justify-end gap-2 w-1/3">
            <button
              type="button"
              onClick={() => setCastModalOpen(true)}
              aria-label="แคสต์ไปยังอุปกรณ์ใกล้เคียง"
              title="แคสต์ไปยังอุปกรณ์ใกล้เคียง"
              className={`min-h-9 px-2.5 rounded-control border flex items-center gap-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                activeCastTarget || nativeCastState === 'connected'
                  ? 'border-primary text-primary'
                  : 'border-border text-muted hover:text-foreground'
              }`}
            >
              <Cast className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">
                {activeCastTarget ? 'กำลังแคสต์' : 'แคสต์'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setEqOpen((prev) => !prev)}
              aria-label="เปิดอีควอไลเซอร์และความเร็ว"
              title="อีควอไลเซอร์และความเร็ว"
              className={`min-h-9 px-2.5 rounded-control border flex items-center gap-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                eqOpen || prefs.eqPreset !== 'flat' || prefs.playbackRate !== 1
                  ? 'border-primary text-primary'
                  : 'border-border text-muted hover:text-foreground'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">EQ</span>
              {prefs.playbackRate !== 1 && (
                <span className="font-mono tabular-nums">{prefs.playbackRate}x</span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setQueueOpen(true)}
              aria-label="เปิดคิวเพลง"
              title="คิวเพลง"
              className="w-9 h-9 rounded-control border border-border flex items-center justify-center text-muted hover:text-foreground cursor-pointer"
            >
              <ListMusic className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-1.5 w-28 pl-1">
              <button
                type="button"
                onClick={() => setIsMuted((prev) => !prev)}
                aria-label={isMuted ? 'เปิดเสียง' : 'ปิดเสียง'}
                className="w-8 h-8 rounded-control flex items-center justify-center text-muted hover:text-foreground cursor-pointer shrink-0"
              >
                {isMuted || prefs.volume === 0 ? (
                  <VolumeX className="w-4 h-4" />
                ) : prefs.volume < 0.5 ? (
                  <Volume1 className="w-4 h-4" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={isMuted ? 0 : prefs.volume}
                aria-label="ระดับเสียง"
                onChange={(e) => {
                  const vol = Number(e.target.value);
                  setIsMuted(vol === 0);
                  updatePrefs((prev) => ({ ...prev, volume: vol }));
                }}
                className="aura-range w-full"
              />
            </div>
          </div>
        </div>
      </footer>

      {/* Modals & Drawers */}
      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        currentUser={currentUser}
        stats={{
          favoritesCount: prefs.favorites.length,
          localCount: localTracks.length,
          playlistsCount: prefs.playlists.length,
          sharedStreamsCount: serverStreams.length,
        }}
        onSignIn={handleSignIn}
        onSignUp={handleSignUp}
        onSignOut={handleSignOut}
        onClearLocalFiles={handleClearLocalFiles}
        onOpenAdminPanel={() => setActiveTab('admin')}
        onOpenResetData={() => {
          setResetDefaultIncludeServer(isAdmin);
          setResetModalOpen(true);
        }}
      />

      <ResetDataModal
        open={resetModalOpen}
        onClose={() => setResetModalOpen(false)}
        isAdmin={isAdmin}
        defaultIncludeServer={resetDefaultIncludeServer}
        stats={{
          localCount: localTracks.length,
          sharedStreamsCount: serverStreams.length,
          playlistsCount: prefs.playlists.length,
          favoritesCount: prefs.favorites.length,
        }}
        onConfirmReset={handleConfirmResetData}
      />

      <StreamModal
        open={streamModalOpen}
        onClose={() => setStreamModalOpen(false)}
        isAdmin={isAdmin}
        onOpenAuth={() => setAuthModalOpen(true)}
        onAddStream={handleAddStream}
        onOpenHddMount={() => setHddModalOpen(true)}
        onRescanHdd={handleRescanHostHdd}
      />

      <HddStreamModal
        open={hddModalOpen}
        onClose={() => setHddModalOpen(false)}
        isAdmin={isAdmin}
        onOpenAuth={() => setAuthModalOpen(true)}
        savedHandles={savedHddHandles}
        syncedFolders={syncedFolders}
        onPickBrowserHddFolder={handlePickBrowserHddFolder}
        onPickBrowserHddFiles={() => fileInputRef.current?.click()}
        onReconnectHandle={handleReconnectHddHandle}
        onRemoveHandle={handleRemoveHddHandle}
        onRemoveSyncedFolder={handleRemoveSyncedFolder}
        onHostHddScanned={async (tracks, folder) => {
          await refreshServerStreams();
          await refreshAdminStatus();
          setActiveTab('admin');
          setAdminTask({
            state: 'done',
            message: `เชื่อมต่อ HDD "${folder}" พบ ${tracks.length} เพลง (ไม่อัปโหลด)`,
            updatedAt: Date.now(),
          });
          showStatus(`สตรีมตรงจาก HDD "${folder}" จำนวน ${tracks.length} เพลงแล้ว (ไม่อัปโหลดขึ้นระบบ)`);
          if (tracks.length > 0) playTrack(tracks[0]);
        }}
        onHostHddFilesAdded={async (tracks) => {
          await refreshServerStreams();
          await refreshAdminStatus();
          setActiveTab('admin');
          setAdminTask({
            state: 'done',
            message: `เพิ่มไฟล์จาก HDD ${tracks.length} เพลงเข้าสตรีมตรงแล้ว`,
            updatedAt: Date.now(),
          });
          showStatus(`สตรีมตรงจาก HDD ${tracks.length} เพลงแล้ว (ไม่อัปโหลดขึ้นระบบ)`);
          if (tracks.length > 0) playTrack(tracks[0]);
        }}
        onHostHddUnmounted={async (folder) => {
          await refreshServerStreams();
          await refreshAdminStatus();
          setAdminTask({
            state: 'done',
            message: `ถอดโฟลเดอร์ "${folder}" ออกจากสตรีมแล้ว`,
            updatedAt: Date.now(),
          });
          showStatus(`ยกเลิกการเชื่อมต่อโฟลเดอร์ "${folder}" แล้ว`);
        }}
      />

      <AdminTrackModal
        track={editingTrack}
        onClose={() => setEditingTrack(null)}
        onSave={handleSaveEditedTrack}
      />

      <PlaylistModal
        open={playlistModalOpen}
        onClose={() => setPlaylistModalOpen(false)}
        onCreate={handleCreatePlaylist}
      />

      <EqualizerPopover
        open={eqOpen}
        onClose={() => setEqOpen(false)}
        preset={prefs.eqPreset}
        bands={prefs.eqBands}
        playbackRate={prefs.playbackRate}
        onSelectPreset={handleSelectEqPreset}
        onChangeBand={handleChangeEqBand}
        onChangePlaybackRate={(rate) => updatePrefs((prev) => ({ ...prev, playbackRate: rate }))}
      />

      <QueueDrawer
        open={queueOpen}
        onClose={() => setQueueOpen(false)}
        queue={activeQueue}
        currentTrackId={currentTrack?.id || null}
        isPlaying={isPlaying}
        onSelectTrack={(track) => playTrack(track)}
      />

      <CastModal
        open={castModalOpen}
        onClose={() => setCastModalOpen(false)}
        myDevice={deviceIdentity}
        onRenameMyDevice={handleRenameMyDevice}
        connectedDevices={connectedDevices}
        activeCastTarget={activeCastTarget}
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        castingBusyId={castingBusyId}
        nativeCastState={nativeCastState}
        nativeCastSupported={nativeCastSupported}
        audioOutputs={audioOutputs}
        selectedSinkId={selectedSinkId}
        canSelectAudioOutput={canSelectAudioOutput}
        onCastToDevice={handleCastToDevice}
        onRemoteAction={handleRemoteCastAction}
        onTriggerNativeCast={handleTriggerNativeCast}
        onSelectAudioOutputPrompt={handleSelectAudioOutputPrompt}
        onSelectSinkId={handleApplySinkId}
        onRefreshOutputs={refreshAudioOutputs}
      />

      <AndroidGitHubModal
        open={androidModalOpen}
        onClose={() => setAndroidModalOpen(false)}
        onServerUrlSaved={(resolvedUrl) => {
          setServerConfigVersion((v) => v + 1);
          showStatus(
            resolvedUrl
              ? `เชื่อมต่อเซิร์ฟเวอร์ ${resolvedUrl} แล้ว`
              : 'สลับกลับไปใช้เซิร์ฟเวอร์เริ่มต้นแล้ว'
          );
        }}
      />

      <LanNetworkModal
        open={lanModalOpen}
        onClose={() => setLanModalOpen(false)}
        myDevice={deviceIdentity}
        isSharingLan={isSharingLan}
        sharingBusy={sharingLanBusy}
        localTrackCount={localTracks.length}
        activePeerCount={lanPeerCount}
        lanHosts={lanHosts}
        connectedHostIds={connectedLanHostIds}
        connectingHostId={connectingLanHostId}
        onToggleShareLan={handleToggleShareLan}
        onConnectLanHost={handleConnectLanHost}
        onDisconnectLanHost={handleDisconnectLanHost}
        onRefreshLanHosts={handleRefreshLanHosts}
        onServerUrlSaved={(resolvedUrl) => {
          setServerConfigVersion((v) => v + 1);
          showStatus(
            resolvedUrl
              ? `สลับเซิร์ฟเวอร์เป็น ${resolvedUrl} แล้ว`
              : 'สลับกลับไปใช้เซิร์ฟเวอร์เริ่มต้นแล้ว'
          );
        }}
      />
      <PWAUpdateBanner />
      <OfflineIndicator />
    </div>
  );
}
