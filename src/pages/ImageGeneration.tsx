import { GenerationAuthGate } from '@/components/generation/GenerationAuthGate';
import { GenerationPromptForm } from '@/components/generation/GenerationPromptForm';
import { Button } from '@/ui/button';
import {
  memo,
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from 'react';
import { toast as message } from 'sonner';
import { useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  IMAGE_GENERATION_PRESET_LABEL,
  useImageGenerationFlow,
} from '../hooks/useImageGenerationFlow';
import { GenerationStepTimeline } from '../components/generation/GenerationStepTimeline';
import { GenerationArtifactGallery } from '../components/generation/GenerationArtifactGallery';
import './Generation.css';


function ImageGenerationPageBase() {
  const { isAuthenticated, login } = useAuth();
  const { runId: routeRunId } = useParams<{ runId?: string }>();
  const [prompt, setPrompt] = useState('');
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const {
    state,
    actions: { clearError, submit, refreshRun },
  } = useImageGenerationFlow();
  const isViewingRun = Boolean(routeRunId);
  const canSubmit = !isViewingRun && !state.isTaskActive && prompt.trim().length > 0;

  useEffect(() => {
    if (routeRunId && routeRunId !== state.currentSnapshot?.runId) {
      void refreshRun(routeRunId).catch(() => undefined);
    }
  }, [refreshRun, routeRunId, state.currentSnapshot?.runId]);

  useEffect(() => {
    const nextPrompt = state.currentSnapshot?.prompt
    if (nextPrompt) {
      setPrompt(nextPrompt);
    }
  }, [state.currentSnapshot?.prompt]);

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
    return <GenerationAuthGate kind="image" label="AI 文生图" title="把一句话变成高质量图片" description="登录后即可进入文生图页面，输入提示词并查看步骤与图片产物。" onLogin={login} />;
  }

  return (
    <div className="generation-page generation-page--image">
      <div className="generation-page__layout generation-page__layout--image">
        <aside className="generation-page__column">
          <GenerationPromptForm presetLabel={IMAGE_GENERATION_PRESET_LABEL} prompt={prompt}
            placeholder="描述你想要生成的图片" submitLabel="生成图片"
            busy={state.isTaskActive} readOnly={isViewingRun} canSubmit={canSubmit}
            runId={routeRunId} onPromptChange={setPrompt} onSubmit={handleSubmit} />
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
              <Button variant="outline" type="button" onClick={clearError}>
                关闭
              </Button>
            </div>
          )}

          <GenerationArtifactGallery
            moduleKey="image"
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

export default memo(ImageGenerationPageBase);
