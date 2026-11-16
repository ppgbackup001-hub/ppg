import { parseBlob, selectCover } from 'music-metadata';
import type { Track } from '../types/music';

export const SUPPORTED_AUDIO_EXTENSIONS = [
  'mp3',
  'wav',
  'flac',
  'ogg',
  'oga',
  'aac',
  'm4a',
  'm4b',
  'opus',
  'wma',
  'aiff',
  'aif',
  'aifc',
  'alac',
  'webm',
  'amr',
  'ape',
  'ac3',
  'dts',
  'mid',
  'midi',
  'caf',
  'm3u',
  'm3u8',
] as const;

export const AUDIO_ACCEPT_STRING =
  'audio/*,' + SUPPORTED_AUDIO_EXTENSIONS.map((ext) => `.${ext}`).join(',');

const LOSSLESS_EXTENSIONS = new Set(['flac', 'wav', 'aiff', 'aif', 'aifc', 'alac', 'ape']);

export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

export function isSupportedAudioFilename(filename: string): boolean {
  const ext = getFileExtension(filename);
  return (SUPPORTED_AUDIO_EXTENSIONS as readonly string[]).includes(ext);
}

export function isSupportedAudioFile(file: File): boolean {
  if (isSupportedAudioFilename(file.name)) return true;
  if (file.type && file.type.startsWith('audio/')) return true;
  if (file.type === 'video/webm' || file.type === 'application/ogg') return true;
  return false;
}

export function formatTime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || isNaN(seconds) || !isFinite(seconds) || seconds < 0) {
    return '0:00';
  }
  const totalSecs = Math.floor(seconds);
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function hashStringToSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function uint8ToDataUrl(data: Uint8Array, mimeType: string): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

const COVER_IMAGE_BASES = ['cover', 'folder', 'front', 'album', 'albumart'];
const COVER_IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp']);

export function getCoverImagePriority(filename: string): number {
  const base = filename.replace(/\.[^/.]+$/, '').trim().toLowerCase();
  const ext = getFileExtension(filename);
  if (!COVER_IMAGE_EXTS.has(ext)) return -1;
  return COVER_IMAGE_BASES.indexOf(base);
}

export function isCoverImageFilename(filename: string): boolean {
  return getCoverImagePriority(filename) !== -1;
}

export async function resizeImageBlobToDataUrl(
  blob: Blob,
  maxDim = 512
): Promise<string | undefined> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    if (blob.size <= 400 * 1024) {
      const buf = new Uint8Array(await blob.arrayBuffer());
      return uint8ToDataUrl(buf, blob.type || 'image/jpeg');
    }
    return undefined;
  }

  const objUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      const timer = window.setTimeout(() => reject(new Error('image-timeout')), 4000);
      el.onload = () => {
        window.clearTimeout(timer);
        resolve(el);
      };
      el.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error('image-error'));
      };
      el.src = objUrl;
    });

    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return undefined;

    if (w <= maxDim && h <= maxDim && blob.size <= 120 * 1024) {
      const buf = new Uint8Array(await blob.arrayBuffer());
      return uint8ToDataUrl(buf, blob.type || 'image/jpeg');
    }

    const scale = Math.min(1, maxDim / Math.max(w, h));
    const targetW = Math.max(1, Math.round(w * scale));
    const targetH = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const out = canvas.toDataURL('image/jpeg', 0.84);
    return out && out.startsWith('data:image/') ? out : undefined;
  } catch {
    if (blob.size <= 400 * 1024) {
      try {
        const buf = new Uint8Array(await blob.arrayBuffer());
        return uint8ToDataUrl(buf, blob.type || 'image/jpeg');
      } catch {
        return undefined;
      }
    }
    return undefined;
  } finally {
    URL.revokeObjectURL(objUrl);
  }
}

export async function extractCoverFromImageFile(
  file: File,
  maxDim = 512
): Promise<string | undefined> {
  return resizeImageBlobToDataUrl(file, maxDim);
}

export async function extractCoverFromAudioBlob(
  blob: Blob,
  maxDim = 512
): Promise<string | undefined> {
  try {
    const metadata = await parseBlob(blob, {
      duration: false,
      skipCovers: false,
    });
    const pic = selectCover(metadata.common.picture) || metadata.common.picture?.[0];
    if (!pic || pic.data.byteLength === 0) return undefined;
    const imgBytes = Uint8Array.from(pic.data);
    const imgBlob = new Blob([imgBytes], { type: pic.format || 'image/jpeg' });
    return await resizeImageBlobToDataUrl(imgBlob, maxDim);
  } catch {
    return undefined;
  }
}

