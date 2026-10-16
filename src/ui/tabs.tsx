import * as Primitive from '@radix-ui/react-tabs';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
export const Tabs = Primitive.Root;
export function TabsList({ className, ...props }: ComponentProps<typeof Primitive.List>) { return <Primitive.List className={cn('inline-flex h-9 items-center gap-1 rounded-lg bg-muted p-1 text-muted-foreground', className)} {...props}/>; }
export function TabsTrigger({ className, ...props }: ComponentProps<typeof Primitive.Trigger>) { return <Primitive.Trigger className={cn('inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm', className)} {...props}/>; }
export function TabsContent({ className, ...props }: ComponentProps<typeof Primitive.Content>) { return <Primitive.Content className={cn('mt-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', className)} {...props}/>; }
