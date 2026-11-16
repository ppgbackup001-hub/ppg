import { useSyncExternalStore } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { isNativeAndroidShell } from './api';

export interface PWAUpdateState {
  supported: boolean;
  needRefresh: boolean;
  isChecking: boolean;
  isUpdating: boolean;
  lastCheckedAt: number | null;
  statusMessage: string | null;
  currentBuildId: string | null;
  latestBuildId: string | null;
}

const RELOAD_GUARD_KEY = 'aura_sw_last_reload_at';
const RELOAD_COOLDOWN_MS = 15_000;
const AUTO_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const VISIBILITY_THROTTLE_MS = 30_000;

let state: PWAUpdateState = {
  supported:
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    !isNativeAndroidShell(),
  needRefresh: false,
  isChecking: false,
  isUpdating: false,
  lastCheckedAt: null,
  statusMessage: null,
  currentBuildId: null,
  latestBuildId: null,
};

const listeners = new Set<() => void>();
let initialized = false;
let updateSWFn: ((reloadPage?: boolean) => Promise<void>) | null = null;
let swRegistration: ServiceWorkerRegistration | null = null;
let bootTimestamp = Date.now();
let lastVisibilityCheckAt = 0;
let manualUpdateRequested = false;
let reloadingNow = false;
let statusClearTimer: number | null = null;

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function setState(patch: Partial<PWAUpdateState>) {
  state = { ...state, ...patch };
  emit();
}

function setTransientStatus(message: string | null, durationMs = 4500) {
  if (statusClearTimer !== null && typeof window !== 'undefined') {
    window.clearTimeout(statusClearTimer);
    statusClearTimer = null;
  }
  setState({ statusMessage: message });
  if (message && durationMs > 0 && typeof window !== 'undefined') {
    statusClearTimer = window.setTimeout(() => {
      statusClearTimer = null;
      if (state.statusMessage === message) {
        setState({ statusMessage: null });
      }
    }, durationMs);
  }
}

function isAnyAudioPlaying(): boolean {
  if (typeof document === 'undefined') return false;
  const mediaEls = document.querySelectorAll('audio, video');
  for (const el of mediaEls) {
    const media = el as HTMLMediaElement;
    if (!media.paused && !media.ended && media.currentTime > 0) {
      return true;
    }
  }
  return false;
}

function canAutoReloadSafely(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.sessionStorage.getItem(RELOAD_GUARD_KEY);
    if (raw) {
      const prev = Number(raw);
      if (Number.isFinite(prev) && Date.now() - prev < RELOAD_COOLDOWN_MS) {
        return false;
      }
    }
  } catch {
    // ignore sessionStorage restrictions
  }
  return true;
}

function safeReloadPage() {
  if (typeof window === 'undefined' || reloadingNow) return;
  if (!canAutoReloadSafely() && !manualUpdateRequested) {
    setState({ needRefresh: true });
    setTransientStatus('พบแอพเวอร์ชันใหม่ — กด "อัพเดททันที" เพื่อโหลดใหม่', 0);
    return;
  }
  reloadingNow = true;
  try {
    window.sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
  } catch {
    // ignore
  }
  window.location.reload();
}

async function fetchOriginBuildId(): Promise<string | null> {
  if (typeof window === 'undefined' || isNativeAndroidShell()) return null;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`/api/health?t=${Date.now()}`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as { buildId?: unknown };
    return typeof data.buildId === 'string' && data.buildId.trim()
      ? data.buildId.trim()
      : null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function waitForInstallingWorker(
  reg: ServiceWorkerRegistration,
  timeoutMs = 2500
): Promise<boolean> {
  const installing = reg.installing;
  if (!installing) {
    return Boolean(reg.waiting);
  }
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (foundUpdate: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      installing.removeEventListener('statechange', onStateChange);
      resolve(foundUpdate);
    };
    const onStateChange = () => {
      if (installing.state === 'installed' || installing.state === 'activated') {
        finish(Boolean(reg.waiting || navigator.serviceWorker.controller));
      } else if (installing.state === 'redundant') {
        finish(false);
      }
    };
    const timer = window.setTimeout(() => {
      finish(Boolean(reg.waiting));
    }, timeoutMs);
    installing.addEventListener('statechange', onStateChange);
  });
}

