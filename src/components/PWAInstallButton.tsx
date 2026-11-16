import { useState } from 'react';
import {
  ArrowUpCircle,
  Check,
  Copy,
  Download,
  ExternalLink,
  MonitorDown,
  RefreshCw,
  Share,
  WifiOff,
  X,
} from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';
import { isNativeAndroidShell } from '../utils/api';
import { usePWAUpdate } from '../utils/pwaUpdater';
import { Button, Surface } from './ui';

interface PWAInstallButtonProps {
  variant?: 'header' | 'sidebar';
  onInstalled?: () => void;
  onStatusMessage?: (message: string) => void;
}

export function PWAInstallButton({
  variant = 'header',
  onInstalled,
  onStatusMessage,
}: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, isInIframe, install } = usePWAInstall();
  const {
    needRefresh,
    isChecking,
    isUpdating,
    statusMessage,
    checkForUpdate,
    applyUpdate,
  } = usePWAUpdate();
  const [showGuide, setShowGuide] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [installing, setInstalling] = useState(false);

  // Suppress inside native Android APK shell
  if (isNativeAndroidShell()) {
    return null;
  }

  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

  const handleCopyUrl = async () => {
    if (!currentUrl) return;
    try {
      await navigator.clipboard.writeText(currentUrl);
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 2200);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleInstallClick = async () => {
    if (isInstallable) {
      setInstalling(true);
      try {
        const accepted = await install();
        if (accepted) {
          onInstalled?.();
        }
      } finally {
        setInstalling(false);
      }
      return;
    }
    setShowGuide(true);
  };

  const handleUpdateClick = async () => {
    if (needRefresh) {
      await applyUpdate();
      return;
    }
    const result = await checkForUpdate();
    if (result.hasUpdate) {
      await applyUpdate();
    } else if (onStatusMessage) {
      onStatusMessage(
        result.error || 'เป็นเวอร์ชันล่าสุดแล้ว (กด "รีเฟรชล้างแคชแอพ" ด้านข้างได้หากต้องการบังคับโหลดใหม่)'
      );
    }
  };

  if (isInstalled) {
    if (variant === 'sidebar') {
      return (
        <div className="space-y-1.5">
          <Button
            tone={needRefresh ? 'primary' : 'ghost'}
            disabled={isChecking || isUpdating}
            onClick={() => void handleUpdateClick()}
            className={`w-full justify-start text-xs ${
              needRefresh ? '' : 'text-muted hover:text-foreground'
            }`}
          >
            <RefreshCw
              className={`w-4 h-4 shrink-0 ${
                needRefresh ? '' : 'text-primary'
              } ${isChecking || isUpdating ? 'animate-spin' : ''}`}
            />
            <span>
              {isUpdating
                ? 'กำลังอัพเดทแอพ...'
                : isChecking
                  ? 'กำลังตรวจหาอัพเดท...'
                  : needRefresh
                    ? 'มีอัพเดทใหม่ — กดเพื่ออัพเดท'
                    : 'ตรวจหาอัพเดทแอพ'}
            </span>
          </Button>
          {statusMessage && !needRefresh && (
            <div className="flex items-center justify-between gap-2 px-2 text-[11px] text-muted">
              <span className="truncate">{statusMessage}</span>
              <button
                type="button"
                onClick={() => void applyUpdate()}
                disabled={isUpdating}
                className="text-primary hover:underline shrink-0 font-medium cursor-pointer"
              >
                โหลดใหม่
              </button>
            </div>
          )}
        </div>
      );
    }

    return (
      <button
        type="button"
        onClick={() => void handleUpdateClick()}
        disabled={isChecking || isUpdating}
        aria-label={needRefresh ? 'อัพเดทแอพ Aura Audio เป็นเวอร์ชันล่าสุด' : 'ตรวจสอบอัพเดทแอพ Aura Audio'}
        title={
          needRefresh
            ? 'มีแอพเวอร์ชันใหม่ — กดเพื่ออัพเดททันที'
            : 'ตรวจสอบอัพเดทแอพเวอร์ชันล่าสุด'
        }
        className={`min-h-10 px-2.5 sm:px-3 rounded-control border flex items-center gap-1.5 text-xs font-medium transition-colors cursor-pointer shrink-0 ${
          needRefresh
            ? 'border-primary bg-primary text-primary-foreground hover:brightness-95'
            : 'border-border text-foreground hover:bg-foreground/5'
        }`}
      >
        <RefreshCw
          className={`w-4 h-4 shrink-0 ${isChecking || isUpdating ? 'animate-spin' : ''}`}
        />
        <span className="hidden lg:inline">
          {isUpdating
            ? 'กำลังอัพเดท...'
            : isChecking
              ? 'กำลังตรวจ...'
              : needRefresh
                ? 'อัพเดทแอพ'
                : 'ตรวจอัพเดท'}
        </span>
      </button>
    );
  }

  return (
    <>
      {variant === 'sidebar' ? (
        <div className="space-y-1.5">
          {needRefresh ? (
            <Button
              tone="primary"
              disabled={isUpdating}
              onClick={() => void applyUpdate()}
              className="w-full justify-start text-xs"
            >
              <RefreshCw className={`w-4 h-4 shrink-0 ${isUpdating ? 'animate-spin' : ''}`} />
              <span>{isUpdating ? 'กำลังอัพเดท...' : 'มีอัพเดทใหม่ — อัพเดททันที'}</span>
            </Button>
          ) : (
            <Button
              tone="ghost"
              disabled={isChecking || isUpdating}
              onClick={() => void handleUpdateClick()}
              className="w-full justify-start text-xs text-muted hover:text-foreground"
            >
              <RefreshCw
                className={`w-4 h-4 shrink-0 text-primary ${isChecking || isUpdating ? 'animate-spin' : ''}`}
              />
              <span>
                {isUpdating
                  ? 'กำลังอัพเดท...'
                  : isChecking
                    ? 'กำลังตรวจหาอัพเดท...'
                    : 'ตรวจหาอัพเดทแอพ'}
              </span>
            </Button>
          )}
          {statusMessage && !needRefresh && (
            <div className="flex items-center justify-between gap-2 px-2 text-[11px] text-muted">
              <span className="truncate">{statusMessage}</span>
              <button
                type="button"
                onClick={() => void applyUpdate()}
                disabled={isUpdating}
                className="text-primary hover:underline shrink-0 font-medium cursor-pointer"
              >
                โหลดใหม่
              </button>
            </div>
          )}
          <Button
            tone={isInstallable && !needRefresh ? 'primary' : 'ghost'}
            disabled={installing}
            onClick={() => void handleInstallClick()}
            className={`w-full justify-start text-xs ${
              isInstallable && !needRefresh ? '' : 'text-muted hover:text-foreground'
            }`}
          >
            <MonitorDown
              className={`w-4 h-4 shrink-0 ${isInstallable && !needRefresh ? '' : 'text-primary'}`}
            />
            <span>
              {installing
                ? 'กำลังติดตั้ง...'
                : isInstallable
                  ? 'ติดตั้งแอพบน Chrome (พร้อมแล้ว)'
                  : 'ติดตั้งแอพลง Chrome / อุปกรณ์'}
            </span>
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2 shrink-0">
          {needRefresh && (
            <button
              type="button"
              onClick={() => void applyUpdate()}
              disabled={isUpdating}
              aria-label="อัพเดทแอพ Aura Audio เป็นเวอร์ชันล่าสุด"
              title="มีแอพเวอร์ชันใหม่ — กดเพื่ออัพเดททันที"
              className="min-h-10 px-2.5 sm:px-3 rounded-control border border-primary bg-primary text-primary-foreground hover:brightness-95 flex items-center gap-1.5 text-xs font-medium transition-colors cursor-pointer shrink-0"
            >
              <RefreshCw className={`w-4 h-4 shrink-0 ${isUpdating ? 'animate-spin' : ''}`} />
              <span className="hidden lg:inline">
                {isUpdating ? 'กำลังอัพเดท...' : 'อัพเดทแอพ'}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleInstallClick()}
            disabled={installing}
            aria-label="ติดตั้งแอพ Aura Audio บน Google Chrome หรือหน้าจอหลัก"
            title={
              isInstallable
                ? 'ติดตั้งแอพ Aura Audio ทันที'
                : 'ติดตั้งแอพลง Google Chrome / หน้าจอหลัก'
            }
            className={`min-h-10 px-2.5 sm:px-3 rounded-control border flex items-center gap-1.5 text-xs font-medium transition-colors cursor-pointer shrink-0 ${
              isInstallable && !needRefresh
                ? 'border-primary bg-primary text-primary-foreground hover:brightness-95'
                : 'border-border text-foreground hover:bg-foreground/5'
            }`}
          >
            <Download className="w-4 h-4 shrink-0" />
            <span className="hidden lg:inline">
              {installing ? 'กำลังติดตั้ง...' : 'ติดตั้งแอพ'}
            </span>
          </button>
        </div>
      )}

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-guide-title"
          onClick={() => setShowGuide(false)}
        >
          <Surface
            className="w-full max-w-md border border-border p-6 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-border/60">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-control bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <MonitorDown className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h2 id="pwa-guide-title" className="text-base font-semibold truncate">
                    {isIOS ? 'ติดตั้งลง iPhone / iPad' : 'ติดตั้ง Aura Audio บน Google Chrome'}
                  </h2>
                  <p className="text-xs text-muted truncate">
                    เปิดใช้งานแบบแอพแยกหน้าต่าง พร้อมทำงานเต็มหน้าจอ
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="ปิดหน้าต่างคำแนะนำการติดตั้ง"
                className="w-8 h-8 rounded-control flex items-center justify-center text-muted hover:text-foreground hover:bg-foreground/5 cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <div className="space-y-2.5 text-xs text-muted leading-relaxed">
                <p className="text-foreground font-medium">
                  สำหรับ Safari บน iOS / iPadOS:
                </p>
                <p className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-surface border border-border flex items-center justify-center text-[11px] font-semibold text-foreground shrink-0">
                    1
                  </span>
                  <span>
                    แตะปุ่ม{' '}
                    <strong className="text-foreground inline-flex items-center gap-1">
                      <Share className="w-3.5 h-3.5" /> แชร์ (Share)
                    </strong>{' '}
                    ที่แถบเครื่องมือ Safari
                  </span>
                </p>
                <p className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-surface border border-border flex items-center justify-center text-[11px] font-semibold text-foreground shrink-0">
                    2
                  </span>
                  <span>
                    เลื่อนลงแล้วเลือก{' '}
                    <strong className="text-foreground">
                      เพิ่มไปยังหน้าจอโฮม (Add to Home Screen)
                    </strong>
                  </span>
                </p>
              </div>
            ) : (
              <div className="space-y-3 text-xs leading-relaxed">
                {isInIframe && (
                  <Surface inset className="p-3 border border-amber-500/40 space-y-2">
                    <p className="font-medium text-amber-800 dark:text-amber-300">
                      หน้าเว็บกำลังเปิดอยู่ในกรอบพรีวิว (iframe)
                    </p>
                    <p className="text-muted">
                      Google Chrome ไม่อนุญาตให้ติดตั้งแอพจากในกรอบพรีวิว — กรุณาเปิดลิงก์นี้ในแท็บ Chrome
                      ตรงโดยตรงก่อนแล้วปุ่มติดตั้งจะขึ้นทันที
                    </p>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <a
                        href={currentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-control bg-primary text-primary-foreground font-medium hover:brightness-95"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>เปิดในแท็บ Chrome ใหม่</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => void handleCopyUrl()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-control border border-border text-foreground hover:bg-foreground/5 cursor-pointer"
                      >
                        {copiedUrl ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span>คัดลอกลิงก์แล้ว</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>คัดลอกลิงก์</span>
                          </>
                        )}
                      </button>
                    </div>
                  </Surface>
                )}

                <div className="space-y-2 text-muted">
                  <p className="text-foreground font-medium">วิธีติดตั้งบน Google Chrome:</p>
                  <p>
                    <strong className="text-foreground">• บนคอมพิวเตอร์ (Windows / Mac):</strong>{' '}
                    กดไอคอน <strong className="text-foreground">ติดตั้ง Aura Audio</strong>{' '}
                    ที่ด้านขวาของแถบที่อยู่ URL หรือกดเมนู{' '}
                    <strong className="text-foreground">
                      ⋮ &gt; บันทึกและแชร์ (Cast, save, and share) &gt; ติดตั้งหน้าเว็บเป็นแอพ
                    </strong>
                  </p>
                  <p>
                    <strong className="text-foreground">• บนมือถือ Android (Chrome):</strong>{' '}
                    กดเมนู{' '}
                    <strong className="text-foreground">
                      ⋮ &gt; เพิ่มลงในหน้าจอหลัก (Add to Home screen) &gt; ติดตั้ง (Install)
                    </strong>
                  </p>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button tone="ink" onClick={() => setShowGuide(false)}>
                เข้าใจแล้ว
              </Button>
            </div>
          </Surface>
        </div>
      )}
    </>
  );
}

