import { useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { PanelLeft, PanelRightClose, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Empty } from '@/ui/empty';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/ui/sheet';
import { WORKSPACE_MOBILE_QUERY } from '@/hooks/useWorkspaceSidebar';
import './workspace.css';
interface WorkspaceSidebarProps {
    mobileTriggerRef?: import('react').RefObject<HTMLButtonElement | null>;
    title: string;
    newLabel: string;
    mobileOpen: boolean;
    desktopCollapsed: boolean;
    onDesktopToggle?: () => void;
    onMobileClose?: () => void;
    onNew: () => void;
    children: ReactNode;
}
export function WorkspaceSidebar({ mobileTriggerRef, title, newLabel, mobileOpen, desktopCollapsed, onDesktopToggle, onMobileClose, onNew, children }: WorkspaceSidebarProps) {
    const [isMobile, setIsMobile] = useState(() => window.matchMedia(WORKSPACE_MOBILE_QUERY).matches);
    useEffect(() => {
        const media = window.matchMedia(WORKSPACE_MOBILE_QUERY);
        const update = () => { setIsMobile(media.matches); if (!media.matches)
            onMobileClose?.(); };
        media.addEventListener('change', update);
        return () => media.removeEventListener('change', update);
    }, [onMobileClose]);
    const content = <><Button variant="outline" className={cn('mb-3 w-full justify-start', !isMobile && desktopCollapsed && 'justify-center px-0')} onClick={onNew} aria-label={newLabel}><Plus size={16}/>{(isMobile || !desktopCollapsed) && newLabel}</Button>{children}</>;
    if (isMobile)
        return <Sheet open={mobileOpen} onOpenChange={(open) => { if (!open)
            onMobileClose?.(); }}><SheetContent id="workspace-session-sidebar" onCloseAutoFocus={(event) => {
                event.preventDefault();
                if (window.matchMedia(WORKSPACE_MOBILE_QUERY).matches) mobileTriggerRef?.current?.focus();
            }}><div className="border-b border-border px-4 py-5"><SheetTitle className="text-sm font-semibold">{title}</SheetTitle><SheetDescription className="sr-only">选择会话或新建会话</SheetDescription></div><div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">{content}</div></SheetContent></Sheet>;
    return <aside id="workspace-session-sidebar" className={cn('session-nav', desktopCollapsed && 'session-nav--desktop-collapsed')} aria-label={title}><div className="mb-3 flex justify-end"><Button variant="ghost" size="icon" onClick={onDesktopToggle} aria-label={desktopCollapsed ? '展开侧边栏' : '收起侧边栏'}>{desktopCollapsed ? <PanelLeft size={18}/> : <PanelRightClose size={18}/>}</Button></div>{content}</aside>;
}
export function WorkspaceHeader({ className, ...props }: ComponentProps<'header'>) { return <header className={cn('chat__header', className)} {...props}/>; }
// Keep the actual div and its ref: history pagination and SSE following use its scroll metrics.
export function WorkspaceMessages({ className, ...props }: ComponentProps<'div'>) { return <div className={cn('chat__messages', className)} {...props}/>; }
export function WorkspaceComposer({ className, ...props }: ComponentProps<'form'>) { return <form className={cn('chat__form', className)} {...props}/>; }
export function WorkspaceEmpty({ title, description, icon }: {
    title: string;
    description: string;
    icon: ReactNode;
}) {
    return <Empty className="chat__empty" icon={icon} description={description}><h2 className="order-first text-lg font-semibold text-foreground">{title}</h2></Empty>;
}
export function WorkspaceError({ className, ...props }: ComponentProps<'div'>) { return <div role="alert" className={cn('chat__error', className)} {...props}/>; }
export function WorkspaceConfirmCard({ children, ...props }: ComponentProps<typeof Card>) { return <Card {...props}>{children}</Card>; }
export function WorkspaceSessionRow({ children, deleteAction }: {
    children: ReactNode;
    deleteAction?: ReactNode;
}) {
    return <div className="session-nav__row">
        {children}
        {deleteAction}
    </div>;
}
