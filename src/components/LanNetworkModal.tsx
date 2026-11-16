import { useEffect, useState, type FormEvent } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Laptop,
  Network,
  Radio,
  RefreshCw,
  Server,
  Smartphone,
  Tablet,
  Tv,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import type { CastDeviceType, LanHostInfo, NetworkInfoResponse } from '../types/music';
import {
  fetchNetworkInfo,
  getConfiguredServerBaseUrl,
  getServerBaseUrl,
  isNativeAndroidShell,
  normalizeServerBaseUrl,
  setServerBaseUrl,
  testServerConnection,
  type LocalDeviceIdentity,
} from '../utils/api';
import { Button, Field, Surface } from './ui';

interface LanNetworkModalProps {
  open: boolean;
  onClose: () => void;
  myDevice: LocalDeviceIdentity;
  isSharingLan: boolean;
  sharingBusy: boolean;
  localTrackCount: number;
  activePeerCount: number;
  lanHosts: LanHostInfo[];
  connectedHostIds: string[];
  connectingHostId: string | null;
  onToggleShareLan: () => Promise<void>;
  onConnectLanHost: (host: LanHostInfo) => Promise<void>;
  onDisconnectLanHost: (hostDeviceId: string) => void;
  onRefreshLanHosts: () => Promise<void>;
  onServerUrlSaved: (resolvedUrl: string) => void;
}

function DeviceIcon({ type }: { type: CastDeviceType }) {
  if (type === 'mobile') return <Smartphone className="w-4 h-4" />;
  if (type === 'tablet') return <Tablet className="w-4 h-4" />;
  if (type === 'tv') return <Tv className="w-4 h-4" />;
  return <Laptop className="w-4 h-4" />;
}

