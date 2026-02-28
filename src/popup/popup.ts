import type {
  PopupStateMessage,
  BackupProgressMessage,
  BackupStatus,
} from '../types';

// --- Helpers ---

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function formatRelativeTime(iso: string): { text: string; absolute: string } {
  const date = new Date(iso);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  let text: string;
  if (diffSec < 60) {
    text = 'just now';
  } else if (diffMin < 60) {
    text = `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  } else if (diffHr < 24) {
    text = `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`;
  } else {
    text = `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
  }

  const absolute = date.toLocaleString();
  return { text, absolute };
}

function openExtPage(path: string): void {
  const url = chrome.runtime.getURL(path);
  chrome.tabs.create({ url });
}

function statusBadgeClass(status: BackupStatus): string {
  if (status === 'complete') return 'status-badge status-badge--complete';
  if (status === 'partial') return 'status-badge status-badge--partial';
  return 'status-badge';
}

function statusLabel(status: BackupStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

// --- Renderers ---

function renderStateA(): string {
  return `
    <div class="no-detect">
      <p>No Shopify store detected on this page.</p>
    </div>
    <a href="#" class="link" data-action="open-dashboard">Open Dashboard</a>
  `;
}

function renderStateB(state: PopupStateMessage): string {
  return `
    <div class="store-domain">${escapeHtml(state.domain ?? '')}</div>
    <div class="shop-id">${escapeHtml(state.shop ?? '')}</div>
    <button class="btn-primary" data-action="start-backup">Start Backup</button>
    <a href="#" class="link" data-action="open-dashboard">Open Dashboard</a>
  `;
}

function renderStateC(state: PopupStateMessage): string {
  const fetched = state.progress?.fetched ?? 0;
  const estimated = state.progress?.estimated ?? 1;
  const pct = Math.min(100, Math.round((fetched / estimated) * 100));

  return `
    <div class="store-domain">${escapeHtml(state.domain ?? '')}</div>
    <p class="progress-text">Fetching products\u2026 ${formatNumber(fetched)} / ~${formatNumber(estimated)} estimated</p>
    <div class="progress-bar">
      <div class="progress-fill" style="width: ${pct}%"></div>
    </div>
    <button class="btn-primary" data-action="pause-backup">Pause</button>
    <a href="#" class="link" data-action="open-logs">View Logs</a>
  `;
}

function renderStateD(state: PopupStateMessage): string {
  let lastBackupHtml = 'Never';
  if (state.lastBackupAt) {
    const rel = formatRelativeTime(state.lastBackupAt);
    lastBackupHtml = `<span title="${escapeHtml(rel.absolute)}">${escapeHtml(rel.text)}</span>`;
  }

  return `
    <div class="store-domain">${escapeHtml(state.domain ?? '')}</div>
    <div class="info-row">
      <span class="info-label">Last backup:</span>
      <span class="info-value">${lastBackupHtml} <span class="${statusBadgeClass(state.backupStatus)}">${statusLabel(state.backupStatus)}</span></span>
    </div>
    <div class="info-row">
      <span class="info-label">Products:</span>
      <span class="info-value">${formatNumber(state.productCount)}</span>
    </div>
    <button class="btn-primary" data-action="update-backup">Update Backup</button>
    <a href="#" class="link" data-action="open-dashboard">Open Dashboard</a>
  `;
}

function renderStateE(state: PopupStateMessage): string {
  const fetched = state.progress?.fetched ?? 0;

  return `
    <div class="store-domain">${escapeHtml(state.domain ?? '')}</div>
    <p class="progress-text">Backup paused \u2014 ${formatNumber(fetched)} products fetched so far.</p>
    <div class="btn-group">
      <button class="btn-primary" data-action="resume-backup">Resume</button>
      <button class="btn-danger" data-action="cancel-backup">Cancel</button>
    </div>
    <a href="#" class="link" data-action="open-logs">View Logs</a>
  `;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// --- Main logic ---

let currentState: PopupStateMessage | null = null;

function renderState(state: PopupStateMessage): void {
  currentState = state;
  const container = document.getElementById('state-container');
  if (!container) return;

  let html: string;

  if (!state.detected) {
    html = renderStateA();
  } else if (state.backupStatus === 'never') {
    html = renderStateB(state);
  } else if (state.backupStatus === 'in-progress') {
    html = renderStateC(state);
  } else if (state.backupStatus === 'paused') {
    html = renderStateE(state);
  } else {
    // 'complete' or 'partial'
    html = renderStateD(state);
  }

  container.innerHTML = html;
}

async function requestPersist(): Promise<boolean> {
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

function getStorefrontId(): string {
  return currentState?.shop ?? '';
}

async function handleAction(action: string): Promise<void> {
  const shop = getStorefrontId();

  switch (action) {
    case 'open-dashboard':
      openExtPage('dashboard/dashboard.html');
      break;

    case 'open-logs':
      openExtPage('logs/logs.html');
      break;

    case 'start-backup': {
      const persistGranted = await requestPersist();
      chrome.runtime.sendMessage({
        type: 'START_BACKUP',
        storefront_id: shop,
        persistGranted,
      });
      break;
    }

    case 'update-backup': {
      const persistGranted = await requestPersist();
      chrome.runtime.sendMessage({
        type: 'UPDATE_BACKUP',
        storefront_id: shop,
        persistGranted,
      });
      break;
    }

    case 'pause-backup':
      chrome.runtime.sendMessage({
        type: 'PAUSE_BACKUP',
        storefront_id: shop,
      });
      break;

    case 'resume-backup':
      chrome.runtime.sendMessage({
        type: 'RESUME_BACKUP',
        storefront_id: shop,
      });
      break;

    case 'cancel-backup':
      chrome.runtime.sendMessage({
        type: 'CANCEL_BACKUP',
        storefront_id: shop,
      });
      break;
  }
}

function setupEventDelegation(): void {
  const container = document.getElementById('state-container');
  if (!container) return;

  container.addEventListener('click', (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const actionEl = target.closest<HTMLElement>('[data-action]');
    if (!actionEl) return;

    e.preventDefault();
    const action = actionEl.dataset.action;
    if (action) {
      void handleAction(action);
    }
  });
}

function updateProgress(msg: BackupProgressMessage): void {
  if (!currentState || currentState.backupStatus !== 'in-progress') return;
  if (currentState.shop !== msg.storefront_id) return;

  // Update progress text and bar in place without full re-render
  const textEl = document.querySelector('.progress-text');
  const fillEl = document.querySelector<HTMLElement>('.progress-fill');
  if (textEl) {
    textEl.textContent = `Fetching products\u2026 ${formatNumber(msg.fetched)} / ~${formatNumber(msg.estimated)} estimated`;
  }
  if (fillEl) {
    const pct = Math.min(100, Math.round((msg.fetched / msg.estimated) * 100));
    fillEl.style.width = `${pct}%`;
  }

  // Keep local state in sync
  if (currentState.progress) {
    currentState.progress.fetched = msg.fetched;
    currentState.progress.estimated = msg.estimated;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  setupEventDelegation();

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0]?.id;
    if (tabId === undefined) return;

    chrome.runtime.sendMessage(
      { type: 'GET_POPUP_STATE', tabId },
      (response: PopupStateMessage | undefined) => {
        if (response) {
          renderState(response);
        }
      },
    );
  });

  chrome.runtime.onMessage.addListener(
    (message: BackupProgressMessage | PopupStateMessage) => {
      if (message.type === 'BACKUP_PROGRESS') {
        updateProgress(message);
      } else if (message.type === 'POPUP_STATE') {
        renderState(message);
      }
    },
  );
});
