/**
 * 会话导航：通过 /chat/:sessionId 切换会话
 */
import type { MouseEvent } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useChatStore } from '../../store/useChatStore'
import './ChatSessionNav.css'

interface ChatSessionNavProps {
  sendingSessionId?: string | null
}

export default function ChatSessionNav({
  sendingSessionId = null,
}: ChatSessionNavProps) {
  // const { sessionId: routeSessionId } = useParams()
  const navigate = useNavigate()
  const sessions = useChatStore((s) => s.sessions)
  const createSession = useChatStore((s) => s.createSession)
  const removeSession = useChatStore((s) => s.removeSession)

  const handleNew = async () => {
    try {
      const id = await createSession();
      navigate(`/chat/${id}`);
    } catch (err) {
      console.error('创建会话失败:', err);
    }
  };

  const handleRemove = async (e: MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (sessions.length <= 1) return;
    
    if (window.confirm('确定要删除这个会话吗？')) {
      await removeSession(id);
      // 删除后 Zustand 会自动更新 activeSessionId，我们在 useEffect 或路由同步中处理跳转
      const currentActiveId = useChatStore.getState().activeSessionId;
      if (currentActiveId) {
        navigate(`/chat/${currentActiveId}`, { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    }
  };

  return (
    <aside className="session-nav">
      <button type="button" className="session-nav__new" onClick={handleNew}>
        + 新对话
      </button>
      <ul className="session-nav__list">
        {sessions.map((session) => (
          <li key={session.id}>
            <NavLink
              to={`/chat/${session.id}`}
              className={({ isActive }) =>
                `session-nav__item${isActive ? ' session-nav__item--active' : ''}`
              }
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
                  onClick={(e) => handleRemove(e, session.id)}
                >
                  ×
                </button>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </aside>
  )
}
