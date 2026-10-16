import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
export function Textarea({ className, rows, ...props }: ComponentProps<'textarea'>) {
    return <textarea rows={rows} className={cn('flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50', rows === 1 ? 'min-h-9' : 'min-h-20', className)} {...props}/>;
}
