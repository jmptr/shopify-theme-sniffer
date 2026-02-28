import { getAllStorefronts, deleteStorefront, getProductsByStorefront } from '../db';
import type { Storefront, Product, BackupStatus } from '../types';

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
// State
// ---------------------------------------------------------------------------

let storefronts: Storefront[] = [];
let sortState: SortState = { column: 'last_backup', direction: 'desc' };
let pendingDeleteId: string | null = null;

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

function getTable(): HTMLTableElement {
  return document.getElementById('storefront-table') as HTMLTableElement;
}

function getTbody(): HTMLTableSectionElement {
  return getTable().querySelector('tbody') as HTMLTableSectionElement;
}

function getEmptyState(): HTMLDivElement {
  return document.getElementById('empty-state') as HTMLDivElement;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return 'Never';

  const date = new Date(isoString);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  if (diffHour < 24) return `${diffHour} hour${diffHour === 1 ? '' : 's'} ago`;
  if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;

  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth} month${diffMonth === 1 ? '' : 's'} ago`;

  const diffYear = Math.floor(diffMonth / 12);
  return `${diffYear} year${diffYear === 1 ? '' : 's'} ago`;
}

function formatAbsoluteTime(isoString: string | null): string {
  if (!isoString) return '';
  return new Date(isoString).toLocaleString();
}

function statusLabel(status: BackupStatus): string {
  switch (status) {
    case 'complete': return 'Complete';
    case 'partial': return 'Partial';
    case 'in-progress': return 'In Progress';
    case 'paused': return 'Paused';
    case 'never': return 'Never';
  }
}

function statusClass(status: BackupStatus): string {
  switch (status) {
    case 'complete': return 'status-complete';
    case 'partial': return 'status-partial';
    case 'in-progress': return 'status-in-progress';
    case 'paused': return 'status-paused';
    case 'never': return 'status-never';
  }
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

const STATUS_ORDER: Record<BackupStatus, number> = {
  'complete': 0,
  'partial': 1,
  'in-progress': 2,
  'paused': 3,
  'never': 4,
};

function sortStorefronts(data: Storefront[]): Storefront[] {
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

function updateSortIndicators(): void {
  const headers = getTable().querySelectorAll<HTMLTableCellElement>('th[data-sortable]');
  for (const th of headers) {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset['column'] === sortState.column) {
      th.classList.add(sortState.direction === 'asc' ? 'sort-asc' : 'sort-desc');
    }
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderTable(): void {
  const tbody = getTbody();
  const emptyState = getEmptyState();
  const table = getTable();

  if (storefronts.length === 0) {
    table.hidden = true;
    emptyState.hidden = false;
    return;
  }

  table.hidden = false;
  emptyState.hidden = true;

  const sorted = sortStorefronts(storefronts);
  updateSortIndicators();

  const rows: string[] = [];
  for (const sf of sorted) {
    rows.push(renderStorefrontRow(sf));
    if (pendingDeleteId === sf.id) {
      rows.push(renderConfirmRow(sf));
    }
  }
  tbody.innerHTML = rows.join('');
}

function renderStorefrontRow(sf: Storefront): string {
  const relTime = formatRelativeTime(sf.last_backup_at);
  const absTime = formatAbsoluteTime(sf.last_backup_at);
  const size = formatBytes(sf.size_bytes);
  const badge = `<span class="status-badge ${statusClass(sf.backup_status)}">${statusLabel(sf.backup_status)}</span>`;

  return `<tr data-storefront-id="${escapeAttr(sf.id)}">
    <td>${escapeHtml(sf.domain)}</td>
    <td><a href="../products/products.html?storefront=${encodeURIComponent(sf.id)}" style="color:#0066cc;text-decoration:none;">${sf.product_count}</a></td>
    <td>${badge}</td>
    <td title="${escapeAttr(absTime)}">${escapeHtml(relTime)}</td>
    <td>${escapeHtml(size)}</td>
    <td>
      <button class="btn-export" data-action="export" data-id="${escapeAttr(sf.id)}">Export JSON</button>
      <button class="btn-delete" data-action="delete" data-id="${escapeAttr(sf.id)}">Delete</button>
    </td>
  </tr>`;
}

function renderConfirmRow(sf: Storefront): string {
  return `<tr class="confirm-row" data-storefront-id="${escapeAttr(sf.id)}">
    <td colspan="6">
      Delete all data for <strong>${escapeHtml(sf.domain)}</strong>? This cannot be undone.
      <button class="btn-confirm-delete" data-action="confirm-delete" data-id="${escapeAttr(sf.id)}">Confirm Delete</button>
      <button class="btn-cancel" data-action="cancel-delete">Cancel</button>
    </td>
  </tr>`;
}

// ---------------------------------------------------------------------------
// HTML escaping
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------------------
// Export JSON
// ---------------------------------------------------------------------------

async function exportStorefront(id: string): Promise<void> {
  const sf = storefronts.find((s) => s.id === id);
  if (!sf) return;

  const products = await getProductsByStorefront(id);

  const sanitizedProducts = products.map((p: Product) => {
    const { storefront_id: _sfId, sniffer_updated_at: _sniffed, ...rest } = p;
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

  // Clean up
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 100);
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

async function confirmDelete(id: string): Promise<void> {
  await deleteStorefront(id);
  storefronts = storefronts.filter((s) => s.id !== id);
  pendingDeleteId = null;
  renderTable();
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

function handleHeaderClick(e: MouseEvent): void {
  const th = (e.target as HTMLElement).closest<HTMLTableCellElement>('th[data-sortable]');
  if (!th) return;

  const column = th.dataset['column'] as SortColumn | undefined;
  if (!column) return;

  if (sortState.column === column) {
    sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
  } else {
    sortState.column = column;
    sortState.direction = 'asc';
  }

  renderTable();
}

function handleBodyClick(e: MouseEvent): void {
  const target = e.target as HTMLElement;
  const button = target.closest<HTMLButtonElement>('button[data-action]');
  if (!button) return;

  const action = button.dataset['action'];
  const id = button.dataset['id'];

  switch (action) {
    case 'export':
      if (id) void exportStorefront(id);
      break;
    case 'delete':
      if (id) {
        pendingDeleteId = pendingDeleteId === id ? null : id;
        renderTable();
      }
      break;
    case 'confirm-delete':
      if (id) void confirmDelete(id);
      break;
    case 'cancel-delete':
      pendingDeleteId = null;
      renderTable();
      break;
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function init(): Promise<void> {
  storefronts = await getAllStorefronts();
  renderTable();

  const table = getTable();
  const thead = table.querySelector('thead');
  if (thead) {
    thead.addEventListener('click', handleHeaderClick);
  }
  table.querySelector('tbody')!.addEventListener('click', handleBodyClick);
}

document.addEventListener('DOMContentLoaded', () => {
  void init();
});
