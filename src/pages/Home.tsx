/** 首页：左侧会话导航 + 右侧聊天面板，路由 /chat/:sessionId */
import {
  Profiler,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import ChatPanel from '../components/chat/ChatPanel';
import ChatSessionNav from '../components/chat/ChatSessionNav';
import ConnectGithub from '../components/ConnectGithub';
import { useChatRouteSync } from '../hooks/useChatRouteSync';
import { useAuth } from '../hooks/useAuth';
import './Home.css';

const DESKTOP_NAV_COLLAPSED_KEY = 'chat.desktopNavCollapsed';
const MOBILE_NAV_OPEN_KEY = 'chat.mobileNavOpen';
const DESKTOP_MEDIA_QUERY = '(min-width: 1025px)';

const MemoizedChatPanel = memo(ChatPanel);

function readStoredBoolean(key: string, fallback = false) {
  if (typeof window === 'undefined') return fallback;
  const value = window.localStorage.getItem(key);
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

export default function Home() {
  const renderStart = performance.now();
  useChatRouteSync();
  const { isAuthenticated } = useAuth();
  const [sendingSessionId, setSendingSessionId] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(() =>
    readStoredBoolean(MOBILE_NAV_OPEN_KEY),
  );
  const [desktopNavCollapsed, setDesktopNavCollapsed] = useState(() =>
    readStoredBoolean(DESKTOP_NAV_COLLAPSED_KEY),
  );
  const [sidebarTransitionEnabled, setSidebarTransitionEnabled] =
    useState(false);
  const isDesktop = useMemo(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia(DESKTOP_MEDIA_QUERY).matches;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(MOBILE_NAV_OPEN_KEY, String(mobileNavOpen));
  }, [mobileNavOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      DESKTOP_NAV_COLLAPSED_KEY,
      String(desktopNavCollapsed),
    );
  }, [desktopNavCollapsed]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let frameId = window.requestAnimationFrame(() => {
      setSidebarTransitionEnabled(true);
    });

    const mediaQuery = window.matchMedia(DESKTOP_MEDIA_QUERY);
    const handleChange = (event: MediaQueryListEvent) => {
      setSidebarTransitionEnabled(false);
      setMobileNavOpen(false);
      if (!event.matches) {
        setDesktopNavCollapsed(readStoredBoolean(DESKTOP_NAV_COLLAPSED_KEY));
      }
      frameId = window.requestAnimationFrame(() => {
        setSidebarTransitionEnabled(true);
      });
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => {
      window.cancelAnimationFrame(frameId);
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  if (typeof window !== 'undefined') {
    const host = window as typeof window & {
      __SIDEBAR_SYNC_PROFILE__?: unknown[];
    };
    const bucket = (host.__SIDEBAR_SYNC_PROFILE__ ??= []);
    bucket.push({
      component: 'Home',
      phase: 'render-start',
      mobileNavOpen,
      desktopNavCollapsed,
      ts: renderStart,
    });
  }

  const onRenderProfiler = useCallback(
    (
      id: string,
      phase: 'mount' | 'update' | 'nested-update',
      actualDuration: number,
      baseDuration: number,
      startTime: number,
      commitTime: number,
    ) => {
      if (typeof window === 'undefined') return;
      const host = window as typeof window & {
        __SIDEBAR_PROFILE__?: unknown[];
      };
      const bucket = (host.__SIDEBAR_PROFILE__ ??= []);
      bucket.push({
        id,
        phase,
        actualDuration,
        baseDuration,
        startTime,
        commitTime,
        ts: performance.now(),
        mobileNavOpen,
        desktopNavCollapsed,
      });
    },
    [mobileNavOpen, desktopNavCollapsed],
  );

  const handleDesktopToggle = useCallback(() => {
    setDesktopNavCollapsed((prev) => !prev);
  }, []);

  const handleMobileOpen = useCallback(() => {
    performance.mark('sidebar-open-click-start');
    setMobileNavOpen(true);
  }, []);

  const handleMobileClose = useCallback(() => {
    performance.mark('sidebar-close-click-start');
    setMobileNavOpen(false);
  }, []);

  if (!isAuthenticated) {
    return <ConnectGithub />;
  }

  return (
    <Profiler id="Home" onRender={onRenderProfiler}>
      <div
        className={`home${mobileNavOpen ? ' home--mobile-nav-open' : ''}${desktopNavCollapsed ? ' home--desktop-nav-collapsed' : ''}${sidebarTransitionEnabled ? ' home--sidebar-transition-enabled' : ''}`}
      >
        <Profiler id="ChatSessionNav" onRender={onRenderProfiler}>
          <ChatSessionNav
            sendingSessionId={sendingSessionId}
            mobileOpen={mobileNavOpen}
            desktopCollapsed={desktopNavCollapsed}
            onDesktopToggle={handleDesktopToggle}
            onMobileClose={handleMobileClose}
          />
        </Profiler>
        <Profiler id="ChatPanel" onRender={onRenderProfiler}>
          <MemoizedChatPanel
            onSendingChange={setSendingSessionId}
            onOpenSessions={handleMobileOpen}
          />
        </Profiler>
      </div>
    </Profiler>
  );
}
