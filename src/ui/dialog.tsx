import * as Primitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
export const Dialog = Primitive.Root;
export const DialogTrigger = Primitive.Trigger;
export const DialogClose = Primitive.Close;
export function DialogContent({ className, children, ...props }: ComponentProps<typeof Primitive.Content>) {
    return <Primitive.Portal><Primitive.Overlay className="ui-overlay fixed inset-0 z-[80] bg-black/50"/><Primitive.Content className={cn('ui-dialog fixed left-1/2 top-1/2 z-[81] grid max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-lg border border-border bg-background p-6 text-foreground shadow-lg focus:outline-none', className)} {...props}>{children}<Primitive.Close className="absolute right-4 top-4 rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X className="size-4"/><span className="sr-only">关闭</span></Primitive.Close></Primitive.Content></Primitive.Portal>;
}
export function DialogTitle({ className, ...props }: ComponentProps<typeof Primitive.Title>) {
    return <Primitive.Title className={cn('pr-6 text-lg font-semibold', className)} {...props}/>;
}
export function DialogDescription({ className, ...props }: ComponentProps<typeof Primitive.Description>) {
    return <Primitive.Description className={cn('text-sm text-muted-foreground', className)} {...props}/>;
}
export function DialogHeader({ className, ...props }: ComponentProps<'div'>) { return <div className={cn('flex flex-col gap-2', className)} {...props}/>; }
export function DialogFooter({ className, ...props }: ComponentProps<'div'>) { return <div className={cn('flex justify-end gap-2', className)} {...props}/>; }
