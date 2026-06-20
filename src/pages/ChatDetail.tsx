import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { Modal, Spin, message } from 'antd';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Database,
  Eye,
  Globe,
  Lock,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import { sessionApi } from '../api/sessions';
import type { KnowledgePreviewResult } from '../api/index';
import { useChatStore } from '../store/useChatStore';
import './ChatDetail.css';

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

type PreviewState =
  | {
      open: false;
      fileName: string;
      data: null;
    }
  | {
      open: true;
      fileName: string;
      data: KnowledgePreviewResult;
    };

function getPreviewErrorMessage(error: any) {
  const status = error?.status;
  if (status === 403) return '没有权限查看该知识库文件';
  if (status === 404) return '文件不存在或会话不存在';
  if (status === 400) return '当前文件类型暂不支持在线预览';
  return error?.message || '预览知识库文件失败';
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
  const [uploading, setUploading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewState, setPreviewState] = useState<PreviewState>({
    open: false,
    fileName: '',
    data: null,
  });
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
  const publicUrl = isPublicDraft
    ? `${window.location.origin}/public/session/${sessionId}`
    : '';

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

  useEffect(() => {
    return () => {
      if (previewState.open && previewState.data.kind === 'pdf') {
        URL.revokeObjectURL(previewState.data.blobUrl);
      }
    };
  }, [previewState]);

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

      setUploading(true);
      try {
        await addSessionKnowledgeFiles(sessionId, files);
        messageApi.success('知识库文件上传成功');
        event.target.value = '';
      } catch (err: any) {
        messageApi.error(err.message || '上传知识库文件失败');
      } finally {
        setUploading(false);
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

  const handlePreviewKnowledge = useCallback(
    async (fileId: string, fileName: string) => {
      if (!sessionId) return;
      setPreviewLoading(true);
      try {
        const data = await sessionApi.getKnowledgeContent(sessionId, fileId);
        setPreviewState({
          open: true,
          fileName,
          data,
        });
      } catch (err: any) {
        messageApi.error(getPreviewErrorMessage(err));
      } finally {
        setPreviewLoading(false);
      }
    },
    [messageApi, sessionId],
  );

  const handleClosePreview = useCallback(() => {
    setPreviewState((prev) => {
      if (prev.open && prev.data.kind === 'pdf') {
        URL.revokeObjectURL(prev.data.blobUrl);
      }
      return {
        open: false,
        fileName: '',
        data: null,
      };
    });
  }, []);

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
              disabled={saving || uploading}
              onChange={(event) => setTitleDraft(event.target.value)}
            />
          </label>
          <label className="chat-detail-page__field chat-detail-page__field--switch">
            <span>访问权限</span>
            <button
              type="button"
              className={`chat-detail-page__visibility${isPublicDraft ? ' chat-detail-page__visibility--public' : ''}`}
              disabled={saving || uploading}
              onClick={() => setIsPublicDraft((prev) => !prev)}
            >
              {isPublicDraft ? <Globe size={16} /> : <Lock size={16} />}
              {isPublicDraft ? '公开' : '私有'}
            </button>
          </label>
          <div className="chat-detail-page__field chat-detail-page__field--full">
            <span>公开链接</span>
            {publicUrl ? (
              <div className="chat-detail-page__public-link-row">
                <input value={publicUrl} readOnly />
                <button
                  type="button"
                  className="chat-detail-page__link-action"
                  onClick={async () => {
                    if (!publicUrl) return;
                    try {
                      await navigator.clipboard.writeText(publicUrl);
                      messageApi.success('公开链接已复制');
                    } catch {
                      messageApi.error('复制公开链接失败');
                    }
                  }}
                >
                  复制链接
                </button>
              </div>
            ) : (
              <div className="chat-detail-page__public-link-empty">
                当前为私有会话，开启公开后可复制访问链接。
              </div>
            )}
          </div>
          <label className="chat-detail-page__field chat-detail-page__field--full">
            <span>会话 Prompt</span>
            <textarea
              value={promptDraft}
              disabled={saving || uploading}
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
              disabled={saving || uploading}
              onClick={() => knowledgeInputRef.current?.click()}
            >
              <Upload size={16} />
              {uploading ? '上传中...' : '上传文件'}
            </button>
            <input
              ref={knowledgeInputRef}
              type="file"
              multiple
              hidden
              onChange={handleUploadKnowledge}
            />
          </div>

          {uploading && (
            <div className="chat-detail-page__uploading">
              <Spin size="small" />
              <span>知识库文件上传中，请稍候...</span>
            </div>
          )}

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
                  <div className="chat-detail-page__knowledge-actions">
                    <button
                      type="button"
                      className="chat-detail-page__preview"
                      disabled={saving || uploading || previewLoading}
                      onClick={() =>
                        void handlePreviewKnowledge(file.id, file.name)
                      }
                    >
                      <Eye size={14} />
                      预览
                    </button>
                    <button
                      type="button"
                      className="chat-detail-page__delete"
                      disabled={saving || uploading}
                      onClick={() => void handleDeleteKnowledge(file.id)}
                    >
                      <Trash2 size={14} />
                      删除
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="chat-detail-page__footer">
          <button
            type="button"
            className="chat-detail-page__save"
            disabled={saving || uploading}
            onClick={() => void handleSave()}
          >
            <Save size={16} />
            {saving ? '保存中...' : '保存设置'}
          </button>
        </div>
      </div>

      <Modal
        open={previewState.open}
        title={previewState.fileName || '知识库预览'}
        footer={null}
        width={960}
        onCancel={handleClosePreview}
      >
        {previewLoading || !previewState.open ? (
          <div className="chat-detail-page__preview-loading">
            <Spin />
          </div>
        ) : previewState.data.kind === 'pdf' ? (
          <iframe
            title={previewState.fileName}
            src={previewState.data.blobUrl}
            className="chat-detail-page__preview-frame"
          />
        ) : previewState.data.kind === 'markdown' ? (
          <div className="chat-detail-page__preview-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {previewState.data.text}
            </ReactMarkdown>
          </div>
        ) : (
          <pre className="chat-detail-page__preview-text">
            {previewState.data.text}
          </pre>
        )}
      </Modal>
    </div>
  );
}