async function clearAppShellCaches(): Promise<void> {
  if (typeof window === 'undefined' || !('caches' in window)) return;
  try {
    const keys = await window.caches.keys();
    await Promise.all(keys.map((key) => window.caches.delete(key)));
  } catch {
    // Ignore cache storage errors; never touch localStorage or IndexedDB
  }
}

export function initPWAUpdater(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  bootTimestamp = Date.now();

  if (isNativeAndroidShell()) {
    setState({ supported: false });
    return;
  }

  void fetchOriginBuildId().then((buildId) => {
    if (buildId) {
      setState({
        currentBuildId: state.currentBuildId || buildId,
        latestBuildId: buildId,
      });
    }
  });

  if (!('serviceWorker' in navigator)) {
    setState({ supported: false });
    return;
  }

  setState({ supported: true });

  const hadControllerAtBoot = Boolean(navigator.serviceWorker.controller);

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadControllerAtBoot && !manualUpdateRequested) {
      return;
    }
    const bootedRecently = Date.now() - bootTimestamp < 12_000;
    if (manualUpdateRequested || bootedRecently || !isAnyAudioPlaying()) {
      safeReloadPage();
    } else {
      setState({ needRefresh: true });
      setTransientStatus('อัพเดทแอพพร้อมแล้ว — กดเพื่อโหลดเวอร์ชันล่าสุด', 0);
    }
  });

  updateSWFn = registerSW({
    immediate: true,
    onNeedReload() {
      setState({ needRefresh: true });
      const bootedRecently = Date.now() - bootTimestamp < 12_000;
      if (manualUpdateRequested || bootedRecently || !isAnyAudioPlaying()) {
        safeReloadPage();
      } else {
        setTransientStatus('มีแอพเวอร์ชันใหม่พร้อมอัพเดท', 0);
      }
    },
    onNeedRefresh() {
      setState({ needRefresh: true });
      const bootedRecently = Date.now() - bootTimestamp < 12_000;
      if ((manualUpdateRequested || bootedRecently || !isAnyAudioPlaying()) && updateSWFn) {
        void updateSWFn(true).catch(() => {
          setTransientStatus('มีแอพเวอร์ชันใหม่พร้อมอัพเดท', 0);
        });
      } else {
        setTransientStatus('มีแอพเวอร์ชันใหม่พร้อมอัพเดท', 0);
      }
    },
    onRegisteredSW(swUrl, registration) {
      if (!registration) return;
      swRegistration = registration;

      // Ensure Chrome never uses its HTTP cache when checking /sw.js for updates
      if ('serviceWorker' in navigator && swUrl) {
        void navigator.serviceWorker
          .register(swUrl, { scope: registration.scope, updateViaCache: 'none' })
          .catch(() => {
            // ignore if preview/browser restricts re-registration
          });
      }

      // Check shortly after boot in case Chrome opened a stale standalone PWA cache
      window.setTimeout(() => {
        void checkForAppUpdate({ silent: true });
      }, 1500);

      // Periodic background update check for long-lived standalone PWA windows
      window.setInterval(() => {
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          void checkForAppUpdate({ silent: true });
        }
      }, AUTO_CHECK_INTERVAL_MS);
    },
    onRegisterError() {
      // Ignore registration errors in restricted preview iframes or non-secure contexts
    },
  });

  const handleVisibilityOrOnline = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    const now = Date.now();
    if (now - lastVisibilityCheckAt < VISIBILITY_THROTTLE_MS) return;
    lastVisibilityCheckAt = now;
    void checkForAppUpdate({ silent: true });
  };

  document.addEventListener('visibilitychange', handleVisibilityOrOnline);
  window.addEventListener('online', handleVisibilityOrOnline);
}

