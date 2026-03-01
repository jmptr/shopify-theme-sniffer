import * as React from 'react';
import { cn } from '../../lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline';
}

const variantClasses: Record<string, string> = {
  default: 'bg-green-100 text-green-800',
  secondary: 'bg-gray-100 text-gray-600',
  destructive: 'bg-red-100 text-red-800',
  outline: 'border border-gray-300 text-gray-600',
};

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}

export { Badge };
