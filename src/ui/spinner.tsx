import { LoaderCircle } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
export function Spinner({ className, ...props }: ComponentProps<'span'>) {
    return <span role="status" className={cn('inline-flex items-center justify-center', className)} {...props}><LoaderCircle className="size-5 animate-spin"/><span className="sr-only">加载中</span></span>;
}
