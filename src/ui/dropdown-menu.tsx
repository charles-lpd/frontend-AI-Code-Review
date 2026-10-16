import * as Primitive from '@radix-ui/react-dropdown-menu';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
export const DropdownMenu = Primitive.Root;
export const DropdownMenuTrigger = Primitive.Trigger;
export function DropdownMenuContent({ className, sideOffset = 4, ...props }: ComponentProps<typeof Primitive.Content>) { return <Primitive.Portal><Primitive.Content sideOffset={sideOffset} className={cn('ui-popover z-[85] min-w-40 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md', className)} {...props}/></Primitive.Portal>; }
export function DropdownMenuItem({ className, ...props }: ComponentProps<typeof Primitive.Item>) { return <Primitive.Item className={cn('flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50', className)} {...props}/>; }
export function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof Primitive.Separator>) { return <Primitive.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props}/>; }
