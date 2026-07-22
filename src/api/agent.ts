import { AGENT_API_PATH, BACKEND_API_BASE_URL } from '../constants';
import { useAuthStore } from '../store/useAuthStore';
import type {
  AgentRunRequest,
  AgentRunSnapshot,
  AgentResumeRequest,
} from '../types/agent';

function buildAuthHeaders() {
  const token = useAuthStore.getState().token;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

export async function runAgentStream(
  payload: AgentRunRequest,
  signal?: AbortSignal,
) {
  const response = await fetch(`${BACKEND_API_BASE_URL}${AGENT_API_PATH}/run`, {
    method: 'POST',
    headers: buildAuthHeaders(),
    body: JSON.stringify(payload),
    signal,
  });

  await assertJsonResponseOk(response);
  return response;
}

export async function resumeAgentStream(
  runId: string,
  payload: AgentResumeRequest,
  signal?: AbortSignal,
) {
  const response = await fetch(
    `${BACKEND_API_BASE_URL}${AGENT_API_PATH}/${runId}/resume`,
    {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify(payload),
      signal,
    },
  );

  await assertJsonResponseOk(response);
  return response;
}

export async function getAgentRun(
  runId: string,
): Promise<AgentRunSnapshot> {
  const response = await fetch(`${BACKEND_API_BASE_URL}${AGENT_API_PATH}/${runId}`, {
    method: 'GET',
    headers: buildAuthHeaders(),
  });

  await assertJsonResponseOk(response);
  return response.json();
}
