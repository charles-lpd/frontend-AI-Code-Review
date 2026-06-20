import { Suspense, lazy, useMemo } from 'react';
import { NavLink, Route, Routes, Link, useLocation } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import './App.css';

const Home = lazy(() => import('./pages/Home'));
const Profile = lazy(() => import('./pages/Profile'));
const ChatDetail = lazy(() => import('./pages/ChatDetail'));
const PublicSession = lazy(() => import('./pages/PublicSession'));

export default function App() {
  const location = useLocation();
  const { isAuthenticated, user, login, logout } = useAuth();
  const isMobileChatRoute =
    location.pathname === '/' || location.pathname.startsWith('/chat/');

  const routeContent = useMemo(
    () => (
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/chat/:sessionId" element={<Home />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/chat-details/:sessionId" element={<ChatDetail />} />
        <Route path="/public/session/:id" element={<PublicSession />} />
      </Routes>
    ),
    [],
  );

  return (
    <div className="app">
      <nav className={`nav${isMobileChatRoute ? ' nav--chat-mobile' : ''}`}>
        <div className="nav__left">
          <span className="nav__brand">EverPay AI Review</span>
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `nav__tab${isActive ? ' nav__tab--active' : ''}`
            }
          >
            对话
          </NavLink>
        </div>

        <div className="nav__right">
          {isAuthenticated && user ? (
            <div className="user-profile">
              <Link to="/profile" className="user-info-link">
                <img
                  src={user.avatarUrl}
                  alt={user.name}
                  className="user-avatar"
                />
                <span className="user-name">{user.name || user.login}</span>
              </Link>
              <button onClick={logout} className="logout-btn">
                退出
              </button>
            </div>
          ) : (
            <button onClick={login} className="login-btn">
              连接 GitHub
            </button>
          )}
        </div>
      </nav>
      <main
        className={`app__main${isMobileChatRoute ? ' app__main--chat-mobile' : ''}`}
      >
        <Suspense fallback={<div className="app__loading">加载中...</div>}>
          {routeContent}
        </Suspense>
      </main>
    </div>
  );
}
