/**
 * 会话导航：通过 /chat/:sessionId 切换会话
 */
import { memo, useCallback, type MouseEvent } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { PanelLeft, PanelRightClose, Plus, X } from 'lucide-react';
import { useChatStore } from '../../store/useChatStore';
import './ChatSessionNav.css';

interface ChatSessionNavProps {
  sendingSessionId?: string | null;
  mobileOpen?: boolean;
  desktopCollapsed?: boolean;
  onDesktopToggle?: () => void;
  onMobileToggle?: () => void;
  onMobileClose?: () => void;
}

interface SessionListProps {
  sessions: ReturnType<typeof useChatStore.getState>['sessions'];
  sendingSessionId: string | null;
  onMobileClose?: () => void;
  onRemove: (e: MouseEvent, id: string) => void;
}

const SessionList = memo(function SessionList({
  sessions,
  sendingSessionId,
  onMobileClose,
  onRemove,
}: SessionListProps) {
  return (
    <ul className="session-nav__list">
      {sessions.map((session) => (
        <li key={session.id}>
          <NavLink
            to={`/chat/${session.id}`}
            className={({ isActive }) =>
              `session-nav__item${isActive ? ' session-nav__item--active' : ''}`
            }
            onClick={onMobileClose}
          >
            <span className="session-nav__title">{session.title}</span>
            {sendingSessionId === session.id && (
              <span className="session-nav__badge">…</span>
            )}
            {sessions.length > 1 && (
              <button
                type="button"
                className="session-nav__delete"
                title="删除会话"
                onClick={(e) => onRemove(e, session.id)}
              >
                ×
              </button>
            )}
          </NavLink>
        </li>
      ))}
    </ul>
  );
});

function ChatSessionNav({
  sendingSessionId = null,
  mobileOpen = false,
  desktopCollapsed = false,
  onDesktopToggle,
  onMobileClose,
}: ChatSessionNavProps) {
  const navigate = useNavigate();
  const sessions = useChatStore((s) => s.sessions);
  const createSession = useChatStore((s) => s.createSession);
  const removeSession = useChatStore((s) => s.removeSession);

  const handleNew = useCallback(async () => {
    try {
      const id = await createSession();
      navigate(`/chat/${id}`);
      onMobileClose?.();
    } catch (err) {
      console.error('创建会话失败:', err);
    }
  }, [createSession, navigate, onMobileClose]);

  const handleRemove = useCallback(
    async (e: MouseEvent, id: string) => {
      e.preventDefault();
      e.stopPropagation();
      if (sessions.length <= 1) return;

      if (window.confirm('确定要删除这个会话吗？')) {
        await removeSession(id);
        const currentActiveId = useChatStore.getState().activeSessionId;
        if (currentActiveId) {
          navigate(`/chat/${currentActiveId}`, { replace: true });
        } else {
          navigate('/', { replace: true });
        }
      }
    },
    [sessions.length, removeSession, navigate],
  );

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          className="session-nav__overlay"
          aria-label="关闭会话列表遮罩"
          onClick={onMobileClose}
        />
      )}

      <aside
        className={`session-nav${mobileOpen ? ' session-nav--mobile-open' : ''}${desktopCollapsed ? ' session-nav--desktop-collapsed' : ''}`}
      >
        <div className="session-nav__desktop-header">
          <button
            type="button"
            className="session-nav__desktop-toggle"
            onClick={onDesktopToggle}
            aria-label={desktopCollapsed ? '展开侧边栏' : '收起侧边栏'}
          >
            {desktopCollapsed ? (
              <PanelLeft size={18} />
            ) : (
              <PanelRightClose size={18} />
            )}
          </button>
        </div>

        <div className="session-nav__mobile-header">
          <div className="session-nav__mobile-brand">EverPay</div>
          <button
            type="button"
            className="session-nav__mobile-close"
            onClick={onMobileClose}
            aria-label="关闭会话列表"
          >
            <X size={18} />
          </button>
        </div>
        <button
          type="button"
          className={`session-nav__new${desktopCollapsed && !mobileOpen ? ' session-nav__new--icon' : ''}`}
          onClick={handleNew}
          aria-label="新对话"
          title="新对话"
        >
          {desktopCollapsed && !mobileOpen ? <Plus size={18} /> : '+ 新对话'}
        </button>
        {(!desktopCollapsed || mobileOpen) && (
          <SessionList
            sessions={sessions}
            sendingSessionId={sendingSessionId}
            onMobileClose={onMobileClose}
            onRemove={handleRemove}
          />
        )}
      </aside>
    </>
  );
}

export default memo(ChatSessionNav);
