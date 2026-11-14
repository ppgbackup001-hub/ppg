import { useEffect, useState, type FormEvent } from 'react';
import {
  Cast,
  Check,
  Copy,
  Laptop,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Smartphone,
  Speaker,
  Square,
  Tablet,
  Tv,
  X,
} from 'lucide-react';
import type { CastDeviceType, ConnectedCastDevice, Track } from '../types/music';
import type { LocalDeviceIdentity } from '../utils/api';
import { Button, Field, Surface } from './ui';

export interface AudioOutputDeviceOption {
  deviceId: string;
  label: string;
}

interface CastModalProps {
  open: boolean;
  onClose: () => void;
  myDevice: LocalDeviceIdentity;
  onRenameMyDevice: (newName: string) => Promise<void>;
  connectedDevices: ConnectedCastDevice[];
  activeCastTarget: ConnectedCastDevice | null;
  currentTrack: Track | null;
  isPlaying: boolean;
  castingBusyId: string | null;
  nativeCastState: 'disconnected' | 'connecting' | 'connected';
  nativeCastSupported: boolean;
  audioOutputs: AudioOutputDeviceOption[];
  selectedSinkId: string;
  canSelectAudioOutput: boolean;
  onCastToDevice: (device: ConnectedCastDevice) => Promise<void>;
  onRemoteAction: (action: 'pause' | 'resume' | 'stop') => Promise<void>;
  onTriggerNativeCast: () => Promise<void>;
  onSelectAudioOutputPrompt: () => Promise<void>;
  onSelectSinkId: (sinkId: string) => Promise<void>;
  onRefreshOutputs: () => Promise<void>;
}

function DeviceTypeIcon({ type }: { type: CastDeviceType }) {
  if (type === 'mobile') return <Smartphone className="w-4 h-4" />;
  if (type === 'tablet') return <Tablet className="w-4 h-4" />;
  if (type === 'tv') return <Tv className="w-4 h-4" />;
  return <Laptop className="w-4 h-4" />;
}

