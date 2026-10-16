import * as Primitive from '@radix-ui/react-popover';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
export const Popover = Primitive.Root;
export const PopoverTrigger = Primitive.Trigger;
export const PopoverClose = Primitive.Close;
export function PopoverContent({ className, align = 'start', sideOffset = 4, ...props }: ComponentProps<typeof Primitive.Content>) {
    return <Primitive.Portal><Primitive.Content align={align} sideOffset={sideOffset} className={cn('ui-popover z-[85] w-80 rounded-md border border-border bg-popover p-4 text-popover-foreground shadow-md outline-none', className)} {...props}/></Primitive.Portal>;
}
