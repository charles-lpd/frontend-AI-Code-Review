/** 首页：左侧会话导航 + 右侧聊天面板，路由 /chat/:sessionId */
import { Profiler, useCallback, useState } from 'react';

import ChatPanel from '../components/chat/ChatPanel';
import ChatSessionNav from '../components/chat/ChatSessionNav';
import ConnectGithub from '../components/ConnectGithub';
import { useChatRouteSync } from '../hooks/useChatRouteSync';
import { useAuth } from '../hooks/useAuth';
import './Home.css';

export default function Home() {
  const renderStart = performance.now();
  useChatRouteSync();
  const { isAuthenticated } = useAuth();
  const [sendingSessionId, setSendingSessionId] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [desktopNavCollapsed, setDesktopNavCollapsed] = useState(false);

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
        className={`home${mobileNavOpen ? ' home--mobile-nav-open' : ''}${desktopNavCollapsed ? ' home--desktop-nav-collapsed' : ''}`}
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
          <ChatPanel
            onSendingChange={setSendingSessionId}
            onOpenSessions={handleMobileOpen}
          />
        </Profiler>
      </div>
    </Profiler>
  );
}
