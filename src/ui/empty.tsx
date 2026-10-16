import { Inbox } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';
export interface EmptyProps extends ComponentProps<'div'> {
    description?: ReactNode;
    icon?: ReactNode;
}
export function Empty({ className, description = '暂无数据', icon = <Inbox className="size-8"/>, children, ...props }: EmptyProps) {
    return <div className={cn('flex flex-col items-center justify-center gap-3 rounded-lg p-8 text-center text-sm text-muted-foreground', className)} {...props}>{icon}{description && <p>{description}</p>}{children}</div>;
}
