import { useEffect, useState, type FormEvent } from 'react';
import { HardDrive, Radio, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { Button, Field, Surface } from './ui';

interface StreamModalProps {
  open: boolean;
  onClose: () => void;
  isAdmin: boolean;
  onOpenAuth: () => void;
  onAddStream: (payload: {
    title: string;
    artist: string;
    genre?: string;
    url: string;
    format: string;
  }) => Promise<void>;
  onOpenHddMount: () => void;
  onRescanHdd: () => Promise<void>;
}

export function StreamModal({
  open,
  onClose,
  isAdmin,
  onOpenAuth,
  onAddStream,
  onOpenHddMount,
  onRescanHdd,
}: StreamModalProps) {
  const [mode, setMode] = useState<'hdd' | 'url'>('hdd');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [genre, setGenre] = useState('');
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState('STREAM');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    setSubmitting(false);
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const inferFormat = (rawUrl: string): string => {
    const clean = rawUrl.split('?')[0].toLowerCase();
    if (clean.endsWith('.flac')) return 'FLAC';
    if (clean.endsWith('.ogg') || clean.endsWith('.oga')) return 'OGG';
    if (clean.endsWith('.aac') || clean.endsWith('.m4a')) return 'AAC';
    if (clean.endsWith('.wav')) return 'WAV';
    if (clean.endsWith('.opus')) return 'OPUS';
    if (clean.endsWith('.mp3')) return 'MP3';
    return 'STREAM';
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedUrl = url.trim();
    if (!/^https?:\/\//i.test(trimmedUrl)) {
      setError('กรุณากรอก URL ที่ขึ้นต้นด้วย http:// หรือ https://');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await onAddStream({
        title: title.trim() || 'สถานีวิทยุออนไลน์',
        artist: artist.trim() || 'Online Audio Stream',
        genre: genre.trim() || undefined,
        url: trimmedUrl,
        format: format === 'STREAM' ? inferFormat(trimmedUrl) : format,
      });

      setTitle('');
      setArtist('');
      setGenre('');
      setUrl('');
      setFormat('STREAM');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถเพิ่มสตรีมได้');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRescan = async () => {
    setError('');
    setSubmitting(true);
    try {
      await onRescanHdd();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'รีสแกน HDD ไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stream-modal-heading"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Surface className="max-w-md w-full border border-border p-6">
        <div className="flex items-center justify-between pb-4 border-b border-border/60">
          <h2 id="stream-modal-heading" className="text-base font-semibold">
            เพิ่มเพลงสตรีมออนไลน์ (ใช้ไฟล์จาก HDD เป็นหลัก)
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่างเพิ่มสตรีม"
            className="w-9 h-9 rounded-control flex items-center justify-center text-muted hover:text-foreground hover:bg-foreground/5 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!isAdmin ? (
          <div className="pt-5 space-y-4">
            <p className="text-sm text-muted leading-relaxed">
              เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถเพิ่มหรือจัดการคลังสตรีมกลางของทุกเครื่องได้
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
            <div className="flex gap-2 pt-4 pb-4 border-b border-border/60">
              <button
                type="button"
                onClick={() => {
                  setMode('hdd');
                  setError('');
                }}
                className={`flex-1 min-h-10 px-3 rounded-control text-xs sm:text-sm font-medium border transition-colors cursor-pointer ${
                  mode === 'hdd'
                    ? 'bg-foreground text-surface border-foreground'
                    : 'bg-surface text-muted border-border hover:text-foreground'
                }`}
              >
                ไฟล์จาก HDD (ไม่อัปโหลด)
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('url');
                  setError('');
                }}
                className={`flex-1 min-h-10 px-3 rounded-control text-xs sm:text-sm font-medium border transition-colors cursor-pointer ${
                  mode === 'url'
                    ? 'bg-foreground text-surface border-foreground'
                    : 'bg-surface text-muted border-border hover:text-foreground'
                }`}
              >
                ลิงก์สตรีม URL
              </button>
            </div>

            {mode === 'hdd' ? (
              <div className="pt-5 space-y-4">
                <p className="text-sm text-muted leading-relaxed">
                  เลือกโฟลเดอร์หรือไฟล์เพลงบน HDD ของเครื่องโฮสต์เพื่อสตรีมให้ทุกเครื่องทันที{' '}
                  <strong className="text-foreground">โดยไม่อัปโหลดไฟล์ขึ้นระบบ</strong>{' '}
                  และจะตรวจจับไฟล์ใหม่ที่เพิ่มเข้าโฟลเดอร์บน HDD ให้อัตโนมัติ
                </p>

                <Button
                  tone="primary"
                  disabled={submitting}
                  onClick={() => {
                    onClose();
                    onOpenHddMount();
                  }}
                  className="w-full"
                >
                  <HardDrive className="w-4 h-4" />
                  <span>เลือกโฟลเดอร์ / ไฟล์บน HDD</span>
                </Button>

                <Button
                  tone="quiet"
                  disabled={submitting}
                  onClick={handleRescan}
                  className="w-full"
                >
                  <RefreshCw className={`w-4 h-4 ${submitting ? 'animate-spin' : ''}`} />
                  <span>{submitting ? 'กำลังรีสแกน HDD...' : 'รีสแกนไฟล์ล่าสุดใน HDD ที่เชื่อมต่ออยู่'}</span>
                </Button>

                {error && (
                  <p role="alert" className="text-xs text-red-700 dark:text-red-400">
                    {error}
                  </p>
                )}
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="pt-5 space-y-4">
                <Field
                  label="ชื่อเพลง หรือ ชื่อสถานี"
                  type="text"
                  required
                  autoFocus
                  placeholder="เช่น Lofi Study Radio หรือ Night Jazz"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field
                    label="ศิลปิน"
                    type="text"
                    placeholder="เช่น Internet Radio"
                    value={artist}
                    onChange={(e) => setArtist(e.target.value)}
                  />
                  <Field
                    label="แนวเพลง (Genre)"
                    type="text"
                    placeholder="เช่น Jazz, Lo-Fi, Pop"
                    value={genre}
                    onChange={(e) => setGenre(e.target.value)}
                  />
                </div>

                <Field
                  label="ลิงก์สตรีมเสียง (MP3, FLAC, OGG, AAC, WAV, Icecast)"
                  type="url"
                  required
                  placeholder="https://example.com/stream.mp3"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  error={error}
                />

                <div>
                  <label htmlFor="stream-format-select" className="block text-xs font-medium text-muted mb-1.5">
                    รูปแบบเสียง
                  </label>
                  <select
                    id="stream-format-select"
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                    className="w-full min-h-11 px-3.5 text-sm rounded-control bg-background text-foreground border border-border/80 focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <option value="STREAM">ตรวจจับอัตโนมัติ (Auto)</option>
                    <option value="MP3">MP3 Stream</option>
                    <option value="AAC">AAC / M4A Stream</option>
                    <option value="OGG">OGG / Opus Stream</option>
                    <option value="FLAC">FLAC Lossless Stream</option>
                    <option value="WAV">WAV Stream</option>
                  </select>
                </div>

                <Button type="submit" tone="primary" disabled={submitting} className="w-full">
                  <Radio className="w-4 h-4" />
                  <span>{submitting ? 'กำลังบันทึก...' : 'เพิ่มเข้าคลังสตรีมกลางทุกเครื่อง'}</span>
                </Button>
              </form>
            )}
          </>
        )}
      </Surface>
    </div>
  );
}
