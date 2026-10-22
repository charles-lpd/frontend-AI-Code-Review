import { Card } from '@/ui/card';
import { Badge } from '@/ui/badge';
import { Label } from '@/ui/label';
import { Input } from '@/ui/input';
import { Button } from '@/ui/button';
import { Textarea } from '@/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/ui/select';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/ui/dialog';
import { Skeleton } from '@/ui/skeleton';
import { Spinner } from '@/ui/spinner';
import { toast as messageApi } from 'sonner';
import { Link, useParams } from 'react-router-dom';
import {
  Database,
  Eye,
  Globe,
  Lock,
  Save,
  Trash2,
  Upload,
  RefreshCcw,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react';
import MessageItem from '../components/chat/MessageItem/MessageItem';
import { sessionApi } from '../api/sessions';
import { buildPublicSessionUrl } from '../constants';
import type { KnowledgePreviewResult } from '../api/index';
import type { ChatMode, KnowledgeFileStatus } from '../types/chat';
import { useChatStore } from '../store/useChatStore';
import './ChatDetail.css';

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

type PreviewState = {
  open: boolean;
  fileName: string;
  data: KnowledgePreviewResult | null;
};

type KnowledgeRefreshResult = {
  files: number;
  pending: number;
  failed: number;
};

function getKnowledgeStatusLabel(
  status?: KnowledgeFileStatus,
): string {
  switch (status) {
    case 'pending':
      return '排队中';
    case 'processing':
      return '索引中';
    case 'failed':
      return '索引失败';
    case 'ready':
    default:
      return '已可检索';
  }
}

function getKnowledgeReadinessLabel(readiness?: string) {
  switch (readiness) {
    case 'indexing': return '正在建立索引';
    case 'ready': return '全部可用';
    case 'mixed': return '部分文件可用';
    case 'failed': return '索引失败';
    default: return '尚未上传文件';
  }
}

function getKnowledgeStatusVariant(
  status?: KnowledgeFileStatus,
): 'info' | 'destructive' | 'success' {
  switch (status) {
    case 'pending':
    case 'processing':
      return 'info';
    case 'failed':
      return 'destructive';
    case 'ready':
    default:
      return 'success';
  }
}

function getPreviewErrorMessage(error: any) {
  const status = error?.status;
  if (status === 403) return '没有权限查看该知识库文件';
  if (status === 404) return '文件不存在或会话不存在';
  if (status === 400) return '当前文件类型暂不支持在线预览';
  return error?.message || '预览知识库文件失败';
}

export default function ChatDetail() {
  const { sessionId } = useParams();
  const session = useChatStore((s) =>
    s.sessions.find((item) => item.id === sessionId),
  );
  const fetchSessionDetail = useChatStore((s) => s.fetchSessionDetail);
  const updateSessionManageConfig = useChatStore(
    (s) => s.updateSessionManageConfig,
  );
  const syncSessionKnowledgeFiles = useChatStore(
    (s) => s.syncSessionKnowledgeFiles,
  );
  const addSessionKnowledgeFiles = useChatStore(
    (s) => s.addSessionKnowledgeFiles,
  );
  const removeSessionKnowledgeFile = useChatStore(
    (s) => s.removeSessionKnowledgeFile,
  );
  const knowledgeFiles =
    session?.manageConfig?.knowledgeFiles ?? [];

  const [titleDraft, setTitleDraft] = useState('');
  const [promptDraft, setPromptDraft] = useState('');
  const [isPublicDraft, setIsPublicDraft] = useState(false);
  const [chatModeDraft, setChatModeDraft] = useState<ChatMode>('assistant');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [refreshingKnowledge, setRefreshingKnowledge] = useState(false);
  const [rebuildingKnowledge, setRebuildingKnowledge] = useState(false);
  const [checkingKnowledge, setCheckingKnowledge] = useState(false);
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
  const pendingKnowledgeFiles = useMemo(
    () =>
      knowledgeFiles.filter(
        (file) => file.indexStatus === 'pending' || file.indexStatus === 'processing',
      ),
    [knowledgeFiles],
  );
  const failedKnowledgeFiles = useMemo(
    () =>
      knowledgeFiles.filter(
        (file) => (file.indexStatus ?? 'ready') === 'failed',
      ),
    [knowledgeFiles],
  );
  const publicUrl = isPublicDraft
    ? buildPublicSessionUrl(window.location.origin, sessionId ?? '')
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
    setChatModeDraft(session?.manageConfig?.chatMode ?? 'assistant');
  }, [
    session?.id,
    session?.title,
    session?.manageConfig?.systemPrompt,
    session?.manageConfig?.isPublic,
    session?.manageConfig?.chatMode,
  ]);

  const refreshKnowledgeFiles = useCallback(
    async (silent = false): Promise<KnowledgeRefreshResult | null> => {
      if (!sessionId) return null;

      if (!silent) {
        setRefreshingKnowledge(true);
      }

      try {
        const state = await sessionApi.getKnowledgeState(sessionId);
        const files = state.knowledgeFiles;
        syncSessionKnowledgeFiles(sessionId, files, state.knowledgeReadiness);
        return {
          files: files.length,
          pending: files.filter(
            (file) => file.indexStatus === 'pending' || file.indexStatus === 'processing',
          ).length,
          failed: files.filter(
            (file) => (file.indexStatus ?? 'ready') === 'failed',
          ).length,
        };
      } catch (err: any) {
        if (!silent) {
          messageApi.error(err.message || '刷新知识库状态失败');
        }
        return null;
      } finally {
        if (!silent) {
          setRefreshingKnowledge(false);
        }
      }
    },
    [messageApi, sessionId, syncSessionKnowledgeFiles],
  );

  useEffect(() => {
    if (!sessionId) return;
    void refreshKnowledgeFiles(true);
  }, [refreshKnowledgeFiles, sessionId]);

  useEffect(() => {
    if (!sessionId || uploading || pendingKnowledgeFiles.length === 0) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshKnowledgeFiles(true);
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [pendingKnowledgeFiles.length, refreshKnowledgeFiles, sessionId, uploading]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && pendingKnowledgeFiles.length > 0) {
        void refreshKnowledgeFiles(true);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [pendingKnowledgeFiles.length, refreshKnowledgeFiles]);

  useEffect(() => {
    return () => {
      if (previewState.data?.kind === 'pdf') {
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
        chatMode: chatModeDraft,
      });
      messageApi.success('会话设置已保存');
    } catch (err: any) {
      messageApi.error(err.message || '保存会话设置失败');
    } finally {
      setSaving(false);
    }
  }, [
    isPublicDraft,
    chatModeDraft,
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

      if (knowledgeFiles.length + files.length > 20) {
        messageApi.error('每个会话最多上传 20 个知识文件');
        event.target.value = '';
        return;
      }

      const allowedExtensions = ['.md', '.txt', '.pdf', '.docx'];
      const invalidExtensionFile = files.find(
        (file) => !allowedExtensions.some((extension) => file.name.toLowerCase().endsWith(extension)),
      );
      if (invalidExtensionFile) {
        messageApi.error(`文件类型不支持：${invalidExtensionFile.name}`);
        event.target.value = '';
        return;
      }

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
        await refreshKnowledgeFiles(true);
        messageApi.success('文件已上传，正在等待索引');
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
      refreshKnowledgeFiles,
      knowledgeFiles.length,
    ],
  );

  const handleDeleteKnowledge = useCallback(
    async (fileId: string) => {
      if (!sessionId) return;
      setSaving(true);
      try {
        await removeSessionKnowledgeFile(sessionId, fileId);
        await refreshKnowledgeFiles(true);
        messageApi.success('知识库文件已删除');
      } catch (err: any) {
        messageApi.error(err.message || '删除知识库文件失败');
      } finally {
        setSaving(false);
      }
    },
    [messageApi, refreshKnowledgeFiles, removeSessionKnowledgeFile, sessionId],
  );

  const handleRefreshKnowledge = useCallback(async () => {
    const result = await refreshKnowledgeFiles(false);
    if (!result) return;
    messageApi.success(
      `已刷新 ${result.files} 个文件，${result.pending} 个索引中，${result.failed} 个失败`,
    );
  }, [messageApi, refreshKnowledgeFiles]);

  const handleRebuildKnowledge = useCallback(async () => {
    if (!sessionId) return;
    setRebuildingKnowledge(true);
    try {
      await sessionApi.rebuildKnowledge(sessionId);
      await refreshKnowledgeFiles(true);
      messageApi.success('已触发知识库重建');
    } catch (err: any) {
      messageApi.error(err.message || '重建知识库失败');
    } finally {
      setRebuildingKnowledge(false);
    }
  }, [messageApi, refreshKnowledgeFiles, sessionId]);

  const handleReindexKnowledgeFile = useCallback(async (fileId: string) => {
    if (!sessionId) return;
    try {
      const result = await sessionApi.reindexKnowledgeFile(sessionId, fileId);
      await refreshKnowledgeFiles(true);
      messageApi.success(result.deduplicated ? '该文件已有索引任务正在执行' : '已创建重新索引任务');
    } catch (err: any) {
      messageApi.error(err.message || '重新索引失败');
    }
  }, [messageApi, refreshKnowledgeFiles, sessionId]);

  const handleCheckKnowledgeConsistency = useCallback(async () => {
    if (!sessionId) return;
    setCheckingKnowledge(true);
    try {
      const result = await sessionApi.checkKnowledgeConsistency(sessionId);
      if (result.ok) {
        messageApi.success('知识库一致性检查通过');
      } else {
        messageApi.warning(
          result.issues?.length
            ? `发现 ${result.issues.length} 个问题：${result.issues.join('；')}`
            : '知识库一致性检查发现问题',
        );
      }
    } catch (err: any) {
      messageApi.error(err.message || '检查知识库一致性失败');
    } finally {
      setCheckingKnowledge(false);
    }
  }, [messageApi, sessionId]);

  const handlePreviewKnowledge = useCallback(
    async (fileId: string, fileName: string) => {
      if (!sessionId) return;
      setPreviewState({
        open: true,
        fileName,
        data: null,
      });
      setPreviewLoading(true);
      try {
        const data = await sessionApi.getKnowledgeContent(sessionId, fileId);
        setPreviewState({
          open: true,
          fileName,
          data,
        });
      } catch (err: any) {
        setPreviewState({
          open: false,
          fileName: '',
          data: null,
        });
        messageApi.error(getPreviewErrorMessage(err));
      } finally {
        setPreviewLoading(false);
      }
    },
    [messageApi, sessionId],
  );

  const handleClosePreview = useCallback(() => {
    setPreviewState((prev) => {
      if (prev.data?.kind === 'pdf') {
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

      <div className="chat-detail-page__header">
        <div className="chat-detail-page__header-main">
          <h1>会话设置</h1>
          <Button asChild variant="outline" className="chat-detail-page__link">
            <Link to={`/chat/${sessionId}`}>返回对话</Link>
          </Button>
        </div>
      </div>

      <Card className="chat-detail-page__card">
        <div className="chat-detail-page__grid">
          <div className="chat-detail-page__field">
            <Label htmlFor="session-title">会话名称</Label>
            <Input
              id="session-title"
              value={titleDraft}
              disabled={saving || uploading}
              onChange={(event) => setTitleDraft(event.target.value)}
            />
          </div>
          <div className="chat-detail-page__field">
            <Label htmlFor="session-visibility">访问权限</Label>
            <Button variant="outline"
              id="session-visibility"
              aria-pressed={isPublicDraft}
              type="button"
              className="chat-detail-page__visibility w-full justify-start"
              disabled={saving || uploading}
              onClick={() => setIsPublicDraft((prev) => !prev)}
            >
              {isPublicDraft ? <Globe size={16} /> : <Lock size={16} />}
              {isPublicDraft ? '公开' : '私有'}
            </Button>
          </div>
          <div className="chat-detail-page__field">
            <Label htmlFor="session-mode">问答模式</Label>
            <Select value={chatModeDraft} disabled={saving || uploading} onValueChange={(value) => setChatModeDraft(value as ChatMode)}>
              <SelectTrigger id="session-mode" aria-label="问答模式"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">自动：有知识库文件时走知识库，否则走高级助手</SelectItem>
                <SelectItem value="direct">普通问答：不检索知识库</SelectItem>
                <SelectItem value="knowledge">知识库：固定检索当前会话文件</SelectItem>
                <SelectItem value="assistant">高级助手：仅私有问答可使用</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="chat-detail-page__field chat-detail-page__field--full">
            <Label htmlFor={publicUrl ? 'session-public-url' : undefined}>公开链接</Label>
            {publicUrl ? (
              <div className="chat-detail-page__public-link-row">
                <Input id="session-public-url" value={publicUrl} readOnly />
                <Button variant="outline"
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
                </Button>
              </div>
            ) : (
              <div className="chat-detail-page__public-link-empty">
                当前为私有会话，开启公开后可复制访问链接。
              </div>
            )}
          </div>
          <div className="chat-detail-page__field chat-detail-page__field--full">
            <Label htmlFor="session-prompt">会话 Prompt</Label>
            <Textarea
              id="session-prompt"
              className="min-h-[132px] resize-y"
              value={promptDraft}
              disabled={saving || uploading}
              placeholder="输入该会话的系统提示词"
              onChange={(event) => setPromptDraft(event.target.value)}
            />
          </div>
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
                {' '}· {getKnowledgeReadinessLabel(session?.manageConfig?.knowledgeReadiness)}
                {pendingKnowledgeFiles.length > 0 && (
                <span className="chat-detail-page__knowledge-pending-hint">
                    {' '}
                    · {pendingKnowledgeFiles.length} 个文件正在索引中，系统会自动刷新状态
                    {failedKnowledgeFiles.length > 0
                      ? `，${failedKnowledgeFiles.length} 个文件索引失败`
                      : ''}
                </span>
                )}
              </div>
            </div>
            <div className="chat-detail-page__knowledge-actions">
              <Button variant="outline"
                type="button"
                className="chat-detail-page__refresh"
                disabled={saving || uploading || refreshingKnowledge}
                onClick={() => void handleRefreshKnowledge()}
              >
                <RefreshCcw size={16} />
                {refreshingKnowledge ? '刷新中...' : '刷新状态'}
              </Button>
              <Button variant="outline"
                type="button"
                className="chat-detail-page__refresh"
                disabled={saving || uploading || rebuildingKnowledge}
                onClick={() => void handleRebuildKnowledge()}
              >
                <RotateCcw size={16} />
                {rebuildingKnowledge ? '重建中...' : '重建索引'}
              </Button>
              <Button variant="outline"
                type="button"
                className="chat-detail-page__refresh"
                disabled={saving || uploading || checkingKnowledge}
                onClick={() => void handleCheckKnowledgeConsistency()}
              >
                <ShieldAlert size={16} />
                {checkingKnowledge ? '检查中...' : '一致性检查'}
              </Button>
              <Button variant="outline"
                type="button"
                className="chat-detail-page__upload"
                disabled={saving || uploading}
                onClick={() => knowledgeInputRef.current?.click()}
              >
                <Upload size={16} />
                {uploading ? '上传中...' : '上传文件'}
              </Button>
            </div>
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
              <Spinner />
              <span>知识库文件上传中，请稍候...</span>
            </div>
          )}

          <div className="chat-detail-page__knowledge-list">
            {knowledgeFiles.length === 0 ? (
              <div className="chat-detail-page__knowledge-empty">
                暂无知识库文件
              </div>
            ) : (
              knowledgeFiles.map((file) => (
                <div key={file.id} className="chat-detail-page__knowledge-item">
                  <div className="chat-detail-page__knowledge-main">
                    <div className="chat-detail-page__knowledge-name-row">
                      <div className="chat-detail-page__knowledge-name">
                        {file.name}
                      </div>
                      <Badge variant={getKnowledgeStatusVariant(file.indexStatus)}>
                        {getKnowledgeStatusLabel(file.indexStatus)}
                      </Badge>
                    </div>
                    <div className="chat-detail-page__knowledge-meta">
                      {formatFileSize(file.size)} ·{' '}
                      {new Date(file.uploadedAt).toLocaleString()}
                    </div>
                    {file.indexStatus === 'failed' && file.indexError && (
                      <div className="chat-detail-page__knowledge-error">
                        {file.indexError}
                      </div>
                    )}
                    {(file.indexStatus === 'pending' || file.indexStatus === 'processing') && (
                      <div className="chat-detail-page__knowledge-error">
                        索引完成后即可参与检索。
                      </div>
                    )}
                    {file.indexStatus === 'ready' && (
                      <div className="chat-detail-page__knowledge-ready">
                        可用于聊天和公开会话召回。
                      </div>
                    )}
                  </div>
                  <div className="chat-detail-page__knowledge-actions">
                    <Button variant="outline"
                      type="button"
                      className="chat-detail-page__refresh"
                      hidden={file.indexStatus !== 'failed' && file.indexStatus !== 'ready'}
                      disabled={saving || uploading}
                      onClick={() => void handleReindexKnowledgeFile(file.id)}
                    >
                      <RotateCcw size={14} />
                      {file.indexStatus === 'ready' ? '强制重建' : '重新索引'}
                    </Button>
                    <Button variant="outline"
                      type="button"
                      className="chat-detail-page__preview"
                      disabled={
                        saving ||
                        uploading ||
                        previewLoading ||
                        file.name.toLowerCase().endsWith('.docx') ||
                        (file.indexStatus ?? 'ready') !== 'ready'
                      }
                      title={file.name.toLowerCase().endsWith('.docx') ? 'DOCX 暂不支持在线预览' : '预览文件'}
                      onClick={() =>
                        void handlePreviewKnowledge(file.id, file.name)
                      }
                    >
                      <Eye size={14} />
                      预览
                    </Button>
                    <Button variant="ghost"
                      type="button"
                      className="chat-detail-page__delete"
                      disabled={saving || uploading}
                      onClick={() => void handleDeleteKnowledge(file.id)}
                    >
                      <Trash2 size={14} />
                      删除
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="chat-detail-page__footer">
          <Button
            type="button"
            className="chat-detail-page__save"
            loading={saving}
            disabled={saving || uploading}
            onClick={() => void handleSave()}
          >
            <Save size={16} />
            {saving ? '保存中...' : '保存设置'}
          </Button>
        </div>
      </Card>

      <Dialog open={previewState.open} onOpenChange={(open) => { if (!open) handleClosePreview(); }}>
        <DialogContent className="max-w-[960px]">
          <DialogTitle>{previewState.fileName || '知识库预览'}</DialogTitle>
          <DialogDescription className="sr-only">查看当前知识库文件内容</DialogDescription>
        {previewLoading ? (
          <div className="chat-detail-page__preview-loading">
            <div className="space-y-3">{Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="h-4 w-full" />)}</div>
          </div>
        ) : !previewState.data ? (
          <div className="chat-detail-page__preview-loading">
            <Spinner />
          </div>
        ) : previewState.data.kind === 'pdf' ? (
          <iframe
            title={previewState.fileName}
            src={previewState.data.blobUrl}
            className="chat-detail-page__preview-frame"
          />
        ) : previewState.data.kind === 'markdown' ? (
          <div className="chat-detail-page__preview-markdown">
            <MessageItem role="assistant" content={previewState.data.text} />
          </div>
        ) : (
          <pre className="chat-detail-page__preview-text">
            {previewState.data.text}
          </pre>
        )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
