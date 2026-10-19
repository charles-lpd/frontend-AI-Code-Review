import { useCallback, useEffect, useRef, useState } from 'react';
import { GitBranch, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/ui/dialog';
import { Button } from '@/ui/button';
import { BACKEND_API_BASE_URL } from '../constants';
import { useAuthStore } from '../store/useAuthStore';
import { useLoginDialogStore } from '../store/useLoginDialogStore';
import { AUTH_MESSAGE_TYPE, LOGIN_POPUP_NAME } from '../lib/loginPopup';
import './LoginDialog.css';

/** zustand persist 写入 localStorage 的 key，授权窗口登录后会写入这里 */
const AUTH_STORAGE_KEY = 'everpay-auth-storage';
const POPUP_WIDTH = 600;
const POPUP_HEIGHT = 720;

/** 直接从 localStorage 读取持久化的 token（与 zustand persist 的存储格式一致） */
function readStoredToken(): string | null {
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    const token = raw ? JSON.parse(raw)?.state?.token : null;
    return typeof token === 'string' && token ? token : null;
  } catch {
    return null;
  }
}

type Phase = 'idle' | 'waiting' | 'blocked' | 'cancelled';

/**
 * 登录弹窗：点击登录后弹出；在弹出的 GitHub 授权窗口里完成授权，
 * 拿到新的 token（相对于打开弹窗时）后弹窗自动关闭。
 * 注意：不能用 isAuthenticated 判断成功，否则站内已登录、仅 GitHub 授权失效时弹窗会立刻关闭。
 */
export default function LoginDialog() {
  const open = useLoginDialogStore((s) => s.open);
  const setOpen = useLoginDialogStore((s) => s.setOpen);
  const token = useAuthStore((s) => s.token);
  const setToken = useAuthStore((s) => s.setToken);
  const [phase, setPhase] = useState<Phase>('idle');
  const popupRef = useRef<Window | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const tokenAtOpenRef = useRef<string | null>(null);

  const stopWatching = useCallback(() => {
    window.clearInterval(timerRef.current);
    timerRef.current = undefined;
  }, []);

  const close = useCallback(() => {
    stopWatching();
    popupRef.current?.close();
    popupRef.current = null;
    setPhase('idle');
    setOpen(false);
  }, [setOpen, stopWatching]);

  // 记录打开弹窗时的 token（必须排在下面的关闭判断之前执行）
  useEffect(() => {
    if (open) tokenAtOpenRef.current = useAuthStore.getState().token;
  }, [open]);

  // 登录成功：token 变为与打开时不同的新值，即关闭弹窗（无论来自 postMessage 还是 storage）
  useEffect(() => {
    if (open && token && token !== tokenAtOpenRef.current) close();
  }, [open, token, close]);

  // 1) 授权窗口回调页通过 postMessage 交回 token
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || data.type !== AUTH_MESSAGE_TYPE || typeof data.token !== 'string') return;
      setToken(data.token);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [setToken]);

  // 2) 兜底：授权窗口与主页面同源，写入 localStorage 会触发 storage 事件
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== AUTH_STORAGE_KEY || !event.newValue) return;
      try {
        const token = JSON.parse(event.newValue)?.state?.token;
        if (typeof token === 'string' && token) setToken(token);
      } catch {
        // 忽略无法解析的内容
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [setToken]);

  // 3) 主动轮询：对话框打开期间定时读取 localStorage 中的 token。
  // 不依赖 postMessage / storage 事件是否送达（浏览器的跨站 opener 限制可能导致事件丢失）。
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => {
      const stored = readStoredToken();
      if (stored && stored !== tokenAtOpenRef.current && stored !== useAuthStore.getState().token) {
        setToken(stored);
      }
    }, 500);
    return () => window.clearInterval(id);
  }, [open, setToken]);

  // 卸载时清理轮询
  useEffect(() => stopWatching, [stopWatching]);

  const startLogin = () => {
    const url = `${BACKEND_API_BASE_URL}/github/auth/login`;
    const left = window.screenX + (window.outerWidth - POPUP_WIDTH) / 2;
    const top = window.screenY + (window.outerHeight - POPUP_HEIGHT) / 2;
    const popup = window.open(
      url,
      LOGIN_POPUP_NAME,
      `width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${left},top=${top}`,
    );

    if (!popup) {
      setPhase('blocked');
      return;
    }

    popupRef.current?.close();
    popupRef.current = popup;
    setPhase('waiting');

    // 授权窗口被用户关掉且仍未登录，视为取消
    stopWatching();
    timerRef.current = window.setInterval(() => {
      if (!popup.closed) return;
      stopWatching();
      popupRef.current = null;
      if (useAuthStore.getState().token === tokenAtOpenRef.current) setPhase('cancelled');
    }, 500);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogContent className="login-dialog">
        <DialogHeader>
          <DialogTitle>登录</DialogTitle>
          <DialogDescription>
            使用 GitHub 账号登录。将打开 GitHub 授权窗口，授权完成后此弹窗会自动关闭。
          </DialogDescription>
        </DialogHeader>

        <div className="login-dialog__body">
          {phase === 'waiting' && (
            <div className="login-dialog__status">
              <Loader2 size={16} className="animate-spin" />
              <span>等待 GitHub 授权完成…</span>
            </div>
          )}
          {phase === 'blocked' && (
            <p className="login-dialog__error">浏览器拦截了授权窗口，请允许本站弹窗后重试。</p>
          )}
          {phase === 'cancelled' && (
            <p className="login-dialog__error">授权窗口已关闭，未完成登录。</p>
          )}

          <Button onClick={startLogin} className="login-dialog__button">
            <GitBranch size={18} />
            <span>{phase === 'waiting' ? '重新打开授权窗口' : '使用 GitHub 登录'}</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
