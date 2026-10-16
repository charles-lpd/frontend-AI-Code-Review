import * as Primitive from '@radix-ui/react-tooltip';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
export const TooltipProvider = Primitive.Provider;
export const Tooltip = Primitive.Root;
export const TooltipTrigger = Primitive.Trigger;
export function TooltipContent({ className, sideOffset = 4, ...props }: ComponentProps<typeof Primitive.Content>) { return <Primitive.Portal><Primitive.Content sideOffset={sideOffset} className={cn('z-[100] rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground shadow-md', className)} {...props}/></Primitive.Portal>; }
