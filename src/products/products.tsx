import React, { useState, useEffect, useMemo, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import { getStorefront, getProductsByStorefront } from '../db';
import type { Product, ProductVariant, ProductImage } from '../types';
import { formatRelativeTime, formatAbsoluteTime, priceRange, priceForSort } from '../lib/format';
import { Input } from '../components/ui/input';
import { Checkbox } from '../components/ui/checkbox';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../components/ui/table';
import { SortableHeader } from '../components/shared/SortableHeader';
import { EmptyState } from '../components/shared/EmptyState';
import { ProductImageCarousel } from '../components/shared/ProductImageCarousel';

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
// Detail Row Components
// ---------------------------------------------------------------------------

function VariantTable({ variants }: { variants: ProductVariant[] }) {
  if (variants.length === 0) {
    return <p className="text-gray-400 text-[13px]">No variants</p>;
  }

  return (
    <table className="w-full border-collapse text-[13px] bg-white rounded overflow-hidden">
      <thead>
        <tr>
          <th className="px-2.5 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 bg-gray-100 border-b border-gray-200">
            Title
          </th>
          <th className="px-2.5 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 bg-gray-100 border-b border-gray-200">
            SKU
          </th>
          <th className="px-2.5 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 bg-gray-100 border-b border-gray-200">
            Price
          </th>
          <th className="px-2.5 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 bg-gray-100 border-b border-gray-200">
            Compare At
          </th>
        </tr>
      </thead>
      <tbody>
        {variants.map((v) => (
          <tr key={v.id} className="border-b border-gray-100">
            <td className="px-2.5 py-1.5">{v.title}</td>
            <td className="px-2.5 py-1.5">{v.sku}</td>
            <td className="px-2.5 py-1.5">${v.price}</td>
            <td className="px-2.5 py-1.5">
              {v.compare_at_price ? `$${v.compare_at_price}` : '\u2014'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ImageGallery({ images, productTitle }: { images: ProductImage[]; productTitle: string }) {
  return <ProductImageCarousel images={images} productTitle={productTitle} />;
}

function TagList({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-block px-2 py-0.5 rounded-full text-[11px] bg-gray-200 text-gray-700"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

function DetailRow({ product }: { product: Product }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={7} className="p-0 px-3.5 pb-3.5 bg-gray-50 border-b-2 border-gray-200">
        <div className="flex gap-6">
          <div className="flex-1 min-w-0">
            <h3 className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">
              Variants
            </h3>
            <VariantTable variants={product.variants} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">
              Images
            </h3>
            <ImageGallery images={product.images} productTitle={product.title} />
            {product.tags.length > 0 && (
              <>
                <h3 className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2 mt-3">
                  Tags
                </h3>
                <TagList tags={product.tags} />
              </>
            )}
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// Product Row
// ---------------------------------------------------------------------------

function ProductRow({
  product,
  isExpanded,
  onToggleExpand,
}: {
  product: Product;
  isExpanded: boolean;
  onToggleExpand: (id: string) => void;
}) {
  const isRemoved = !!product.removed_at;
  const thumb = product.images.length > 0 ? product.images[0] : null;

  return (
    <>
      <TableRow className={isExpanded ? 'bg-blue-50/60 hover:bg-blue-50/60' : ''}>
        <TableCell className="w-14">
          {thumb ? (
            <img
              src={thumb.url}
              alt={thumb.alt ?? product.title}
              className="w-10 h-10 object-cover rounded bg-gray-100"
            />
          ) : (
            <div className="w-10 h-10 rounded bg-gray-200 flex items-center justify-center text-gray-400 text-base">
              ?
            </div>
          )}
        </TableCell>
        <TableCell className={isRemoved ? 'text-gray-400' : ''}>
          <span
            className={`font-medium cursor-pointer hover:text-blue-600 ${
              isRemoved ? 'line-through text-gray-400' : 'text-gray-900'
            }`}
            onClick={() => onToggleExpand(product.id)}
          >
            {product.title}
          </span>
          {isRemoved && (
            <Badge variant="destructive" className="ml-1.5">
              Removed
            </Badge>
          )}
        </TableCell>
        <TableCell className={isRemoved ? 'text-gray-400' : ''}>{product.vendor}</TableCell>
        <TableCell className={isRemoved ? 'text-gray-400' : ''}>{product.product_type}</TableCell>
        <TableCell className={isRemoved ? 'text-gray-400' : ''}>
          {product.variants.length}
        </TableCell>
        <TableCell className={isRemoved ? 'text-gray-400' : ''}>{priceRange(product)}</TableCell>
        <TableCell
          className={isRemoved ? 'text-gray-400' : ''}
          title={formatAbsoluteTime(product.updated_at)}
        >
          {formatRelativeTime(product.updated_at)}
        </TableCell>
      </TableRow>
      {isExpanded && <DetailRow product={product} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main App
// ---------------------------------------------------------------------------

function ProductsApp() {
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [domain, setDomain] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [sortState, setSortState] = useState<SortState>({ column: 'title', direction: 'asc' });
  const [searchQuery, setSearchQuery] = useState('');
  const [showRemoved, setShowRemoved] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Load data on mount
  useEffect(() => {
    async function loadData() {
      const params = new URLSearchParams(window.location.search);
      const storefrontId = params.get('storefront');

      if (!storefrontId) {
        setDomain('No storefront specified');
        setLoading(false);
        return;
      }

      const storefront = await getStorefront(storefrontId);
      const title = storefront ? storefront.domain : storefrontId;
      setDomain(title);
      document.title = `Products \u2014 ${title}`;

      const products = await getProductsByStorefront(storefrontId);
      setAllProducts(products);
      setLoading(false);
    }

    void loadData();
  }, []);

  // Filter
  const filteredProducts = useMemo(() => {
    let list = allProducts;

    if (!showRemoved) {
      list = list.filter((p) => !p.removed_at);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.vendor.toLowerCase().includes(q) ||
          p.product_type.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    return list;
  }, [allProducts, showRemoved, searchQuery]);

  // Sort
  const sortedProducts = useMemo(() => {
    const { column, direction } = sortState;
    const sorted = [...filteredProducts];
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
  }, [filteredProducts, sortState]);

  // Paginate
  const { pageItems, totalPages, start, end } = useMemo(() => {
    const total = sortedProducts.length;
    const tp = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(currentPage, tp);
    const s = (safePage - 1) * pageSize;
    const e = Math.min(s + pageSize, total);
    return {
      pageItems: sortedProducts.slice(s, e),
      totalPages: tp,
      start: s,
      end: e,
    };
  }, [sortedProducts, pageSize, currentPage]);

  // Clamp current page when filtered data shrinks
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  // Handlers
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
    setCurrentPage(1);
  }, []);

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value.trim());
    setCurrentPage(1);
  }, []);

  const handleShowRemovedChange = useCallback((checked: boolean | 'indeterminate') => {
    setShowRemoved(checked === true);
    setCurrentPage(1);
  }, []);

  const handlePageSizeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setPageSize(parseInt(e.target.value, 10));
    setCurrentPage(1);
  }, []);

  if (loading) {
    return (
      <div className="bg-gray-100 min-h-screen p-6">
        <p className="text-gray-500 text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-100 min-h-screen p-6">
      {/* Header */}
      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <a
            href="../dashboard/dashboard.html"
            className="text-blue-600 text-sm no-underline hover:underline"
          >
            &larr; Dashboard
          </a>
          <h1 className="text-xl font-semibold text-gray-900">Products &mdash; {domain}</h1>
        </div>
      </header>

      {/* Toolbar */}
      <div className="flex items-center gap-4 mb-4">
        <Input
          placeholder="Search products..."
          className="flex-1 max-w-[360px]"
          onChange={handleSearchChange}
        />
        <label className="flex items-center gap-1.5 text-[13px] text-gray-600 cursor-pointer select-none">
          <Checkbox checked={showRemoved} onCheckedChange={handleShowRemovedChange} />
          Show removed
        </label>
      </div>

      {/* Table or Empty State */}
      {filteredProducts.length === 0 ? (
        <EmptyState message="No products found." />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14">Image</TableHead>
                <SortableHeader
                  column="title"
                  label="Title"
                  sortColumn={sortState.column}
                  sortDirection={sortState.direction}
                  onSort={handleSort}
                />
                <SortableHeader
                  column="vendor"
                  label="Vendor"
                  sortColumn={sortState.column}
                  sortDirection={sortState.direction}
                  onSort={handleSort}
                />
                <SortableHeader
                  column="product_type"
                  label="Type"
                  sortColumn={sortState.column}
                  sortDirection={sortState.direction}
                  onSort={handleSort}
                />
                <SortableHeader
                  column="variants"
                  label="Variants"
                  sortColumn={sortState.column}
                  sortDirection={sortState.direction}
                  onSort={handleSort}
                />
                <SortableHeader
                  column="price"
                  label="Price"
                  sortColumn={sortState.column}
                  sortDirection={sortState.direction}
                  onSort={handleSort}
                />
                <SortableHeader
                  column="updated_at"
                  label="Updated"
                  sortColumn={sortState.column}
                  sortDirection={sortState.direction}
                  onSort={handleSort}
                />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((product) => (
                <ProductRow
                  key={product.id}
                  product={product}
                  isExpanded={expandedIds.has(product.id)}
                  onToggleExpand={handleToggleExpand}
                />
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
              {sortedProducts.length > 0
                ? `${start + 1}\u2013${end} of ${sortedProducts.length}`
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

ReactDOM.createRoot(document.getElementById('root')!).render(<ProductsApp />);