async function readNativeDuration(url: string, timeoutMs = 1200): Promise<number | null> {
  return new Promise((resolve) => {
    const audio = new Audio();
    const timer = window.setTimeout(() => {
      audio.src = '';
      resolve(null);
    }, timeoutMs);

    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      window.clearTimeout(timer);
      const dur = isFinite(audio.duration) ? audio.duration : null;
      audio.src = '';
      resolve(dur);
    };
    audio.onerror = () => {
      window.clearTimeout(timer);
      audio.src = '';
      resolve(null);
    };
    audio.src = url;
  });
}

export interface ExtractLocalTrackOptions {
  relativePath?: string;
  syncedFolder?: string;
  skipNativeDurationProbe?: boolean;
  fastMode?: boolean;
  fallbackCoverDataUrl?: string;
}

export function normalizeGenre(raw?: string[] | string): string | undefined {
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

export function extractFolderNameFromRelativePath(
  relPath?: string,
  fallbackFolder?: string
): string | undefined {
  if (!relPath) return fallbackFolder;
  const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const lastSlash = normalized.lastIndexOf('/');
  if (lastSlash > 0) {
    return normalized.slice(0, lastSlash);
  }
  return fallbackFolder;
}

export async function extractLocalTrack(
  file: File,
  ownerId: string,
  options?: ExtractLocalTrackOptions
): Promise<Track> {
  const ext = getFileExtension(file.name).toUpperCase() || 'AUDIO';
  const cleanFilename = file.name.replace(/\.[^/.]+$/, '');
  const objectUrl = URL.createObjectURL(file);
  const relPath =
    options?.relativePath ||
    ((file as File & { webkitRelativePath?: string }).webkitRelativePath || '').trim() ||
    file.name;
  const folderFromRel = relPath.includes('/') ? relPath.split('/')[0] : undefined;
  const syncedFolder = options?.syncedFolder || folderFromRel;
  const folderName = extractFolderNameFromRelativePath(relPath, syncedFolder);
  const fastMode = Boolean(options?.fastMode);

  let title = cleanFilename;
  let artist = syncedFolder ? `HDD · ${syncedFolder}` : 'ไฟล์ในเครื่อง';
  let album: string | undefined;
  let genre: string | undefined;
  let coverDataUrl: string | undefined;
  let durationSec: number | null = null;
  let sampleRate: number | undefined;
  let bitrate: number | undefined;
  let isLossless = LOSSLESS_EXTENSIONS.has(ext.toLowerCase());
  let codecLabel = ext;

  try {
    const metadata = await parseBlob(file, {
      duration: false,
      skipCovers: fastMode,
    });
    if (metadata.common.title?.trim()) title = metadata.common.title.trim();
    if (metadata.common.artist?.trim()) artist = metadata.common.artist.trim();
    if (metadata.common.album?.trim()) album = metadata.common.album.trim();
    genre = normalizeGenre(metadata.common.genre);

    if (!fastMode && metadata.common.picture && metadata.common.picture.length > 0) {
      const pic = selectCover(metadata.common.picture) || metadata.common.picture[0];
      if (pic && pic.data.byteLength > 0) {
        const imgBytes = Uint8Array.from(pic.data);
        const imgBlob = new Blob([imgBytes], { type: pic.format || 'image/jpeg' });
        coverDataUrl = await resizeImageBlobToDataUrl(imgBlob, 512);
      }
    }
    if (!coverDataUrl && options?.fallbackCoverDataUrl) {
      coverDataUrl = options.fallbackCoverDataUrl;
    }

    if (metadata.format.duration && isFinite(metadata.format.duration)) {
      durationSec = metadata.format.duration;
    }
    if (metadata.format.sampleRate) {
      sampleRate = metadata.format.sampleRate;
    }
    if (metadata.format.bitrate) {
      bitrate = Math.round(metadata.format.bitrate / 1000);
    }
    if (typeof metadata.format.lossless === 'boolean') {
      isLossless = metadata.format.lossless;
    }
    if (metadata.format.codec) {
      const shortCodec = metadata.format.codec.split('/')[0].toUpperCase();
      if (shortCodec.length <= 8) codecLabel = shortCodec;
    }
  } catch {
    // Fallback to filename metadata
  }

  if (durationSec === null && !fastMode && !options?.skipNativeDurationProbe) {
    durationSec = await readNativeDuration(objectUrl);
  }

  const detailParts: string[] = [];
  if (sampleRate) detailParts.push(`${(sampleRate / 1000).toFixed(1)} kHz`);
  if (isLossless) {
    detailParts.push('Lossless');
  } else if (bitrate) {
    detailParts.push(`${bitrate} kbps`);
  }
  detailParts.push(formatFileSize(file.size));

  const deterministicSeed = hashStringToSeed(
    `${ownerId}:${relPath}:${file.size}:${file.lastModified}`
  );

  return {
    id: `local-${deterministicSeed.toString(36)}-${file.size.toString(36)}`,
    title,
    artist,
    album,
    genre,
    source: 'local',
    format: codecLabel,
    formatDetail: detailParts.join(' · '),
    isLossless,
    durationSec,
    durationLabel: durationSec !== null ? formatTime(durationSec) : '--:--',
    url: objectUrl,
    coverDataUrl,
    coverSeed: hashStringToSeed(`${title}-${artist}-${file.size}`),
    addedAt: Date.now(),
    ownerId,
    sizeBytes: file.size,
    sampleRate,
    bitrate,
    relativePath: relPath,
    syncedFolder,
    folderName,
  };
}

interface WebkitEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath: string;
  file?: (success: (file: File) => void, err?: (err: unknown) => void) => void;
  createReader?: () => {
    readEntries: (success: (entries: WebkitEntry[]) => void, err?: (err: unknown) => void) => void;
  };
}

