import { useState, type ReactElement } from 'react';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogCancel, AlertDialogAction } from '@/ui/alert-dialog';
import { toast } from 'sonner';
interface ConfirmActionProps {
    children: ReactElement;
    title: string;
    description?: string;
    onConfirm: () => void | Promise<void>;
}
export function ConfirmAction({ children, title, description = '此操作无法撤销，请确认后继续。', onConfirm }: ConfirmActionProps) {
    const [open, setOpen] = useState(false);
    const [pending, setPending] = useState(false);
    return <AlertDialog open={open} onOpenChange={(value) => { if (!pending)
        setOpen(value); }}><AlertDialogTrigger asChild>{children}</AlertDialogTrigger><AlertDialogContent><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{description}</AlertDialogDescription><div className="flex justify-end gap-2"><AlertDialogCancel disabled={pending}>取消</AlertDialogCancel><AlertDialogAction disabled={pending} onClick={async (event) => {
            event.preventDefault();
            if (pending)
                return;
            setPending(true);
            try {
                await onConfirm();
                setOpen(false);
            }
            catch (error) {
                toast.error(error instanceof Error ? error.message : '操作失败，请重试');
            }
            finally {
                setPending(false);
            }
        }}>{pending ? '处理中...' : '确认'}</AlertDialogAction></div></AlertDialogContent></AlertDialog>;
}
