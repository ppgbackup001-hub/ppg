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
  Moon,
  Music2,
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
import { AndroidGitHubModal } from './components/AndroidGitHubModal';
import { AuthModal } from './components/AuthModal';
import { CastModal, type AudioOutputDeviceOption } from './components/CastModal';
import { EqualizerPopover } from './components/EqualizerPopover';
import { HddStreamModal } from './components/HddStreamModal';
import { PlaylistModal } from './components/PlaylistModal';
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
  fetchServerHddStreams,
  getOrCreateDeviceIdentity,
  getServerBaseUrl,
  publishTrackToServerStream,
  reorderSharedStreams,
  rescanAllHostHddFolders,
  resolveTrackPlayableUrl,
  saveLocalDeviceName,
  sendCastCommand,
  subscribeToStreamEvents,
  updateDevicePresence,
  updateSharedStreamMeta,
  type LocalDeviceIdentity,
} from './utils/api';
import {
  AUDIO_ACCEPT_STRING,
  collectFilesFromDataTransfer,
  decodeBlobToWavUrl,
  extractFolderNameFromRelativePath,
  extractLocalTrack,
  formatFileSize,
  formatTime,
  getFileExtension,
  hashStringToSeed,
  isSupportedAudioFile,
  isSupportedAudioFilename,
  parseM3uContent,
} from './utils/audioMetadata';
import {
  clearHddHandlesFromDb,
  clearLocalTracksFromDb,
  clearSyncedFolderSummaries,
  createDefaultPreferences,
  deleteHddHandleFromDb,
  deleteLocalTrackFromDb,
  EQ_PRESETS,
  getLocalBlobFromDb,
  loadHddHandlesFromDb,
  loadLocalTracksFromDb,
  loadSyncedFolderSummaries,
  loadThemePreference,
  loadUserPreferences,
  removeSyncedFolderSummary,
  saveHddHandleToDb,
  saveLocalTracksBatchToDb,
  saveSyncedFolderSummary,
  saveThemePreference,
  saveUserPreferences,
  type StoredHddHandleRecord,
} from './utils/storage';

const EQ_FREQUENCIES = [60, 230, 910, 3600, 14000];

