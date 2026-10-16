import { Popover, PopoverTrigger, PopoverContent } from '@/ui/popover';
import { Button } from '@/ui/button';
import { Badge } from '@/ui/badge';
import { useState, useEffect } from 'react';
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

  useEffect(() => {
    if (isOpen && repos.length === 0) {
      fetchRepos();
    }
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
        <Button variant="outline" onClick={login} className="install-link">
          连接
        </Button>
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
    <Popover open={isOpen} onOpenChange={setIsOpen}><div className="repo-selector">
      <PopoverTrigger asChild><Button variant="outline"
        className="repo-selector__trigger"
      >
        <Code size={16} />
        <span>选择仓库进行审查</span>
      </Button></PopoverTrigger>

        <PopoverContent className="repo-selector__dropdown w-[min(28rem,calc(100vw-2rem))] p-0" aria-label="您的 GitHub 仓库">
          <div className="repo-selector__header">
            <h3>您的 GitHub 仓库</h3>
            <Button variant="outline" onClick={() => fetchRepos()} disabled={loading}>
              刷新
            </Button>
          </div>

          <div className="repo-selector__list">
            {loading ? (
              <div className="repo-selector__loading">
                <Loader2 size={24} className="animate-spin" />
                <p>正在加载仓库...</p>
              </div>
            ) : repos.length > 0 ? (
              repos.map((repo) => (
                <div key={repo.id} className="repo-item">
                <Button variant="ghost" className="min-w-0 flex-1 justify-start" onClick={() => {
                    onSelect(repo);
                    setIsOpen(false);
                  }}
                >
                  <div className="repo-item__info">
                    <span className="repo-item__name">{repo.fullName}</span>
                    {repo.isPrivate && (
                      <Badge className="repo-item__badge">Private</Badge>
                    )}
                  </div>
                </Button><a
                    aria-label={`打开仓库 ${repo.fullName}`}
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
        </PopoverContent>
    </div></Popover>
  );
}
