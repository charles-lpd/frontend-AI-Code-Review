import {
  memo,
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { message } from 'antd';
import { LoaderCircle, LogIn, Sparkles } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { GenerationArtifactGallery } from '../components/generation/GenerationArtifactGallery';
import { GenerationStepTimeline } from '../components/generation/GenerationStepTimeline';
import { useAuth } from '../hooks/useAuth';
import {
  useVideoGenerationFlow,
  VIDEO_GENERATION_PRESET_LABEL,
} from '../hooks/useVideoGenerationFlow';
import './Generation.css';

function VideoAuthGate({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="generation-page generation-page--video">
      <section className="generation-page__auth-card">
        <div className="generation-page__auth-eyebrow">
          <Sparkles size={14} />
          <span>AI 文生视频</span>
        </div>
        <h1 className="generation-page__auth-title">把一句话变成可播放的视频</h1>
        <p className="generation-page__auth-text">
          登录后即可进入文生视频页面，输入提示词并查看步骤与视频产物。
        </p>
        <button type="button" className="generation-page__primary-button" onClick={onLogin}>
          <LogIn size={16} />
          登录后开始生成
        </button>
      </section>
    </div>
  );
}

function VideoGenerationPageBase() {
  const { isAuthenticated, login } = useAuth();
  const { runId: routeRunId } = useParams<{ runId?: string }>();
  const [prompt, setPrompt] = useState('');
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const {
    state,
    actions: { clearError, submit, refreshRun },
  } = useVideoGenerationFlow();
  const isViewingRun = Boolean(routeRunId);
  const canSubmit = !isViewingRun && !state.isTaskActive && prompt.trim().length > 0;

  useEffect(() => {
    if (routeRunId && routeRunId !== state.currentSnapshot?.runId) {
      void refreshRun(routeRunId).catch(() => undefined);
    }
  }, [refreshRun, routeRunId, state.currentSnapshot?.runId]);

  useEffect(() => {
    const request = state.currentSnapshot?.request;
    if (!request || typeof request !== 'object') return;
    const nextPrompt =
      typeof (request as { prompt?: string }).prompt === 'string'
        ? (request as { prompt?: string }).prompt
        : typeof state.currentSnapshot?.prompt === 'string'
          ? state.currentSnapshot.prompt
          : '';
    if (nextPrompt) {
      setPrompt(nextPrompt);
    }
  }, [state.currentSnapshot?.prompt, state.currentSnapshot?.request]);

  useEffect(() => {
    if (state.visibleArtifacts.length === 0) {
      setSelectedArtifactId(null);
      return;
    }

    if (
      !selectedArtifactId ||
      !state.visibleArtifacts.some((item) => item.artifactKey === selectedArtifactId)
    ) {
      setSelectedArtifactId(state.visibleArtifacts[0].artifactKey);
    }
  }, [selectedArtifactId, state.visibleArtifacts]);

  const handleSubmit = useCallback(
    async (event?: FormEvent) => {
      event?.preventDefault();
      const nextPrompt = prompt.trim();
      if (!nextPrompt) {
        message.warning('请输入提示词');
        return;
      }
      if (nextPrompt.length > 1000) {
        message.warning('提示词长度过长，请控制在 1000 字以内');
        return;
      }

      if (isViewingRun) {
        return;
      }

      await submit(nextPrompt);
    },
    [isViewingRun, prompt, submit],
  );

  if (!isAuthenticated) {
    return <VideoAuthGate onLogin={login} />;
  }

  return (
    <div className="generation-page generation-page--video">
      <div className="generation-page__layout generation-page__layout--video">
        <aside className="generation-page__column">
          <form className="generation-page__card generation-page__form generation-page__form--prompt" onSubmit={handleSubmit}>
            <div className="generation-page__card-head">
              <div>
                <h2 className="generation-page__card-title">提示词模块</h2>
                <p className="generation-page__card-subtitle">
                  输入提示词后，点击生成，页面会轮询 `GET /runs/:id` 直到成功。
                </p>
              </div>
              <span className="generation-page__badge">{VIDEO_GENERATION_PRESET_LABEL}</span>
            </div>

            <label className="generation-page__field generation-page__field--full">
              <span>提示词 *</span>
              <textarea
                value={prompt}
                disabled={state.isTaskActive || isViewingRun}
                placeholder="描述你想要生成的视频"
                onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (isViewingRun) {
                    event.preventDefault();
                    return;
                  }
                  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                    event.preventDefault();
                    void handleSubmit();
                  }
                }}
              />
            </label>

            <button
              type="submit"
              className="generation-page__primary-button"
              disabled={!canSubmit}
            >
              {state.isTaskActive ? (
                <LoaderCircle size={16} className="generation-page__spin" />
              ) : (
                <Sparkles size={16} />
              )}
              {state.isTaskActive ? '生成中...' : '生成视频'}
            </button>
          </form>
        </aside>

        <main className="generation-page__column generation-page__column--main">
          <GenerationStepTimeline
            title="产品化步骤"
            subtitle="步骤会按 stepIndex 排序，同一个 stepKey 只保留一条记录。"
            steps={state.steps}
            currentStep={state.currentStep}
          />

          {state.errorMessage && (
            <div className="generation-page__error-bar">
              <span>{state.errorMessage}</span>
              <button type="button" onClick={clearError}>
                关闭
              </button>
            </div>
          )}

          <GenerationArtifactGallery
            moduleKey="video"
            artifacts={state.visibleArtifacts}
            previewUrlMap={state.artifactPreviewUrls}
            selectedArtifactId={selectedArtifactId}
            onSelectArtifact={setSelectedArtifactId}
          />
        </main>
      </div>
    </div>
  );
}

export default memo(VideoGenerationPageBase);
