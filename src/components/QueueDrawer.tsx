import { useEffect } from 'react';
import { Play, Volume2, X } from 'lucide-react';
import type { Track } from '../types/music';
import { Surface, TrackCover } from './ui';

interface QueueDrawerProps {
  open: boolean;
  onClose: () => void;
  queue: Track[];
  currentTrackId: string | null;
  isPlaying: boolean;
  onSelectTrack: (track: Track) => void;
}

export function QueueDrawer({
  open,
  onClose,
  queue,
  currentTrackId,
  isPlaying,
  onSelectTrack,
}: QueueDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 bg-black/35 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="คิวเพลงที่กำลังเล่น"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Surface className="w-full max-w-sm h-full rounded-none border-l border-border flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/60 shrink-0">
          <div>
            <h2 className="text-base font-semibold">คิวเพลงถัดไป</h2>
            <p className="text-xs text-muted tabular-nums">{queue.length} รายการในรายการ</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดคิวเพลง"
            className="w-9 h-9 rounded-control flex items-center justify-center text-muted hover:text-foreground hover:bg-foreground/5 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-border/50">
          {queue.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted">ยังไม่มีเพลงในคิว</div>
          ) : (
            queue.map((track, idx) => {
              const isCurrent = track.id === currentTrackId;
              return (
                <button
                  key={track.id}
                  type="button"
                  onClick={() => onSelectTrack(track)}
                  className={`w-full px-5 py-3 flex items-center gap-3 text-left transition-colors hover:bg-foreground/4 cursor-pointer ${
                    isCurrent ? 'bg-foreground/6' : ''
                  }`}
                >
                  <span className="w-5 text-center text-xs font-mono tabular-nums text-muted shrink-0">
                    {isCurrent && isPlaying ? (
                      <Volume2 className="w-3.5 h-3.5 text-primary mx-auto" />
                    ) : (
                      idx + 1
                    )}
                  </span>
                  <TrackCover
                    src={track.coverDataUrl}
                    seed={track.coverSeed}
                    title={track.title}
                    sizeClass="w-9 h-9"
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-medium truncate ${
                        isCurrent ? 'text-primary' : 'text-foreground'
                      }`}
                      title={track.title}
                    >
                      {track.title}
                    </p>
                    <p className="text-xs text-muted truncate" title={track.artist}>
                      {track.artist} · {track.format}
                    </p>
                  </div>
                  {!isCurrent && <Play className="w-3.5 h-3.5 text-muted shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      </Surface>
    </div>
  );
}