export function CastModal({
  open,
  onClose,
  myDevice,
  onRenameMyDevice,
  connectedDevices,
  activeCastTarget,
  currentTrack,
  isPlaying,
  castingBusyId,
  nativeCastState,
  nativeCastSupported,
  audioOutputs,
  selectedSinkId,
  canSelectAudioOutput,
  onCastToDevice,
  onRemoteAction,
  onTriggerNativeCast,
  onSelectAudioOutputPrompt,
  onSelectSinkId,
  onRefreshOutputs,
}: CastModalProps) {
  const [deviceNameInput, setDeviceNameInput] = useState(myDevice.deviceName);
  const [savingName, setSavingName] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [localMessage, setLocalMessage] = useState('');
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (!open) return;
    setDeviceNameInput(myDevice.deviceName);
    setLocalMessage('');
    setLocalError('');
    setCopiedLink(false);
    void onRefreshOutputs();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [myDevice.deviceName, onClose, onRefreshOutputs, open]);

  if (!open) return null;

  const otherDevices = connectedDevices.filter((d) => d.deviceId !== myDevice.deviceId);

  const handleSaveName = async (e: FormEvent) => {
    e.preventDefault();
    if (!deviceNameInput.trim()) return;
    setSavingName(true);
    setLocalError('');
    try {
      await onRenameMyDevice(deviceNameInput.trim());
      setLocalMessage('อัปเดตชื่ออุปกรณ์นี้แล้ว');
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'เปลี่ยนชื่ออุปกรณ์ไม่สำเร็จ');
    } finally {
      setSavingName(false);
    }
  };

  const handleCopyAppLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopiedLink(true);
      setLocalMessage('คัดลอกลิงก์แล้ว — นำไปเปิดบนมือถือ ทีวี หรือเครื่องอื่นเพื่อรับสัญญาณแคสต์');
      window.setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      setLocalMessage(`เปิดลิงก์นี้บนเครื่องอื่น: ${window.location.origin}`);
    }
  };

  const handleCastClick = async (device: ConnectedCastDevice) => {
    setLocalError('');
    setLocalMessage('');
    try {
      await onCastToDevice(device);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'ไม่สามารถแคสต์ไปยังอุปกรณ์นี้ได้');
    }
  };

  const handleNativeCast = async () => {
    setLocalError('');
    setLocalMessage('');
    try {
      await onTriggerNativeCast();
    } catch (err) {
      setLocalError(
        err instanceof Error
          ? err.message
          : 'เบราว์เซอร์หรือสภาพแวดล้อมนี้ไม่รองรับหน้าต่างเลือก Cast โดยตรง — สามารถเปิด Aura Audio บนอุปกรณ์ปลายทางแล้วแคสต์ผ่านรายการด้านบนได้ทันที'
      );
    }
  };

  const handleOutputPrompt = async () => {
    setLocalError('');
    setLocalMessage('');
    try {
      await onSelectAudioOutputPrompt();
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'ไม่สามารถเปิดหน้าต่างเลือกลำโพงจากเบราว์เซอร์นี้ได้'
      );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cast-modal-heading"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Surface className="max-w-lg w-full border border-border p-6 max-h-[90dvh] overflow-y-auto space-y-5">
        <div className="flex items-center justify-between pb-4 border-b border-border/60">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-control bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Cast className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 id="cast-modal-heading" className="text-base font-semibold truncate">
                แคสต์ไปยังอุปกรณ์ใกล้เคียง
              </h2>
              <p className="text-xs text-muted truncate">
                {currentTrack
                  ? `แทร็กพร้อมส่ง: ${currentTrack.title}`
                  : 'เลือกเพลงที่ต้องการ แล้วส่งไปเล่นบนอุปกรณ์อื่นหรือลำโพงไร้สาย'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่างแคสต์อุปกรณ์"
            className="w-9 h-9 rounded-control flex items-center justify-center text-muted hover:text-foreground hover:bg-foreground/5 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Active Remote Cast Controls */}
        {activeCastTarget && (
          <Surface inset className="p-3.5 flex items-center justify-between gap-3 border border-primary/40">
            <div className="min-w-0">
              <p className="text-xs font-medium text-primary flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">กำลังแคสต์ไปที่ {activeCastTarget.deviceName}</span>
              </p>
              <p className="text-xs text-muted truncate mt-0.5">
                {currentTrack ? `${currentTrack.title} · ${currentTrack.artist}` : 'เชื่อมต่ออยู่'}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                tone="quiet"
                onClick={() => void onRemoteAction(isPlaying ? 'pause' : 'resume')}
                className="min-h-9 px-3 text-xs"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{isPlaying ? 'พัก' : 'เล่นต่อ'}</span>
              </Button>
              <Button
                tone="danger"
                onClick={() => void onRemoteAction('stop')}
                className="min-h-9 px-3 text-xs"
              >
                <Square className="w-3 h-3 fill-current" />
                <span>หยุดแคสต์</span>
              </Button>
            </div>
          </Surface>
        )}

        {/* Section 1: Connected Aura Audio Devices */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
              อุปกรณ์ Aura Audio ที่ออนไลน์อยู่ ({otherDevices.length})
            </h3>
            <button
              type="button"
              onClick={handleCopyAppLink}
              className="text-xs text-primary hover:underline inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedLink ? 'คัดลอกลิงก์แล้ว' : 'คัดลอกลิงก์เปิดบนเครื่องอื่น'}</span>
            </button>
          </div>

          {otherDevices.length > 0 ? (
            <div className="divide-y divide-border/60 border border-border/75 rounded-control overflow-hidden bg-background/50">
              {otherDevices.map((device) => {
                const isTarget = activeCastTarget?.deviceId === device.deviceId;
                const isBusy = castingBusyId === device.deviceId;
                return (
                  <div
                    key={device.deviceId}
                    className="p-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-control border flex items-center justify-center shrink-0 ${
                          isTarget
                            ? 'border-primary text-primary bg-primary/10'
                            : 'border-border/70 text-muted bg-surface'
                        }`}
                      >
                        <DeviceTypeIcon type={device.deviceType} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{device.deviceName}</p>
                        <p className="text-xs text-muted truncate">
                          {isTarget
                            ? 'กำลังรับสัญญาณแคสต์จากเครื่องนี้'
                            : device.currentTrackTitle
                            ? `${device.isPlaying ? 'กำลังเล่น' : 'หยุดไว้'}: ${device.currentTrackTitle}`
                            : 'ออนไลน์ · พร้อมรับแคสต์'}
                        </p>
                      </div>
                    </div>

                    {isTarget ? (
                      <Button
                        tone="danger"
                        onClick={() => void onRemoteAction('stop')}
                        className="min-h-9 px-3 text-xs shrink-0"
                      >
                        หยุดแคสต์
                      </Button>
                    ) : (
                      <Button
                        tone="primary"
                        disabled={isBusy}
                        onClick={() => void handleCastClick(device)}
                        className="min-h-9 px-3 text-xs shrink-0"
                      >
                        <Cast className="w-3.5 h-3.5" />
                        <span>{isBusy ? 'กำลังส่ง...' : 'แคสต์ไปเครื่องนี้'}</span>
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <Surface inset className="p-4 text-xs text-muted leading-relaxed">
              ยังไม่พบอุปกรณ์ Aura Audio เครื่องอื่นที่เปิดอยู่ — กด{' '}
              <strong className="text-foreground">“คัดลอกลิงก์เปิดบนเครื่องอื่น”</strong>{' '}
              เพื่อเปิดหน้าเว็บนี้บนมือถือ แท็บเล็ต Smart TV หรือคอมพิวเตอร์อีกเครื่อง
              แล้วอุปกรณ์นั้นจะปรากฏในรายการให้อัตโนมัติ
            </Surface>
          )}
        </div>

        {/* Section 2: Native Wireless Cast (Chromecast / AirPlay) & Audio Outputs (Bluetooth / HDMI) */}
        <div className="pt-4 border-t border-border/60 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
              Chromecast / AirPlay และลำโพงไร้สาย
            </h3>
            <span className="text-[11px] text-muted">
              {nativeCastState === 'connected'
                ? 'เชื่อมต่ออุปกรณ์ Cast แล้ว'
                : nativeCastState === 'connecting'
                ? 'กำลังเชื่อมต่อ...'
                : nativeCastSupported
                ? 'พร้อมค้นหาผ่านเบราว์เซอร์'
                : 'ขึ้นอยู่กับการรองรับของเบราว์เซอร์'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <Button tone="quiet" onClick={() => void handleNativeCast()} className="min-h-10 text-xs">
              <Tv className="w-4 h-4 shrink-0" />
              <span>ค้นหา Chromecast / AirPlay</span>
            </Button>

            {canSelectAudioOutput ? (
              <Button tone="quiet" onClick={() => void handleOutputPrompt()} className="min-h-10 text-xs">
                <Speaker className="w-4 h-4 shrink-0" />
                <span>เลือกลำโพง / Bluetooth</span>
              </Button>
            ) : (
              <Button
                tone="quiet"
                onClick={() => void onRefreshOutputs()}
                className="min-h-10 text-xs"
              >
                <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                <span>สแกนอุปกรณ์เสียงออก</span>
              </Button>
            )}
          </div>

          {audioOutputs.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <p className="text-[11px] font-medium text-muted">
                ช่องทางเสียงออกที่ตรวจพบบนเครื่องนี้:
              </p>
              <div className="divide-y divide-border/50 border border-border/70 rounded-control overflow-hidden">
                {audioOutputs.map((out) => {
                  const active =
                    selectedSinkId === out.deviceId ||
                    (!selectedSinkId && out.deviceId === 'default');
                  return (
                    <button
                      key={out.deviceId}
                      type="button"
                      onClick={() => void onSelectSinkId(out.deviceId)}
                      className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                        active
                          ? 'bg-foreground/5 text-foreground font-medium'
                          : 'text-muted hover:text-foreground hover:bg-foreground/3'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <Speaker className="w-3.5 h-3.5 shrink-0 text-primary" />
                        <span className="truncate">{out.label}</span>
                      </span>
                      {active && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Section 3: Rename This Device */}
        <form onSubmit={handleSaveName} className="pt-4 border-t border-border/60">
          <div className="flex items-end gap-2">
            <div className="flex-1 min-w-0">
              <Field
                label="ชื่ออุปกรณ์นี้ (แสดงให้เครื่องใกล้เคียงเห็น)"
                type="text"
                value={deviceNameInput}
                onChange={(e) => setDeviceNameInput(e.target.value)}
                placeholder="เช่น คอมห้องนั่งเล่น, มือถือ"
              />
            </div>
            <Button type="submit" tone="ink" disabled={savingName} className="min-h-11 px-4 text-xs shrink-0">
              <span>{savingName ? 'บันทึก...' : 'ตั้งชื่อ'}</span>
            </Button>
          </div>
        </form>

        {(localError || localMessage) && (
          <p
            role={localError ? 'alert' : 'status'}
            className={`text-xs leading-relaxed ${
              localError ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'
            }`}
          >
            {localError || localMessage}
          </p>
        )}
      </Surface>
    </div>
  );
}
