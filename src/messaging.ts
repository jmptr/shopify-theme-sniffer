import type { ExtensionMessage, PopupStateMessage, BackupStatus, BackupProgress } from './types';
import { getStorefront, getBackupCursor, getProductCount } from './db';

// ---------------------------------------------------------------------------
// Tab state tracking
// ---------------------------------------------------------------------------

export interface TabState {
  detected: boolean;
  domain: string;
  shop: string | null;
}

const tabStates = new Map<number, TabState>();

export function getTabState(tabId: number): TabState | undefined {
  return tabStates.get(tabId);
}

export function setTabState(tabId: number, state: TabState): void {
  tabStates.set(tabId, state);
}

// Clean up tab state when a tab is closed
chrome.tabs.onRemoved.addListener((tabId: number) => {
  tabStates.delete(tabId);
});

// ---------------------------------------------------------------------------
// Badge management
// ---------------------------------------------------------------------------

export function setBadgeForTab(tabId: number, detected: boolean): void {
  const color = detected ? '#4CAF50' : '#9E9E9E';
  const text = detected ? '!' : '';
  chrome.action.setBadgeBackgroundColor({ color, tabId });
  chrome.action.setBadgeText({ text, tabId });
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

export interface MessageCallbacks {
  onStartBackup: (storefrontId: string, persistGranted: boolean) => void;
  onUpdateBackup: (storefrontId: string, persistGranted: boolean) => void;
  onPauseBackup: (storefrontId: string) => void;
  onResumeBackup: (storefrontId: string) => void;
  onCancelBackup: (storefrontId: string) => void;
}

export function setupMessageListener(callbacks: MessageCallbacks): void {
  chrome.runtime.onMessage.addListener(
    (
      message: ExtensionMessage,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response: PopupStateMessage) => void
    ): boolean | undefined => {
      switch (message.type) {
        case 'SHOPIFY_DETECTED': {
          const tabId = sender.tab?.id;
          if (tabId !== undefined) {
            const state: TabState = {
              detected: true,
              domain: message.domain,
              shop: message.shop,
            };
            setTabState(tabId, state);
            setBadgeForTab(tabId, true);
            console.log(`[Sniffer] Shopify detected on ${message.domain} (shop: ${message.shop})`);
          }
          return undefined;
        }

        case 'SHOPIFY_NOT_DETECTED': {
          const tabId = sender.tab?.id;
          if (tabId !== undefined) {
            const state: TabState = {
              detected: false,
              domain: message.domain,
              shop: null,
            };
            setTabState(tabId, state);
            setBadgeForTab(tabId, false);
          }
          return undefined;
        }

        case 'GET_POPUP_STATE': {
          const { tabId } = message;
          const tab = getTabState(tabId);

          if (!tab || !tab.detected || !tab.shop) {
            sendResponse({
              type: 'POPUP_STATE',
              detected: tab?.detected ?? false,
              domain: tab?.domain ?? null,
              shop: tab?.shop ?? null,
              backupStatus: 'never' as BackupStatus,
              lastBackupAt: null,
              productCount: 0,
              progress: null,
            });
            return undefined;
          }

          const shop = tab.shop;
          const domain = tab.domain;

          (async () => {
            const storefront = await getStorefront(shop);
            const cursor = await getBackupCursor(shop);
            const productCount = await getProductCount(shop);

            let backupStatus: BackupStatus = storefront?.backup_status ?? 'never';
            let progress: BackupProgress | null = null;

            if (cursor && (backupStatus === 'in-progress' || backupStatus === 'paused')) {
              progress = {
                fetched: cursor.products_fetched,
                estimated: cursor.total_products ?? 0,
              };
            }

            sendResponse({
              type: 'POPUP_STATE',
              detected: true,
              domain,
              shop,
              backupStatus,
              lastBackupAt: storefront?.last_backup_at ?? null,
              productCount,
              progress,
            });
          })();

          // Return true to indicate async sendResponse
          return true;
        }

        case 'START_BACKUP':
          callbacks.onStartBackup(message.storefront_id, message.persistGranted);
          return undefined;

        case 'UPDATE_BACKUP':
          callbacks.onUpdateBackup(message.storefront_id, message.persistGranted);
          return undefined;

        case 'PAUSE_BACKUP':
          callbacks.onPauseBackup(message.storefront_id);
          return undefined;

        case 'RESUME_BACKUP':
          callbacks.onResumeBackup(message.storefront_id);
          return undefined;

        case 'CANCEL_BACKUP':
          callbacks.onCancelBackup(message.storefront_id);
          return undefined;

        default:
          return undefined;
      }
    }
  );
}

// ---------------------------------------------------------------------------
// Broadcast progress
// ---------------------------------------------------------------------------

export function broadcastProgress(storefrontId: string, fetched: number, estimated: number): void {
  chrome.runtime
    .sendMessage({
      type: 'BACKUP_PROGRESS',
      storefront_id: storefrontId,
      fetched,
      estimated,
    })
    .catch(() => {
      // No listeners available (popup closed) — safe to ignore
    });
}
