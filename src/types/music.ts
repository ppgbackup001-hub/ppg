export type TrackSource = 'local' | 'stream' | 'synth' | 'lan';

export type SynthPreset = 'rain-rhodes' | 'tape-loop';

export type UserRole = 'admin' | 'member';

export interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
  genre?: string;
  source: TrackSource;
  isSharedStream?: boolean;
  streamKind?: 'file' | 'url' | 'hdd';
  format: string;
  formatDetail: string;
  isLossless?: boolean;
  durationSec: number | null;
  durationLabel: string;
  url: string;
  streamUrl?: string;
  hddPath?: string;
  publishedStreamId?: string;
  lanHostDeviceId?: string;
  lanHostDeviceName?: string;
  lanOriginalTrackId?: string;
  coverDataUrl?: string;
  coverSeed: number;
  addedAt: number;
  ownerId: string;
  sizeBytes?: number;
  sampleRate?: number;
  bitrate?: number;
  relativePath?: string;
  syncedFolder?: string;
  folderName?: string;
  synthPreset?: SynthPreset;
}

export interface SyncedHddFolderSummary {
  id: string;
  name: string;
  ownerId: string;
  trackCount: number;
  lastSyncedAt: number;
  mode: 'handle' | 'directory-input';
}

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: number;
  ownerId: string;
}

export interface UserAccount {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  createdAt: number;
  accentHue: number;
}

export type EqPresetKey = 'flat' | 'warm' | 'bass' | 'vocal' | 'latenight' | 'custom';

export type EqBands = [number, number, number, number, number];

export interface UserPreferences {
  favorites: string[];
  recentIds: string[];
  playlists: Playlist[];
  eqPreset: EqPresetKey;
  eqBands: EqBands;
  playbackRate: number;
  volume: number;
  includeHddInStream: boolean;
  autoStreamOnAdd?: boolean;
}

export interface HddRootOption {
  label: string;
  path: string;
}

export interface HddHostInfo {
  platform: string;
  hostname: string;
  isCloudContainer: boolean;
}

export interface MountedHddFolder {
  path: string;
  trackCount: number;
}

export interface HddBrowseAudioFile {
  name: string;
  path: string;
  sizeBytes: number;
  format: string;
}

export interface HddBrowseResult {
  currentDir: string;
  parentDir: string | null;
  directories: Array<{ name: string; path: string }>;
  audioCount: number;
  audioFiles: HddBrowseAudioFile[];
}

export type LibraryTab =
  | 'all'
  | 'stream'
  | 'lan'
  | 'local'
  | 'favorites'
  | 'recent'
  | 'admin'
  | `playlist:${string}`;

export type LibraryGroupBy = 'none' | 'folder' | 'artist' | 'genre';

export type FormatFilter = 'all' | 'lossless' | 'compressed' | 'stream';

export type RepeatMode = 'off' | 'all' | 'one';

export interface AdminActivityItem {
  id: string;
  action: string;
  detail: string;
  status: 'success' | 'info' | 'error';
  timestamp: number;
}

export interface AdminOperationalStatus {
  serverStatus: 'online';
  startedAt: number;
  uptimeSec: number;
  connectedDevices: number;
  totalSharedTracks: number;
  fileTracks: number;
  hddTracks: number;
  urlTracks: number;
  totalSizeBytes: number;
  mountedFolders: MountedHddFolder[];
  watchingHddCount?: number;
  storageWritable: boolean;
  recentActivities: AdminActivityItem[];
}

export type CastDeviceType = 'desktop' | 'mobile' | 'tablet' | 'tv';

export interface ConnectedCastDevice {
  deviceId: string;
  deviceName: string;
  deviceType: CastDeviceType;
  isAdmin: boolean;
  currentTrackTitle?: string;
  isPlaying?: boolean;
  connectedAt: number;
  lastSeenAt: number;
}

export type CastAction = 'play' | 'pause' | 'resume' | 'seek' | 'stop';

export interface CastCommandPayload {
  id: string;
  targetDeviceId: string;
  fromDeviceId: string;
  fromDeviceName: string;
  action: CastAction;
  track?: Track;
  positionSec?: number;
  sentAt: number;
}

export interface NetworkInterfaceUrl {
  name: string;
  ip: string;
  url: string;
}

export interface NetworkInfoResponse {
  hostname: string;
  port: number;
  isCloudContainer: boolean;
  lanUrls: NetworkInterfaceUrl[];
  connectedDevices: number;
  lanHostsCount: number;
}

export interface LanSharedTrackMeta {
  id: string;
  title: string;
  artist: string;
  album?: string;
  genre?: string;
  folderName?: string;
  format: string;
  formatDetail: string;
  isLossless?: boolean;
  durationSec: number | null;
  durationLabel: string;
  sizeBytes?: number;
  sampleRate?: number;
  bitrate?: number;
  coverDataUrl?: string;
  hasCover?: boolean;
  coverSeed: number;
  addedAt: number;
}

export interface LanHostInfo {
  deviceId: string;
  deviceName: string;
  deviceType: CastDeviceType;
  tracks: LanSharedTrackMeta[];
  trackCount: number;
  updatedAt: number;
}

export interface LanSignalPayload {
  fromDeviceId: string;
  fromDeviceName: string;
  targetDeviceId: string;
  signalType: 'offer' | 'answer' | 'ice' | 'reject';
  data: unknown;
  sentAt: number;
}

