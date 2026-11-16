import type { LanSignalPayload } from '../types/music';
import { sendLanSignal, type LocalDeviceIdentity } from './api';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

const CHUNK_SIZE = 48 * 1024;
const MAX_BUFFERED_AMOUNT = 1024 * 1024;
const LOW_WATER_MARK = 256 * 1024;

interface PendingTransfer {
  mimeType: string;
  totalBytes: number;
  receivedBytes: number;
  chunks: ArrayBuffer[];
  onProgress?: (received: number, total: number) => void;
  resolve: (blob: Blob) => void;
  reject: (err: Error) => void;
  resetTimeout: () => void;
  cleanup: () => void;
}

interface PendingCoverRequest {
  resolve: (dataUrl: string | null) => void;
  timer: number;
  parts?: string[];
  receivedCount?: number;
}

interface PeerRecord {
  deviceId: string;
  role: 'host' | 'client';
  pc: RTCPeerConnection;
  dc: RTCDataChannel | null;
  pendingIce: RTCIceCandidateInit[];
  readyPromise: Promise<RTCDataChannel>;
  resolveReady: (dc: RTCDataChannel) => void;
  rejectReady: (err: Error) => void;
  settled: boolean;
  keepAliveTimer?: number;
  disconnectTimer?: number;
}

function packBinaryChunk(requestId: string, chunkBuffer: ArrayBuffer): ArrayBuffer {
  const idBytes = new TextEncoder().encode(requestId);
  const out = new Uint8Array(4 + idBytes.length + chunkBuffer.byteLength);
  const view = new DataView(out.buffer);
  view.setUint32(0, idBytes.length, false);
  out.set(idBytes, 4);
  out.set(new Uint8Array(chunkBuffer), 4 + idBytes.length);
  return out.buffer;
}

function unpackBinaryChunk(packet: ArrayBuffer): { requestId: string; payload: ArrayBuffer } | null {
  if (packet.byteLength < 4) return null;
  const view = new DataView(packet);
  const idLen = view.getUint32(0, false);
  if (idLen <= 0 || 4 + idLen > packet.byteLength) return null;
  const idBytes = new Uint8Array(packet, 4, idLen);
  const requestId = new TextDecoder().decode(idBytes);
  const payload = packet.slice(4 + idLen);
  return { requestId, payload };
}

export class LanP2PManager {
  private peers = new Map<string, PeerRecord>();
  private transfers = new Map<string, PendingTransfer>();
  private coverRequests = new Map<string, PendingCoverRequest>();
  private getIdentity: () => LocalDeviceIdentity;
  private resolveLocalBlob: (trackId: string) => Promise<Blob | null>;
  private resolveLocalCover?: (trackId: string) => Promise<string | null>;
  private onPeerCountChange?: (count: number) => void;

  constructor(opts: {
    getIdentity: () => LocalDeviceIdentity;
    resolveLocalBlob: (trackId: string) => Promise<Blob | null>;
    resolveLocalCover?: (trackId: string) => Promise<string | null>;
    onPeerCountChange?: (count: number) => void;
  }) {
    this.getIdentity = opts.getIdentity;
    this.resolveLocalBlob = opts.resolveLocalBlob;
    this.resolveLocalCover = opts.resolveLocalCover;
    this.onPeerCountChange = opts.onPeerCountChange;
  }

  private emitPeerCount() {
    let active = 0;
    for (const p of this.peers.values()) {
      if (p.pc.connectionState !== 'closed' && p.pc.connectionState !== 'failed') {
        active++;
      }
    }
    this.onPeerCountChange?.(active);
  }