export function PWAUpdateBanner() {
  const { needRefresh, isUpdating, applyUpdate, dismissUpdate } = usePWAUpdate();
  if (!needRefresh || isNativeAndroidShell()) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-24 right-4 z-40 flex items-center gap-3 rounded-control border border-primary/40 bg-surface px-3.5 py-2.5 text-xs shadow-xl max-w-[calc(100vw-2rem)]"
    >
      <ArrowUpCircle className="w-4 h-4 text-primary shrink-0" />
      <div className="min-w-0">
        <p className="font-medium text-foreground truncate">มีแอพเวอร์ชันใหม่พร้อมใช้งาน</p>
        <p className="text-[11px] text-muted truncate">
          กดอัพเดทเพื่อโหลดความสามารถล่าสุด (ข้อมูลเพลงไม่หาย)
        </p>
      </div>
      <Button
        tone="primary"
        disabled={isUpdating}
        onClick={() => void applyUpdate()}
        className="min-h-8 px-3 text-xs shrink-0"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${isUpdating ? 'animate-spin' : ''}`} />
        <span>{isUpdating ? 'กำลังอัพเดท...' : 'อัพเดททันที'}</span>
      </Button>
      <button
        type="button"
        onClick={dismissUpdate}
        aria-label="ซ่อนแจ้งเตือนอัพเดทชั่วคราว"
        className="w-7 h-7 rounded-control flex items-center justify-center text-muted hover:text-foreground hover:bg-foreground/5 cursor-pointer shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-24 left-4 z-40 flex items-center gap-2 rounded-control border border-amber-500/40 bg-surface px-3 py-1.5 text-xs font-medium text-amber-800 dark:text-amber-300 shadow-lg"
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>โหมดออฟไลน์ — เล่นไฟล์ในเครื่องที่ซิงค์ไว้ได้ตามปกติ</span>
    </div>
  );
}
