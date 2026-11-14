import { useEffect, useState } from 'react';
import { AlertTriangle, RotateCcw, X } from 'lucide-react';
import { Button, Surface } from './ui';

interface ResetDataModalProps {
  open: boolean;
  onClose: () => void;
  isAdmin: boolean;
  defaultIncludeServer?: boolean;
  stats: {
    localCount: number;
    sharedStreamsCount: number;
    playlistsCount: number;
    favoritesCount: number;
  };
  onConfirmReset: (includeServer: boolean) => Promise<void>;
}

export function ResetDataModal({
  open,
  onClose,
  isAdmin,
  defaultIncludeServer = false,
  stats,
  onConfirmReset,
}: ResetDataModalProps) {
  const [includeServer, setIncludeServer] = useState(defaultIncludeServer);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setIncludeServer(isAdmin && defaultIncludeServer);
    setError('');
    setSubmitting(false);
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, isAdmin, defaultIncludeServer, submitting, onClose]);

  if (!open) return null;

  const handleReset = async () => {
    setError('');
    setSubmitting(true);
    try {
      await onConfirmReset(isAdmin && includeServer);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'รีเซ็ตข้อมูลไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reset-modal-heading"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <Surface className="max-w-md w-full border border-border p-6">
        <div className="flex items-center justify-between pb-4 border-b border-border/60">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-red-700 dark:text-red-400" />
            <h2 id="reset-modal-heading" className="text-base font-semibold">
              รีเซ็ตข้อมูลแอพพลิเคชัน
            </h2>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            aria-label="ปิดหน้าต่างรีเซ็ตข้อมูล"
            className="w-9 h-9 rounded-control flex items-center justify-center text-muted hover:text-foreground hover:bg-foreground/5 cursor-pointer disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="pt-5 space-y-4">
          <p className="text-sm text-muted leading-relaxed">
            การรีเซ็ตข้อมูลจะล้างรายการเพลงในแอพ ประวัติโฟลเดอร์ HDD ที่ซิงค์ไว้ ({stats.localCount} ไฟล์),
            เพลงที่ถูกใจ ({stats.favoritesCount}), เพลย์ลิสต์ ({stats.playlistsCount}) และตั้งค่า EQ กลับเป็นค่าเริ่มต้น
          </p>

          <p className="text-xs text-muted leading-relaxed px-3 py-2 rounded-control bg-background border border-border/70">
            หมายเหตุ: ไฟล์เพลงต้นฉบับบนฮาร์ดดิสก์ (HDD) ของคุณจะไม่ถูกลบแต่อย่างใด
          </p>

          {isAdmin && (
            <label className="flex items-start gap-2.5 p-3 rounded-control border border-border/80 bg-background cursor-pointer">
              <input
                type="checkbox"
                checked={includeServer}
                onChange={(e) => setIncludeServer(e.target.checked)}
                className="mt-0.5 accent-primary cursor-pointer"
              />
              <span className="text-xs leading-relaxed">
                <strong className="block text-foreground font-medium">
                  รีเซ็ตคลังสตรีมออนไลน์ส่วนกลางทุกเครื่องด้วย ({stats.sharedStreamsCount} เพลง)
                </strong>
                <span className="text-muted">
                  ล้างรายชื่อเพลงสตรีมออนไลน์และโฟลเดอร์ HDD โฮสต์ที่เชื่อมต่ออยู่ทั้งหมด
                </span>
              </span>
            </label>
          )}

          {error && (
            <p role="alert" className="text-xs text-red-700 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="pt-2 flex items-center justify-end gap-2">
            <Button tone="quiet" disabled={submitting} onClick={onClose}>
              ยกเลิก
            </Button>
            <Button tone="danger" disabled={submitting} onClick={handleReset}>
              <RotateCcw className={`w-4 h-4 ${submitting ? 'animate-spin' : ''}`} />
              <span>{submitting ? 'กำลังรีเซ็ต...' : 'ยืนยันรีเซ็ตข้อมูล'}</span>
            </Button>
          </div>
        </div>
      </Surface>
    </div>
  );
}
