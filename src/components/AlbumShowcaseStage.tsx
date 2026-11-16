import { useEffect, useState } from 'react';
import {
  CassetteTape,
  Disc3,
  Heart,
  Image as ImageIcon,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Play,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import type { Track } from '../types/music';
import { formatTime } from '../utils/audioMetadata';
import { Button, TrackCover } from './ui';
import { VisualizerCanvas } from './VisualizerCanvas';

export type ShowcaseVisualMode = 'cover' | 'turntable' | 'cassette';

const SHOWCASE_MODE_STORAGE_KEY = 'aura_showcase_visual_mode_v1';

interface AlbumShowcaseStageProps {
  track: Track | null;
  hasActiveTrack: boolean;
  isPlaying: boolean;
  isBuffering: boolean;
  isFavorite: boolean;
  currentTime: number;
  duration: number;
  sidebarCollapsed: boolean;
  analyser: AnalyserNode | null;
  isSynthOrCors: boolean;
  onToggleSidebar: () => void;
  onClose: () => void;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onToggleFavorite: (trackId: string) => void;
}

export function AlbumShowcaseStage({
  track,
  hasActiveTrack,
  isPlaying,
  isBuffering,
  isFavorite,
  currentTime,
  duration,
  sidebarCollapsed,
  analyser,
  isSynthOrCors,
  onToggleSidebar,
  onClose,
  onTogglePlay,
  onPrev,
  onNext,
  onToggleFavorite,
}: AlbumShowcaseStageProps) {
  const [visualMode, setVisualMode] = useState<ShowcaseVisualMode>(() => {
    try {
      const saved = localStorage.getItem(SHOWCASE_MODE_STORAGE_KEY);
      if (saved === 'cover' || saved === 'turntable' || saved === 'cassette') {
        return saved;
      }
    } catch {
      // ignore
    }
    return 'cover';
  });

  useEffect(() => {
    try {
      localStorage.setItem(SHOWCASE_MODE_STORAGE_KEY, visualMode);
    } catch {
      // ignore
    }
  }, [visualMode]);

  const spinning = isPlaying && hasActiveTrack;
  const progressRatio =
    duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0.25;
  const leftTapeRingPct = Math.round(86 - progressRatio * 34);
  const rightTapeRingPct = Math.round(52 + progressRatio * 34);

  const modeOptions: ReadonlyArray<{
    id: ShowcaseVisualMode;
    label: string;
    icon: typeof ImageIcon;
  }> = [
    { id: 'cover', label: 'หน้าปกเต็ม', icon: ImageIcon },
    { id: 'turntable', label: 'เครื่องเล่นแผ่นเสียง', icon: Disc3 },
    { id: 'cassette', label: 'เครื่องเล่นเทปคาสเซ็ท', icon: CassetteTape },
  ];

  return (
    <div className="flex-1 min-h-0 overflow-y-auto relative flex flex-col justify-between px-5 py-5 md:px-10 md:py-7 bg-background">
      {track?.coverDataUrl && (
        <>
          <img
            src={track.coverDataUrl}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover blur-3xl scale-110 opacity-20 dark:opacity-25 pointer-events-none select-none"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-b from-background/75 via-background/55 to-background/90 pointer-events-none"
          />
        </>
      )}

      {/* Showcase Top Bar */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-muted min-w-0">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              spinning ? 'bg-primary animate-pulse' : 'bg-muted/60'
            }`}
          />
          <span className="truncate font-medium">
            {isBuffering
              ? 'กำลังเชื่อมต่อเสียง...'
              : spinning
              ? 'กำลังเล่น'
              : hasActiveTrack
              ? 'หยุดชั่วคราว'
              : 'หน้าปกอัลบั้ม'}
            {track ? ` · ${track.format}` : ''}
            {track?.formatDetail ? ` · ${track.formatDetail}` : ''}
          </span>
        </div>

        {/* Visual Player Mode Selector */}
        <div
          role="group"
          aria-label="เลือกโหมดแสดงสื่อเล่นเพลง"
          className="flex items-center gap-1 p-1 rounded-control border border-border/80 bg-surface/85 backdrop-blur-sm"
        >
          {modeOptions.map((mode) => {
            const Icon = mode.icon;
            const active = visualMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => setVisualMode(mode.id)}
                aria-pressed={active}
                className={`min-h-8 px-2.5 sm:px-3 rounded-control text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-foreground text-surface'
                    : 'text-muted hover:text-foreground hover:bg-foreground/5'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">{mode.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="hidden md:inline-flex min-h-9 px-3 rounded-control border border-border/80 bg-surface/80 backdrop-blur-sm text-xs font-medium text-foreground hover:bg-surface items-center gap-1.5 cursor-pointer"
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="w-3.5 h-3.5" />
            ) : (
              <PanelLeftClose className="w-3.5 h-3.5" />
            )}
            <span>{sidebarCollapsed ? 'แสดงแถบข้าง' : 'ย่อปิดแถบข้าง'}</span>
          </button>
          <Button
            tone="quiet"
            onClick={onClose}
            className="min-h-9 px-3 text-xs bg-surface/85 backdrop-blur-sm"
          >
            <Minimize2 className="w-3.5 h-3.5" />
            <span>กลับรายการเพลง</span>
          </Button>
        </div>
      </div>

      {/* Centerpiece Visual Media & Metadata */}
      <div className="relative z-10 flex-1 flex flex-col lg:flex-row items-center justify-center gap-7 lg:gap-14 max-w-6xl w-full mx-auto py-4">
        {visualMode === 'cover' && (
          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={spinning ? 'หยุดชั่วคราว' : 'เล่นเพลง'}
            title={spinning ? 'คลิกเพื่อหยุดชั่วคราว' : 'คลิกเพื่อเล่นเพลง'}
            className="group relative shrink-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary cursor-pointer"
          >
            <TrackCover
              src={track?.coverDataUrl}
              seed={track?.coverSeed ?? 1}
              title={track?.title || 'Aura Audio'}
              sizeClass="w-[min(78vw,46vh)] h-[min(78vw,46vh)] sm:w-[min(68vw,54vh)] sm:h-[min(68vw,54vh)] lg:w-[min(44vw,64vh)] lg:h-[min(44vw,64vh)] max-w-[580px] max-h-[580px]"
              roundedClass="rounded-2xl shadow-2xl border border-border/50 transition-transform duration-300 group-hover:scale-[1.01]"
            />
          </button>
        )}

        {visualMode === 'turntable' && (
          <div
            role="button"
            tabIndex={0}
            onClick={onTogglePlay}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onTogglePlay();
              }
            }}
            aria-label={spinning ? 'เครื่องเล่นแผ่นเสียงกำลังหมุน — คลิกเพื่อหยุด' : 'เครื่องเล่นแผ่นเสียงหยุดอยู่ — คลิกเพื่อเล่น'}
            title={spinning ? 'คลิกที่แผ่นเสียงเพื่อหยุดชั่วคราว' : 'คลิกที่แผ่นเสียงเพื่อวางหัวเข็มและเล่นเพลง'}
            className="relative shrink-0 w-[min(86vw,48vh)] h-[min(86vw,48vh)] sm:w-[min(72vw,56vh)] sm:h-[min(72vw,56vh)] lg:w-[min(45vw,62vh)] lg:h-[min(45vw,62vh)] max-w-[580px] max-h-[580px] rounded-3xl bg-gradient-to-br from-surface via-surface to-background border border-border/90 shadow-2xl p-4 sm:p-6 flex items-center justify-center select-none cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
          >
            {/* Corner Plinth Details & Power LED */}
            <div className="absolute top-3.5 left-4 flex items-center gap-2 z-20">
              <span
                className={`w-2.5 h-2.5 rounded-full transition-colors duration-300 ${
                  spinning
                    ? 'bg-primary shadow-[0_0_10px_var(--color-primary)]'
                    : 'bg-muted/40'
                }`}
              />
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted">
                33⅓ RPM · Direct Drive
              </span>
            </div>

            <div className="absolute bottom-3.5 left-4 flex items-center gap-2 z-20">
              <span className="px-2 py-0.5 rounded-control border border-border/70 bg-background/80 text-[10px] font-mono text-muted">
                {spinning ? 'SPINNING' : 'STANDBY'}
              </span>
            </div>

            {/* Strobe Pitch Dot Ring & Aluminum Platter */}
            <div className="relative w-[88%] h-[88%] rounded-full bg-gradient-to-b from-zinc-300 to-zinc-500 dark:from-zinc-700 dark:to-zinc-900 p-[2.4%] shadow-inner flex items-center justify-center">
              {/* Strobe Ring Dots */}
              <div
                aria-hidden="true"
                className="absolute inset-1 rounded-full border-[3px] border-dotted border-zinc-700/45 dark:border-zinc-300/30 pointer-events-none"
              />

              {/* Spinning Vinyl Record with Album Art Media */}
              <div
                className={`relative w-full h-full rounded-full bg-zinc-950 shadow-xl flex items-center justify-center overflow-hidden animate-vinyl ${
                  spinning ? '' : 'paused-vinyl'
                }`}
              >
                {/* Micro-groove concentric texture */}
                <div
                  aria-hidden="true"
                  className="absolute inset-[2%] rounded-full pointer-events-none"
                  style={{
                    background:
                      'repeating-radial-gradient(circle at center, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 1px, transparent 1px, transparent 5px)',
                  }}
                />
                {/* Specular vinyl sheen */}
                <div
                  aria-hidden="true"
                  className="absolute inset-0 rounded-full pointer-events-none opacity-35"
                  style={{
                    background:
                      'conic-gradient(from 35deg, transparent 0deg, rgba(255,255,255,0.22) 38deg, transparent 78deg, transparent 180deg, rgba(255,255,255,0.18) 218deg, transparent 262deg)',
                  }}
                />

                {/* Album Cover Printed as Picture-Disc Media */}
                <div className="relative w-[58%] h-[58%] rounded-full overflow-hidden ring-4 ring-zinc-900/90 shadow-lg flex items-center justify-center">
                  <TrackCover
                    src={track?.coverDataUrl}
                    seed={track?.coverSeed ?? 1}
                    title={track?.title || 'Aura Vinyl'}
                    sizeClass="w-full h-full"
                    roundedClass="rounded-full"
                  />
                  {/* Inner record ring detail */}
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full ring-1 ring-inset ring-white/25 pointer-events-none"
                  />
                </div>

                {/* Metallic Spindle Cap */}
                <div
                  aria-hidden="true"
                  className="absolute w-[7%] h-[7%] rounded-full bg-gradient-to-br from-zinc-100 to-zinc-400 border border-zinc-600 shadow-md z-10 flex items-center justify-center"
                >
                  <span className="w-[38%] h-[38%] rounded-full bg-zinc-800" />
                </div>
              </div>
            </div>

            {/* Animated Articulated Tonearm */}
            <div
              aria-hidden="true"
              className="absolute top-[6%] right-[5%] w-[24%] h-[68%] pointer-events-none z-20"
            >
              {/* Gimbal Pivot Base */}
              <div className="absolute top-2 right-2 w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-b from-zinc-200 to-zinc-400 dark:from-zinc-600 dark:to-zinc-800 border border-zinc-500/60 shadow-lg flex items-center justify-center">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-zinc-800 dark:bg-zinc-950 border border-zinc-400/50" />
              </div>

              {/* Rotating Arm Assembly */}
              <div
                className={`absolute top-6 right-7 sm:top-7 sm:right-8 origin-top transition-transform duration-700 ease-in-out ${
                  spinning ? 'rotate-[25deg]' : 'rotate-[-2deg]'
                }`}
                style={{ width: '16px', height: '78%' }}
              >
                {/* Counterweight */}
                <div className="w-6 h-5 -ml-1.5 -mt-6 rounded-sm bg-gradient-to-r from-zinc-400 via-zinc-200 to-zinc-500 dark:from-zinc-500 dark:via-zinc-300 dark:to-zinc-600 border border-zinc-600 shadow" />
                {/* Arm Wand */}
                <div className="w-2 h-[82%] mx-auto rounded-full bg-gradient-to-r from-zinc-300 via-zinc-100 to-zinc-400 dark:from-zinc-400 dark:via-zinc-200 dark:to-zinc-500 shadow-md" />
                {/* Headshell & Cartridge */}
                <div className="w-5 h-8 -ml-1.5 -mt-1 rotate-[18deg] rounded-sm bg-zinc-900 border border-zinc-600 shadow-lg flex flex-col items-center justify-end p-0.5">
                  <span className="w-3 h-2.5 rounded-[2px] bg-primary" />
                </div>
              </div>
            </div>
          </div>
        )}

        {visualMode === 'cassette' && (
          <div
            role="button"
            tabIndex={0}
            onClick={onTogglePlay}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onTogglePlay();
              }
            }}
            aria-label={spinning ? 'เครื่องเล่นเทปกำลังหมุน — คลิกเพื่อหยุด' : 'เครื่องเล่นเทปหยุดอยู่ — คลิกเพื่อเล่น'}
            title={spinning ? 'คลิกที่ตลับเทปเพื่อหยุดชั่วคราว' : 'คลิกที่ตลับเทปเพื่อเล่นเพลง'}
            className="relative shrink-0 w-[min(92vw,66vh)] max-w-[600px] aspect-[1.54/1] rounded-3xl bg-gradient-to-b from-surface to-background border border-border/90 shadow-2xl p-4 sm:p-6 flex flex-col justify-between select-none cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
          >
            {/* Deck Top Bezel */}
            <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-muted px-1">
              <span className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full transition-colors ${
                    spinning
                      ? 'bg-primary shadow-[0_0_8px_var(--color-primary)]'
                      : 'bg-muted/40'
                  }`}
                />
                <span>AURA STEREO CASSETTE DECK</span>
              </span>
              <span>{track ? `${formatTime(currentTime)} / ${duration > 0 ? formatTime(duration) : track.durationLabel}` : 'C-90'}</span>
            </div>

            {/* Cassette Shell with Album Art Media */}
            <div className="relative flex-1 my-2.5 rounded-2xl bg-zinc-900 border-2 border-zinc-700/80 shadow-inner overflow-hidden flex flex-col justify-between p-3 sm:p-4">
              {/* Background Album Cover Artwork Printed on Cassette Label */}
              <div className="absolute inset-0 overflow-hidden">
                {track?.coverDataUrl ? (
                  <img
                    src={track.coverDataUrl}
                    alt={`ปกตลับเทป ${track.title}`}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover opacity-85"
                  />
                ) : (
                  <TrackCover
                    src={undefined}
                    seed={track?.coverSeed ?? 1}
                    title={track?.title || 'Aura Tape'}
                    sizeClass="w-full h-full"
                    roundedClass="rounded-none"
                  />
                )}
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/25 to-black/65"
                />
              </div>

              {/* Corner Cassette Screws */}
              <span aria-hidden="true" className="absolute top-2 left-2 w-2.5 h-2.5 rounded-full bg-zinc-300/70 border border-zinc-700 z-20" />
              <span aria-hidden="true" className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-zinc-300/70 border border-zinc-700 z-20" />
              <span aria-hidden="true" className="absolute bottom-2 left-2 w-2.5 h-2.5 rounded-full bg-zinc-300/70 border border-zinc-700 z-20" />
              <span aria-hidden="true" className="absolute bottom-2 right-2 w-2.5 h-2.5 rounded-full bg-zinc-300/70 border border-zinc-700 z-20" />

              {/* Top Printed Label Strip */}
              <div className="relative z-10 mx-4 sm:mx-6 px-3 py-1.5 rounded-md bg-white/90 dark:bg-zinc-950/85 backdrop-blur-sm border border-black/15 dark:border-white/15 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="px-1.5 py-0.5 rounded bg-foreground text-surface text-[10px] font-mono font-bold shrink-0">
                    A
                  </span>
                  <span className="text-xs sm:text-sm font-semibold text-foreground truncate">
                    {track ? track.title : 'Aura Studio Cassette'}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-muted shrink-0">
                  {track?.format || 'HI-RES'} · C-90
                </span>
              </div>

              {/* Center Translucent Tape Window with Animated Spinning Reels */}
              <div className="relative z-10 mx-auto w-[84%] h-[46%] rounded-xl bg-zinc-950/88 border-2 border-zinc-700/90 shadow-inner flex items-center justify-between px-4 sm:px-7 overflow-hidden">
                {/* Visible Magnetic Tape Bridge across window */}
                <div
                  aria-hidden="true"
                  className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-zinc-700/60"
                />

                {/* Left Supply Reel */}
                <div className="relative w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center">
                  {/* Dynamic Magnetic Tape Spool Size */}
                  <div
                    className="rounded-full bg-gradient-to-br from-amber-950 via-zinc-900 to-black border border-amber-700/35 transition-all duration-500 flex items-center justify-center"
                    style={{ width: `${leftTapeRingPct}%`, height: `${leftTapeRingPct}%` }}
                  >
                    <div
                      className={`w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-zinc-100 border-2 border-zinc-400 shadow flex items-center justify-center relative animate-tape-reel ${
                        spinning ? '' : 'paused-vinyl'
                      }`}
                    >
                      <span className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-zinc-900 border border-zinc-500" />
                      <span className="absolute top-0.5 w-1 h-2 bg-zinc-700 rounded-full" />
                      <span className="absolute bottom-0.5 w-1 h-2 bg-zinc-700 rounded-full" />
                      <span className="absolute left-0.5 w-2 h-1 bg-zinc-700 rounded-full" />
                      <span className="absolute right-0.5 w-2 h-1 bg-zinc-700 rounded-full" />
                    </div>
                  </div>
                </div>

                {/* Center Tape Window Scale */}
                <div className="hidden sm:flex flex-col items-center justify-center gap-1 text-[9px] font-mono text-zinc-400">
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-3 bg-zinc-700 rounded-xs" />
                    <span className="w-1.5 h-4 bg-zinc-600 rounded-xs" />
                    <span className="w-1.5 h-3 bg-zinc-700 rounded-xs" />
                  </div>
                  <span>{spinning ? '▶ PLAY' : '❚❚ PAUSE'}</span>
                </div>

                {/* Right Take-up Reel */}
                <div className="relative w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center">
                  <div
                    className="rounded-full bg-gradient-to-br from-amber-950 via-zinc-900 to-black border border-amber-700/35 transition-all duration-500 flex items-center justify-center"
                    style={{ width: `${rightTapeRingPct}%`, height: `${rightTapeRingPct}%` }}
                  >
                    <div
                      className={`w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-zinc-100 border-2 border-zinc-400 shadow flex items-center justify-center relative animate-tape-reel ${
                        spinning ? '' : 'paused-vinyl'
                      }`}
                    >
                      <span className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-zinc-900 border border-zinc-500" />
                      <span className="absolute top-0.5 w-1 h-2 bg-zinc-700 rounded-full" />
                      <span className="absolute bottom-0.5 w-1 h-2 bg-zinc-700 rounded-full" />
                      <span className="absolute left-0.5 w-2 h-1 bg-zinc-700 rounded-full" />
                      <span className="absolute right-0.5 w-2 h-1 bg-zinc-700 rounded-full" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Cassette Trapezoid Head Bay */}
              <div className="relative z-10 mx-auto w-[62%] h-6 sm:h-7 rounded-t-lg bg-zinc-950/90 border-t-2 border-x-2 border-zinc-700 flex items-center justify-around px-4">
                <span className="w-2 h-2 rounded-full bg-zinc-500" />
                <span className="w-10 h-1.5 rounded-full bg-amber-800/80" />
                <span className="w-2 h-2 rounded-full bg-zinc-500" />
              </div>
            </div>

            {/* Deck Bottom Transport Status */}
            <div className="flex items-center justify-between text-[10px] font-mono text-muted px-1">
              <span className="truncate max-w-[65%]">
                {track ? `${track.artist}${track.album ? ` — ${track.album}` : ''}` : 'READY'}
              </span>
              <span>DOLBY · METAL BIAS</span>
            </div>
          </div>
        )}

        {/* Track Details & Controls */}
        <div className="w-full max-w-lg min-w-0 flex flex-col items-center lg:items-start text-center lg:text-left space-y-4">
          <div className="w-full min-w-0 space-y-1.5">
            <h2
              className="text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight leading-tight break-words"
              title={track?.title}
            >
              {track ? track.title : 'ยังไม่ได้เลือกเพลง'}
            </h2>
            <p
              className="text-base sm:text-xl text-foreground/80 font-medium truncate"
              title={track?.artist}
            >
              {track
                ? track.artist
                : 'เพิ่มเพลงหรือเลือกจากคลังเพื่อแสดงหน้าปกอัลบั้ม'}
            </p>
            {(track?.album || track?.genre || track?.folderName) && (
              <p className="text-xs sm:text-sm text-muted truncate">
                {[track.album, track.genre, track.folderName].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>

          <div className="w-full max-w-md pt-1">
            <VisualizerCanvas
              analyser={analyser}
              isPlaying={isPlaying}
              isSynthOrCors={isSynthOrCors}
            />
          </div>

          <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2.5 pt-1">
            <button
              type="button"
              onClick={onPrev}
              aria-label="เพลงก่อนหน้า"
              className="w-11 h-11 rounded-full border border-border/80 bg-surface/85 hover:bg-surface flex items-center justify-center text-foreground cursor-pointer transition-colors"
            >
              <SkipBack className="w-4 h-4 fill-current" />
            </button>

            <button
              type="button"
              onClick={onTogglePlay}
              aria-label={spinning ? 'หยุดชั่วคราว' : 'เล่นเพลง'}
              className="h-12 px-6 rounded-full bg-foreground text-surface flex items-center justify-center gap-2 font-medium text-sm hover:brightness-95 active:scale-95 transition-all cursor-pointer"
            >
              {spinning ? (
                <>
                  <Pause className="w-4 h-4 fill-current" />
                  <span>หยุดชั่วคราว</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>เล่นเพลง</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onNext}
              aria-label="เพลงถัดไป"
              className="w-11 h-11 rounded-full border border-border/80 bg-surface/85 hover:bg-surface flex items-center justify-center text-foreground cursor-pointer transition-colors"
            >
              <SkipForward className="w-4 h-4 fill-current" />
            </button>

            {track && (
              <button
                type="button"
                onClick={() => onToggleFavorite(track.id)}
                aria-label={isFavorite ? 'นำออกจากเพลงที่ถูกใจ' : 'เพิ่มเป็นเพลงที่ถูกใจ'}
                className={`w-11 h-11 rounded-full border border-border/80 bg-surface/85 hover:bg-surface flex items-center justify-center transition-colors cursor-pointer ${
                  isFavorite ? 'text-primary' : 'text-muted hover:text-foreground'
                }`}
              >
                <Heart className={`w-4 h-4 ${isFavorite ? 'fill-current' : ''}`} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="relative z-10 text-center text-[11px] text-muted">
        สลับรูปแบบการเล่น (หน้าปก · แผ่นเสียง · เทปคาสเซ็ท) ได้ตลอดระหว่างฟัง · กด{' '}
        <span className="font-mono">Esc</span> เพื่อกลับหน้ารายการเพลง
      </div>
    </div>
  );
}
