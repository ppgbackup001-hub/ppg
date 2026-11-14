import { useEffect, useState, type FormEvent } from 'react';
import {
  Check,
  Folder,
  FolderOpen,
  HardDrive,
  Info,
  Music2,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type {
  HddBrowseResult,
  HddHostInfo,
  HddRootOption,
  MountedHddFolder,
  SyncedHddFolderSummary,
  Track,
} from '../types/music';
import {
  addHostHddFiles,
  browseHostHddDirectory,
  fetchHostHddRoots,
  scanHostHddFolder,
  unmountHostHddFolder,
} from '../utils/api';
import { formatFileSize } from '../utils/audioMetadata';
import type { StoredHddHandleRecord } from '../utils/storage';
import { Button, Field, Surface } from './ui';

interface HddStreamModalProps {
  open: boolean;
  onClose: () => void;
  isAdmin: boolean;
  onOpenAuth: () => void;
  savedHandles: StoredHddHandleRecord[];
  syncedFolders: SyncedHddFolderSummary[];
  onPickBrowserHddFolder: () => void;
  onPickBrowserHddFiles: () => void;
  onReconnectHandle: (record: StoredHddHandleRecord) => Promise<void>;
  onRemoveHandle: (id: string) => Promise<void>;
  onRemoveSyncedFolder: (id: string) => void;
  onHostHddScanned: (tracks: Track[], folder: string) => void;
  onHostHddFilesAdded: (tracks: Track[]) => void;
  onHostHddUnmounted: (folder: string) => void;
}

export function HddStreamModal({
  open,
  onClose,
  isAdmin,
  onOpenAuth,
  savedHandles,
  syncedFolders,
  onPickBrowserHddFolder,
  onPickBrowserHddFiles,
  onReconnectHandle,
  onRemoveHandle,
  onRemoveSyncedFolder,
  onHostHddScanned,
  onHostHddFilesAdded,
  onHostHddUnmounted,
}: HddStreamModalProps) {
  const [mode, setMode] = useState<'host' | 'pc'>(isAdmin ? 'host' : 'pc');
  const [roots, setRoots] = useState<HddRootOption[]>([]);
  const [hostInfo, setHostInfo] = useState<HddHostInfo | null>(null);
  const [mountedFolders, setMountedFolders] = useState<MountedHddFolder[]>([]);
  const [pathInput, setPathInput] = useState('');
  const [browseData, setBrowseData] = useState<HddBrowseResult | null>(null);
  const [selectedFilePaths, setSelectedFilePaths] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [syncingHandleId, setSyncingHandleId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setMode(isAdmin ? 'host' : 'pc');
    setError('');
    setSelectedFilePaths(new Set());
    setSyncingHandleId(null);
  }, [open, isAdmin]);

  useEffect(() => {
    if (!open || !isAdmin) return;
    let cancelled = false;
    setError('');

    fetchHostHddRoots().then(async (res) => {
      if (cancelled) return;
      setRoots(res.roots);
      setMountedFolders(res.mountedFolders);
      setHostInfo(res.hostInfo || null);
      const initialDir = res.roots[0]?.path || '';
      if (initialDir) {
        setPathInput(initialDir);
        try {
          const browsed = await browseHostHddDirectory(initialDir);
          if (!cancelled) {
            setBrowseData(browsed);
            setPathInput(browsed.currentDir);
          }
        } catch {
          // ignore initial browse error
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [open, isAdmin]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleBrowse = async (dir?: string) => {
    setError('');
    setLoading(true);
    setSelectedFilePaths(new Set());
    try {
      const res = await browseHostHddDirectory(dir);
      setBrowseData(res);
      setPathInput(res.currentDir);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถเปิดโฟลเดอร์ได้');
    } finally {
      setLoading(false);
    }
  };

  const handleScanPath = async (e: FormEvent) => {
    e.preventDefault();
    const target = pathInput.trim();
    if (!target) return;
    setError('');
    setLoading(true);
    try {
      const res = await scanHostHddFolder(target);
      onHostHddScanned(res.tracks, res.folder);
      const updated = await fetchHostHddRoots();
      setMountedFolders(updated.mountedFolders);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถสแกนโฟลเดอร์ HDD ได้');
    } finally {
      setLoading(false);
    }
  };

  const handleRescanFolder = async (folder: string) => {
    setError('');
    setLoading(true);
    try {
      const res = await scanHostHddFolder(folder);
      onHostHddScanned(res.tracks, res.folder);
      const updated = await fetchHostHddRoots();
      setMountedFolders(updated.mountedFolders);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'รีสแกนโฟลเดอร์ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleFile = (filePath: string) => {
    setSelectedFilePaths((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  };

  const handleAddSelectedFiles = async () => {
    if (selectedFilePaths.size === 0) return;
    setError('');
    setLoading(true);
    try {
      const res = await addHostHddFiles(Array.from(selectedFilePaths));
      onHostHddFilesAdded(res.tracks);
      setSelectedFilePaths(new Set());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เพิ่มไฟล์จาก HDD ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  const handleUnmount = async (folder: string) => {
    await unmountHostHddFolder(folder);
    onHostHddUnmounted(folder);
    const updated = await fetchHostHddRoots();
    setMountedFolders(updated.mountedFolders);
  };

  const handleIds = new Set(savedHandles.map((h) => h.name));
  const extraSyncedFolders = syncedFolders.filter((f) => !handleIds.has(f.name));

  return (
    <div
      className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hdd-modal-heading"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Surface className="max-w-xl w-full border border-border p-6 max-h-[90dvh] flex flex-col">
        <div className="flex items-center justify-between pb-4 border-b border-border/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <HardDrive className="w-4 h-4 text-primary" />
            <h2 id="hdd-modal-heading" className="text-base font-semibold">
              ซิงค์และเล่นตรงจาก HDD (ไม่อัปโหลดขึ้นระบบ)
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่าง HDD"
            className="w-9 h-9 rounded-control flex items-center justify-center text-muted hover:text-foreground hover:bg-foreground/5 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex gap-2 pt-4 pb-4 border-b border-border/60 shrink-0">
          <button
            type="button"
            onClick={() => {
              setMode('pc');
              setError('');
            }}
            className={`flex-1 min-h-10 px-3 rounded-control text-xs sm:text-sm font-medium border transition-colors cursor-pointer ${
              mode === 'pc'
                ? 'bg-foreground text-surface border-foreground'
                : 'bg-surface text-muted border-border hover:text-foreground'
            }`}
          >
            HDD บนเครื่องนี้ (ซิงค์เล่นตรง)
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('host');
              setError('');
            }}
            className={`flex-1 min-h-10 px-3 rounded-control text-xs sm:text-sm font-medium border transition-colors cursor-pointer ${
              mode === 'host'
                ? 'bg-foreground text-surface border-foreground'
                : 'bg-surface text-muted border-border hover:text-foreground'
            }`}
          >
            HDD เครื่องโฮสต์ (สตรีมทุกเครื่อง)
          </button>
        </div>

        <div className="pt-4 overflow-y-auto min-h-0 space-y-4">
          {mode === 'pc' ? (
            <>
              <p className="text-sm text-muted leading-relaxed">
                ซิงค์โฟลเดอร์หรือไฟล์เพลงจากฮาร์ดดิสก์บนเครื่องของคุณโดยตรง{' '}
                <strong className="text-foreground">ไม่มีการอัปโหลดขึ้นเซิร์ฟเวอร์</strong>{' '}
                (ลากโฟลเดอร์เพลงมาวางในหน้าแอพได้ทันทีเช่นกัน)
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <Button
                  tone="primary"
                  onClick={() => {
                    onPickBrowserHddFolder();
                    onClose();
                  }}
                >
                  <FolderOpen className="w-4 h-4" />
                  <span>ซิงค์ทั้งโฟลเดอร์บน HDD</span>
                </Button>
                <Button
                  tone="quiet"
                  onClick={() => {
                    onPickBrowserHddFiles();
                    onClose();
                  }}
                >
                  <Upload className="w-4 h-4" />
                  <span>เลือกไฟล์เพลงจาก HDD</span>
                </Button>
              </div>

              {(savedHandles.length > 0 || extraSyncedFolders.length > 0) && (
                <div className="pt-4 border-t border-border/60 space-y-2">
                  <p className="text-xs font-medium text-muted">โฟลเดอร์ HDD ที่ซิงค์ไว้</p>
                  <div className="divide-y divide-border/50 border border-border/70 rounded-control">
                    {savedHandles.map((rec) => {
                      const isSyncing = syncingHandleId === rec.id;
                      return (
                        <div key={rec.id} className="px-3 py-2.5 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Folder className="w-4 h-4 text-primary shrink-0" />
                            <span className="text-sm font-medium truncate">{rec.name}</span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              disabled={Boolean(syncingHandleId)}
                              onClick={async () => {
                                setError('');
                                setSyncingHandleId(rec.id);
                                try {
                                  await onReconnectHandle(rec);
                                  onClose();
                                } catch (err) {
                                  setError(
                                    err instanceof Error
                                      ? err.message
                                      : `ไม่สามารถซิงค์โฟลเดอร์ "${rec.name}" ได้`
                                  );
                                } finally {
                                  setSyncingHandleId(null);
                                }
                              }}
                              className="px-2.5 py-1 rounded-control border border-border text-xs font-medium hover:bg-foreground/5 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                              <span>{isSyncing ? 'กำลังซิงค์...' : 'ซิงค์จาก HDD'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onRemoveHandle(rec.id)}
                              aria-label={`ลบโฟลเดอร์ ${rec.name}`}
                              className="w-8 h-8 rounded-control flex items-center justify-center text-muted hover:text-red-700 dark:hover:text-red-400 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {extraSyncedFolders.map((folder) => (
                      <div key={folder.id} className="px-3 py-2.5 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Folder className="w-4 h-4 text-primary shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{folder.name}</p>
                            <p className="text-[11px] text-muted tabular-nums">
                              {folder.trackCount} เพลง
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              onPickBrowserHddFolder();
                              onClose();
                            }}
                            className="px-2.5 py-1 rounded-control border border-border text-xs font-medium hover:bg-foreground/5 flex items-center gap-1 cursor-pointer"
                          >
                            <RefreshCw className="w-3 h-3" />
                            <span>ซิงค์จาก HDD</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemoveSyncedFolder(folder.id)}
                            aria-label={`ลบประวัติโฟลเดอร์ ${folder.name}`}
                            className="w-8 h-8 rounded-control flex items-center justify-center text-muted hover:text-red-700 dark:hover:text-red-400 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : !isAdmin ? (
            <div className="space-y-4">
              <p className="text-sm text-muted leading-relaxed">
                เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถเลือกโฟลเดอร์หรือไฟล์บน HDD ของเครื่องโฮสต์เพื่อสตรีมให้ทุกเครื่องใช้งานร่วมกันได้
                (หรือสลับไปแท็บ &ldquo;HDD บนเครื่องนี้&rdquo; เพื่อซิงค์ไฟล์จากเครื่องของคุณเองโดยไม่อัปโหลด)
              </p>
              <Button
                tone="primary"
                onClick={() => {
                  onClose();
                  onOpenAuth();
                }}
                className="w-full"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>เข้าสู่ระบบ Admin</span>
              </Button>
            </div>
          ) : (
            <>
              {hostInfo?.isCloudContainer && (
                <div className="p-3 rounded-control border border-border bg-background space-y-2">
                  <div className="flex items-start gap-2 text-xs text-muted leading-relaxed">
                    <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <span>
                      เซิร์ฟเวอร์นี้ทำงานบนคลาวด์ ({hostInfo.platform}) จึงไม่เห็นไดรฟ์บนเครื่อง PC ของคุณ (เช่น{' '}
                      <code className="font-mono">D:\Music</code>) หากต้องการซิงค์เพลงจากฮาร์ดดิสก์บนเครื่องของคุณโดยไม่อัปโหลด ให้ใช้โหมด{' '}
                      <strong className="text-foreground">HDD บนเครื่องนี้</strong>
                    </span>
                  </div>
                  <Button
                    tone="quiet"
                    onClick={() => {
                      setMode('pc');
                      setError('');
                    }}
                    className="min-h-8 px-3 text-xs"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>สลับไปซิงค์ HDD บนเครื่องนี้ทันที</span>
                  </Button>
                </div>
              )}

              <p className="text-sm text-muted leading-relaxed">
                เลือกไดรฟ์ โฟลเดอร์ หรือไฟล์เพลงบน HDD ของเครื่องโฮสต์เพื่อเปิดสตรีมให้ทุกเครื่องทันที{' '}
                <strong className="text-foreground">โดยไม่อัปโหลดหรือคัดลอกไฟล์ขึ้นระบบ</strong>
              </p>

              {roots.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {roots.map((r) => (
                    <button
                      key={r.path}
                      type="button"
                      onClick={() => handleBrowse(r.path)}
                      className="px-2.5 py-1 rounded-control border border-border text-xs font-medium hover:bg-foreground/5 cursor-pointer"
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              )}

              <form onSubmit={handleScanPath} className="space-y-3">
                <Field
                  label="ที่อยู่โฟลเดอร์บน HDD เครื่องโฮสต์"
                  type="text"
                  required
                  placeholder="/home/user/Music หรือ D:\Music"
                  value={pathInput}
                  onChange={(e) => setPathInput(e.target.value)}
                />

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    tone="quiet"
                    disabled={loading}
                    onClick={() => handleBrowse(pathInput.trim() || undefined)}
                  >
                    <FolderOpen className="w-4 h-4" />
                    <span>เปิดดูในโฟลเดอร์</span>
                  </Button>
                  <Button type="submit" tone="primary" disabled={loading} className="flex-1">
                    <HardDrive className="w-4 h-4" />
                    <span>
                      {loading ? 'กำลังซิงค์ HDD...' : 'ซิงค์และสตรีมทั้งโฟลเดอร์นี้'}
                    </span>
                  </Button>
                </div>
              </form>

              {browseData && (
                <div className="border border-border/70 rounded-control overflow-hidden">
                  <div className="px-3 py-2 bg-background border-b border-border/60 flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono truncate" title={browseData.currentDir}>
                      {browseData.currentDir}
                    </span>
                    <span className="text-muted whitespace-nowrap tabular-nums">
                      {browseData.audioCount} ไฟล์เสียง
                    </span>
                  </div>
                  <div className="max-h-56 overflow-y-auto divide-y divide-border/50">
                    {browseData.parentDir && (
                      <button
                        type="button"
                        onClick={() => handleBrowse(browseData.parentDir!)}
                        className="w-full px-3 py-2 text-left text-xs text-muted hover:bg-foreground/5 cursor-pointer"
                      >
                        .. (ย้อนกลับ)
                      </button>
                    )}
                    {browseData.directories.map((d) => (
                      <button
                        key={d.path}
                        type="button"
                        onClick={() => handleBrowse(d.path)}
                        className="w-full px-3 py-2 text-left text-xs flex items-center gap-2 hover:bg-foreground/5 cursor-pointer"
                      >
                        <Folder className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span className="truncate font-medium">{d.name}</span>
                      </button>
                    ))}
                    {browseData.audioFiles.map((file) => {
                      const checked = selectedFilePaths.has(file.path);
                      return (
                        <button
                          key={file.path}
                          type="button"
                          onClick={() => handleToggleFile(file.path)}
                          className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between gap-2 hover:bg-foreground/5 cursor-pointer ${
                            checked ? 'bg-foreground/5' : ''
                          }`}
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <span
                              className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                checked
                                  ? 'bg-primary border-primary text-primary-foreground'
                                  : 'border-border'
                              }`}
                            >
                              {checked && <Check className="w-3 h-3" />}
                            </span>
                            <Music2 className="w-3.5 h-3.5 text-muted shrink-0" />
                            <span className="truncate">{file.name}</span>
                          </span>
                          <span className="text-[11px] text-muted font-mono whitespace-nowrap tabular-nums">
                            {file.format} · {formatFileSize(file.sizeBytes)}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {selectedFilePaths.size > 0 && (
                    <div className="px-3 py-2.5 bg-background border-t border-border/60 flex items-center justify-between gap-2">
                      <span className="text-xs text-muted tabular-nums">
                        เลือกแล้ว {selectedFilePaths.size} ไฟล์
                      </span>
                      <Button
                        type="button"
                        tone="primary"
                        disabled={loading}
                        onClick={handleAddSelectedFiles}
                        className="min-h-8 px-3 text-xs"
                      >
                        สตรีมไฟล์ที่เลือก (ไม่อัปโหลด)
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {mountedFolders.length > 0 && (
                <div className="pt-3 border-t border-border/60 space-y-2">
                  <p className="text-xs font-medium text-muted">
                    โฟลเดอร์ HDD ที่กำลังสตรีมตรงอยู่ (เฝ้าดูไฟล์ใหม่อัตโนมัติ)
                  </p>
                  <div className="divide-y divide-border/50 border border-border/70 rounded-control">
                    {mountedFolders.map((m) => (
                      <div key={m.path} className="px-3 py-2 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-mono truncate" title={m.path}>
                            {m.path}
                          </p>
                          <p className="text-[11px] text-muted tabular-nums">{m.trackCount} เพลง</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleRescanFolder(m.path)}
                            disabled={loading}
                            aria-label={`รีสแกน ${m.path}`}
                            title="ซิงค์โฟลเดอร์ล่าสุด"
                            className="w-8 h-8 rounded-control flex items-center justify-center text-muted hover:text-foreground cursor-pointer"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUnmount(m.path)}
                            aria-label={`ยกเลิกการเชื่อมต่อ ${m.path}`}
                            title="ถอดโฟลเดอร์"
                            className="w-8 h-8 rounded-control flex items-center justify-center text-muted hover:text-red-700 dark:hover:text-red-400 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {error && (
            <p role="alert" className="text-xs text-red-700 dark:text-red-400 leading-relaxed">
              {error}
            </p>
          )}
        </div>
      </Surface>
    </div>
  );
}
