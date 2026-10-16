import * as Primitive from '@radix-ui/react-alert-dialog';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
import { buttonVariants } from './button';
export const AlertDialog = Primitive.Root;
export const AlertDialogTrigger = Primitive.Trigger;
export function AlertDialogContent({ className, ...props }: ComponentProps<typeof Primitive.Content>) {
    return <Primitive.Portal><Primitive.Overlay className="ui-overlay fixed inset-0 z-[90] bg-black/50"/><Primitive.Content className={cn('ui-dialog fixed left-1/2 top-1/2 z-[91] grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-border bg-background p-6 text-foreground shadow-lg outline-none', className)} {...props}/></Primitive.Portal>;
}
export function AlertDialogTitle({ className, ...props }: ComponentProps<typeof Primitive.Title>) { return <Primitive.Title className={cn('text-lg font-semibold', className)} {...props}/>; }
export function AlertDialogDescription({ className, ...props }: ComponentProps<typeof Primitive.Description>) { return <Primitive.Description className={cn('text-sm text-muted-foreground', className)} {...props}/>; }
export function AlertDialogCancel({ className, ...props }: ComponentProps<typeof Primitive.Cancel>) { return <Primitive.Cancel className={cn(buttonVariants({ variant: 'outline' }), className)} {...props}/>; }
export function AlertDialogAction({ className, ...props }: ComponentProps<typeof Primitive.Action>) { return <Primitive.Action className={cn(buttonVariants({ variant: 'destructive' }), className)} {...props}/>; }
