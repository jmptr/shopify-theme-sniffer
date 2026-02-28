import { pruneOldLogs, addLog } from './db';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const PRUNE_DAYS = 30;
const OFFLINE_ALARM_PREFIX = 'offline-retry-';

// ---------------------------------------------------------------------------
// Log auto-pruning
// ---------------------------------------------------------------------------

/**
 * Prunes log entries older than 30 days, at most once per calendar day.
 * The last prune timestamp is persisted in `chrome.storage.local` so the
 * check survives service worker restarts.
 */
export async function maybePruneLogs(): Promise<void> {
  const result = await chrome.storage.local.get('last_prune_at');
  const lastPrune = result.last_prune_at as string | undefined;

  if (lastPrune) {
    const elapsed = Date.now() - new Date(lastPrune).getTime();
    if (elapsed < PRUNE_INTERVAL_MS) {
      return; // pruned recently, skip
    }
  }

  const deleted = await pruneOldLogs(PRUNE_DAYS);
  await chrome.storage.local.set({ last_prune_at: new Date().toISOString() });

  if (deleted > 0) {
    await addLog({
      storefront_id: '_system',
      timestamp: new Date().toISOString(),
      level: 'info',
      message: `Auto-pruned ${deleted} log entries older than ${PRUNE_DAYS} days.`,
      detail: null,
    });
  }
}

// ---------------------------------------------------------------------------
// Offline recovery via chrome.alarms
// ---------------------------------------------------------------------------

/**
 * Schedules a 30-second alarm to retry connectivity for a storefront that
 * went offline during a backup.
 */
export function scheduleOfflineRetry(storefrontId: string): void {
  chrome.alarms.create(`${OFFLINE_ALARM_PREFIX}${storefrontId}`, {
    delayInMinutes: 0.5, // 30 seconds
  });
}

/**
 * Registers a `chrome.alarms.onAlarm` listener that handles offline-retry
 * alarms. When the alarm fires it probes the storefront with a HEAD request;
 * on success it invokes `onOnlineResume`, on failure it reschedules.
 */
export function setupAlarmListener(
  onOnlineResume: (storefrontId: string) => void,
): void {
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (!alarm.name.startsWith(OFFLINE_ALARM_PREFIX)) return;

    const storefrontId = alarm.name.slice(OFFLINE_ALARM_PREFIX.length);

    try {
      await fetch(`https://${storefrontId}`, {
        method: 'HEAD',
        mode: 'no-cors',
      });
      // If we got here without throwing, network is available
      onOnlineResume(storefrontId);
    } catch {
      // Still offline, schedule another retry
      scheduleOfflineRetry(storefrontId);
      await addLog({
        storefront_id: storefrontId,
        timestamp: new Date().toISOString(),
        level: 'warn',
        message: 'Still offline, scheduling another retry in 30 seconds.',
        detail: null,
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Password-protected store detection
// ---------------------------------------------------------------------------

/**
 * Checks whether a Shopify storefront is password-protected by fetching
 * `/products.json` and inspecting the response status and final URL.
 * Returns `true` if the store appears to be behind a password gate.
 */
export async function isStorePasswordProtected(
  storefrontId: string,
): Promise<boolean> {
  try {
    const response = await fetch(`https://${storefrontId}/products.json`, {
      redirect: 'follow',
    });
    // If redirected to /password or non-200, it's protected
    if (!response.ok || response.url.includes('/password')) {
      return true;
    }
    return false;
  } catch {
    return false; // Network error, not necessarily password-protected
  }
}
