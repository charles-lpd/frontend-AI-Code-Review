import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/ui/tabs';
import { Avatar, AvatarImage, AvatarFallback } from '@/ui/avatar';
import { Card } from '@/ui/card';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { githubApi, type GithubRepo } from '../api/github';
import { useChatStore } from '../store/useChatStore';
import { useLoginDialogStore } from '../store/useLoginDialogStore';
import { GITHUB_APP_INSTALL_URL } from '../constants';
import {
  User,
  ExternalLink,
  Loader2,
  Code,
  Shield,
  Calendar,
  MessageSquare,
  Globe,
  Lock,
} from 'lucide-react';
import './Profile.css';

export default function Profile() {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuthStore();
  const sessions = useChatStore((s) => s.sessions);
  const hasFetched = useChatStore((s) => s.hasFetched);
  const fetchSessions = useChatStore((s) => s.fetchSessions);
  const createSession = useChatStore((s) => s.createSession);
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [loading, setLoading] = useState(false);
  const [creatingSession, setCreatingSession] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      void fetchRepos();
      if (!hasFetched) {
        void fetchSessions();
      }
    }
  }, [isAuthenticated, hasFetched, fetchSessions]);

  const fetchRepos = async () => {
    setLoading(true);
    setError(null);
    setErrorCode(null);
    try {
      const data = await githubApi.getUserRepos();
      setRepos(data);
    } catch (err: any) {
      setError(err.message || '获取仓库列表失败');
      setErrorCode(err.code ?? null);
    } finally {
      setLoading(false);
    }
  };

  const needsGithubReauth = errorCode === 'GITHUB_AUTH_EXPIRED' || errorCode === 'GITHUB_AUTH_FAILED';

  const handleCreateSession = async () => {
    setCreatingSession(true);
    setError(null);
    try {
      const id = await createSession('我的客服会话');
      navigate(`/chat-details/${id}`);
    } catch (err: any) {
      setError(err.message || '创建会话失败');
    } finally {
      setCreatingSession(false);
    }
  };

  if (!isAuthenticated || !user) {
    return (
      <div className="profile-empty">
        <User size={48} />
        <h2>请先连接 GitHub</h2>
        <p>登录后即可查看您的个人信息和仓库列表。</p>
      </div>
    );
  }

  return (
    <div className="profile">
      <div className="profile__header">
        <Card className="profile__user-card">
<Avatar className="profile__avatar"><AvatarImage src={user.avatarUrl} alt={user.name || user.login} /><AvatarFallback>{(user.name || user.login).slice(0, 1)}</AvatarFallback></Avatar>
          <div className="profile__user-info">
            <h1 className="profile__name">{user.name || user.login}</h1>
            <p className="profile__login">@{user.login}</p>
            <div className="profile__badges">
              <Badge className="profile__badge">
                <User size={12} />
                GitHub ID: {user.githubId}
              </Badge>
            </div>
          </div>
        </Card>
      </div>

      <div className="profile__content">
        <Card className="profile__panel">
          <div className="profile__section-header">
            <div className="profile__section-title">
              <MessageSquare size={20} />
              <h2>我的会话 ({sessions.length})</h2>
            </div>
            <Button variant="outline"
              className="profile__refresh"
              onClick={() => void handleCreateSession()}
              disabled={creatingSession}
            >
              {creatingSession ? '创建中...' : '新建会话'}
            </Button>
          </div>

          {sessions.length === 0 ? (
            <div className="profile__empty-card">
              <p>暂无会话，先去聊天页创建一个会话吧。</p>
            </div>
          ) : (
            <div className="profile__session-list">
              {sessions.map((session) => {
                const isPublic = session.manageConfig?.isPublic;
                return (
                  <Link
                    key={session.id}
                    to={`/chat-details/${session.id}`}
                    className="profile__session-item"
                  >
                    <div className="profile__session-main">
                      <div className="profile__session-title-row">
                        <span className="profile__session-title">
                          {session.title}
                        </span>
                        <span className="profile__session-visibility">
                          {isPublic ? <Globe size={14} /> : <Lock size={14} />}
                        </span>
                      </div>
                      <span className="profile__session-time">
                        创建于 {new Date(session.updatedAt).toLocaleString()}
                      </span>
                      {session.summary && (
                        <span className="profile__session-time">
                          {session.summary}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="profile__panel"><Tabs value="repos">
          <div className="profile__tabs-header">
            <TabsList aria-label="个人资源" className="max-w-full overflow-x-auto">
              <TabsTrigger value="repos">
                <Code size={16} />
                仓库 ({repos.length})
              </TabsTrigger>
            </TabsList>
            <Button variant="outline"
              className="profile__refresh"
              onClick={fetchRepos}
              disabled={loading}
            >
              {loading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                '刷新列表'
              )}
            </Button>
          </div>

          {error && (
            <div className="profile__error">
              <p>{error}</p>
              {needsGithubReauth && (
                <Button variant="outline" onClick={() => useLoginDialogStore.getState().setOpen(true)}>
                  重新授权 GitHub
                </Button>
              )}
            </div>
          )}

          <TabsContent value="repos">
            <div className="profile__repo-grid">
              {loading && repos.length === 0 ? (
                <div className="profile__loading">
                  <Loader2 size={32} className="animate-spin" />
                  <p>正在拉取仓库数据...</p>
                </div>
              ) : repos.length === 0 ? (
                <div className="profile__empty-card">
                  {error ? null : (
                    <>
                      <p>暂无可访问的仓库。如果还没有为账号安装 GitHub App，请先安装并选择需要授权的仓库，然后点击"刷新列表"。</p>
                      {GITHUB_APP_INSTALL_URL && (
                        <a href={GITHUB_APP_INSTALL_URL} target="_blank" rel="noopener noreferrer" className="repo-card__link">
                          <ExternalLink size={14} />
                          前往安装 GitHub App
                        </a>
                      )}
                    </>
                  )}
                </div>
              ) : (
                repos.map((repo) => (
                  <Card key={repo.id} className="repo-card">
                    <div className="repo-card__header">
                      <h3 className="repo-card__name">{repo.fullName}</h3>
                      {repo.isPrivate && (
                        <Badge className="repo-card__private-badge whitespace-nowrap">
                          <Shield size={10} />
                          私有
                        </Badge>
                      )}
                    </div>
                    <p className="repo-card__desc">
                      {repo.description || '暂无描述'}
                    </p>
                    <div className="repo-card__footer">
                      <div className="repo-card__meta">
                        <span className="repo-card__branch">
                          <Code size={12} />
                          {repo.defaultBranch}
                        </span>
                        <span className="repo-card__date">
                          <Calendar size={12} />
                          {new Date(repo.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                      <a
                        href={`https://github.com/${repo.fullName}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="repo-card__link"
                      >
                        <ExternalLink size={14} />
                        查看
                      </a>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs></Card>
      </div>
    </div>
  );
}
