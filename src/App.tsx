import { Button } from '@/ui/button';
import { Suspense, lazy, useMemo } from 'react';
import { NavLink, Route, Routes, Link, useLocation } from 'react-router-dom';
import { Avatar, AvatarImage, AvatarFallback } from '@/ui/avatar';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/ui/dropdown-menu';
import { Spinner } from '@/ui/spinner';
import { useAuth } from './hooks/useAuth';
import './App.css';

const Home = lazy(() => import('./pages/Home'));
const Profile = lazy(() => import('./pages/Profile'));
const ChatDetail = lazy(() => import('./pages/ChatDetail'));
const PublicSession = lazy(() => import('./pages/PublicSession'));
const CodeReview = lazy(() => import('./pages/CodeReview'));
// const AgentPage = lazy(() => import('./pages/Agent'));
const ImageGeneration = lazy(() => import('./pages/ImageGeneration'));
const VideoGeneration = lazy(() => import('./pages/VideoGeneration'));

export default function App() {
  const location = useLocation();
  const { isAuthenticated, user, login, logout } = useAuth();
  const isMobileChatRoute =
    location.pathname === '/' || location.pathname.startsWith('/chat/');
  const isChatWorkspaceRoute = isAuthenticated && isMobileChatRoute;

  const routeContent = useMemo(
    () => (
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/chat/:sessionId" element={<Home />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/code-review" element={<CodeReview />} />
        <Route path="/code-review/:reviewId" element={<CodeReview />} />
        {/* <Route path="/agent" element={<Agen。tPage />} /> */}
        {/* <Route path="/agent/:runId" element={<AgentPage />} /> */}
        <Route path="/image-generation" element={<ImageGeneration />} />
        <Route path="/image-generation/:runId" element={<ImageGeneration />} />
        <Route path="/video-generation" element={<VideoGeneration />} />
        <Route path="/video-generation/:runId" element={<VideoGeneration />} />
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
          <span className="nav__brand">AI 知识库</span>
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `nav__tab${isActive ? ' nav__tab--active' : ''}`
            }>
            对话
          </NavLink>
          <NavLink
            to="/code-review"
            className={({ isActive }) =>
              `nav__tab${isActive ? ' nav__tab--active' : ''}`
            }
          >
            审查
          </NavLink>
          {/* <NavLink
            to="/agent"
            className={({ isActive }) =>
              `nav__tab${isActive ? ' nav__tab--active' : ''}`
            }
          >
            Agent
          </NavLink> */}
          <NavLink
            to="/image-generation"
            className={({ isActive }) =>
              `nav__tab${isActive ? ' nav__tab--active' : ''}`
            }
          >
            文生图
          </NavLink>
          <NavLink
            to="/video-generation"
            className={({ isActive }) =>
              `nav__tab${isActive ? ' nav__tab--active' : ''}`
            }
          >
            文生视频
          </NavLink>
        </div>

        <div className="nav__right">
          {isAuthenticated && user ? (
            <div className="user-profile">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="user-info-link" aria-label="用户菜单">
                    <Avatar className="size-7"><AvatarImage src={user.avatarUrl} alt={user.name || user.login} /><AvatarFallback>{(user.name || user.login).slice(0, 1)}</AvatarFallback></Avatar>
                    <span className="user-name">{user.name || user.login}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild><Link to="/profile">个人中心</Link></DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={logout}>退出</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <Button onClick={login} className="login-btn">
              连接 GitHub
            </Button>
          )}
        </div>
      </nav>
      <main
        className={`app__main${isMobileChatRoute ? ' app__main--chat-mobile' : ''}${isChatWorkspaceRoute ? ' app__main--chat-workspace' : ''}`}
      >
        <Suspense fallback={<div className="app__loading w-full h-full flex items-center justify-center gap-2"><Spinner />加载中...</div>}>
          {routeContent}
        </Suspense>
      </main>
    </div>
  );
}