export async function collectFilesFromDataTransfer(
  dataTransfer: DataTransfer,
  maxFiles = 500
): Promise<Array<{ file: File; relativePath: string }>> {
  const items = Array.from(dataTransfer.items || []);
  const entries: WebkitEntry[] = [];
  for (const item of items) {
    const getEntry = (item as unknown as { webkitGetAsEntry?: () => WebkitEntry | null })
      .webkitGetAsEntry;
    const entry = getEntry ? getEntry.call(item) : null;
    if (entry) entries.push(entry);
  }

  if (entries.length === 0) {
    return Array.from(dataTransfer.files || []).map((file) => ({
      file,
      relativePath:
        ((file as File & { webkitRelativePath?: string }).webkitRelativePath || '').trim() ||
        file.name,
    }));
  }

  const collected: Array<{ file: File; relativePath: string }> = [];

  const walkEntry = async (entry: WebkitEntry): Promise<void> => {
    if (collected.length >= maxFiles) return;
    if (entry.isFile && entry.file) {
      await new Promise<void>((resolve) => {
        entry.file!(
          (file) => {
            const cleanRel = entry.fullPath.replace(/^\/+/, '') || file.name;
            collected.push({ file, relativePath: cleanRel });
            resolve();
          },
          () => resolve()
        );
      });
      return;
    }

    if (entry.isDirectory && entry.createReader) {
      const reader = entry.createReader();
      const readAllChunks = async (): Promise<WebkitEntry[]> => {
        const all: WebkitEntry[] = [];
        while (true) {
          const batch = await new Promise<WebkitEntry[]>((resolve) => {
            reader.readEntries(
              (chunk) => resolve(chunk || []),
              () => resolve([])
            );
          });
          if (batch.length === 0) break;
          all.push(...batch);
        }
        return all;
      };
      const children = await readAllChunks();
      for (const child of children) {
        if (collected.length >= maxFiles) break;
        await walkEntry(child);
      }
    }
  };

  for (const entry of entries) {
    if (collected.length >= maxFiles) break;
    await walkEntry(entry);
  }

  return collected;
}

export function parseM3uContent(content: string): Array<{ title: string; url: string }> {
  const lines = content.split(/\r?\n/).map((l) => l.trim());
  const results: Array<{ title: string; url: string }> = [];
  let pendingTitle = '';

  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith('#EXTINF:')) {
      const commaIdx = line.indexOf(',');
      if (commaIdx !== -1) {
        pendingTitle = line.slice(commaIdx + 1).trim();
      }
      continue;
    }
    if (line.startsWith('#')) continue;
    if (/^https?:\/\//i.test(line)) {
      results.push({
        title: pendingTitle || line.split('/').pop() || 'M3U Stream',
        url: line,
      });
      pendingTitle = '';
    }
  }
  return results;
}

/**
 * Fallback decoder for uncompressed/exotic containers that AudioContext can decode
 * when the browser's <audio> element cannot play the container directly.
 */
export async function decodeBlobToWavUrl(blob: Blob): Promise<string | null> {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    const ctx = new AudioCtx();
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    await ctx.close();

    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const numFrames = audioBuffer.length;
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const dataSize = numFrames * blockAlign;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    const channels = Array.from({ length: numChannels }, (_, c) => audioBuffer.getChannelData(c));
    let offset = 44;
    for (let i = 0; i < numFrames; i++) {
      for (let c = 0; c < numChannels; c++) {
        const s = Math.max(-1, Math.min(1, channels[c][i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        offset += 2;
      }
    }

    const wavBlob = new Blob([buffer], { type: 'audio/wav' });
    return URL.createObjectURL(wavBlob);
  } catch {
    return null;
  }
}
