import { useEffect, useState, type FormEvent } from 'react';
import { Save, X } from 'lucide-react';
import type { Track } from '../types/music';
import { Button, Field, Surface } from './ui';

interface AdminTrackModalProps {
  track: Track | null;
  onClose: () => void;
  onSave: (
    id: string,
    payload: {
      title: string;
      artist: string;
      album: string;
      genre: string;
      folderName: string;
      format: string;
    }
  ) => Promise<void>;
}

export function AdminTrackModal({ track, onClose, onSave }: AdminTrackModalProps) {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [genre, setGenre] = useState('');
  const [folderName, setFolderName] = useState('');
  const [format, setFormat] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!track) return;
    setTitle(track.title);
    setArtist(track.artist);
    setAlbum(track.album || '');
    setGenre(track.genre || '');
    setFolderName(track.folderName || track.syncedFolder || '');
    setFormat(track.format);
    setError('');

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [track, onClose]);

  if (!track) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('กรุณากรอกชื่อเพลง');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave(track.id, {
        title: title.trim(),
        artist: artist.trim() || 'Shared Online Stream',
        album: album.trim(),
        genre: genre.trim(),
        folderName: folderName.trim(),
        format: format.trim().toUpperCase() || track.format,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกข้อมูลไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-edit-track-heading"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Surface className="max-w-md w-full border border-border p-6 max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-border/60">
          <h2 id="admin-edit-track-heading" className="text-base font-semibold">
            แก้ไขข้อมูลเพลงออนไลน์ (Admin)
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่างแก้ไขเพลง"
            className="w-9 h-9 rounded-control flex items-center justify-center text-muted hover:text-foreground hover:bg-foreground/5 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="pt-5 space-y-3.5">
          <Field
            label="ชื่อเพลง"
            type="text"
            required
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Field
            label="ศิลปิน"
            type="text"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field
              label="แนวเพลง (Genre)"
              type="text"
              placeholder="เช่น Pop, Jazz, Lo-Fi"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
            />
            <Field
              label="โฟลเดอร์"
              type="text"
              placeholder="เช่น Music/Jazz"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
            />
          </div>
          <Field
            label="อัลบั้ม"
            type="text"
            placeholder="ไม่ระบุ"
            value={album}
            onChange={(e) => setAlbum(e.target.value)}
          />
          <Field
            label="รูปแบบเสียง (เช่น MP3, FLAC, WAV)"
            type="text"
            value={format}
            onChange={(e) => setFormat(e.target.value)}
          />

          {error && (
            <p role="alert" className="text-xs text-red-700 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button tone="quiet" onClick={onClose}>
              ยกเลิก
            </Button>
            <Button type="submit" tone="primary" disabled={saving}>
              <Save className="w-4 h-4" />
              <span>{saving ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}</span>
            </Button>
          </div>
        </form>
      </Surface>
    </div>
  );
}
