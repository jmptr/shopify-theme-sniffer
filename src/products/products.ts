import { getStorefront, getProductsByStorefront } from '../db';
import type { Product } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SortColumn = 'title' | 'vendor' | 'product_type' | 'variants' | 'price' | 'updated_at';
type SortDirection = 'asc' | 'desc';

interface SortState {
  column: SortColumn;
  direction: SortDirection;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let allProducts: Product[] = [];
let sortState: SortState = { column: 'title', direction: 'asc' };
let searchQuery = '';
let showRemoved = false;
let expandedIds = new Set<string>();
let pageSize = 10;
let currentPage = 1;

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

function getTable(): HTMLTableElement {
  return document.getElementById('product-table') as HTMLTableElement;
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

function priceRange(product: Product): string {
  if (product.variants.length === 0) return '—';

  const prices = product.variants
    .map((v) => parseFloat(v.price))
    .filter((p) => !isNaN(p));

  if (prices.length === 0) return '—';

  const min = Math.min(...prices);
  const max = Math.max(...prices);

  if (min === max) return `$${min.toFixed(2)}`;
  return `$${min.toFixed(2)} – $${max.toFixed(2)}`;
}

function priceForSort(product: Product): number {
  if (product.variants.length === 0) return 0;
  const prices = product.variants
    .map((v) => parseFloat(v.price))
    .filter((p) => !isNaN(p));
  return prices.length > 0 ? Math.min(...prices) : 0;
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
// Filtering
// ---------------------------------------------------------------------------

function getFilteredProducts(): Product[] {
  let list = allProducts;

  if (!showRemoved) {
    list = list.filter((p) => !p.removed_at);
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter((p) =>
      p.title.toLowerCase().includes(q) ||
      p.vendor.toLowerCase().includes(q) ||
      p.product_type.toLowerCase().includes(q) ||
      p.tags.some((t) => t.toLowerCase().includes(q))
    );
  }

  return list;
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

function sortProducts(data: Product[]): Product[] {
  const { column, direction } = sortState;
  const sorted = [...data];
  const dir = direction === 'asc' ? 1 : -1;

  sorted.sort((a, b) => {
    let cmp = 0;
    switch (column) {
      case 'title':
        cmp = a.title.localeCompare(b.title);
        break;
      case 'vendor':
        cmp = a.vendor.localeCompare(b.vendor);
        break;
      case 'product_type':
        cmp = a.product_type.localeCompare(b.product_type);
        break;
      case 'variants':
        cmp = a.variants.length - b.variants.length;
        break;
      case 'price':
        cmp = priceForSort(a) - priceForSort(b);
        break;
      case 'updated_at':
        cmp = a.updated_at.localeCompare(b.updated_at);
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
  const pagination = document.getElementById('pagination') as HTMLDivElement;
  const filtered = getFilteredProducts();

  if (filtered.length === 0) {
    table.hidden = true;
    emptyState.hidden = false;
    pagination.hidden = true;
    return;
  }

  table.hidden = false;
  emptyState.hidden = true;

  const sorted = sortProducts(filtered);
  updateSortIndicators();

  const totalPages = Math.ceil(sorted.length / pageSize);
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const start = (currentPage - 1) * pageSize;
  const pageItems = sorted.slice(start, start + pageSize);

  const rows: string[] = [];
  for (const p of pageItems) {
    rows.push(renderProductRow(p));
    if (expandedIds.has(p.id)) {
      rows.push(renderDetailRow(p));
    }
  }
  tbody.innerHTML = rows.join('');

  // Update pagination controls
  const end = Math.min(start + pageSize, sorted.length);
  (document.getElementById('page-info') as HTMLSpanElement).textContent =
    `${start + 1}–${end} of ${sorted.length}`;
  (document.getElementById('prev-page') as HTMLButtonElement).disabled = currentPage <= 1;
  (document.getElementById('next-page') as HTMLButtonElement).disabled = currentPage >= totalPages;
  pagination.hidden = false;
}

function renderProductRow(p: Product): string {
  const isRemoved = !!p.removed_at;
  const isExpanded = expandedIds.has(p.id);
  const classes = [isRemoved ? 'removed-product' : '', isExpanded ? 'expanded' : ''].filter(Boolean).join(' ');
  const rowClass = classes ? ` class="${classes}"` : '';

  const thumb = p.images.length > 0
    ? `<img class="product-thumb" src="${escapeAttr(p.images[0].url)}" alt="${escapeAttr(p.images[0].alt ?? p.title)}">`
    : '<div class="thumb-placeholder">?</div>';

  const removedBadge = isRemoved ? '<span class="removed-badge">Removed</span>' : '';

  const relTime = formatRelativeTime(p.updated_at);
  const absTime = formatAbsoluteTime(p.updated_at);

  return `<tr data-product-id="${escapeAttr(p.id)}"${rowClass}>
    <td>${thumb}</td>
    <td><span class="product-title" data-action="toggle" data-id="${escapeAttr(p.id)}">${escapeHtml(p.title)}</span>${removedBadge}</td>
    <td>${escapeHtml(p.vendor)}</td>
    <td>${escapeHtml(p.product_type)}</td>
    <td>${p.variants.length}</td>
    <td>${escapeHtml(priceRange(p))}</td>
    <td title="${escapeAttr(absTime)}">${escapeHtml(relTime)}</td>
  </tr>`;
}

function renderDetailRow(p: Product): string {
  const variantsHtml = p.variants.length > 0
    ? `<table class="variant-table">
        <thead><tr>
          <th>Title</th><th>SKU</th><th>Price</th><th>Compare At</th>
        </tr></thead>
        <tbody>${p.variants.map((v) => `<tr>
          <td>${escapeHtml(v.title)}</td>
          <td>${escapeHtml(v.sku)}</td>
          <td>$${escapeHtml(v.price)}</td>
          <td>${v.compare_at_price ? '$' + escapeHtml(v.compare_at_price) : '—'}</td>
        </tr>`).join('')}</tbody>
      </table>`
    : '<p style="color:#888;font-size:13px;">No variants</p>';

  const imagesHtml = p.images.length > 0
    ? `<div class="image-gallery">${p.images.map((img) =>
        `<img src="${escapeAttr(img.url)}" alt="${escapeAttr(img.alt ?? p.title)}">`
      ).join('')}</div>`
    : '<p style="color:#888;font-size:13px;">No images</p>';

  const tagsHtml = p.tags.length > 0
    ? `<div class="tag-list">${p.tags.map((t) =>
        `<span class="tag">${escapeHtml(t)}</span>`
      ).join('')}</div>`
    : '';

  return `<tr class="detail-row" data-detail-for="${escapeAttr(p.id)}">
    <td colspan="7">
      <div class="detail-content">
        <div class="detail-section">
          <h3>Variants</h3>
          ${variantsHtml}
        </div>
        <div class="detail-section">
          <h3>Images</h3>
          ${imagesHtml}
          ${tagsHtml ? `<h3 style="margin-top:12px;">Tags</h3>${tagsHtml}` : ''}
        </div>
      </div>
    </td>
  </tr>`;
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

  currentPage = 1;
  renderTable();
}

function handleBodyClick(e: MouseEvent): void {
  const target = e.target as HTMLElement;

  // Toggle expand on product title click
  const titleEl = target.closest<HTMLElement>('[data-action="toggle"]');
  if (titleEl) {
    const id = titleEl.dataset['id'];
    if (id) {
      if (expandedIds.has(id)) {
        expandedIds.delete(id);
      } else {
        expandedIds.add(id);
      }
      renderTable();
    }
    return;
  }
}

function handleSearchInput(): void {
  const input = document.getElementById('search-input') as HTMLInputElement;
  searchQuery = input.value.trim();
  currentPage = 1;
  renderTable();
}

function handleShowRemovedToggle(): void {
  const checkbox = document.getElementById('show-removed') as HTMLInputElement;
  showRemoved = checkbox.checked;
  currentPage = 1;
  renderTable();
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function init(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const storefrontId = params.get('storefront');

  if (!storefrontId) {
    document.getElementById('page-title')!.textContent = 'Products — No storefront specified';
    getTable().hidden = true;
    getEmptyState().hidden = false;
    return;
  }

  const storefront = await getStorefront(storefrontId);
  const title = storefront ? storefront.domain : storefrontId;
  document.getElementById('page-title')!.textContent = `Products — ${title}`;
  document.title = `Products — ${title}`;

  allProducts = await getProductsByStorefront(storefrontId);
  renderTable();

  const table = getTable();
  const thead = table.querySelector('thead');
  if (thead) {
    thead.addEventListener('click', handleHeaderClick);
  }
  table.querySelector('tbody')!.addEventListener('click', handleBodyClick);

  document.getElementById('search-input')!.addEventListener('input', handleSearchInput);
  document.getElementById('show-removed')!.addEventListener('change', handleShowRemovedToggle);

  document.getElementById('page-size')!.addEventListener('change', (e) => {
    pageSize = parseInt((e.target as HTMLSelectElement).value, 10);
    currentPage = 1;
    renderTable();
  });
  document.getElementById('prev-page')!.addEventListener('click', () => {
    if (currentPage > 1) { currentPage--; renderTable(); }
  });
  document.getElementById('next-page')!.addEventListener('click', () => {
    currentPage++;
    renderTable();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  void init();
});