export default function App() {
  // --- Theme ---
  const [theme, setTheme] = useState<'light' | 'dark'>(() => loadThemePreference());

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    saveThemePreference(theme);
  }, [theme]);

  // --- Server-Backed Auth & Scoped Preferences ---
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const isAdmin = currentUser?.role === 'admin';
  const ownerKey = currentUser ? currentUser.id : 'guest';

  const [prefs, setPrefs] = useState<UserPreferences>(() => loadUserPreferences('guest'));
  const [localTracks, setLocalTracks] = useState<Track[]>([]);
  const [serverStreams, setServerStreams] = useState<Track[]>([]);
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
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
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

  const refreshServerStreams = useCallback(async () => {
    const serverTracks = await fetchServerHddStreams();
    setServerStreams(serverTracks);
    setLastSyncAt(Date.now());
  }, []);

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

  // Initial fetch + Real-time SSE sync & nearby device Cast listener
  useEffect(() => {
    refreshServerStreams();
    fetchConnectedDevices().then((devices) => {
      setConnectedDevices(devices);
    });
    const unsubscribe = subscribeToStreamEvents(
      () => {
        refreshServerStreams();
        if (isAdmin) {
          refreshAdminStatus();
        }
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
      }
    );
    return unsubscribe;
  }, [deviceIdentity, isAdmin, refreshAdminStatus, refreshServerStreams, serverConfigVersion]);

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

  // Reload scoped user preferences and device local files when user changes
  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;

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

    loadLocalTracksFromDb(ownerKey).then((loaded) => {
      if (!cancelled) setLocalTracks(loaded);
    });

    loadHddHandlesFromDb(ownerKey).then((handles) => {
      if (!cancelled) setSavedHddHandles(handles);
    });

    setSyncedFolders(loadSyncedFolderSummaries(ownerKey));

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

  // --- Combined Library (Shared Server Streams + Local Device HDD Tracks) ---
  const allTracks = useMemo<Track[]>(() => {
    return [...serverStreams, ...localTracks];
  }, [serverStreams, localTracks]);

  // --- Navigation, Grouping & Filters ---
  const [activeTab, setActiveTab] = useState<LibraryTab>('all');
  const [formatFilter, setFormatFilter] = useState<FormatFilter>('all');
  const [groupBy, setGroupBy] = useState<LibraryGroupBy>('none');
  const [selectedGroupKey, setSelectedGroupKey] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setSelectedGroupKey('ALL');
  }, [groupBy, activeTab]);

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
        ...(prefs.includeHddInStream ? localTracks : []),
      ];
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
      list = list.filter((t) => (t.source === 'local' || Boolean(t.hddPath)) && !t.isLossless);
    } else if (formatFilter === 'stream') {
      list = list.filter((t) => t.source === 'stream' || Boolean(t.publishedStreamId));
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
          t.format.toLowerCase().includes(q) ||
          t.formatDetail.toLowerCase().includes(q)
      );
    }

    return list;
  }, [
    allTracks,
    serverStreams,
    localTracks,
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
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const eqFiltersRef = useRef<BiquadFilterNode[]>([]);
  const masterGainRef = useRef<GainNode | null>(null);
  const localSourceConnectedRef = useRef(false);

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

  // Keep currentTrack synced if admin edits metadata from another device or modal
  useEffect(() => {
    if (!currentTrack) return;
    const updated = allTracks.find((t) => t.id === currentTrack.id);
    if (
      updated &&
      (updated.title !== currentTrack.title ||
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
    }

    if (audioCtxRef.current.state === 'suspended') {
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

  const stopAllEngines = useCallback(() => {
    if (localAudioRef.current) localAudioRef.current.pause();
    if (remoteAudioRef.current) remoteAudioRef.current.pause();
  }, []);

  const isSameOriginTrack = useCallback((track: Track | null) => {
    if (!track) return false;
    return (
      track.source === 'local' ||
      track.url.startsWith('/api/streams/') ||
      track.url.startsWith('/api/hdd/') ||
      track.url.includes('/api/streams/') ||
      track.url.includes('/api/hdd/')
    );
  }, []);

  const playTrackLocally = useCallback(
    async (track: Track, startAtSec = 0) => {
      setPlaybackError('');
      setCurrentTrack(track);
      setCurrentTime(startAtSec);
      setDuration(track.durationSec || 0);

      updatePrefs((prev) => ({
        ...prev,
        recentIds: [track.id, ...prev.recentIds.filter((id) => id !== track.id)].slice(0, 30),
      }));

      stopAllEngines();

      if (isSameOriginTrack(track)) {
        ensureAudioGraph();
        const el = localAudioRef.current;
        if (!el) return;
        setIsBuffering(true);
        el.src = track.url;
        el.playbackRate = prefs.playbackRate;
        if (startAtSec > 0 && isFinite(startAtSec)) {
          el.currentTime = startAtSec;
        }
        try {
          await el.play();
          setIsPlaying(true);
          setIsBuffering(false);
        } catch {
          if (track.source === 'local') {
            const storedBlob = await getLocalBlobFromDb(track.id);
            if (storedBlob) {
              const wavUrl = await decodeBlobToWavUrl(storedBlob);
              if (wavUrl) {
                el.src = wavUrl;
                try {
                  await el.play();
                  setIsPlaying(true);
                  setIsBuffering(false);
                  showStatus(`แปลงไฟล์ ${track.format} ผ่านตัวถอดรหัส PCM สำเร็จ`);
                  return;
                } catch {
                  // fall through
                }
              }
            }
          }
          setIsPlaying(false);
          setIsBuffering(false);
          setPlaybackError(`เบราว์เซอร์นี้ไม่รองรับการถอดรหัส ${track.format} โดยตรง`);
        }
        return;
      }

      // External HTTP/Icecast Stream
      const remoteEl = remoteAudioRef.current;
      if (!remoteEl) return;
      setIsBuffering(true);
      remoteEl.src = track.url;
      remoteEl.volume = isMuted ? 0 : prefs.volume;
      remoteEl.playbackRate = prefs.playbackRate;
      if (startAtSec > 0 && isFinite(startAtSec)) {
        remoteEl.currentTime = startAtSec;
      }
      try {
        await remoteEl.play();
        setIsPlaying(true);
        setIsBuffering(false);
      } catch {
        setIsPlaying(false);
        setIsBuffering(false);
        setPlaybackError('ไม่สามารถเชื่อมต่อสตรีมจากลิงก์ภายนอกนี้ได้');
      }
    },
    [
      ensureAudioGraph,
      isMuted,
      isSameOriginTrack,
      prefs.playbackRate,
      prefs.volume,
      showStatus,
      stopAllEngines,
      updatePrefs,
    ]
  );

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
      const activeEl = isSameOriginTrack(currentTrack) ? localAudioRef.current : remoteAudioRef.current;
      if (command.action === 'pause') {
        activeEl?.pause();
        setIsPlaying(false);
        showStatus(`อุปกรณ์ "${command.fromDeviceName}" พักการเล่นชั่วคราว`);
      } else if (command.action === 'resume') {
        activeEl?.play().then(() => setIsPlaying(true)).catch(() => {});
      } else if (command.action === 'seek' && typeof command.positionSec === 'number') {
        if (activeEl && isFinite(activeEl.duration)) {
          activeEl.currentTime = command.positionSec;
          setCurrentTime(command.positionSec);
        }
      } else if (command.action === 'stop') {
        stopAllEngines();
        setIsPlaying(false);
        showStatus(`"${command.fromDeviceName}" หยุดการแคสต์แล้ว`);
      }
    };
  }, [currentTrack, isSameOriginTrack, playTrackLocally, showStatus, stopAllEngines]);

  // Publish this device's presence & playback state to server
  useEffect(() => {
    void updateDevicePresence({
      deviceId: deviceIdentity.deviceId,
      deviceName: deviceIdentity.deviceName,
      deviceType: deviceIdentity.deviceType,
      isAdmin,
      currentTrackTitle: currentTrack ? currentTrack.title : null,
      isPlaying,
    });
  }, [currentTrack, deviceIdentity, isAdmin, isPlaying]);

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
    const activeEl = (isSameOriginTrack(currentTrack)
      ? localAudioRef.current
      : remoteAudioRef.current) as (HTMLAudioElement & {
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
  }, [currentTrack, isSameOriginTrack]);

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

    const usesLocalEl = isSameOriginTrack(currentTrack);
    const activeEl = usesLocalEl ? localAudioRef.current : remoteAudioRef.current;
    if (!activeEl) return;

    if (!activeEl.src) {
      await playTrack(currentTrack);
      return;
    }

    if (activeEl.paused) {
      if (usesLocalEl) ensureAudioGraph();
      try {
        await activeEl.play();
        setIsPlaying(true);
        setPlaybackError('');
      } catch {
        setPlaybackError('ไม่สามารถเล่นแทร็กนี้ได้');
      }
    } else {
      activeEl.pause();
      setIsPlaying(false);
    }
  }, [
    activeCastTarget,
    currentTrack,
    displayedTracks,
    ensureAudioGraph,
    handleRemoteCastAction,
    isPlaying,
    isSameOriginTrack,
    playTrack,
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
    const activeEl = isSameOriginTrack(currentTrack) ? localAudioRef.current : remoteAudioRef.current;
    if (!activeCastTarget && activeEl && activeEl.currentTime > 3) {
      activeEl.currentTime = 0;
      return;
    }
    const idx = activeQueue.findIndex((t) => t.id === currentTrack?.id);
    const prevIdx = idx <= 0 ? activeQueue.length - 1 : idx - 1;
    void playTrack(activeQueue[prevIdx]);
  }, [activeCastTarget, activeQueue, currentTrack, isSameOriginTrack, playTrack]);

  const handleTrackEnded = useCallback(() => {
    if (repeatMode === 'one' && currentTrack) {
      const activeEl = isSameOriginTrack(currentTrack) ? localAudioRef.current : remoteAudioRef.current;
      if (activeEl) {
        activeEl.currentTime = 0;
        activeEl.play().catch(() => {});
        return;
      }
    }
    if (repeatMode === 'off') {
      const idx = activeQueue.findIndex((t) => t.id === currentTrack?.id);
      if (idx === activeQueue.length - 1 && !isShuffle) {
        setIsPlaying(false);
        return;
      }
    }
    playNext();
  }, [activeQueue, currentTrack, isSameOriginTrack, isShuffle, playNext, repeatMode]);

  const handleSeek = (newTime: number) => {
    if (!currentTrack) return;
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
    const activeEl = isSameOriginTrack(currentTrack) ? localAudioRef.current : remoteAudioRef.current;
    if (activeEl && isFinite(activeEl.duration)) {
      activeEl.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
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
  });

  // --- File & Folder Direct HDD Sync (Zero Server Upload) ---
  const syncFilesIntoLibrary = useCallback(
    async (
      entries: Array<{ file: File; relativePath?: string }>,
      options?: {
        folderName?: string;
        folderMode?: 'handle' | 'directory-input';
        targetTab?: LibraryTab;
      }
    ) => {
      const audioEntries: Array<{ file: File; relativePath?: string }> = [];
      const playlistFiles: File[] = [];

      for (const item of entries) {
        const ext = getFileExtension(item.file.name);
        if (ext === 'm3u' || ext === 'm3u8') {
          playlistFiles.push(item.file);
        } else if (isSupportedAudioFile(item.file)) {
          audioEntries.push(item);
        }
      }

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
          if (firstImported && audioEntries.length === 0) {
            playTrack(firstImported);
          }
        }
      }

      if (audioEntries.length === 0) {
        if (playlistFiles.length === 0) {
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

      setHddSyncProgress({
        label: inferredFolder ? `กำลังซิงค์โฟลเดอร์ "${inferredFolder}"` : 'กำลังซิงค์ไฟล์จาก HDD',
        processed: 0,
        total: audioEntries.length,
      });

      const existingById = new Map(localTracks.map((t) => [t.id, t]));
      const syncedTracks: Track[] = [];
      const dbQueue: Array<{ track: Track; blob: Blob }> = [];
      const fastMode = audioEntries.length > 3;
      const BATCH_SIZE = 16;

      try {
        for (let i = 0; i < audioEntries.length; i += BATCH_SIZE) {
          const batch = audioEntries.slice(i, i + BATCH_SIZE);
          const parsedBatch = await Promise.all(
            batch.map(async ({ file, relativePath }) => {
              const relPath =
                relativePath ||
                ((file as File & { webkitRelativePath?: string }).webkitRelativePath || '').trim() ||
                file.name;
              const deterministicSeed = hashStringToSeed(
                `${ownerKey}:${relPath}:${file.size}:${file.lastModified}`
              );
              const candidateId = `local-${deterministicSeed.toString(36)}-${file.size.toString(36)}`;
              const cached = existingById.get(candidateId);

              let track: Track;
              if (cached) {
                const syncedFolder = inferredFolder || cached.syncedFolder;
                track = {
                  ...cached,
                  url: URL.createObjectURL(file),
                  addedAt: Date.now(),
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
                });
              }

              dbQueue.push({ track, blob: file });
              return track;
            })
          );
          syncedTracks.push(...parsedBatch);
          setHddSyncProgress({
            label: inferredFolder
              ? `กำลังซิงค์โฟลเดอร์ "${inferredFolder}"`
              : 'กำลังซิงค์ไฟล์จาก HDD',
            processed: Math.min(i + batch.length, audioEntries.length),
            total: audioEntries.length,
          });
          await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
        }
      } finally {
        setHddSyncProgress(null);
      }

      if (syncedTracks.length > 0) {
        setLocalTracks((prev) => {
          const incomingIds = new Set(syncedTracks.map((t) => t.id));
          const preserved = prev.filter((t) => {
            if (!incomingIds.has(t.id)) return true;
            if (t.url.startsWith('blob:')) URL.revokeObjectURL(t.url);
            return false;
          });
          return [...syncedTracks, ...preserved];
        });

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

        const nextTab = options?.targetTab ?? (activeTab === 'admin' ? 'local' : activeTab);
        if (activeTab === 'admin' || options?.targetTab) {
          setActiveTab(nextTab);
        }

        const shouldAutoPublish = isAdmin && prefs.autoStreamOnAdd !== false;
        showStatus(
          inferredFolder
            ? `ซิงค์โฟลเดอร์ "${inferredFolder}" สำเร็จ ${syncedTracks.length} เพลง — กำลังสตรีมออนไลน์ทันที`
            : `เพิ่มเพลงจาก HDD ${syncedTracks.length} เพลง — กำลังสตรีมออนไลน์ทันที`
        );
        playTrack(syncedTracks[0]);

        // Persist eligible small caches asynchronously in background without blocking sync UI
        void saveLocalTracksBatchToDb(dbQueue);

        // If Admin & autoStreamOnAdd enabled, auto-publish new tracks to shared online stream for all devices
        if (shouldAutoPublish) {
          const existingServerKeys = new Set(
            serverStreams.map((t) => `${t.title.toLowerCase()}::${t.sizeBytes || 0}`)
          );
          const MAX_AUTO_PUBLISH_BYTES = 240 * 1024 * 1024;
          const toPublish = dbQueue.filter(({ track, blob }) => {
            if (blob.size <= 0 || blob.size > MAX_AUTO_PUBLISH_BYTES) return false;
            const key = `${track.title.toLowerCase()}::${track.sizeBytes || 0}`;
            return !existingServerKeys.has(key);
          });

          if (toPublish.length > 0) {
            void (async () => {
              let publishedCount = 0;
              const publishedMap = new Map<string, string>();
              setAdminTask({
                state: 'working',
                message: `กำลังเปิดสตรีมออนไลน์อัตโนมัติทุกเครื่อง (0/${toPublish.length})...`,
                updatedAt: Date.now(),
              });

              const PUBLISH_BATCH = 2;
              for (let i = 0; i < toPublish.length; i += PUBLISH_BATCH) {
                const slice = toPublish.slice(i, i + PUBLISH_BATCH);
                await Promise.all(
                  slice.map(async ({ track, blob }) => {
                    try {
                      const fname =
                        blob instanceof File ? blob.name : `${track.title}.${track.format.toLowerCase()}`;
                      const created = await publishTrackToServerStream(track, blob, fname);
                      publishedMap.set(track.id, created.id);
                      publishedCount++;
                    } catch {
                      // skip individual publish error
                    }
                  })
                );
                setAdminTask({
                  state: 'working',
                  message: `กำลังเปิดสตรีมออนไลน์อัตโนมัติทุกเครื่อง (${Math.min(
                    i + slice.length,
                    toPublish.length
                  )}/${toPublish.length})...`,
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
            })();
          }
        }
      }
    },
    [
      activeTab,
      isAdmin,
      localTracks,
      ownerKey,
      playTrack,
      prefs.autoStreamOnAdd,
      prefs.includeHddInStream,
      refreshAdminStatus,
      refreshServerStreams,
      serverStreams,
      showStatus,
      updatePrefs,
    ]
  );

  const processIncomingFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      const items = Array.from(fileList).map((file) => ({
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
    processIncomingFiles(e.target.files);
    e.target.value = '';
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
    ): Promise<Array<{ file: File; relativePath: string }>> => {
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
            if (isSupportedAudioFilename(entry.name)) {
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

      const files: Array<{ file: File; relativePath: string }> = [];
      const GET_FILE_BATCH = 24;
      for (let i = 0; i < pendingHandles.length; i += GET_FILE_BATCH) {
        const chunk = pendingHandles.slice(i, i + GET_FILE_BATCH);
        const resolved = await Promise.all(
          chunk.map(async ({ handle, relativePath }) => ({
            file: await handle.getFile(),
            relativePath,
          }))
        );
        files.push(...resolved);
      }
      return files;
    },
    []
  );

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
        showStatus(
          'เบราว์เซอร์บล็อกหน้าต่างเลือกโฟลเดอร์อัตโนมัติ — กรุณากด "เปิดทั้งโฟลเดอร์ (ไม่อัปโหลด)" เพื่อซิงค์จาก HDD'
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
        URL.revokeObjectURL(track.url);
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
      await Promise.all([refreshServerStreams(), refreshAdminStatus()]);
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
      return { title: 'คลังเพลงทั้งหมด', sub: 'สตรีมกลางทุกเครื่อง & ไฟล์ในเครื่องนี้' };
    }
    if (activeTab === 'stream') {
      return {
        title: 'สตรีมเพลงออนไลน์',
        sub: 'เพลงชุดเดียวกันสำหรับทุกอุปกรณ์ที่เชื่อมต่อ',
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

  return (
    <div className="h-dvh flex flex-col bg-background text-foreground">
      {/* Dual Audio Elements */}
      <audio
        ref={localAudioRef}
        crossOrigin="anonymous"
        onLoadedMetadata={(e) => {
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
          const el = e.currentTarget;
          setCurrentTime(el.currentTime);
          if (isFinite(el.duration)) setDuration(el.duration);
        }}
        onEnded={handleTrackEnded}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => {
          setIsBuffering(false);
          setIsPlaying(true);
        }}
        onError={() => {
          setIsBuffering(false);
          setIsPlaying(false);
        }}
      />
      <audio
        ref={remoteAudioRef}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          setCurrentTime(el.currentTime);
          if (isFinite(el.duration)) setDuration(el.duration);
        }}
        onEnded={handleTrackEnded}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => {
          setIsBuffering(false);
          setIsPlaying(true);
        }}
        onError={() => {
          setIsBuffering(false);
          setIsPlaying(false);
          setPlaybackError('ไม่สามารถเชื่อมต่อสตรีมจากลิงก์ภายนอกนี้ได้');
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
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex w-64 shrink-0 flex-col justify-between bg-surface border-r border-border/70 p-5 min-h-0 overflow-y-auto">
          <div className="space-y-6">
            {/* Brand */}
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-foreground text-surface flex items-center justify-center shrink-0">
                  <Disc className="w-4 h-4" />
                </div>
                <span className="text-base font-semibold tracking-tight">Aura Audio</span>
              </div>
              {isAdmin && (
                <span className="text-[11px] font-medium text-primary">Admin</span>
              )}
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

        {/* Main Content Pane */}
        <main className="flex-1 min-w-0 min-h-0 flex flex-col">
          {/* Top Header */}
          <header className="h-16 px-4 md:px-7 border-b border-border/70 bg-surface flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 md:hidden shrink-0">
              <div className="w-7 h-7 rounded-full bg-foreground text-surface flex items-center justify-center">
                <Disc className="w-3.5 h-3.5" />
              </div>
              <span className="text-sm font-semibold">Aura</span>
            </div>

            <div className="flex-1 min-w-0 max-w-md relative">
              <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
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

          {/* Scrollable Library Content + Dropzone */}
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
                <TrackCover
                  src={currentTrack?.coverDataUrl}
                  seed={currentTrack?.coverSeed ?? 1}
                  title={currentTrack?.title || 'Aura Audio'}
                  sizeClass="w-12 h-12"
                />
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

              <div className="w-full sm:w-56 shrink-0">
                <VisualizerCanvas
                  analyser={analyserRef.current}
                  isPlaying={isPlaying}
                  isSynthOrCors={isSameOriginTrack(currentTrack)}
                />
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
                                      track.source === 'local' || track.hddPath
                                        ? 'bg-emerald-600 dark:bg-emerald-400'
                                        : 'bg-primary'
                                    }`}
                                  />
                                  <span className="font-medium text-foreground">
                                    {track.hddPath
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
                  <Music2 className="w-5 h-5" />
                </div>
                <p className="text-base font-medium">
                  {activeTab === 'stream' || activeTab === 'admin'
                    ? 'ยังไม่มีเพลงในคลังสตรีมออนไลน์ส่วนกลาง'
                    : 'ไม่พบเพลงในหมวดหมู่นี้'}
                </p>
                <p className="text-sm text-muted mt-1 mb-5">
                  {isAdmin
                    ? 'เลือกโฟลเดอร์หรือไฟล์บน HDD เพื่อสตรีมตรงให้ทุกเครื่องทันที โดยไม่อัปโหลดไฟล์ขึ้นระบบ'
                    : 'คุณสามารถเลือกไฟล์เพลงจาก HDD บนอุปกรณ์นี้มาฟังโดยตรง (ไม่อัปโหลด) หรือเข้าสู่ระบบ Admin'}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {isAdmin ? (
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
            <div className="relative shrink-0">
              <TrackCover
                src={currentTrack?.coverDataUrl}
                seed={currentTrack?.coverSeed ?? 1}
                title={currentTrack?.title || 'Aura'}
                sizeClass="w-11 h-11"
                roundedClass="rounded-full"
                spinning={isPlaying}
              />
              <span
                aria-hidden="true"
                className="w-2.5 h-2.5 rounded-full bg-surface border border-border absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
              />
            </div>

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
    </div>
  );
}
