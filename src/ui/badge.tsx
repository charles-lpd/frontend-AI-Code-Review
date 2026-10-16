import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
const badgeVariants = cva('inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium', {
    variants: { variant: {
            default: 'border-transparent bg-primary text-primary-foreground',
            secondary: 'border-transparent bg-secondary text-secondary-foreground',
            outline: 'border-border text-foreground',
            destructive: 'border-transparent bg-destructive/10 text-destructive',
            success: 'border-transparent bg-success/10 text-success',
            warning: 'border-transparent bg-warning/10 text-warning',
            info: 'border-transparent bg-info/10 text-info',
        } }, defaultVariants: { variant: 'secondary' },
});
export interface BadgeProps extends ComponentProps<'span'>, VariantProps<typeof badgeVariants> {
}
export function Badge({ className, variant, ...props }: BadgeProps) {
    return <span className={cn(badgeVariants({ variant }), className)} {...props}/>;
}
