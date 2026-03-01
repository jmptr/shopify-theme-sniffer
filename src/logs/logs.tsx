import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import { useVirtualizer } from '@tanstack/react-virtual';
import { getAllLogs, getAllStorefronts, clearLogs } from '../db';
import type { LogEntry, LogLevel, Storefront } from '../types';
import { formatTimestamp } from '../lib/format';
import { Button } from '../components/ui/button';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '../components/ui/alert-dialog';
import { EmptyState } from '../components/shared/EmptyState';
import { cn } from '../lib/utils';

// ---------------------------------------------------------------------------
// Level badge color map
// ---------------------------------------------------------------------------

const levelColors: Record<LogLevel, string> = {
  info: 'bg-blue-500',
  warn: 'bg-orange-500',
  error: 'bg-red-500',
};

// ---------------------------------------------------------------------------
// LogsApp
// ---------------------------------------------------------------------------

function LogsApp() {
  const [allLogs, setAllLogs] = useState<LogEntry[]>([]);
  const [storefrontMap, setStorefrontMap] = useState<Map<string, Storefront>>(new Map());
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  // Filter state
  const [sfId, setSfId] = useState('');
  const [level, setLevel] = useState<LogLevel | ''>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const parentRef = useRef<HTMLDivElement>(null);

  // ---- Load data on mount ----
  useEffect(() => {
    async function load() {
      const [storefronts, logs] = await Promise.all([getAllStorefronts(), getAllLogs()]);
      setStorefrontMap(new Map(storefronts.map((sf) => [sf.id, sf])));
      setAllLogs(logs);
    }
    void load();
  }, []);

  // ---- Filtered + sorted logs ----
  const filteredLogs = useMemo(() => {
    const result = allLogs.filter((log) => {
      if (sfId && log.storefront_id !== sfId) return false;
      if (level && log.level !== level) return false;
      if (dateFrom) {
        const logDate = log.timestamp.slice(0, 10);
        if (logDate < dateFrom) return false;
      }
      if (dateTo) {
        const logDate = log.timestamp.slice(0, 10);
        if (logDate > dateTo) return false;
      }
      return true;
    });
    result.sort((a, b) => (a.timestamp > b.timestamp ? -1 : 1));
    return result;
  }, [allLogs, sfId, level, dateFrom, dateTo]);

  // ---- Storefronts list for dropdown ----
  const storefronts = useMemo(() => Array.from(storefrontMap.values()), [storefrontMap]);

  // ---- Resolve storefront domain ----
  const resolveDomain = useCallback(
    (storefrontId: string): string => storefrontMap.get(storefrontId)?.domain ?? storefrontId,
    [storefrontMap]
  );

  // ---- Toggle expanded row ----
  const toggleRow = useCallback((logId: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(logId)) {
        next.delete(logId);
      } else {
        next.add(logId);
      }
      return next;
    });
  }, []);

  // ---- Virtualizer ----
  const virtualizer = useVirtualizer({
    count: filteredLogs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const log = filteredLogs[index];
      return log.id !== undefined && expandedRows.has(log.id) ? 200 : 48;
    },
    overscan: 10,
  });

  // ---- Clear logs handler ----
  const handleClearLogs = useCallback(async () => {
    await clearLogs(sfId || undefined);
    const logs = await getAllLogs();
    setAllLogs(logs);
    setExpandedRows(new Set());
  }, [sfId]);

  // ---- Clear confirmation message ----
  const clearMessage = sfId ? `Clear logs for ${resolveDomain(sfId)}?` : 'Clear all logs?';

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      {/* Header */}
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Shopify Theme Sniffer — Logs</h1>
        <nav>
          <a href="../dashboard/dashboard.html" className="text-blue-600 hover:underline text-sm">
            Dashboard
          </a>
        </nav>
      </header>

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-4 mb-5 p-3.5 bg-white rounded">
        {/* Storefront dropdown */}
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Storefront
          <select
            value={sfId}
            onChange={(e) => setSfId(e.target.value)}
            className="text-sm px-2 py-1.5 border border-gray-300 rounded font-normal normal-case tracking-normal text-gray-900"
          >
            <option value="">All</option>
            {storefronts.map((sf) => (
              <option key={sf.id} value={sf.id}>
                {sf.domain}
              </option>
            ))}
          </select>
        </label>

        {/* Level dropdown */}
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Level
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as LogLevel | '')}
            className="text-sm px-2 py-1.5 border border-gray-300 rounded font-normal normal-case tracking-normal text-gray-900"
          >
            <option value="">All</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
          </select>
        </label>

        {/* Date from */}
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">
          From
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="text-sm px-2 py-1.5 border border-gray-300 rounded font-normal normal-case tracking-normal text-gray-900"
          />
        </label>

        {/* Date to */}
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">
          To
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="text-sm px-2 py-1.5 border border-gray-300 rounded font-normal normal-case tracking-normal text-gray-900"
          />
        </label>

        {/* Clear Logs with AlertDialog */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive">Clear Logs</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Clear Logs</AlertDialogTitle>
              <AlertDialogDescription>{clearMessage}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void handleClearLogs()}>Clear</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Virtual log list */}
      <div className="bg-white rounded p-3.5">
        {filteredLogs.length === 0 ? (
          <EmptyState message="No log entries found." />
        ) : (
          <div ref={parentRef} style={{ height: 'calc(100vh - 200px)', overflow: 'auto' }}>
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                position: 'relative',
                width: '100%',
              }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const log = filteredLogs[virtualRow.index];
                const isExpanded = log.id !== undefined && expandedRows.has(log.id);
                const hasDetail = log.detail !== null;

                return (
                  <div
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    className="border-b border-gray-100 hover:bg-gray-50"
                  >
                    {/* Row header */}
                    <div
                      className={cn(
                        'flex items-center gap-2.5 h-12 px-2',
                        hasDetail ? 'cursor-pointer' : ''
                      )}
                      onClick={(e) => {
                        if (!hasDetail || log.id === undefined) return;
                        // Allow text selection on message span
                        const target = e.target as HTMLElement;
                        if (target.dataset.role === 'message') return;
                        toggleRow(log.id);
                      }}
                    >
                      {/* Expand icon */}
                      {hasDetail && (
                        <span
                          className={cn(
                            'inline-block text-[10px] w-4 shrink-0 text-gray-400 transition-transform duration-150',
                            isExpanded ? 'rotate-90' : ''
                          )}
                        >
                          {'\u25B6'}
                        </span>
                      )}

                      {/* Timestamp */}
                      <span className="font-mono text-[13px] text-gray-500 whitespace-nowrap shrink-0 w-[160px]">
                        {formatTimestamp(log.timestamp)}
                      </span>

                      {/* Level badge */}
                      <span
                        className={cn(
                          'inline-block text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 text-center min-w-[52px] text-white',
                          levelColors[log.level]
                        )}
                      >
                        {log.level.toUpperCase()}
                      </span>

                      {/* Storefront domain */}
                      <span className="text-[13px] text-gray-400 whitespace-nowrap overflow-hidden text-ellipsis shrink-0 w-[180px]">
                        {resolveDomain(log.storefront_id)}
                      </span>

                      {/* Message */}
                      <span
                        data-role="message"
                        className={cn(
                          'flex-1 text-sm whitespace-nowrap overflow-hidden text-ellipsis min-w-0',
                          hasDetail ? 'cursor-text' : ''
                        )}
                      >
                        {log.message}
                      </span>
                    </div>

                    {/* Detail panel */}
                    {isExpanded && log.detail !== null && (
                      <pre className="font-mono text-xs leading-relaxed bg-gray-100 rounded p-2.5 mx-2 mb-2 border-t border-gray-200 overflow-auto max-h-[140px] whitespace-pre-wrap break-all cursor-text select-text">
                        {JSON.stringify(log.detail, null, 2)}
                      </pre>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

ReactDOM.createRoot(document.getElementById('root')!).render(<LogsApp />);
