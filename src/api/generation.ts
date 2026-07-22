import {
  BACKEND_API_BASE_URL,
  IMAGE_GENERATION_API_PATH,
  VIDEO_GENERATION_API_PATH,
} from '../constants';
import { useAuthStore } from '../store/useAuthStore';
import type {
  GenerationRunArtifact,
  GenerationRunListItem,
  GenerationRunSnapshot,
  ImageGenerationRequest,
  VideoGenerationRequest,
} from '../types/generation';

type GenerationApiPath = typeof IMAGE_GENERATION_API_PATH | typeof VIDEO_GENERATION_API_PATH;

function requireToken() {
  const token = useAuthStore.getState().token;
  if (!token) {
    throw new Error('请先登录后再使用生成接口');
  }
  return token;
}

function buildAuthHeaders(includeJson = true) {
  const token = requireToken();
  return {
    ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${token}`,
  };
}

async function assertJsonResponseOk(response: Response) {
  if (response.ok) return;

  const errorData = await response.json().catch(() => ({}));
  throw new Error(
    errorData.error?.message ||
      errorData.error ||
      `请求失败: ${response.status}`,
  );
}

async function startGenerationRun<TPayload>(
  apiPath: GenerationApiPath,
  payload: TPayload,
  signal?: AbortSignal,
) {
  const response = await fetch(`${BACKEND_API_BASE_URL}${apiPath}/runs`, {
    method: 'POST',
    headers: buildAuthHeaders(),
    body: JSON.stringify(payload),
    signal,
  });

  await assertJsonResponseOk(response);
  return response;
}

async function listGenerationRuns(
  apiPath: GenerationApiPath,
): Promise<GenerationRunListItem[]> {
  const response = await fetch(`${BACKEND_API_BASE_URL}${apiPath}/runs`, {
    method: 'GET',
    headers: buildAuthHeaders(false),
  });

  await assertJsonResponseOk(response);
  return response.json();
}

async function getGenerationRun(
  apiPath: GenerationApiPath,
  runId: string,
): Promise<GenerationRunSnapshot> {
  const response = await fetch(`${BACKEND_API_BASE_URL}${apiPath}/runs/${runId}`, {
    method: 'GET',
    headers: buildAuthHeaders(false),
  });

  await assertJsonResponseOk(response);
  return response.json();
}

async function getGenerationRunArtifacts(
  apiPath: GenerationApiPath,
  runId: string,
): Promise<GenerationRunArtifact[]> {
  const response = await fetch(
    `${BACKEND_API_BASE_URL}${apiPath}/runs/${runId}/artifacts`,
    {
      method: 'GET',
      headers: buildAuthHeaders(false),
    },
  );

  await assertJsonResponseOk(response);
  return response.json();
}

async function getGenerationArtifactFile(
  apiPath: GenerationApiPath,
  artifactId: string,
): Promise<Blob> {
  const response = await fetch(
    `${BACKEND_API_BASE_URL}${apiPath}/artifacts/${artifactId}/file`,
    {
      method: 'GET',
      headers: buildAuthHeaders(false),
    },
  );

  await assertJsonResponseOk(response);
  return response.blob();
}

async function deleteGenerationRun(
  apiPath: GenerationApiPath,
  runId: string,
): Promise<void> {
  const response = await fetch(`${BACKEND_API_BASE_URL}${apiPath}/runs/${runId}`, {
    method: 'DELETE',
    headers: buildAuthHeaders(false),
  });

  await assertJsonResponseOk(response);
}

async function cancelGenerationRun(
  apiPath: GenerationApiPath,
  runId: string,
): Promise<void> {
  const response = await fetch(
    `${BACKEND_API_BASE_URL}${apiPath}/runs/${runId}/cancel`,
    {
      method: 'POST',
      headers: buildAuthHeaders(false),
    },
  );

  await assertJsonResponseOk(response);
}

export const imageGenerationApi = {
  startRun(payload: ImageGenerationRequest, signal?: AbortSignal) {
    return startGenerationRun(IMAGE_GENERATION_API_PATH, payload, signal);
  },
  listRuns() {
    return listGenerationRuns(IMAGE_GENERATION_API_PATH);
  },
  getRun(runId: string) {
    return getGenerationRun(IMAGE_GENERATION_API_PATH, runId);
  },
  getRunArtifacts(runId: string) {
    return getGenerationRunArtifacts(IMAGE_GENERATION_API_PATH, runId);
  },
  getArtifactFile(artifactId: string) {
    return getGenerationArtifactFile(IMAGE_GENERATION_API_PATH, artifactId);
  },
  deleteRun(runId: string) {
    return deleteGenerationRun(IMAGE_GENERATION_API_PATH, runId);
  },
};

export const videoGenerationApi = {
  startRun(payload: VideoGenerationRequest, signal?: AbortSignal) {
    return startGenerationRun(VIDEO_GENERATION_API_PATH, payload, signal);
  },
  listRuns() {
    return listGenerationRuns(VIDEO_GENERATION_API_PATH);
  },
  getRun(runId: string) {
    return getGenerationRun(VIDEO_GENERATION_API_PATH, runId);
  },
  getRunArtifacts(runId: string) {
    return getGenerationRunArtifacts(VIDEO_GENERATION_API_PATH, runId);
  },
  getArtifactFile(artifactId: string) {
    return getGenerationArtifactFile(VIDEO_GENERATION_API_PATH, artifactId);
  },
  cancelRun(runId: string) {
    return cancelGenerationRun(VIDEO_GENERATION_API_PATH, runId);
  },
  deleteRun(runId: string) {
    return deleteGenerationRun(VIDEO_GENERATION_API_PATH, runId);
  },
};
