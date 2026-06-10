import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { githubApi, type GithubRepo } from '../api/github';
import {
  User,
  ExternalLink,
  Loader2,
  Code,
  Shield,
  Calendar,
} from 'lucide-react';
import './Profile.css';

export default function Profile() {
  const { user, isAuthenticated } = useAuthStore();
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      fetchRepos();
    }
  }, [isAuthenticated]);

  const fetchRepos = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await githubApi.getUserRepos();
      setRepos(data);
    } catch (err: any) {
      setError(err.message || '获取仓库列表失败');
    } finally {
      setLoading(false);
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
        <div className="profile__user-card">
          <img
            src={user.avatarUrl}
            alt={user.name}
            className="profile__avatar"
          />
          <div className="profile__user-info">
            <h1 className="profile__name">{user.name || user.login}</h1>
            <p className="profile__login">@{user.login}</p>
            <div className="profile__badges">
              <span className="profile__badge">
                <User size={12} />
                GitHub ID: {user.githubId}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="profile__content">
        <div className="profile__section-header">
          <div className="profile__section-title">
            <Code size={20} />
            <h2>您的仓库 ({repos.length})</h2>
          </div>
          <button
            className="profile__refresh"
            onClick={fetchRepos}
            disabled={loading}
          >
            {loading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              '刷新列表'
            )}
          </button>
        </div>

        {error && (
          <div className="profile__error">
            <p>{error}</p>
          </div>
        )}

        <div className="profile__repo-grid">
          {loading && repos.length === 0 ? (
            <div className="profile__loading">
              <Loader2 size={32} className="animate-spin" />
              <p>正在拉取仓库数据...</p>
            </div>
          ) : (
            repos.map((repo) => (
              <div key={repo.id} className="repo-card">
                <div className="repo-card__header">
                  <h3 className="repo-card__name">{repo.fullName}</h3>
                  {repo.isPrivate && (
                    <span className="repo-card__private-badge">
                      <Shield size={10} />
                      私有
                    </span>
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
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
