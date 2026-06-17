import { useState, useEffect, useRef } from 'react';
import { githubApi, type GithubRepo } from '../../api/github';
import { Code, ExternalLink, Loader2, AlertCircle, GitBranch } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import './RepoSelector.css';

interface RepoSelectorProps {
  onSelect: (repo: GithubRepo) => void;
}

export default function RepoSelector({ onSelect }: RepoSelectorProps) {
  const { isAuthenticated, login } = useAuth();
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && repos.length === 0) {
      fetchRepos();
    }
  }, [isOpen]);

  // 点击外部关闭弹窗
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const fetchRepos = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await githubApi.getUserRepos();
      setRepos(data);
    } catch (err: any) {
      if (err.response?.status === 404) {
        setError('REPO_NOT_FOUND');
      } else {
        setError(err.message || '获取仓库列表失败');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="repo-error">
        <GitBranch size={16} />
        <span>请先连接 GitHub</span>
        <button onClick={login} className="install-link">
          连接
        </button>
      </div>
    );
  }

  if (error === 'REPO_NOT_FOUND') {
    return (
      <div className="repo-error">
        <AlertCircle size={16} />
        <span>未找到仓库或未安装 GitHub App</span>
        <a
          href="https://github.com/apps/ai-code-review-v1"
          target="_blank"
          rel="noopener noreferrer"
          className="install-link"
        >
          前往安装
        </a>
      </div>
    );
  }

  return (
    <div className="repo-selector" ref={containerRef}>
      <button
        className="repo-selector__trigger"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Code size={16} />
        <span>选择仓库进行审查</span>
      </button>

      {isOpen && (
        <div className="repo-selector__dropdown">
          <div className="repo-selector__header">
            <h3>您的 GitHub 仓库</h3>
            <button onClick={() => fetchRepos()} disabled={loading}>
              刷新
            </button>
          </div>

          <div className="repo-selector__list">
            {loading ? (
              <div className="repo-selector__loading">
                <Loader2 size={24} className="animate-spin" />
                <p>正在加载仓库...</p>
              </div>
            ) : repos.length > 0 ? (
              repos.map((repo) => (
                <div
                  key={repo.id}
                  className="repo-item"
                  onClick={() => {
                    onSelect(repo);
                    setIsOpen(false);
                  }}
                >
                  <div className="repo-item__info">
                    <span className="repo-item__name">{repo.fullName}</span>
                    {repo.isPrivate && (
                      <span className="repo-item__badge">Private</span>
                    )}
                  </div>
                  <a
                    href={`https://github.com/${repo.fullName}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink size={14} />
                  </a>
                </div>
              ))
            ) : (
              <div className="repo-selector__empty">没有找到可用的仓库</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
