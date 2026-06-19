import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { githubApi, type GithubRepo } from '../api/github';
import { useChatStore } from '../store/useChatStore';
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
  FileText,
  Database,
  Trash2,
} from 'lucide-react';
import './Profile.css';

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Profile() {
  const { user, isAuthenticated } = useAuthStore();
  const sessions = useChatStore((s) => s.sessions);
  const hasFetched = useChatStore((s) => s.hasFetched);
  const fetchSessions = useChatStore((s) => s.fetchSessions);
  const updateSessionManageConfig = useChatStore(
    (s) => s.updateSessionManageConfig,
  );
  const addSessionKnowledgeFiles = useChatStore(
    (s) => s.addSessionKnowledgeFiles,
  );
  const removeSessionKnowledgeFile = useChatStore(
    (s) => s.removeSessionKnowledgeFile,
  );
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [manageSaving, setManageSaving] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);
  const [systemPromptDraft, setSystemPromptDraft] = useState('');
  const knowledgeInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      void fetchRepos();
      if (!hasFetched) {
        void fetchSessions();
      }
    }
  }, [isAuthenticated, hasFetched, fetchSessions]);

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) ?? null,
    [sessions, selectedSessionId],
  );

  useEffect(() => {
    if (!selectedSessionId && sessions.length > 0) {
      setSelectedSessionId(sessions[0].id);
    }
  }, [selectedSessionId, sessions]);

  useEffect(() => {
    setSystemPromptDraft(selectedSession?.manageConfig?.systemPrompt ?? '');
  }, [selectedSession?.id, selectedSession?.manageConfig?.systemPrompt]);

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

  const handlePublicChange = async (sessionId: string, checked: boolean) => {
    setManageSaving(true);
    setManageError(null);
    try {
      await updateSessionManageConfig(sessionId, { isPublic: checked });
    } catch (err: any) {
      setManageError(err.message || '更新公开状态失败');
    } finally {
      setManageSaving(false);
    }
  };

  const handleSystemPromptBlur = async (sessionId: string) => {
    setManageSaving(true);
    setManageError(null);
    try {
      await updateSessionManageConfig(sessionId, {
        systemPrompt: systemPromptDraft,
      });
    } catch (err: any) {
      setManageError(err.message || '更新 system prompt 失败');
    } finally {
      setManageSaving(false);
    }
  };

  const handleKnowledgeUpload = async (
    sessionId: string,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    setManageSaving(true);
    setManageError(null);
    try {
      await addSessionKnowledgeFiles(sessionId, files);
      event.target.value = '';
    } catch (err: any) {
      setManageError(err.message || '上传知识库文件失败');
    } finally {
      setManageSaving(false);
    }
  };

  const handleKnowledgeDelete = async (sessionId: string, fileId: string) => {
    setManageSaving(true);
    setManageError(null);
    try {
      await removeSessionKnowledgeFile(sessionId, fileId);
    } catch (err: any) {
      setManageError(err.message || '删除知识库文件失败');
    } finally {
      setManageSaving(false);
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
        <div className="profile__split">
          <section className="profile__panel">
            <div className="profile__section-header">
              <div className="profile__section-title">
                <MessageSquare size={20} />
                <h2>我的会话 ({sessions.length})</h2>
              </div>
            </div>

            {sessions.length === 0 ? (
              <div className="profile__empty-card">
                <p>暂无会话，先去聊天页创建一个会话吧。</p>
              </div>
            ) : (
              <div className="profile__session-list">
                {sessions.map((session) => {
                  const isActive = session.id === selectedSessionId;
                  const isPublic = session.manageConfig?.isPublic;
                  return (
                    <button
                      key={session.id}
                      type="button"
                      className={`profile__session-item${isActive ? ' profile__session-item--active' : ''}`}
                      onClick={() => setSelectedSessionId(session.id)}
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
                          {new Date(session.updatedAt).toLocaleString()}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="profile__panel">
            <div className="profile__section-header">
              <div className="profile__section-title">
                <FileText size={20} />
                <h2>会话管理</h2>
              </div>
              {selectedSession && (
                <Link
                  to={`/chat/${selectedSession.id}`}
                  className="profile__manage-link"
                >
                  前往会话
                </Link>
              )}
            </div>

            {!selectedSession ? (
              <div className="profile__empty-card">
                <p>选择一个会话后，可在这里管理公开状态、System Prompt 和知识库。</p>
              </div>
            ) : (
              <div className="profile__manage-form">
                {manageError && (
                  <div className="profile__error">
                    <p>{manageError}</p>
                  </div>
                )}

                <div className="profile__manage-block">
                  <div className="profile__manage-header">
                    <div>
                      <h3>对外调用</h3>
                      <p>控制该会话是否允许被其他人调用。</p>
                    </div>
                    <label className="profile__switch">
                      <input
                        type="checkbox"
                        checked={selectedSession.manageConfig?.isPublic ?? false}
                        disabled={manageSaving}
                        onChange={(event) =>
                          handlePublicChange(
                            selectedSession.id,
                            event.target.checked,
                          )
                        }
                      />
                      <span className="profile__switch-slider" />
                    </label>
                  </div>
                </div>

                <div className="profile__manage-block">
                  <div className="profile__manage-header">
                    <div>
                      <h3>System Prompt</h3>
                      <p>为该会话维护专属系统提示词。</p>
                    </div>
                  </div>
                  <textarea
                    className="profile__textarea"
                    placeholder="输入该会话的 system prompt..."
                    value={systemPromptDraft}
                    disabled={manageSaving}
                    onChange={(event) => setSystemPromptDraft(event.target.value)}
                    onBlur={() => handleSystemPromptBlur(selectedSession.id)}
                  />
                </div>

                <div className="profile__manage-block">
                  <div className="profile__manage-header">
                    <div>
                      <h3>知识库</h3>
                      <p>上传与该会话绑定的知识文件。</p>
                    </div>
                    <button
                      type="button"
                      className="profile__refresh"
                      disabled={manageSaving}
                      onClick={() => knowledgeInputRef.current?.click()}
                    >
                      <Database size={14} />
                      上传文件
                    </button>
                    <input
                      ref={knowledgeInputRef}
                      type="file"
                      multiple
                      hidden
                      onChange={(event) =>
                        handleKnowledgeUpload(selectedSession.id, event)
                      }
                    />
                  </div>

                  <div className="profile__knowledge-list">
                    {(selectedSession.manageConfig?.knowledgeFiles ?? []).length === 0 ? (
                      <div className="profile__empty-inline">暂无知识库文件</div>
                    ) : (
                      selectedSession.manageConfig?.knowledgeFiles?.map((file) => (
                        <div key={file.id} className="profile__knowledge-item">
                          <div>
                            <div className="profile__knowledge-name">{file.name}</div>
                            <div className="profile__knowledge-meta">
                              {formatFileSize(file.size)} · {new Date(file.uploadedAt).toLocaleString()}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="profile__icon-button"
                            disabled={manageSaving}
                            onClick={() =>
                              handleKnowledgeDelete(selectedSession.id, file.id)
                            }
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>

        <div className="profile__section-header profile__section-header--repos">
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
