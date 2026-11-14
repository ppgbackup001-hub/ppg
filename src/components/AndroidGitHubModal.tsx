import { useEffect, useState, type FormEvent } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  GitBranch,
  Globe,
  RefreshCw,
  Server,
  Smartphone,
  WifiOff,
  X,
} from 'lucide-react';
import {
  DEFAULT_REMOTE_SERVER_URL,
  getConfiguredServerBaseUrl,
  getServerBaseUrl,
  isNativeAndroidShell,
  setServerBaseUrl,
  testServerConnection,
} from '../utils/api';
import { Button, Field, Surface } from './ui';

interface AndroidGitHubModalProps {
  open: boolean;
  onClose: () => void;
  onServerUrlSaved: (resolvedUrl: string) => void;
}

export function AndroidGitHubModal({
  open,
  onClose,
  onServerUrlSaved,
}: AndroidGitHubModalProps) {
  const isAndroid = isNativeAndroidShell();
  const [urlInput, setUrlInput] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    url: string;
    latencyMs: number;
    connectedDevices?: number;
    error?: string;
  } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setUrlInput(getConfiguredServerBaseUrl() || getServerBaseUrl());
    setTestResult(null);
    setCopiedKey(null);

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleCopyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleTest = async (overrideUrl?: string) => {
    setTesting(true);
    try {
      const result = await testServerConnection(overrideUrl !== undefined ? overrideUrl : urlInput);
      setTestResult(result);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    const resolved = setServerBaseUrl(urlInput);
    onServerUrlSaved(resolved);
    onClose();
  };

  const handleResetDefault = () => {
    setUrlInput('');
    const resolved = setServerBaseUrl('');
    setTestResult(null);
    onServerUrlSaved(resolved);
  };

  const currentOrigin =
    typeof window !== 'undefined' && !isAndroid ? window.location.origin : DEFAULT_REMOTE_SERVER_URL;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="android-github-modal-title"
      onClick={onClose}
    >
      <Surface
        className="w-full max-w-xl p-6 shadow-2xl border border-border max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-control bg-background border border-border flex items-center justify-center text-primary shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 id="android-github-modal-title" className="text-lg font-semibold tracking-tight">
                แอพ Android &amp; GitHub APK
              </h2>
              <p className="text-xs text-muted">
                {isAndroid
                  ? 'กำลังใช้งานบน Aura Android App · ตั้งค่าเซิร์ฟเวอร์สตรีมมิ่งได้ที่นี่'
                  : 'สร้างไฟล์ติดตั้ง .APK อัตโนมัติผ่าน GitHub Actions และเชื่อมต่อคลังเพลงเดียวกัน'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่าง"
            className="w-9 h-9 rounded-control flex items-center justify-center text-muted hover:text-foreground hover:bg-foreground/5 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-5">
          {/* Section 1: Server Connection for Android APK / Remote Client */}
          <form onSubmit={handleSave} className="space-y-3 rounded-control border border-border/80 bg-background p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-primary" />
                <span>ที่อยู่เซิร์ฟเวอร์สตรีมมิ่ง (สำหรับแอพ Android)</span>
              </p>
              <span className="text-[11px] text-muted">
                {getServerBaseUrl() ? 'โหมดเชื่อมต่อรีโมต' : 'โหมดเครื่องเดียวกัน'}
              </span>
            </div>

            <Field
              label="Server URL (ใส่ Cloud URL หรือ IP ของ PC เช่น http://192.168.1.50:3000)"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder={DEFAULT_REMOTE_SERVER_URL}
              autoComplete="url"
            />

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setUrlInput(DEFAULT_REMOTE_SERVER_URL)}
                className="px-2.5 py-1 rounded-control border border-border bg-surface text-[11px] font-medium text-muted hover:text-foreground cursor-pointer inline-flex items-center gap-1"
              >
                <Globe className="w-3 h-3" />
                <span>Cloud URL หลัก</span>
              </button>
              {!isAndroid && (
                <button
                  type="button"
                  onClick={() => setUrlInput(currentOrigin)}
                  className="px-2.5 py-1 rounded-control border border-border bg-surface text-[11px] font-medium text-muted hover:text-foreground cursor-pointer"
                >
                  ใช้ URL หน้าเว็บนี้
                </button>
              )}
              <button
                type="button"
                onClick={handleResetDefault}
                className="px-2.5 py-1 rounded-control border border-border bg-surface text-[11px] font-medium text-muted hover:text-foreground cursor-pointer"
              >
                คืนค่าเริ่มต้น
              </button>
            </div>

            {testResult && (
              <div
                className={`rounded-control border px-3 py-2 text-xs flex items-center justify-between gap-2 ${
                  testResult.ok
                    ? 'border-emerald-600/35 bg-surface text-emerald-700 dark:text-emerald-400'
                    : 'border-red-500/40 bg-surface text-red-700 dark:text-red-400'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  {testResult.ok ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <WifiOff className="w-4 h-4 shrink-0" />
                  )}
                  <span className="truncate">
                    {testResult.ok
                      ? `เชื่อมต่อสำเร็จ (${testResult.latencyMs} ms · ออนไลน์ ${testResult.connectedDevices ?? 1} เครื่อง)`
                      : testResult.error}
                  </span>
                </span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              <Button
                type="button"
                tone="quiet"
                onClick={() => void handleTest()}
                disabled={testing}
                className="min-h-9 px-3 text-xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
                <span>ทดสอบเชื่อมต่อ</span>
              </Button>
              <Button type="submit" tone="primary" className="min-h-9 px-4 text-xs">
                <span>บันทึกและซิงค์ทันที</span>
              </Button>
            </div>
          </form>

          {/* Section 2: GitHub Actions APK Build Guide */}
          <div className="rounded-control border border-border/80 bg-background p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <GitBranch className="w-3.5 h-3.5 text-primary" />
                <span>วิธีสร้างและดาวน์โหลดไฟล์ .APK บน GitHub</span>
              </p>
              <span className="text-[11px] font-mono text-muted">android/ · GitHub Actions</span>
            </div>

            <ol className="space-y-2 text-xs text-muted list-decimal list-inside leading-relaxed">
              <li>
                ส่งโค้ดโปรเจกต์นี้ขึ้น <strong className="text-foreground">GitHub Repository</strong>{' '}
                (โปรเจกต์มีโฟลเดอร์ <code className="font-mono text-foreground">android/</code>{' '}
                และไฟล์ workflow{' '}
                <code className="font-mono text-foreground">.github/workflows/android-apk.yml</code>{' '}
                พร้อมให้แล้ว)
              </li>
              <li>
                เปิดแท็บ <strong className="text-foreground">Actions</strong> บน GitHub → เลือก{' '}
                <strong className="text-foreground">Build Aura Audio Android APK</strong>{' '}
                (ระบบจะคอมไพล์ให้อัตโนมัติเมื่อ Push หรือกด <strong className="text-foreground">Run workflow</strong>)
              </li>
              <li>
                เมื่อ Build เสร็จ ดาวน์โหลดไฟล์{' '}
                <strong className="text-foreground">AuraAudio-debug.apk</strong> จากส่วน{' '}
                <strong className="text-foreground">Artifacts</strong> (หรือสร้างแท็ก{' '}
                <code className="font-mono text-foreground">v1.0.0</code> เพื่อออกไฟล์ในหน้า{' '}
                <strong className="text-foreground">Releases</strong>)
              </li>
              <li>
                ติดตั้ง APK ลงมือถือ Android → เปิดแอพ แล้วเล่นเพลงจากเครื่องมือถือ สตรีมกลางจากทุกเครื่อง หรือฟังเพลงจาก HDD ใน PC ผ่าน Wi-Fi ได้ทันที
              </li>
            </ol>

            <div className="pt-2 border-t border-border/60 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-muted truncate">
                  Cloud URL สำหรับคัดลอกไปวางในแอพ Android:
                </p>
                <p className="text-[11px] font-mono text-foreground truncate">
                  {currentOrigin}
                </p>
              </div>
              <Button
                type="button"
                tone="quiet"
                onClick={() => void handleCopyText('origin', currentOrigin)}
                className="min-h-8 px-3 text-xs shrink-0"
              >
                {copiedKey === 'origin' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>คัดลอกแล้ว</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>คัดลอก URL</span>
                  </>
                )}
              </Button>
            </div>

            <div className="rounded-control bg-surface border border-border/70 px-3 py-2 text-[11px] text-muted flex items-start gap-2">
              <Download className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
              <span>
                แอพ Android รองรับทั้งการเลือกไฟล์เสียงในเครื่องมือถือ (MP3, FLAC, WAV, OGG, AAC, M4A, OPUS), Equalizer 5 ย่านความถี่, ซิงค์คลังกลางแบบเรียลไทม์, และแคสต์ข้ามอุปกรณ์กับคอมพิวเตอร์
              </span>
            </div>
          </div>
        </div>
      </Surface>
    </div>
  );
}