export async function checkForAppUpdate(options?: {
  silent?: boolean;
}): Promise<{ hasUpdate: boolean; error?: string }> {
  const silent = options?.silent ?? false;
  if (typeof window === 'undefined' || isNativeAndroidShell()) {
    return { hasUpdate: false };
  }

  if (state.isChecking || state.isUpdating) {
    return { hasUpdate: state.needRefresh };
  }

  setState({ isChecking: true });
  if (!silent) {
    setTransientStatus('กำลังตรวจสอบอัพเดท...', 0);
  }

  try {
    let foundUpdate = state.needRefresh;

    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker
        .getRegistrations()
        .catch(() => [] as ServiceWorkerRegistration[]);
      const targets =
        registrations.length > 0
          ? registrations
          : swRegistration
            ? [swRegistration]
            : [];

      for (const reg of targets) {
        if (reg.waiting) {
          foundUpdate = true;
        }
        try {
          await reg.update();
          const becameWaiting = await waitForInstallingWorker(reg, 2500);
          if (becameWaiting || reg.waiting) {
            foundUpdate = true;
          }
        } catch {
          // Ignore transient offline errors during update check
        }
      }
    }

    const remoteBuildId = await fetchOriginBuildId();
    if (remoteBuildId) {
      if (!state.currentBuildId) {
        setState({ currentBuildId: remoteBuildId, latestBuildId: remoteBuildId });
      } else {
        setState({ latestBuildId: remoteBuildId });
        if (remoteBuildId !== state.currentBuildId) {
          foundUpdate = true;
        }
      }
    }

    setState({
      needRefresh: foundUpdate,
      lastCheckedAt: Date.now(),
    });

    if (foundUpdate) {
      setTransientStatus('พบเวอร์ชันใหม่พร้อมอัพเดท', 0);
      return { hasUpdate: true };
    }

    if (!silent) {
      setTransientStatus('คุณกำลังใช้งานเวอร์ชันล่าสุดแล้ว');
    } else if (state.statusMessage === 'กำลังตรวจสอบอัพเดท...') {
      setTransientStatus(null);
    }
    return { hasUpdate: false };
  } catch {
    if (!silent) {
      setTransientStatus('ไม่สามารถตรวจสอบอัพเดทได้ในขณะนี้');
    }
    return { hasUpdate: state.needRefresh, error: 'ตรวจสอบอัพเดทไม่สำเร็จ' };
  } finally {
    setState({ isChecking: false });
  }
}

export async function applyAppUpdate(): Promise<void> {
  if (typeof window === 'undefined' || state.isUpdating) return;
  manualUpdateRequested = true;
  setState({ isUpdating: true });
  setTransientStatus('กำลังอัพเดทเป็นเวอร์ชันล่าสุด...', 0);

  try {
    // 1. Trigger Workbox skipWaiting if waiting worker exists
    if (updateSWFn) {
      try {
        await Promise.race([
          updateSWFn(true),
          new Promise<void>((resolve) => window.setTimeout(resolve, 900)),
        ]);
      } catch {
        // Fallback below handles stuck SWs cleanly
      }
    }

    // 2. Ask any waiting SW directly and refresh/unregister stuck SWs
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker
        .getRegistrations()
        .catch(() => [] as ServiceWorkerRegistration[]);

      for (const reg of registrations) {
        try {
          if (!reg.waiting) {
            await reg.update();
          }
          const waitingWorker: ServiceWorker | null = reg.waiting;
          if (waitingWorker) {
            waitingWorker.postMessage({ type: 'SKIP_WAITING' });
          }
        } catch {
          // ignore
        }
      }

      // Give controllerchange a brief chance to fire naturally
      await new Promise<void>((resolve) => window.setTimeout(resolve, 500));

      // If still not reloaded, unregister SW registrations so fresh SW registers cleanly after reload
      if (!reloadingNow) {
        await Promise.all(
          registrations.map((reg) => reg.unregister().catch(() => false))
        );
      }
    }

    // 3. Clear only Service Worker / Workbox HTTP asset caches (preserves IndexedDB & localStorage)
    await clearAppShellCaches();

    // 4. Prime fresh index.html into HTTP cache before reloading
    try {
      await fetch(`/?_sw_refresh=${Date.now()}`, {
        cache: 'reload',
        headers: { 'Cache-Control': 'no-cache' },
      });
    } catch {
      // Ignore if offline or preview blocks
    }
  } finally {
    safeReloadPage();
  }
}

export function dismissAppUpdateBanner(): void {
  setState({ needRefresh: false });
  setTransientStatus(null);
}

export function getPWAUpdateState(): PWAUpdateState {
  return state;
}

export function usePWAUpdate() {
  const snapshot = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getPWAUpdateState,
    getPWAUpdateState
  );

  return {
    ...snapshot,
    checkForUpdate: checkForAppUpdate,
    applyUpdate: applyAppUpdate,
    dismissUpdate: dismissAppUpdateBanner,
  };
}
