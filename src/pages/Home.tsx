/** 首页：左侧会话导航 + 右侧聊天面板，路由 /chat/:sessionId */
import { useState } from 'react';
import ChatPanel from '../components/chat/ChatPanel';
import ChatSessionNav from '../components/chat/ChatSessionNav';
import ConnectGithub from '../components/ConnectGithub';
import { useChatRouteSync } from '../hooks/useChatRouteSync';
import { useAuth } from '../hooks/useAuth';
import './Home.css';

export default function Home() {
  useChatRouteSync();
  const { isAuthenticated } = useAuth();
  const [sendingSessionId, setSendingSessionId] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [desktopNavCollapsed, setDesktopNavCollapsed] = useState(false);

  if (!isAuthenticated) {
    return <ConnectGithub />;
  }

  return (
    <div
      className={`home${mobileNavOpen ? ' home--mobile-nav-open' : ''}${desktopNavCollapsed ? ' home--desktop-nav-collapsed' : ''}`}
    >
      <ChatSessionNav
        sendingSessionId={sendingSessionId}
        mobileOpen={mobileNavOpen}
        desktopCollapsed={desktopNavCollapsed}
        onDesktopToggle={() => setDesktopNavCollapsed((prev) => !prev)}
        onMobileToggle={() => setMobileNavOpen((prev) => !prev)}
        onMobileClose={() => setMobileNavOpen(false)}
      />
      <ChatPanel onSendingChange={setSendingSessionId} />
    </div>
  );
}
