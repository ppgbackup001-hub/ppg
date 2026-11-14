import { useEffect } from 'react';
import { RotateCcw, X } from 'lucide-react';
import type { EqBands, EqPresetKey } from '../types/music';
import { EQ_PRESETS } from '../utils/storage';
import { Surface } from './ui';

interface EqualizerPopoverProps {
  open: boolean;
  onClose: () => void;
  preset: EqPresetKey;
  bands: EqBands;
  playbackRate: number;
  onSelectPreset: (preset: EqPresetKey) => void;
  onChangeBand: (index: number, value: number) => void;
  onChangePlaybackRate: (rate: number) => void;
}

const BAND_LABELS = ['60Hz', '230Hz', '910Hz', '3.6kHz', '14kHz'];
const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5];

export function EqualizerPopover({
  open,
  onClose,
  preset,
  bands,
  playbackRate,
  onSelectPreset,
  onChangeBand,
  onChangePlaybackRate,
}: EqualizerPopoverProps) {
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
      className="fixed bottom-24 right-4 sm:right-8 z-40 w-[min(22rem,calc(100vw-2rem))]"
      role="dialog"
      aria-label="อีควอไลเซอร์และจังหวะการเล่น"
    >
      <Surface className="border border-border p-4 shadow-lg">
        <div className="flex items-center justify-between pb-3 border-b border-border/60">
          <span className="text-sm font-semibold">อีควอไลเซอร์ &amp; ความเร็ว</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onSelectPreset('flat')}
              title="รีเซ็ตค่าเป็น Flat"
              aria-label="รีเซ็ตอีควอไลเซอร์"
              className="w-8 h-8 rounded-control flex items-center justify-center text-muted hover:text-foreground hover:bg-foreground/5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="ปิดอีควอไลเซอร์"
              className="w-8 h-8 rounded-control flex items-center justify-center text-muted hover:text-foreground hover:bg-foreground/5 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="pt-3 flex flex-wrap gap-1.5">
          {(['flat', 'warm', 'bass', 'vocal', 'latenight'] as EqPresetKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onSelectPreset(key)}
              className={`px-2.5 py-1 rounded-control text-xs font-medium border transition-colors whitespace-nowrap cursor-pointer ${
                preset === key
                  ? 'bg-foreground text-surface border-foreground'
                  : 'bg-surface text-muted border-border hover:text-foreground'
              }`}
            >
              {EQ_PRESETS[key].label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-5 gap-2 pt-4 pb-3 border-b border-border/60">
          {bands.map((db, idx) => (
            <div key={BAND_LABELS[idx]} className="flex flex-col items-center gap-2">
              <span className="text-[11px] font-mono tabular-nums text-muted">
                {db > 0 ? `+${db}` : db}
              </span>
              <div className="h-24 flex items-center justify-center">
                <input
                  type="range"
                  min={-12}
                  max={12}
                  step={1}
                  value={db}
                  aria-label={`ย่านความถี่ ${BAND_LABELS[idx]}`}
                  onChange={(e) => onChangeBand(idx, Number(e.target.value))}
                  className="aura-range w-20 -rotate-90 origin-center"
                />
              </div>
              <span className="text-[11px] font-mono text-muted">{BAND_LABELS[idx]}</span>
            </div>
          ))}
        </div>

        <div className="pt-3 flex items-center justify-between gap-2">
          <span className="text-xs text-muted">ความเร็วการเล่น</span>
          <div className="flex items-center gap-1">
            {SPEED_OPTIONS.map((rate) => (
              <button
                key={rate}
                type="button"
                onClick={() => onChangePlaybackRate(rate)}
                className={`px-2.5 py-1 rounded-control text-xs font-mono tabular-nums border cursor-pointer ${
                  playbackRate === rate
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-surface text-muted border-border hover:text-foreground'
                }`}
              >
                {rate}x
              </button>
            ))}
          </div>
        </div>
      </Surface>
    </div>
  );
}
