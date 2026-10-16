import * as Primitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
export const Sheet = Primitive.Root;
export const SheetTrigger = Primitive.Trigger;
export const SheetClose = Primitive.Close;
export const SheetTitle = Primitive.Title;
export const SheetDescription = Primitive.Description;
export interface SheetContentProps extends ComponentProps<typeof Primitive.Content> {
    side?: 'left' | 'right';
}
export function SheetContent({ className, children, side = 'left', ...props }: SheetContentProps) {
    return <Primitive.Portal><Primitive.Overlay className="ui-overlay fixed inset-0 z-[70] bg-black/50"/><Primitive.Content data-side={side} className={cn('ui-sheet fixed inset-y-0 z-[71] flex h-dvh w-[min(20rem,85vw)] flex-col border-border bg-background text-foreground shadow-lg outline-none', side === 'left' ? 'left-0 border-r' : 'right-0 border-l', className)} {...props}>{children}<Primitive.Close className="absolute right-4 top-4 rounded-sm p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"><X className="size-4"/><span className="sr-only">关闭</span></Primitive.Close></Primitive.Content></Primitive.Portal>;
}
