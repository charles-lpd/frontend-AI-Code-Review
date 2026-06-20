import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { message } from 'antd';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Database,
  Globe,
  Lock,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import { useChatStore } from '../store/useChatStore';
import './ChatDetail.css';

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ChatDetail() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [messageApi, contextHolder] = message.useMessage();
  const session = useChatStore((s) =>
    s.sessions.find((item) => item.id === sessionId),
  );
  const fetchSessionDetail = useChatStore((s) => s.fetchSessionDetail);
  const updateSessionManageConfig = useChatStore(
    (s) => s.updateSessionManageConfig,
  );
  const addSessionKnowledgeFiles = useChatStore(
    (s) => s.addSessionKnowledgeFiles,
  );
  const removeSessionKnowledgeFile = useChatStore(
    (s) => s.removeSessionKnowledgeFile,
  );

  const [titleDraft, setTitleDraft] = useState('');
  const [promptDraft, setPromptDraft] = useState('');
  const [isPublicDraft, setIsPublicDraft] = useState(false);
  const [saving, setSaving] = useState(false);
  const knowledgeInputRef = useRef<HTMLInputElement | null>(null);

  const allowedKnowledgeTypes = useMemo(
    () =>
      new Set([
        'application/pdf',
        'text/markdown',
        'text/plain',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ]),
    [],
  );
  const maxKnowledgeFileSize = 10 * 1024 * 1024;

  useEffect(() => {
    if (sessionId && !session?.detailsLoaded) {
      void fetchSessionDetail(sessionId);
    }
  }, [fetchSessionDetail, session?.detailsLoaded, sessionId]);

  useEffect(() => {
    setTitleDraft(session?.title ?? '');
    setPromptDraft(session?.manageConfig?.systemPrompt ?? '');
    setIsPublicDraft(session?.manageConfig?.isPublic ?? false);
  }, [
    session?.id,
    session?.title,
    session?.manageConfig?.systemPrompt,
    session?.manageConfig?.isPublic,
  ]);

  const handleSave = useCallback(async () => {
    if (!sessionId) return;
    setSaving(true);
    try {
      await updateSessionManageConfig(sessionId, {
        title: titleDraft.trim() || '新对话',
        isPublic: isPublicDraft,
        systemPrompt: promptDraft,
      });
      messageApi.success('会话设置已保存');
    } catch (err: any) {
      messageApi.error(err.message || '保存会话设置失败');
    } finally {
      setSaving(false);
    }
  }, [
    isPublicDraft,
    messageApi,
    promptDraft,
    sessionId,
    titleDraft,
    updateSessionManageConfig,
  ]);

  const handleUploadKnowledge = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      if (!sessionId) return;
      const files = Array.from(event.target.files ?? []);
      if (files.length === 0) return;

      const invalidTypeFile = files.find(
        (file) => file.type && !allowedKnowledgeTypes.has(file.type),
      );
      if (invalidTypeFile) {
        messageApi.error(`文件类型不支持：${invalidTypeFile.name}`);
        event.target.value = '';
        return;
      }

      const oversizedFile = files.find(
        (file) => file.size > maxKnowledgeFileSize,
      );
      if (oversizedFile) {
        messageApi.error(`文件超过 10MB：${oversizedFile.name}`);
        event.target.value = '';
        return;
      }

      setSaving(true);
      try {
        await addSessionKnowledgeFiles(sessionId, files);
        messageApi.success('知识库文件上传成功');
        event.target.value = '';
      } catch (err: any) {
        messageApi.error(err.message || '上传知识库文件失败');
      } finally {
        setSaving(false);
      }
    },
    [
      addSessionKnowledgeFiles,
      allowedKnowledgeTypes,
      maxKnowledgeFileSize,
      messageApi,
      sessionId,
    ],
  );

  const handleDeleteKnowledge = useCallback(
    async (fileId: string) => {
      if (!sessionId) return;
      setSaving(true);
      try {
        await removeSessionKnowledgeFile(sessionId, fileId);
        messageApi.success('知识库文件已删除');
      } catch (err: any) {
        messageApi.error(err.message || '删除知识库文件失败');
      } finally {
        setSaving(false);
      }
    },
    [messageApi, removeSessionKnowledgeFile, sessionId],
  );

  if (!sessionId) {
    return null;
  }

  return (
    <div className="chat-detail-page">
      {contextHolder}
      <div className="chat-detail-page__header">
        <button
          type="button"
          className="chat-detail-page__back"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft size={16} />
          返回
        </button>
        <div className="chat-detail-page__header-main">
          <h1>会话设置</h1>
          <Link to={`/chat/${sessionId}`} className="chat-detail-page__link">
            返回对话
          </Link>
        </div>
      </div>

      <div className="chat-detail-page__card">
        <div className="chat-detail-page__grid">
          <label className="chat-detail-page__field">
            <span>会话名称</span>
            <input
              value={titleDraft}
              disabled={saving}
              onChange={(event) => setTitleDraft(event.target.value)}
            />
          </label>
          <label className="chat-detail-page__field chat-detail-page__field--switch">
            <span>访问权限</span>
            <button
              type="button"
              className={`chat-detail-page__visibility${isPublicDraft ? ' chat-detail-page__visibility--public' : ''}`}
              disabled={saving}
              onClick={() => setIsPublicDraft((prev) => !prev)}
            >
              {isPublicDraft ? <Globe size={16} /> : <Lock size={16} />}
              {isPublicDraft ? '公开' : '私有'}
            </button>
          </label>
          <label className="chat-detail-page__field chat-detail-page__field--full">
            <span>会话 Prompt</span>
            <textarea
              value={promptDraft}
              disabled={saving}
              placeholder="输入该会话的系统提示词"
              onChange={(event) => setPromptDraft(event.target.value)}
            />
          </label>
        </div>

        <div className="chat-detail-page__knowledge">
          <div className="chat-detail-page__knowledge-header">
            <div>
              <div className="chat-detail-page__knowledge-title">
                <Database size={16} />
                <span>知识库文件</span>
              </div>
              <div className="chat-detail-page__knowledge-hint">
                支持 PDF、Markdown、TXT、DOCX，单文件不超过 10MB
              </div>
            </div>
            <button
              type="button"
              className="chat-detail-page__upload"
              disabled={saving}
              onClick={() => knowledgeInputRef.current?.click()}
            >
              <Upload size={16} />
              上传文件
            </button>
            <input
              ref={knowledgeInputRef}
              type="file"
              multiple
              hidden
              onChange={handleUploadKnowledge}
            />
          </div>

          <div className="chat-detail-page__knowledge-list">
            {(session?.manageConfig?.knowledgeFiles ?? []).length === 0 ? (
              <div className="chat-detail-page__knowledge-empty">
                暂无知识库文件
              </div>
            ) : (
              (session?.manageConfig?.knowledgeFiles ?? []).map((file) => (
                <div key={file.id} className="chat-detail-page__knowledge-item">
                  <div>
                    <div className="chat-detail-page__knowledge-name">
                      {file.name}
                    </div>
                    <div className="chat-detail-page__knowledge-meta">
                      {formatFileSize(file.size)} ·{' '}
                      {new Date(file.uploadedAt).toLocaleString()}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="chat-detail-page__delete"
                    disabled={saving}
                    onClick={() => void handleDeleteKnowledge(file.id)}
                  >
                    <Trash2 size={14} />
                    删除
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="chat-detail-page__footer">
          <button
            type="button"
            className="chat-detail-page__save"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            <Save size={16} />
            {saving ? '保存中...' : '保存设置'}
          </button>
        </div>
      </div>
    </div>
  );
}
