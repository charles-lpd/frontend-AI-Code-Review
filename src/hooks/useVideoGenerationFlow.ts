import { useMemo } from 'react';
import { videoGenerationApi } from '../api/generation';
import type { GenerationRunStep, VideoGenerationRequest } from '../types/generation';
import { usePollingGenerationFlow } from './usePollingGenerationFlow';

export const VIDEO_GENERATION_PRESET = {
  negativePrompt: '',
  stylePreset: '写实',
  aspectRatio: '16:9',
  durationPreset: '5s',
  resolutionPreset: '1080p',
  motionPreset: '中',
} satisfies Omit<VideoGenerationRequest, 'prompt'>;

export const VIDEO_GENERATION_PRESET_LABEL = '写实 · 16:9 · 5s · 1080p';

const VIDEO_STEP_TEMPLATES = [
  { stepKey: 'validate_prompt', stepLabel: '校验提示词', stepIndex: 0, stepTotal: 7 },
  { stepKey: 'normalize_prompt', stepLabel: '规范化提示词', stepIndex: 1, stepTotal: 7 },
  { stepKey: 'safety_check', stepLabel: '安全检查', stepIndex: 2, stepTotal: 7 },
  { stepKey: 'submit_job', stepLabel: '提交视频生成任务', stepIndex: 3, stepTotal: 7 },
  { stepKey: 'poll_status', stepLabel: '轮询任务状态', stepIndex: 4, stepTotal: 7 },
  { stepKey: 'save_artifact', stepLabel: '保存视频产物', stepIndex: 5, stepTotal: 7 },
  { stepKey: 'done', stepLabel: '完成', stepIndex: 6, stepTotal: 7 },
] satisfies Array<Pick<GenerationRunStep, 'stepKey' | 'stepLabel' | 'stepIndex' | 'stepTotal'>>;

export function useVideoGenerationFlow() {
  const config = useMemo(
    () => ({
      preset: VIDEO_GENERATION_PRESET,
      stepTemplates: VIDEO_STEP_TEMPLATES,
      startRun: (payload: VideoGenerationRequest) => videoGenerationApi.startRun(payload),
      getRun: (runId: string) => videoGenerationApi.getRun(runId),
      getArtifactFile: (artifactId: string) => videoGenerationApi.getArtifactFile(artifactId),
      defaultArtifactMimeType: 'video/mp4',
      startErrorMessage: '文生视频任务启动失败',
      pollErrorMessage: '获取文生视频任务状态失败',
    }),
    [],
  );

  return usePollingGenerationFlow<VideoGenerationRequest>(config);
}