export function LanNetworkModal({
  open,
  onClose,
  myDevice,
  isSharingLan,
  sharingBusy,
  localTrackCount,
  activePeerCount,
  lanHosts,
  connectedHostIds,
  connectingHostId,
  onToggleShareLan,
  onConnectLanHost,
  onDisconnectLanHost,
  onRefreshLanHosts,
  onServerUrlSaved,
}: LanNetworkModalProps) {
  const isAndroid = isNativeAndroidShell();
  const [networkInfo, setNetworkInfo] = useState<NetworkInfoResponse | null>(null);
  const [lanServerInput, setLanServerInput] = useState('');
  const [testing, setTesting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    url: string;
    latencyMs: number;
    connectedDevices?: number;
    error?: string;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    setError('');
    setTestResult(null);
    setCopiedUrl(null);
    setLanServerInput(getConfiguredServerBaseUrl() || getServerBaseUrl());
    void fetchNetworkInfo().then((info) => {
      if (info) setNetworkInfo(info);
    });
    void onRefreshLanHosts();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, onRefreshLanHosts, open]);

  if (!open) return null;

  const otherLanHosts = lanHosts.filter((h) => h.deviceId !== myDevice.deviceId);
  const connectedSet = new Set(connectedHostIds);

  const normalizedInput = normalizeServerBaseUrl(lanServerInput);
  const isHttpsPageWithHttpTarget =
    !isAndroid &&
    typeof window !== 'undefined' &&
    window.location.protocol === 'https:' &&
    normalizedInput.startsWith('http://');

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedUrl(text);
      window.setTimeout(() => setCopiedUrl(null), 2200);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleRefreshAll = async () => {
    setRefreshing(true);
    setError('');
    try {
      const [info] = await Promise.all([fetchNetworkInfo(), onRefreshLanHosts()]);
      if (info) setNetworkInfo(info);
    } finally {
      setRefreshing(false);
    }
  };

  const handleToggleShare = async () => {
    setError('');
    try {
      await onToggleShareLan();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถเปลี่ยนสถานะการแชร์ LAN ได้');
    }
  };

  const handleConnectHost = async (host: LanHostInfo) => {
    setError('');
    try {
      await onConnectLanHost(host);
    } catch (err) {
      setError(err instanceof Error ? err.message : `ไม่สามารถเชื่อมต่อ "${host.deviceName}" ได้`);
    }
  };

  const handleTestLanServer = async () => {
    setTesting(true);
    setError('');
    try {
      const result = await testServerConnection(lanServerInput);
      setTestResult(result);
    } finally {
      setTesting(false);
    }
  };

  const handleSaveLanServer = (e: FormEvent) => {
    e.preventDefault();
    const resolved = setServerBaseUrl(lanServerInput);
    onServerUrlSaved(resolved);
    onClose();
  };

  const handleResetServer = () => {
    setLanServerInput('');
    const resolved = setServerBaseUrl('');
    setTestResult(null);
    onServerUrlSaved(resolved);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lan-modal-heading"
      onClick={onClose}
    >
      <Surface
        className="w-full max-w-xl border border-border p-6 max-h-[90dvh] overflow-y-auto space-y-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-border/60">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-control bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Network className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 id="lan-modal-heading" className="text-base sm:text-lg font-semibold truncate">
                ฟังเพลงผ่าน Local Network (Wi-Fi / LAN)
              </h2>
              <p className="text-xs text-muted truncate">
                เชื่อมต่อฟังเพลงระหว่างเครื่องในวง Wi-Fi เดียวกันแบบตรง (P2P หรือ LAN Server)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่าง Local Network"
            className="w-9 h-9 rounded-control flex items-center justify-center text-muted hover:text-foreground hover:bg-foreground/5 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Section 1: Broadcast This Device over Local Network (WebRTC P2P, Zero Server Upload) */}
        <Surface inset className="p-4 border border-border/80 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-semibold flex items-center gap-2">
                <Radio className={`w-4 h-4 shrink-0 ${isSharingLan ? 'text-emerald-600 dark:text-emerald-400' : 'text-primary'}`} />
                <span>แชร์เพลงจากเครื่องนี้ในวง Local Network</span>
              </p>
              <p className="text-xs text-muted leading-relaxed">
                ส่งเสียงจากไฟล์ HDD บนเครื่องนี้ ({localTrackCount} เพลง) ไปให้มือถือหรือคอมเครื่องอื่นฟังผ่าน Wi-Fi โดยตรง{' '}
                <strong className="text-foreground">ไม่อัปโหลดไฟล์ขึ้นเซิร์ฟเวอร์</strong>
              </p>
            </div>
            <Button
              tone={isSharingLan ? 'danger' : 'primary'}
              disabled={sharingBusy || (!isSharingLan && localTrackCount === 0)}
              onClick={() => void handleToggleShare()}
              className="min-h-10 px-4 text-xs shrink-0"
            >
              <Wifi className="w-4 h-4" />
              <span>
                {sharingBusy
                  ? 'กำลังสลับ...'
                  : isSharingLan
                  ? 'หยุดแชร์ LAN'
                  : 'เปิดแชร์ในวง LAN'}
              </span>
            </Button>
          </div>

          {localTrackCount === 0 && !isSharingLan && (
            <p className="text-[11px] text-muted">
              เพิ่มไฟล์หรือซิงค์โฟลเดอร์เพลงบนเครื่องนี้ก่อน เพื่อเปิดแชร์ให้เครื่องอื่นในวง Wi-Fi ฟังได้ทันที
            </p>
          )}

          {isSharingLan && (
            <div className="pt-2 border-t border-border/60 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-emerald-700 dark:text-emerald-400 font-medium flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                <span>กำลังแชร์ {localTrackCount} เพลงในชื่อ &ldquo;{myDevice.deviceName}&rdquo;</span>
              </span>
              <span className="text-muted tabular-nums">
                เชื่อมต่ออยู่ {activePeerCount} เครื่อง
              </span>
            </div>
          )}
        </Surface>

        {/* Section 2: Discovered LAN P2P Hosts */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
              เครื่องที่แชร์เพลงในวง Local Network ({otherLanHosts.length})
            </h3>
            <button
              type="button"
              onClick={() => void handleRefreshAll()}
              disabled={refreshing}
              className="text-xs text-primary hover:underline inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>ค้นหาใหม่</span>
            </button>
          </div>

          {otherLanHosts.length > 0 ? (
            <div className="divide-y divide-border/60 border border-border/75 rounded-control overflow-hidden bg-background/60">
              {otherLanHosts.map((host) => {
                const isConnected = connectedSet.has(host.deviceId);
                const isBusy = connectingHostId === host.deviceId;
                return (
                  <div key={host.deviceId} className="p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-control border flex items-center justify-center shrink-0 ${
                          isConnected
                            ? 'border-emerald-600/45 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10'
                            : 'border-border/75 text-muted bg-surface'
                        }`}
                      >
                        <DeviceIcon type={host.deviceType} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{host.deviceName}</p>
                        <p className="text-xs text-muted tabular-nums truncate">
                          {host.trackCount} เพลง · {isConnected ? 'เชื่อมต่อวง LAN แล้ว' : 'พร้อมส่งเสียงผ่าน P2P LAN'}
                        </p>
                      </div>
                    </div>

                    {isConnected ? (
                      <Button
                        tone="quiet"
                        onClick={() => onDisconnectLanHost(host.deviceId)}
                        className="min-h-9 px-3 text-xs shrink-0"
                      >
                        ตัดการเชื่อมต่อ
                      </Button>
                    ) : (
                      <Button
                        tone="primary"
                        disabled={isBusy}
                        onClick={() => void handleConnectHost(host)}
                        className="min-h-9 px-3 text-xs shrink-0"
                      >
                        <Wifi className="w-3.5 h-3.5" />
                        <span>{isBusy ? 'กำลังเชื่อม...' : 'ฟังเพลงจากเครื่องนี้'}</span>
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <Surface inset className="p-3.5 text-xs text-muted leading-relaxed">
              ยังไม่พบเครื่องอื่นที่กดเปิดแชร์เพลงในวง LAN — ให้เปิด Aura Audio บนคอมพิวเตอร์หรือมือถืออีกเครื่อง
              แล้วกดปุ่ม <strong className="text-foreground">&ldquo;เปิดแชร์ในวง LAN&rdquo;</strong> เครื่องนั้นจะแสดงที่นี่ทันที
            </Surface>
          )}
        </div>

        {/* Section 3: Direct LAN Server URL (http://192.168.x.x:3000) */}
        <div className="pt-4 border-t border-border/60 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-primary" />
              <span>เชื่อมต่อเซิร์ฟเวอร์ผ่าน IP วง LAN (PC / Home Server)</span>
            </h3>
            {networkInfo && (
              <span className="text-[11px] text-muted truncate">
                {networkInfo.hostname}
              </span>
            )}
          </div>

          {networkInfo && !networkInfo.isCloudContainer && networkInfo.lanUrls.length > 0 && (
            <div className="rounded-control border border-border/75 bg-background p-3 space-y-2">
              <p className="text-xs font-medium text-foreground">
                ที่อยู่ Local Network ของเซิร์ฟเวอร์นี้ (เปิดบนมือถือ/คอมใน Wi-Fi เดียวกัน):
              </p>
              <div className="space-y-1.5">
                {networkInfo.lanUrls.map((item) => (
                  <div
                    key={item.url}
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-control bg-surface border border-border/60"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-mono text-foreground truncate">{item.url}</p>
                      <p className="text-[10px] text-muted truncate">อินเทอร์เฟซ: {item.name}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleCopy(item.url)}
                      className="px-2.5 py-1 rounded-control border border-border text-xs font-medium hover:bg-foreground/5 inline-flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      {copiedUrl === item.url ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span>คัดลอกแล้ว</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>คัดลอก</span>
                        </>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleSaveLanServer} className="space-y-3">
            <Field
              label="URL เซิร์ฟเวอร์ในวง LAN (เช่น http://192.168.1.50:3000)"
              type="text"
              value={lanServerInput}
              onChange={(e) => setLanServerInput(e.target.value)}
              placeholder="http://192.168.1.50:3000"
            />

            {isHttpsPageWithHttpTarget && (
              <div className="rounded-control border border-amber-500/40 bg-background px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed space-y-1">
                <p>
                  หน้าเว็บนี้เปิดผ่าน HTTPS เบราว์เซอร์จะบล็อกการดึงเสียงจากลิงก์ HTTP วง LAN โดยตรง (Mixed Content)
                </p>
                <p>
                  แนะนำ: เปิด{' '}
                  <button
                    type="button"
                    onClick={() => void handleCopy(normalizedInput)}
                    className="underline font-mono font-medium cursor-pointer"
                  >
                    {normalizedInput}
                  </button>{' '}
                  ในแท็บใหม่โดยตรง, ใช้แอพ Android APK, หรือใช้ระบบ <strong>แชร์วง LAN P2P</strong> ด้านบนซึ่งเล่นผ่าน HTTPS ได้ทันที
                </p>
              </div>
            )}

            {testResult && (
              <div
                className={`rounded-control border px-3 py-2 text-xs flex items-center gap-2 ${
                  testResult.ok
                    ? 'border-emerald-600/35 bg-surface text-emerald-700 dark:text-emerald-400'
                    : 'border-red-500/40 bg-surface text-red-700 dark:text-red-400'
                }`}
              >
                {testResult.ok ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <WifiOff className="w-4 h-4 shrink-0" />
                )}
                <span className="truncate">
                  {testResult.ok
                    ? `เชื่อมต่อ LAN สำเร็จ (${testResult.latencyMs} ms · ออนไลน์ ${testResult.connectedDevices ?? 1} เครื่อง)`
                    : testResult.error}
                </span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleResetServer}
                className="text-xs text-muted hover:text-foreground underline cursor-pointer"
              >
                กลับไปใช้เซิร์ฟเวอร์เริ่มต้น
              </button>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  tone="quiet"
                  disabled={testing}
                  onClick={() => void handleTestLanServer()}
                  className="min-h-9 px-3 text-xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
                  <span>ทดสอบ LAN</span>
                </Button>
                <Button type="submit" tone="ink" className="min-h-9 px-4 text-xs">
                  <span>สลับเซิร์ฟเวอร์</span>
                </Button>
              </div>
            </div>
          </form>
        </div>

        {error && (
          <p role="alert" className="text-xs text-red-700 dark:text-red-400 leading-relaxed">
            {error}
          </p>
        )}
      </Surface>
    </div>
  );
}
