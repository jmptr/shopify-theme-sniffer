import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';
import { statusLabel } from '../../lib/format';
import type { BackupStatus } from '../../types';

const statusClasses: Record<BackupStatus, string> = {
  complete: 'bg-green-100 text-green-800',
  partial: 'bg-amber-100 text-amber-800',
  'in-progress': 'bg-blue-100 text-blue-800',
  paused: 'bg-gray-200 text-gray-600',
  never: 'bg-gray-100 text-gray-500',
};

export function StatusBadge({ status }: { status: BackupStatus }) {
  return (
    <Badge className={cn('font-semibold', statusClasses[status])}>{statusLabel(status)}</Badge>
  );
}
