// Service worker for Shopify Theme Sniffer

import { setupMessageListener, broadcastProgress } from './messaging';
import {
  startBackup,
  pauseBackup,
  resumeBackup,
  cancelBackup,
  checkForInterruptedBackups,
} from './backup';
import { maybePruneLogs, setupAlarmListener } from './lifecycle';

// Wire up message handler with backup callbacks
setupMessageListener({
  onStartBackup(storefrontId, _persistGranted) {
    startBackup(storefrontId, (fetched, estimated) => {
      broadcastProgress(storefrontId, fetched, estimated);
    });
  },
  onUpdateBackup(storefrontId, _persistGranted) {
    startBackup(storefrontId, (fetched, estimated) => {
      broadcastProgress(storefrontId, fetched, estimated);
    });
  },
  onPauseBackup(storefrontId) {
    pauseBackup(storefrontId);
  },
  onResumeBackup(storefrontId) {
    resumeBackup(storefrontId, (fetched, estimated) => {
      broadcastProgress(storefrontId, fetched, estimated);
    });
  },
  onCancelBackup(storefrontId) {
    cancelBackup(storefrontId);
  },
});

// Wire up offline recovery alarms
setupAlarmListener((storefrontId) => {
  resumeBackup(storefrontId, (fetched, estimated) => {
    broadcastProgress(storefrontId, fetched, estimated);
  });
});

// Startup tasks: prune old logs and resume interrupted backups
maybePruneLogs();
checkForInterruptedBackups((storefrontId, fetched, estimated) => {
  broadcastProgress(storefrontId, fetched, estimated);
});
