import * as React from 'react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import * as ReactDOM from 'react-dom/client';
import { getAllStorefronts, deleteStorefront, getProductsByStorefront } from '../db';
import type { Storefront, Product, BackupStatus } from '../types';
import { formatRelativeTime, formatAbsoluteTime, formatBytes } from '../lib/format';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../components/ui/table';
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
import { SortableHeader } from '../components/shared/SortableHeader';
import { StatusBadge } from '../components/shared/StatusBadge';
import { EmptyState } from '../components/shared/EmptyState';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SortColumn = 'domain' | 'products' | 'status' | 'last_backup' | 'size';
type SortDirection = 'asc' | 'desc';

interface SortState {
  column: SortColumn;
  direction: SortDirection;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_ORDER: Record<BackupStatus, number> = {
  complete: 0,
  partial: 1,
  'in-progress': 2,
  paused: 3,
  never: 4,
};

// ---------------------------------------------------------------------------
// Sort helper
// ---------------------------------------------------------------------------

function sortStorefronts(data: Storefront[], sortState: SortState): Storefront[] {
  const { column, direction } = sortState;
  const sorted = [...data];
  const dir = direction === 'asc' ? 1 : -1;

  sorted.sort((a, b) => {
    let cmp = 0;
    switch (column) {
      case 'domain':
        cmp = a.domain.localeCompare(b.domain);
        break;
      case 'products':
        cmp = a.product_count - b.product_count;
        break;
      case 'status':
        cmp = STATUS_ORDER[a.backup_status] - STATUS_ORDER[b.backup_status];
        break;
      case 'last_backup':
        cmp = (a.last_backup_at ?? '').localeCompare(b.last_backup_at ?? '');
        break;
      case 'size':
        cmp = a.size_bytes - b.size_bytes;
        break;
    }
    return cmp * dir;
  });

  return sorted;
}

// ---------------------------------------------------------------------------
// Export helper
// ---------------------------------------------------------------------------

async function exportStorefront(
  sf: Storefront,
  getProducts: (id: string) => Promise<Product[]>
): Promise<void> {
  const products = await getProducts(sf.id);

  const sanitizedProducts = products.map((p: Product) => {
    const { storefront_id: _sfId, sniffer_updated_at: _sniffed, ...rest } = p;
    void _sfId;
    void _sniffed;
    return rest;
  });

  const exportData = {
    exported_at: new Date().toISOString(),
    storefront: {
      domain: sf.domain,
      product_count: sf.product_count,
      last_backup_at: sf.last_backup_at,
      backup_status: sf.backup_status,
    },
    products: sanitizedProducts,
  };

  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `${sf.domain}-${dateStr}.json`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 100);
}

// ---------------------------------------------------------------------------
// DashboardApp
// ---------------------------------------------------------------------------

function DashboardApp() {
  const [storefronts, setStorefronts] = useState<Storefront[]>([]);
  const [sortState, setSortState] = useState<SortState>({
    column: 'last_backup',
    direction: 'desc',
  });
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    getAllStorefronts().then(setStorefronts);
  }, []);

  const handleSort = useCallback((column: string) => {
    setSortState((prev) => {
      if (prev.column === column) {
        return {
          column: column as SortColumn,
          direction: prev.direction === 'asc' ? 'desc' : 'asc',
        };
      }
      return { column: column as SortColumn, direction: 'asc' };
    });
  }, []);

  const handleExport = useCallback((sf: Storefront) => {
    void exportStorefront(sf, getProductsByStorefront);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteStorefront(id);
      setStorefronts((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      console.error('[dashboard] Failed to delete storefront:', err);
    } finally {
      setPendingDeleteId(null);
    }
  }, []);

  const sorted = sortStorefronts(storefronts, sortState);

  const { pageItems, totalPages, start, end } = useMemo(() => {
    const total = sorted.length;
    const tp = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(currentPage, tp);
    const s = (safePage - 1) * pageSize;
    const e = Math.min(s + pageSize, total);
    return {
      pageItems: sorted.slice(s, e),
      totalPages: tp,
      start: s,
      end: e,
    };
  }, [sorted, pageSize, currentPage]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const handlePageSizeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setPageSize(parseInt(e.target.value, 10));
    setCurrentPage(1);
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Shopify Theme Sniffer &mdash; Dashboard
        </h1>
        <a
          href="../logs/logs.html"
          className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
        >
          View Logs
        </a>
      </div>

      {/* Content */}
      {storefronts.length === 0 ? (
        <EmptyState message="No storefronts detected yet. Visit a Shopify store to get started." />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHeader
                  column="domain"
                  label="Domain"
                  sortColumn={sortState.column}
                  sortDirection={sortState.direction}
                  onSort={handleSort}
                />
                <SortableHeader
                  column="products"
                  label="Products"
                  sortColumn={sortState.column}
                  sortDirection={sortState.direction}
                  onSort={handleSort}
                />
                <SortableHeader
                  column="status"
                  label="Status"
                  sortColumn={sortState.column}
                  sortDirection={sortState.direction}
                  onSort={handleSort}
                />
                <SortableHeader
                  column="last_backup"
                  label="Last Backup"
                  sortColumn={sortState.column}
                  sortDirection={sortState.direction}
                  onSort={handleSort}
                />
                <SortableHeader
                  column="size"
                  label="Size"
                  sortColumn={sortState.column}
                  sortDirection={sortState.direction}
                  onSort={handleSort}
                />
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((sf) => (
                <TableRow key={sf.id}>
                  <TableCell className="font-medium text-gray-900">{sf.domain}</TableCell>
                  <TableCell>
                    <a
                      href={`../products/products.html?storefront=${encodeURIComponent(sf.id)}`}
                      className="text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      {sf.product_count}
                    </a>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={sf.backup_status} />
                  </TableCell>
                  <TableCell title={formatAbsoluteTime(sf.last_backup_at)}>
                    {formatRelativeTime(sf.last_backup_at)}
                  </TableCell>
                  <TableCell>{formatBytes(sf.size_bytes)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <a href={`https://${sf.domain}`} target="_blank" rel="noopener noreferrer">
                          Visit
                        </a>
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleExport(sf)}>
                        Export JSON
                      </Button>

                      <AlertDialog
                        open={pendingDeleteId === sf.id}
                        onOpenChange={(open) => setPendingDeleteId(open ? sf.id : null)}
                      >
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm">
                            Delete
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Storefront</AlertDialogTitle>
                            <AlertDialogDescription>
                              Delete all data for <strong>{sf.domain}</strong>? This cannot be
                              undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => void handleDelete(sf.id)}>
                              Confirm Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-3 px-3.5 py-2.5 bg-white rounded-md text-[13px] text-gray-600">
            <div className="flex items-center gap-1.5">
              <span>Show</span>
              <select
                value={pageSize}
                onChange={handlePageSizeChange}
                className="px-1.5 py-1 text-[13px] border border-gray-300 rounded bg-white"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span>per page</span>
            </div>
            <span>
              {storefronts.length > 0
                ? `${start + 1}\u2013${end} of ${storefronts.length}`
                : '0 of 0'}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => p - 1)}
              >
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

ReactDOM.createRoot(document.getElementById('root')!).render(<DashboardApp />);
