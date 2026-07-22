import { useMemo } from 'react';
import { imageGenerationApi } from '../api/generation';
import type { GenerationRunStep, ImageGenerationRequest } from '../types/generation';
import { usePollingGenerationFlow } from './usePollingGenerationFlow';

export const IMAGE_GENERATION_PRESET = {
  negativePrompt: '',
  stylePreset: '写实',
  aspectRatio: '1:1',
  sizePreset: '1024x1024',
  count: 1,
} satisfies Omit<ImageGenerationRequest, 'prompt'>;

export const IMAGE_GENERATION_PRESET_LABEL = '写实 · 1:1 · 1024';

const IMAGE_STEP_TEMPLATES = [
  { stepKey: 'validate_prompt', stepLabel: '校验提示词', stepIndex: 0, stepTotal: 6 },
  { stepKey: 'normalize_prompt', stepLabel: '规范化提示词', stepIndex: 1, stepTotal: 6 },
  { stepKey: 'safety_check', stepLabel: '安全检查', stepIndex: 2, stepTotal: 6 },
  { stepKey: 'generate_image', stepLabel: '请求图片生成', stepIndex: 3, stepTotal: 6 },
  { stepKey: 'save_artifact', stepLabel: '保存图片产物', stepIndex: 4, stepTotal: 6 },
  { stepKey: 'done', stepLabel: '完成', stepIndex: 5, stepTotal: 6 },
] satisfies Array<Pick<GenerationRunStep, 'stepKey' | 'stepLabel' | 'stepIndex' | 'stepTotal'>>;

export function useImageGenerationFlow() {
  const config = useMemo(
    () => ({
      preset: IMAGE_GENERATION_PRESET,
      stepTemplates: IMAGE_STEP_TEMPLATES,
      startRun: (payload: ImageGenerationRequest) => imageGenerationApi.startRun(payload),
      getRun: (runId: string) => imageGenerationApi.getRun(runId),
      getArtifactFile: (artifactId: string) => imageGenerationApi.getArtifactFile(artifactId),
      defaultArtifactMimeType: 'image/png',
      startErrorMessage: '文生图任务启动失败',
      pollErrorMessage: '获取文生图任务状态失败',
    }),
    [],
  );

  return usePollingGenerationFlow<ImageGenerationRequest>(config);
}