  private createPeerRecord(deviceId: string, role: 'host' | 'client'): PeerRecord {
    this.closePeer(deviceId);

    const pc = new RTCPeerConnection(RTC_CONFIG);
    let resolveReady!: (dc: RTCDataChannel) => void;
    let rejectReady!: (err: Error) => void;
    const readyPromise = new Promise<RTCDataChannel>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });

    const record: PeerRecord = {
      deviceId,
      role,
      pc,
      dc: null,
      pendingIce: [],
      readyPromise,
      resolveReady,
      rejectReady,
      settled: false,
    };

    pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      const me = this.getIdentity();
      void sendLanSignal({
        fromDeviceId: me.deviceId,
        fromDeviceName: me.deviceName,
        targetDeviceId: deviceId,
        signalType: 'ice',
        data: e.candidate.toJSON(),
      }).catch(() => {});
    };

    pc.onconnectionstatechange = () => {
      this.emitPeerCount();
      if (pc.connectionState === 'connected') {
        if (record.disconnectTimer) {
          window.clearTimeout(record.disconnectTimer);
          record.disconnectTimer = undefined;
        }
      } else if (pc.connectionState === 'disconnected') {
        // Wi-Fi / NAT hiccup: give ICE a chance to recover before closing
        if (!record.disconnectTimer) {
          record.disconnectTimer = window.setTimeout(() => {
            record.disconnectTimer = undefined;
            if (pc.connectionState === 'disconnected') {
              try {
                pc.restartIce();
              } catch {
                // ignore
              }
            }
          }, 2500);
        }
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        if (!record.settled) {
          record.settled = true;
          record.rejectReady(new Error('การเชื่อมต่อ Local Network P2P ขาดหาย'));
        }
        this.closePeer(deviceId);
      }
    };

    this.peers.set(deviceId, record);
    this.emitPeerCount();
    return record;
  }

  private attachChannelHandlers(record: PeerRecord, dc: RTCDataChannel) {
    dc.binaryType = 'arraybuffer';
    dc.bufferedAmountLowThreshold = LOW_WATER_MARK;
    record.dc = dc;

    dc.onopen = () => {
      if (!record.settled) {
        record.settled = true;
        record.resolveReady(dc);
      }
      if (record.keepAliveTimer) {
        window.clearInterval(record.keepAliveTimer);
      }
      // Keep NAT/DataChannel active across idle playback gaps
      record.keepAliveTimer = window.setInterval(() => {
        if (dc.readyState === 'open') {
          try {
            dc.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
          } catch {
            // ignore
          }
        }
      }, 10000);
      this.emitPeerCount();
    };

    dc.onclose = () => {
      if (record.keepAliveTimer) {
        window.clearInterval(record.keepAliveTimer);
        record.keepAliveTimer = undefined;
      }
      if (!record.settled) {
        record.settled = true;
        record.rejectReady(new Error('ช่องสัญญาณ Local Network ปิดลง'));
      }
      this.emitPeerCount();
    };

    dc.onerror = () => {
      if (!record.settled) {
        record.settled = true;
        record.rejectReady(new Error('เกิดข้อผิดพลาดในการเชื่อมต่อ Local Network'));
      }
    };

    dc.onmessage = (event) => {
      if (typeof event.data === 'string') {
        try {
          const msg = JSON.parse(event.data) as Record<string, unknown>;
          if (msg.type === 'ping') {
            if (dc.readyState === 'open') {
              dc.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
            }
            return;
          }
          if (msg.type === 'pong') {
            return;
          }
          if (msg.type === 'request-track') {
            const requestId = String(msg.requestId || '');
            const trackId = String(msg.trackId || '');
            if (requestId && trackId) {
              void this.streamBlobToPeer(dc, requestId, trackId);
            }
          } else if (msg.type === 'request-cover') {
            const requestId = String(msg.requestId || '');
            const trackId = String(msg.trackId || '');
            if (requestId && trackId) {
              void this.sendCoverToPeer(dc, requestId, trackId);
            }
          } else if (msg.type === 'cover-response') {
            const requestId = String(msg.requestId || '');
            const pending = this.coverRequests.get(requestId);
            if (pending) {
              window.clearTimeout(pending.timer);
              this.coverRequests.delete(requestId);
              const coverDataUrl =
                typeof msg.coverDataUrl === 'string' && msg.coverDataUrl.startsWith('data:image/')
                  ? msg.coverDataUrl
                  : null;
              pending.resolve(coverDataUrl);
            }
          } else if (msg.type === 'cover-chunk') {
            const requestId = String(msg.requestId || '');
            const pending = this.coverRequests.get(requestId);
            if (pending) {
              const index = Number(msg.index);
              const total = Number(msg.total);
              const chunk = typeof msg.chunk === 'string' ? msg.chunk : '';
              if (
                Number.isInteger(index) &&
                Number.isInteger(total) &&
                total > 0 &&
                total <= 128 &&
                index >= 0 &&
                index < total
              ) {
                if (!pending.parts || pending.parts.length !== total) {
                  pending.parts = new Array<string>(total).fill('');
                  pending.receivedCount = 0;
                }
                if (!pending.parts[index]) {
                  pending.parts[index] = chunk;
                  pending.receivedCount = (pending.receivedCount || 0) + 1;
                }
                if ((pending.receivedCount || 0) >= total) {
                  window.clearTimeout(pending.timer);
                  this.coverRequests.delete(requestId);
                  const assembled = pending.parts.join('');
                  pending.resolve(assembled.startsWith('data:image/') ? assembled : null);
                }
              }
            }
          } else if (msg.type === 'track-meta') {
            const requestId = String(msg.requestId || '');
            const t = this.transfers.get(requestId);
            if (t) {
              t.mimeType = String(msg.mimeType || 'audio/mpeg');
              t.totalBytes = Number(msg.totalBytes || 0);
              t.resetTimeout();
            }
          } else if (msg.type === 'track-end') {
            const requestId = String(msg.requestId || '');
            const t = this.transfers.get(requestId);
            if (t) {
              t.cleanup();
              this.transfers.delete(requestId);
              t.resolve(new Blob(t.chunks, { type: t.mimeType || 'audio/mpeg' }));
            }
          } else if (msg.type === 'track-error') {
            const requestId = String(msg.requestId || '');
            const t = this.transfers.get(requestId);
            if (t) {
              t.cleanup();
              this.transfers.delete(requestId);
              t.reject(new Error(String(msg.message || 'โฮสต์ไม่สามารถส่งไฟล์เสียงนี้ได้')));
            }
          }
        } catch {
          // ignore malformed control message
        }
        return;
      }

      if (event.data instanceof ArrayBuffer) {
        const unpacked = unpackBinaryChunk(event.data);
        if (!unpacked) return;
        const t = this.transfers.get(unpacked.requestId);
        if (!t) return;
        t.chunks.push(unpacked.payload);
        t.receivedBytes += unpacked.payload.byteLength;
        t.resetTimeout();
        t.onProgress?.(t.receivedBytes, t.totalBytes);
      }
    };
  }

  private async sendCoverToPeer(dc: RTCDataChannel, requestId: string, trackId: string) {
    let coverDataUrl: string | null = null;
    try {
      if (this.resolveLocalCover) {
        coverDataUrl = await this.resolveLocalCover(trackId);
      }
    } catch {
      coverDataUrl = null;
    }
    if (dc.readyState !== 'open') return;
    try {
      const COVER_CHUNK_CHARS = 20000;
      if (coverDataUrl && coverDataUrl.length > COVER_CHUNK_CHARS) {
        const total = Math.ceil(coverDataUrl.length / COVER_CHUNK_CHARS);
        for (let index = 0; index < total; index++) {
          if (dc.readyState !== 'open') return;
          const chunk = coverDataUrl.slice(
            index * COVER_CHUNK_CHARS,
            (index + 1) * COVER_CHUNK_CHARS
          );
          dc.send(JSON.stringify({ type: 'cover-chunk', requestId, index, total, chunk }));
        }
      } else {
        dc.send(JSON.stringify({ type: 'cover-response', requestId, coverDataUrl }));
      }
    } catch {
      try {
        if (dc.readyState === 'open') {
          dc.send(JSON.stringify({ type: 'cover-response', requestId, coverDataUrl: null }));
        }
      } catch {
        // ignore
      }
    }
  }

  private async streamBlobToPeer(dc: RTCDataChannel, requestId: string, trackId: string) {
    try {
      const blob = await this.resolveLocalBlob(trackId);
      if (!blob || blob.size <= 0) {
        if (dc.readyState === 'open') {
          dc.send(
            JSON.stringify({
              type: 'track-error',
              requestId,
              message: 'ไม่พบข้อมูลไฟล์เสียงนี้บนเครื่องโฮสต์ (อาจต้องกดเชื่อมต่อโฟลเดอร์ใหม่)',
            })
          );
        }
        return;
      }

      if (dc.readyState !== 'open') return;
      dc.send(
        JSON.stringify({
          type: 'track-meta',
          requestId,
          mimeType: blob.type || 'audio/mpeg',
          totalBytes: blob.size,
        })
      );

      for (let offset = 0; offset < blob.size; offset += CHUNK_SIZE) {
        if (dc.readyState !== 'open') return;
        if (dc.bufferedAmount > MAX_BUFFERED_AMOUNT) {
          await new Promise<void>((resolve) => {
            let done = false;
            const finish = () => {
              if (done) return;
              done = true;
              dc.removeEventListener('bufferedamountlow', finish);
              window.clearTimeout(timer);
              resolve();
            };
            const timer = window.setTimeout(finish, 250);
            dc.addEventListener('bufferedamountlow', finish);
          });
        }
        if (dc.readyState !== 'open') return;
        const slice = blob.slice(offset, Math.min(offset + CHUNK_SIZE, blob.size));
        const buf = await slice.arrayBuffer();
        dc.send(packBinaryChunk(requestId, buf));
      }

      if (dc.readyState === 'open') {
        dc.send(JSON.stringify({ type: 'track-end', requestId }));
      }
    } catch {
      if (dc.readyState === 'open') {
        dc.send(
          JSON.stringify({
            type: 'track-error',
            requestId,
            message: 'อ่านไฟล์เสียงบนเครื่องโฮสต์ไม่สำเร็จ',
          })
        );
      }
    }
  }

  async handleSignal(signal: LanSignalPayload): Promise<void> {
    const me = this.getIdentity();
    if (signal.targetDeviceId !== me.deviceId) return;

    if (signal.signalType === 'offer') {
      const record = this.createPeerRecord(signal.fromDeviceId, 'host');
      record.pc.ondatachannel = (e) => {
        this.attachChannelHandlers(record, e.channel);
      };
      const desc = signal.data as RTCSessionDescriptionInit;
      await record.pc.setRemoteDescription(new RTCSessionDescription(desc));
      for (const ice of record.pendingIce) {
        await record.pc.addIceCandidate(new RTCIceCandidate(ice)).catch(() => {});
      }
      record.pendingIce = [];
      const answer = await record.pc.createAnswer();
      await record.pc.setLocalDescription(answer);
      await sendLanSignal({
        fromDeviceId: me.deviceId,
        fromDeviceName: me.deviceName,
        targetDeviceId: signal.fromDeviceId,
        signalType: 'answer',
        data: answer,
      });
      return;
    }

    const record = this.peers.get(signal.fromDeviceId);
    if (!record) return;

    if (signal.signalType === 'answer') {
      const desc = signal.data as RTCSessionDescriptionInit;
      await record.pc.setRemoteDescription(new RTCSessionDescription(desc));
      for (const ice of record.pendingIce) {
        await record.pc.addIceCandidate(new RTCIceCandidate(ice)).catch(() => {});
      }
      record.pendingIce = [];
      return;
    }

    if (signal.signalType === 'ice' && signal.data) {
      const candidate = signal.data as RTCIceCandidateInit;
      if (record.pc.remoteDescription) {
        await record.pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      } else {
        record.pendingIce.push(candidate);
      }
    }
  }

  async connectToHost(hostDeviceId: string): Promise<RTCDataChannel> {
    const existing = this.peers.get(hostDeviceId);
    if (
      existing &&
      existing.dc &&
      existing.dc.readyState === 'open' &&
      existing.pc.connectionState !== 'failed' &&
      existing.pc.connectionState !== 'closed'
    ) {
      return existing.dc;
    }

    const record = this.createPeerRecord(hostDeviceId, 'client');
    const dc = record.pc.createDataChannel('aura-lan-audio', { ordered: true });
    this.attachChannelHandlers(record, dc);

    const offer = await record.pc.createOffer();
    await record.pc.setLocalDescription(offer);

    const me = this.getIdentity();
    await sendLanSignal({
      fromDeviceId: me.deviceId,
      fromDeviceName: me.deviceName,
      targetDeviceId: hostDeviceId,
      signalType: 'offer',
      data: offer,
    });

    let connectTimer = 0;
    const timeoutPromise = new Promise<never>((_, reject) => {
      connectTimer = window.setTimeout(() => {
        if (!record.settled) {
          record.settled = true;
          this.closePeer(hostDeviceId);
          reject(new Error('หมดเวลาเชื่อมต่อกับโฮสต์ในวง Local Network (12 วินาที)'));
        }
      }, 12000);
    });

    try {
      return await Promise.race([record.readyPromise, timeoutPromise]);
    } finally {
      if (connectTimer) window.clearTimeout(connectTimer);
    }
  }

  private requestOnceOverChannel(
    dc: RTCDataChannel,
    trackId: string,
    onProgress?: (receivedBytes: number, totalBytes: number) => void
  ): Promise<Blob> {
    const requestId = `lanreq-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    return new Promise<Blob>((resolve, reject) => {
      let timer = 0;
      const cleanup = () => {
        if (timer) window.clearTimeout(timer);
      };
      const resetTimeout = () => {
        if (timer) window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          this.transfers.delete(requestId);
          reject(new Error('การรับไฟล์เสียงผ่าน Local Network หยุดชะงัก'));
        }, 25000);
      };

      const entry: PendingTransfer = {
        mimeType: 'audio/mpeg',
        totalBytes: 0,
        receivedBytes: 0,
        chunks: [],
        onProgress,
        resolve,
        reject,
        resetTimeout,
        cleanup,
      };
      this.transfers.set(requestId, entry);
      resetTimeout();

      try {
        dc.send(JSON.stringify({ type: 'request-track', requestId, trackId }));
      } catch (err) {
        cleanup();
        this.transfers.delete(requestId);
        reject(err instanceof Error ? err : new Error('ไม่สามารถส่งคำขอไฟล์ผ่าน Local Network ได้'));
      }
    });
  }

  async fetchTrackBlob(
    hostDeviceId: string,
    trackId: string,
    onProgress?: (receivedBytes: number, totalBytes: number) => void
  ): Promise<Blob> {
    try {
      const dc = await this.connectToHost(hostDeviceId);
      return await this.requestOnceOverChannel(dc, trackId, onProgress);
    } catch {
      // Transparently drop stale channel and re-establish WebRTC P2P once
      this.closePeer(hostDeviceId);
      const freshDc = await this.connectToHost(hostDeviceId);
      return await this.requestOnceOverChannel(freshDc, trackId, onProgress);
    }
  }

  private requestCoverOnceOverChannel(dc: RTCDataChannel, trackId: string): Promise<string | null> {
    const requestId = `lancov-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    return new Promise<string | null>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.coverRequests.delete(requestId);
        resolve(null);
      }, 9000);
      this.coverRequests.set(requestId, { resolve, timer });
      try {
        dc.send(JSON.stringify({ type: 'request-cover', requestId, trackId }));
      } catch (err) {
        window.clearTimeout(timer);
        this.coverRequests.delete(requestId);
        reject(err instanceof Error ? err : new Error('cover-send-failed'));
      }
    });
  }

  async fetchTrackCover(hostDeviceId: string, trackId: string): Promise<string | null> {
    try {
      const dc = await this.connectToHost(hostDeviceId);
      return await this.requestCoverOnceOverChannel(dc, trackId);
    } catch {
      try {
        this.closePeer(hostDeviceId);
        const freshDc = await this.connectToHost(hostDeviceId);
        return await this.requestCoverOnceOverChannel(freshDc, trackId);
      } catch {
        return null;
      }
    }
  }

  closePeer(deviceId: string) {
    const existing = this.peers.get(deviceId);
    if (!existing) return;
    this.peers.delete(deviceId);
    if (existing.keepAliveTimer) {
      window.clearInterval(existing.keepAliveTimer);
    }
    if (existing.disconnectTimer) {
      window.clearTimeout(existing.disconnectTimer);
    }
    try {
      existing.dc?.close();
    } catch {
      // ignore
    }
    try {
      existing.pc.close();
    } catch {
      // ignore
    }
    this.emitPeerCount();
  }

  closeAll() {
    for (const key of Array.from(this.peers.keys())) {
      this.closePeer(key);
    }
    for (const [reqId, t] of this.transfers.entries()) {
      t.cleanup();
      t.reject(new Error('ยกเลิกการรับสัญญาณ Local Network'));
      this.transfers.delete(reqId);
    }
    for (const [reqId, cov] of this.coverRequests.entries()) {
      window.clearTimeout(cov.timer);
      cov.resolve(null);
      this.coverRequests.delete(reqId);
    }
  }
}
