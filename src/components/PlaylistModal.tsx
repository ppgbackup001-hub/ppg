import { useEffect, useState, type FormEvent } from 'react';
import { ListPlus, X } from 'lucide-react';
import { Button, Field, Surface } from './ui';

interface PlaylistModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
}

export function PlaylistModal({ open, onClose, onCreate }: PlaylistModalProps) {
  const [name, setName] = useState('');

  useEffect(() => {
    if (!open) return;
    setName('');
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(trimmed);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="playlist-modal-heading"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Surface className="max-w-sm w-full border border-border p-6">
        <div className="flex items-center justify-between pb-4 border-b border-border/60">
          <h2 id="playlist-modal-heading" className="text-base font-semibold">
            สร้างเพลย์ลิสต์ใหม่
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่างสร้างเพลย์ลิสต์"
            className="w-9 h-9 rounded-control flex items-center justify-center text-muted hover:text-foreground hover:bg-foreground/5 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="pt-5 space-y-4">
          <Field
            label="ชื่อเพลย์ลิสต์"
            type="text"
            required
            autoFocus
            placeholder="เช่น เพลงโฟกัสตอนดึก"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" tone="primary" className="w-full">
            <ListPlus className="w-4 h-4" />
            <span>สร้างเพลย์ลิสต์</span>
          </Button>
        </form>
      </Surface>
    </div>
  );
}
