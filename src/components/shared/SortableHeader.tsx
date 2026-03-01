import { cn } from '../../lib/utils';
import { TableHead } from '../ui/table';

interface SortableHeaderProps {
  column: string;
  label: string;
  sortColumn: string;
  sortDirection: 'asc' | 'desc';
  onSort: (column: string) => void;
  className?: string;
}

export function SortableHeader({ column, label, sortColumn, sortDirection, onSort, className }: SortableHeaderProps) {
  const isActive = sortColumn === column;

  return (
    <TableHead
      className={cn('cursor-pointer select-none hover:bg-gray-100 pr-6 relative', className)}
      onClick={() => onSort(column)}
    >
      {label}
      {isActive && (
        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-500">
          {sortDirection === 'asc' ? '\u25B2' : '\u25BC'}
        </span>
      )}
    </TableHead>
  );
}
