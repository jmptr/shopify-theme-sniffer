import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import type {
  PopupStateMessage,
  BackupProgressMessage,
  BackupStatus,
} from '../types';
import { Button } from '../components/ui/button';
import { Progress } from '../components/ui/progress';
import { StatusBadge } from '../components/shared/StatusBadge';
import { formatRelativeTime, formatNumber, formatAbsoluteTime } from '../lib/format';

// --- Helpers ---

function openExtPage(path: string): void {
  const url = chrome.runtime.getURL(path);
  chrome.tabs.create({ url });
}

async function requestPersist(): Promise<boolean> {
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

// --- State renderers ---

function StateA() {
  return (
    <>
      <p className="text-sm text-gray-500 py-3">
        No Shopify store detected on this page.
      </p>
      <Button
        variant="link"
        className="mt-3 text-xs"
        onClick={() => openExtPage('dashboard/dashboard.html')}
      >
        Open Dashboard
      </Button>
    </>
  );
}

function StateB({ state }: { state: PopupStateMessage }) {
  const handleStart = async () => {
    const persistGranted = await requestPersist();
    chrome.runtime.sendMessage({
      type: 'START_BACKUP',
      storefront_id: state.shop ?? '',
      persistGranted,
    });
  };

  return (
    <>
      <div className="text-lg font-bold break-words">{state.domain}</div>
      <div className="text-xs text-gray-500 break-words mb-3">{state.shop}</div>
      <Button className="w-full mt-3" onClick={handleStart}>
        Start Backup
      </Button>
      <Button
        variant="link"
        className="mt-3 text-xs"
        onClick={() => openExtPage('dashboard/dashboard.html')}
      >
        Open Dashboard
      </Button>
    </>
  );
}

function StateC({ state }: { state: PopupStateMessage }) {
  const fetched = state.progress?.fetched ?? 0;
  const estimated = state.progress?.estimated ?? 1;
  const pct = Math.min(100, Math.round((fetched / estimated) * 100));

  const handlePause = () => {
    chrome.runtime.sendMessage({
      type: 'PAUSE_BACKUP',
      storefront_id: state.shop ?? '',
    });
  };

  return (
    <>
      <div className="text-lg font-bold break-words">{state.domain}</div>
      <p className="text-xs text-gray-600 mt-2">
        Fetching products… {formatNumber(fetched)} / ~{formatNumber(estimated)} estimated
      </p>
      <Progress value={pct} className="mt-2" />
      <Button className="w-full mt-3" onClick={handlePause}>
        Pause
      </Button>
      <Button
        variant="link"
        className="mt-3 text-xs"
        onClick={() => openExtPage('logs/logs.html')}
      >
        View Logs
      </Button>
    </>
  );
}

function StateD({ state }: { state: PopupStateMessage }) {
  const handleUpdate = async () => {
    const persistGranted = await requestPersist();
    chrome.runtime.sendMessage({
      type: 'UPDATE_BACKUP',
      storefront_id: state.shop ?? '',
      persistGranted,
    });
  };

  return (
    <>
      <div className="text-lg font-bold break-words">{state.domain}</div>
      <div className="flex justify-between items-center text-xs py-1 mt-2">
        <span className="text-gray-500">Last backup:</span>
        <span className="font-medium flex items-center gap-1.5">
          <span title={formatAbsoluteTime(state.lastBackupAt)}>
            {formatRelativeTime(state.lastBackupAt)}
          </span>
          <StatusBadge status={state.backupStatus} />
        </span>
      </div>
      <div className="flex justify-between items-center text-xs py-1">
        <span className="text-gray-500">Products:</span>
        <span className="font-medium">{formatNumber(state.productCount)}</span>
      </div>
      <Button className="w-full mt-3" onClick={handleUpdate}>
        Update Backup
      </Button>
      <Button
        variant="link"
        className="mt-3 text-xs"
        onClick={() => openExtPage('dashboard/dashboard.html')}
      >
        Open Dashboard
      </Button>
    </>
  );
}

function StateE({ state }: { state: PopupStateMessage }) {
  const fetched = state.progress?.fetched ?? 0;

  const handleResume = () => {
    chrome.runtime.sendMessage({
      type: 'RESUME_BACKUP',
      storefront_id: state.shop ?? '',
    });
  };

  const handleCancel = () => {
    chrome.runtime.sendMessage({
      type: 'CANCEL_BACKUP',
      storefront_id: state.shop ?? '',
    });
  };

  return (
    <>
      <div className="text-lg font-bold break-words">{state.domain}</div>
      <p className="text-xs text-gray-600 mt-2">
        Backup paused — {formatNumber(fetched)} products fetched so far.
      </p>
      <div className="flex gap-2 mt-3">
        <Button className="flex-1" onClick={handleResume}>
          Resume
        </Button>
        <Button variant="destructive" className="flex-1" onClick={handleCancel}>
          Cancel
        </Button>
      </div>
      <Button
        variant="link"
        className="mt-3 text-xs"
        onClick={() => openExtPage('logs/logs.html')}
      >
        View Logs
      </Button>
    </>
  );
}

// --- Main App ---

function PopupApp() {
  const [state, setState] = useState<PopupStateMessage | null>(null);

  useEffect(() => {
    // Query active tab and request popup state
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (tabId === undefined) return;

      chrome.runtime.sendMessage(
        { type: 'GET_POPUP_STATE', tabId },
        (response: PopupStateMessage | undefined) => {
          if (response) {
            setState(response);
          }
        },
      );
    });

    // Listen for runtime messages
    const listener = (message: BackupProgressMessage | PopupStateMessage) => {
      if (message.type === 'POPUP_STATE') {
        setState(message);
      } else if (message.type === 'BACKUP_PROGRESS') {
        setState((prev) => {
          if (!prev) return prev;
          if (prev.backupStatus !== 'in-progress') return prev;
          if (prev.shop !== message.storefront_id) return prev;
          return {
            ...prev,
            progress: {
              fetched: message.fetched,
              estimated: message.estimated,
            },
          };
        });
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => {
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, []);

  const renderContent = useCallback(() => {
    if (!state) return null;

    if (!state.detected) {
      return <StateA />;
    }

    switch (state.backupStatus) {
      case 'never':
        return <StateB state={state} />;
      case 'in-progress':
        return <StateC state={state} />;
      case 'paused':
        return <StateE state={state} />;
      case 'complete':
      case 'partial':
        return <StateD state={state} />;
      default:
        return null;
    }
  }, [state]);

  return (
    <div className="w-[380px] p-4">
      {renderContent()}
    </div>
  );
}

// --- Mount ---

ReactDOM.createRoot(document.getElementById('root')!).render(<PopupApp />);
