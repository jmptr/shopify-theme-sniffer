import type { Product } from '../types';

export function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

export function formatRelativeTime(isoString: string | null): string {
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

export function formatAbsoluteTime(isoString: string | null): string {
  if (!isoString) return '';
  return new Date(isoString).toLocaleString();
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

export function priceRange(product: Product): string {
  if (product.variants.length === 0) return '\u2014';

  const prices = product.variants.map((v) => parseFloat(v.price)).filter((p) => !isNaN(p));

  if (prices.length === 0) return '\u2014';

  const min = Math.min(...prices);
  const max = Math.max(...prices);

  if (min === max) return `$${min.toFixed(2)}`;
  return `$${min.toFixed(2)} \u2013 $${max.toFixed(2)}`;
}

export function priceForSort(product: Product): number {
  if (product.variants.length === 0) return 0;
  const prices = product.variants.map((v) => parseFloat(v.price)).filter((p) => !isNaN(p));
  return prices.length > 0 ? Math.min(...prices) : 0;
}

export function statusLabel(status: string): string {
  switch (status) {
    case 'complete':
      return 'Complete';
    case 'partial':
      return 'Partial';
    case 'in-progress':
      return 'In Progress';
    case 'paused':
      return 'Paused';
    case 'never':
      return 'Never';
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}
