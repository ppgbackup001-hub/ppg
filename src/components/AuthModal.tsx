import { useEffect, useState, type FormEvent } from 'react';
import { LogOut, RotateCcw, ShieldCheck, Trash2, X } from 'lucide-react';
import type { UserAccount } from '../types/music';
import { Button, Field, Surface } from './ui';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  currentUser: UserAccount | null;
  stats: {
    favoritesCount: number;
    localCount: number;
    playlistsCount: number;
    sharedStreamsCount: number;
  };
  onSignIn: (identifier: string, password: string) => Promise<string | null>;
  onSignUp: (username: string, email: string, password: string) => Promise<string | null>;
  onSignOut: () => void;
  onClearLocalFiles: () => void;
  onOpenAdminPanel: () => void;
  onOpenResetData: () => void;
}

export function AuthModal({
  open,
  onClose,
  currentUser,
  stats,
  onSignIn,
  onSignUp,
  onSignOut,
  onClearLocalFiles,
  onOpenAdminPanel,
  onOpenResetData,
}: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [identifier, setIdentifier] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (mode === 'login') {
        const err = await onSignIn(identifier.trim(), password);
        if (err) {
          setError(err);
        } else {
          setIdentifier('');
          setPassword('');
          onClose();
        }
      } else {
        const err = await onSignUp(username.trim(), email.trim(), password);
        if (err) {
          setError(err);
        } else {
          setUsername('');
          setEmail('');
          setPassword('');
          onClose();
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-heading"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Surface className="max-w-md w-full border border-border p-6">
        <div className="flex items-center justify-between pb-4 border-b border-border/60">
          <h2 id="auth-modal-heading" className="text-base font-semibold">
            {currentUser
              ? 'บัญชีผู้ใช้งาน'
              : mode === 'login'
              ? 'เข้าสู่ระบบ Aura Audio'
              : 'สมัครสมาชิก Aura Audio'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่างบัญชีผู้ใช้"
            className="w-9 h-9 rounded-control flex items-center justify-center text-muted hover:text-foreground hover:bg-foreground/5 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {currentUser ? (
          <div className="pt-5 space-y-5">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-lg font-semibold shrink-0">
                {currentUser.username.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold truncate">{currentUser.username}</p>
                  {currentUser.role === 'admin' && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Admin
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted truncate">{currentUser.email}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-3 pt-4 border-t border-border/60 text-sm">
              <div>
                <p className="text-xs text-muted">คลังสตรีมกลาง (ทุกเครื่อง)</p>
                <p className="font-semibold tabular-nums mt-0.5">{stats.sharedStreamsCount} เพลง</p>
              </div>
              <div>
                <p className="text-xs text-muted">ไฟล์เพลงในเครื่องนี้</p>
                <p className="font-semibold tabular-nums mt-0.5">{stats.localCount} ไฟล์</p>
              </div>
              <div>
                <p className="text-xs text-muted">เพลงที่ถูกใจ</p>
                <p className="font-semibold tabular-nums mt-0.5">{stats.favoritesCount} เพลง</p>
              </div>
              <div>
                <p className="text-xs text-muted">เพลย์ลิสต์ส่วนตัว</p>
                <p className="font-semibold tabular-nums mt-0.5">{stats.playlistsCount} รายการ</p>
              </div>
            </div>

            {currentUser.role === 'admin' && (
              <Button
                tone="primary"
                onClick={() => {
                  onClose();
                  onOpenAdminPanel();
                }}
                className="w-full"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>จัดการคลังเพลงสตรีมกลาง (Admin)</span>
              </Button>
            )}

            <div className="pt-4 border-t border-border/60 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {stats.localCount > 0 && (
                  <Button tone="quiet" onClick={onClearLocalFiles} className="text-xs">
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>ล้างไฟล์ในเครื่อง</span>
                  </Button>
                )}
                <Button
                  tone="quiet"
                  onClick={() => {
                    onClose();
                    onOpenResetData();
                  }}
                  className="text-xs"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>รีเซ็ตข้อมูล</span>
                </Button>
              </div>
              <Button
                tone="danger"
                onClick={() => {
                  onSignOut();
                  onClose();
                }}
              >
                <LogOut className="w-4 h-4" />
                <span>ออกจากระบบ</span>
              </Button>
            </div>
          </div>
        ) : (
          <div className="pt-5">
            <div className="flex gap-2 mb-5">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError('');
                }}
                className={`flex-1 min-h-10 rounded-control text-sm font-medium border transition-colors cursor-pointer ${
                  mode === 'login'
                    ? 'bg-foreground text-surface border-foreground'
                    : 'bg-surface text-muted border-border hover:text-foreground'
                }`}
              >
                เข้าสู่ระบบ
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError('');
                }}
                className={`flex-1 min-h-10 rounded-control text-sm font-medium border transition-colors cursor-pointer ${
                  mode === 'register'
                    ? 'bg-foreground text-surface border-foreground'
                    : 'bg-surface text-muted border-border hover:text-foreground'
                }`}
              >
                สมัครสมาชิก
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'login' ? (
                <Field
                  label="ชื่อผู้ใช้ หรือ อีเมล"
                  type="text"
                  required
                  autoFocus
                  placeholder="เช่น admin หรือ alex@example.com"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                />
              ) : (
                <>
                  <Field
                    label="ชื่อผู้ใช้งาน"
                    type="text"
                    required
                    autoFocus
                    placeholder="เช่น Alex_Music"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                  <Field
                    label="อีเมล"
                    type="email"
                    required
                    placeholder="alex@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </>
              )}

              <Field
                label="รหัสผ่าน"
                type="password"
                required
                minLength={4}
                placeholder="กรอกรหัสผ่าน"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              {error ? (
                <p role="alert" className="text-xs text-red-700 dark:text-red-400">
                  {error}
                </p>
              ) : null}

              <Button type="submit" tone="primary" disabled={submitting} className="w-full">
                {submitting
                  ? 'กำลังดำเนินการ...'
                  : mode === 'login'
                  ? 'เข้าสู่ระบบ'
                  : 'สร้างบัญชีและเข้าสู่ระบบ'}
              </Button>
            </form>
          </div>
        )}
      </Surface>
    </div>
  );
}
